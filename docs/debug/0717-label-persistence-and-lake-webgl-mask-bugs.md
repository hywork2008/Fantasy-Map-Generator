# ラベル編集の未永続化バグ系統と、湖ドラッグ時のWebGL land maskバグ

**背景**: `docs/plan/unite-data-and-map.md` の実装が完了しテスト前の状態だったセッションで、「国家ラベルを編集してWebGL renderingモードをトグルすると元の値・位置に戻る」というバグ報告から着手。調査の過程で同系統の別バグ（州ラベル）と、全く別系統の重大バグ（湖の頂点ドラッグでland全体が青くなる、webglHybridモード限定）が見つかった。前者は修正・検証済み、後者は原因未特定のまま引き継ぐ。

このセッション終了時点の `git status --short`:

```
 M src/controllers/labels-editor.ts
 M src/renderers/draw-state-labels.ts
 M src/renderers/webgl/adapters/deckDataAdapters.ts
 M src/runtime/presentationData.ts
 M src/runtime/worldRuntime.ts
?? docs/plan/unite-data-and-map_orig.md   ← このセッションと無関係、既存の未追跡ファイル
```

---

## 1. ラベル編集が再描画で消える系統のバグ

### 1.1 根本原因（共通）

`src/controllers/labels-editor.ts` のラベル編集（ドラッグ移動・曲線の制御点による折り曲げ・開始位置/サイズ/字間調整）は、対応する `<text>`/`<textPath>` の **SVG属性を直接書き換えるだけ** で、`pack` にもどこにも永続化されていなかった。一方、対応するレンダラー（`drawStateLabels()` や `ProvincesRenderer.render()`）は再描画のたびに該当要素を **丸ごと削除して canonical data から再生成** する。そのため、renderMode切り替え（`setRenderMode()` → `drawLayers()` → 各レンダラーの `render()` 呼び出し）を含む、あらゆる全体再描画で編集内容が消える。

`docs/plan/unite-data-and-map.md` §4.3 は元々 `PresentationData.labels`（state labelのbaseline・手動位置・サイズoverride）をcanonical dataとして持つ設計を明記しており、`src/runtime/dataFieldOwnership.ts` にも `"presentation.labels"` というトピックが登録済みだった。しかし実装（`src/runtime/presentationData.ts`）にはその `labels` フィールド自体が存在しておらず、「設計は正しいが実装が追いついていない」状態だった。

### 1.2 修正済み: 国家ラベル (state label)

以下4ファイルに実装・検証済み（Playwrightで実際にドラッグ・曲げ操作をしてrenderMode切り替えを跨いで保持されることを確認、修正前のコードに一時的に戻して同じ操作でバグが再現することも確認済み）。

- `src/runtime/presentationData.ts`: `PresentationData` に `labels: Record<string, Record<string, PresentationStyleValue>>` を追加。`LabelLayout` 型、`getPresentationLabel()` getter、`applyPresentationPatch()` への `labels` パッチ処理を追加。
- `src/runtime/worldRuntime.ts`: `presentation.patch` コマンドハンドラで `labels` の変更を検知し `"presentation.labels"` トピックを発行するよう対応。
- `src/controllers/labels-editor.ts`: `patchStateLabelLayout()` ヘルパーを追加（`stateLabel*` のIDのみ対象）。ドラッグ終了時 (`dx`/`dy`)、`changeStartOffset`/`changeRelativeSize`/`changeLetterSpacingSize`、および曲線の制御点ドラッグ終了・追加・削除時 (`pathD`) に `patchPresentation({ labels: {...} })` を呼んで永続化。
- `src/renderers/draw-state-labels.ts`: `drawStateLabels()` の最後に `applyLabelOverrides()` を追加し、`presentationData.labels[stateLabelId]` にoverrideがあれば `transform`/`startOffset`/`font-size`/`letter-spacing`/曲線の `d` を上書き適用。

テキスト自体（国家名）は意図的に対象外（`labels-editor.ts` の `changeText()` は元々 state label に対して「States Editorで変更してください」という警告を出すのみで、`pack.states[i].name` を書き換える設計になっている。これは正しい）。

### 1.3 未修正: 州ラベル (province label) — 同じ手法で直せる

`src/controllers/provinces-editor.ts:822-824` の `dragLabel()`:

```ts
function dragLabel(this: SVGTextElement, event: d3.D3DragEvent<SVGTextElement, unknown, unknown>): void {
  this.setAttribute("transform", `translate(${_dlX + event.x},${_dlY + event.y})`);
}
```

`transform` をDOM属性に書くだけで、どこにも永続化されていない（`patchPresentation` 相当の呼び出しが一切ない）。

対応する `src/renderers/draw-provinces.ts:32-40` の `ProvincesRenderer.render()`:

```ts
const labels = provinces
  .filter(p => p.i && !p.removed && isCellInScope(focusScope, p.center))
  .map(p => {
    const [x, y] = p.pole ?? cells.p[p.center];
    return `<text x="${x}" y="${y}" id="provinceLabel${p.i}">${p.name}</text>`;
  });

provs.html(`
  <g id='provincesBody'>${bodyPaths.join("")}</g>
  <g id='provinceLabels'>${labels.join("")}</g>
`);
```

`provs.html(...)` で `#provinceLabels` を含む中身を **丸ごと innerHTML 置換** しており、`transform` は一切引き継がれない。state labelより単純（曲線ではなく直線配置、`<textPath>` も使わない）なので、修正はより簡単なはず。

**次の修正方針（実施済みの state label と同一パターン）**:
1. `PresentationData.labels` はそのまま流用可能（キーを `provinceLabel${p.i}` にするだけ）。
2. `provinces-editor.ts` の `dragLabelEnd`（現状は "end" ハンドラ自体が存在しない → 追加が必要）で `patchPresentation({ labels: { [id]: { dx, dy } } })` を呼ぶ。
3. `draw-provinces.ts` の `render()` で、labels 生成後に `getPresentationLabel(presentationData, `provinceLabel${p.i}`)` を見て `transform` を上書き適用する処理を追加。

### 1.4 他のドラッグ系エディタの調査結果（`src/controllers/*-editor.ts`）

サブエージェントで全 `*-editor.ts` の d3 drag実装を洗い出した結果:

| エディタ / 対象 | 判定 | 根拠 |
| :-- | :-- | :-- |
| `markers-editor.ts`（マーカー） | 安全 | `moveMarker(...)` 経由 |
| `coastline-editor.ts` / `lakes-editor.ts`（頂点） | 安全 | `moveFeatureVertex(...)` 経由（ただし §2 の別バグあり） |
| `rivers-editor.ts` / `routes-editor.ts`（制御点） | 安全 | `replaceRiverGeometry(...)` / `replaceRoutePoints(...)` 経由 |
| `ice-editor.ts`（氷山移動） | 安全 | `pack.ice` 要素に直接書き込み、`draw-ice.ts` が読み戻す |
| `regiment-editor.ts`（位置・回転） | 安全 | `moveRegimentCommand(...)` / `reg.angle` 直接書き込み |
| `burg-editor.ts`（再配置） | 安全 | `moveBurg(...)` 経由 |
| `emblems-editor.ts`（COA位置） | 安全 | `el.coa.x/y` に直接書き込み |
| `cultures-editor.ts` / `religions-editor.ts`（中心点） | 安全 | `pack.cultures[i].center` 等に直接書き込み |
| `labels-editor.ts`（国家ラベル） | **修正済み**（§1.2） | |
| `provinces-editor.ts`（州ラベル） | **未修正・要修正**（§1.3） | 確認済みで再現性高い |
| `burg-editor.ts`（ラベル微調整ドラッグ、"fine-tuning only"） | 低確信・未調査 | DOM直書きだが `BurgLabelsRenderer` はkeyed joinで`transform`を触らないため通常描画では消えない可能性。burg追加/削除やマップ再読み込みで消えるかは未確認 |

burg label微調整は優先度低いが、次に手を付けるなら province label の次に見るとよい。

---

## 2. 湖の頂点を大きくドラッグするとland全体が青くなるバグ（未解決）

### 2.1 再現条件

- `viewContext.renderMode === "webglHybrid"`（**svgモードでは再現しない** — 後述）
- Lake Editor（`src/controllers/lakes-editor.ts`）で頂点を **大きく**（往復250px程度）ドラッグする
- SVGモードで同じ操作をしても問題なし。小さいドラッグ（20px程度）ではwebglHybridでも再現しない → ある程度大きな変形が必要

再現後、地図全体（ドラッグした湖から遠く離れた島も含む）が一様に青白く(desaturateされたような)色になり、州の塗り分け色が全て消える。`git stash` で無修正版に戻し、修正後のコードで再度直ったことを確認する形の切り分けは**まだできていない**（後述の通り、試した修正では直らなかったため）。

### 2.2 却下した仮説（実装したが効果なし）

`src/renderers/webgl/adapters/deckDataAdapters.ts` に以下2点を実装済み（残してある。副作用のない正しい防御的修正だが、**このバグ自体は直っていない**）:

1. **`getFeaturePolygon()`** (2172行目付近): 頂点を大きく動かすと `feature.vertices` から作るリングが自己交差（bowtie）することがある。SVGのネイティブpath塗りは自己交差を無害に処理するが、deck.glのGPU三角形分割はそうではない、という仮説。`toSimplePolygon()`/`hasSelfIntersection()`/`segmentsProperlyIntersect()` を追加し、自己交差を検知したら `d3.polygonHull()` で凸包にフォールバックする処理を追加。
2. **`buildLandMaskPolygons()`** (1748行目付近): 湖polygonを島のmaskの「穴」として使う条件が `isPointInsidePolygon(lake.points[0], island.points)`（**最初の1点だけ**）だった。`isFullyInsidePolygon()` に変更し、湖の全頂点が島の中に完全に収まっている場合のみ穴として使うように変更。deck.glの `MaskExtension`（`buildDeckLayers.ts:301-302,472-484`）は全land-mask polygonを **1枚の共有stencilテクスチャ** にまとめて描画するため、1つの不正な穴/外郭の組み合わせが地図全体のマスクを壊しうる、という仮説だった。

**検証結果**: 一時的なデバッグログで、(1)(2)とも正しく発火している（自己交差検知→凸包生成、該当の穴が正しく除外される）ことを確認したが、それでも `land pixel after drag` の色は **修正前と小数点以下まで完全一致**（`[127, 154, 196, 255]`、修正前と同じ)。さらに:

- `buildLandMaskPolygons()` を強制的に空配列にしても同じ症状（ただしこれは `hasLandMask=false` になり land レイヤー自体が生成されなくなる仕様のため、決定的な切り分けにはならない）
- ドラッグ後に `svg` → `webglHybrid` と renderMode を往復させてdeck.gl layerを完全再構築させても症状は変わらない → GPU側のstaleなキャッシュ/stencilの問題でもない

これにより、`getFeaturePolygon()` / `buildLandMaskPolygons()` を経由する「地物ポリゴン」パイプライン（湖・島の輪郭line、mask）は **原因ではない** と確認できた。

### 2.3 次に見るべき場所（未着手）

州の色を実際に塗っているのは `src/renderers/webgl/buildDeckLayers.ts:500-510` あたりの `createLandMaskedPolygonLayer({ id: "fmg-webgl-land", data: buildLandPolygonsBase(worldContext, viewContext.focusScope, landFill, landCells), ... })` で、この `landCells` は:

```
buildDeckLayers.ts:426-428
  const landCells = getCachedLandTopology(signatures.landGeometrySignature, () =>
    inProcessLandTopologyProjectionAdapter.project(buildLandCellGeometry(worldContext, viewContext.focusScope))
  );
```

- `buildLandCellGeometry()` (`deckDataAdapters.ts:325`): `pack.cells`/`pack.vertices` から **セル単位** でポリゴンを組む、`getFeaturePolygon()` とは完全に別の経路（`getCellPolygon()` at `deckDataAdapters.ts:2031` 付近を使用）。地物(feature)のvertices配列ではなく、セルの境界vertexを直接辿っている。
- `inProcessLandTopologyProjectionAdapter.project(...)` (`src/renderers/webgl/landTopologyProjectionAdapter.ts`) が全セルポリゴンをまとめて共有CSR/フラットバッファ (`src/renderers/webgl/flatLandTopology.ts` の `buildFlatLandTopology()`) に変換する。

**仮説**: ドラッグした湖の頂点が隣接する land セルの境界とも共有されている場合、`getCellPolygon()` あるいは `buildFlatLandTopology()` のCSR構築が、1つのセルの異常な頂点位置によって **オフセット計算やインデックス整合性が地図全体で崩れる**（1セルの異常が全体の共有バッファを巻き添えにする）可能性がある。`docs/webgl-renderer-migration-candidates.md` のPhase 7/8で言及されているtopology CSR化・Worker projection周りの実装（`flatLandTopology.ts`, `landTopologyProjectionAdapter.ts`）を読み、同様に「1点だけ大きく動かす」操作を模した単体テストかPlaywright再現で切り分けるのが次の一手。

再現用のPlaywrightスクリプト（このセッションでは `tests/e2e/_debug-*.spec.ts` として一時作成し、確認後に削除済み。再作成する場合の要点）:

```ts
// 1. seed=verify-lake でマップ生成、setRenderMode(page, "webglHybrid")
// 2. #lakes g use[data-f] を dispatchEvent(new MouseEvent("click", {..., view: window})) で直接クリック
//    (実座標クリックは湖が小さすぎてヒットしないため、DOM要素に直接dispatchするのが確実)
// 3. #vertices circle (r=0.4という極小ヒットターゲットなので同様にdispatchEventで操作)
//    を mousedown → mousemove(複数ステップ) → mouseup で250px程度動かす
//    (MouseEventには必ず view: window を渡すこと。省略するとd3の内部処理が
//     "Cannot read properties of null (reading 'document')" で例外を投げる)
// 4. gl.readPixels() で地図上の別の州の色をサンプリングし、ドラッグ前後で比較
//    canvas座標変換: readPixels(x*dpr, (canvas.height/dpr - y)*dpr, ...) (Y軸反転に注意)
```

### 2.4 このセッションで残した実装（保持推奨）

`src/renderers/webgl/adapters/deckDataAdapters.ts` の以下2点は、**今回のバグは直さなかったが**、それ自体は正しい防御的修正であり、他の破損シナリオ（自己交差ポリゴンのGPU三角形分割破綻、部分的にしか内包されない穴によるmask破損）を予防する。次のセッションで湖バグを追う場合も、これらは維持したまま追加調査するのが良い。
