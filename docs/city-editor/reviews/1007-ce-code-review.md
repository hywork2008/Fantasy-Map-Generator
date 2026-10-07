# City Editor コード・ドキュメントレビュー

レビュー日: 2026-10-07。対象: `master`（`90bada76e`）。レビュー: Claude（Opus 5.5）。

## 範囲と方法

CE は約4.5万行あり、全行は読んでいない。重点的に見たのは次の部分。

- データモデルと編集操作の土台: `core/mesh.ts`、`core/history.ts`、`core/gen/geom.ts`、`core/gen/edgeGraph.ts`
- 橋: `core/passages.ts`、`core/bridgeDeck.ts`
- ファイル読み込み: `core/document.ts`、`io/cityEditorFile.ts`
- `core/generate.ts` の構造
- `docs/city-editor/` の主な設計文書

「実測」と書いた項目は、使い捨てのテストを実行して確認した。テストは削除済み。「推定」はコードを読んだうえでの判断で、実行では確認していない。

## 重大度：高

### 1. 頂点を動かすと面が自己交差しても受理される（実測）

**原因**

`validate()`（`core/mesh.ts` の `validate`）が検査するのは次の3点だけである。

- 辺の長さが1m以上か
- 面積の絶対値が1以上か
- 参照が整っているか

design.md §5 が約束している「隣り合わない辺は交差しない／面は CCW／境界が閉じている」は実装されていない。

**実測**

Tiny グリッドで、中心付近の20頂点をそれぞれ30〜80m、6方向に動かした。

| グリッド | 受理された移動 | 自己交差面が残った | 面の向きが反転した |
| --- | --- | --- | --- |
| Voronoi | 360 | 200 | 12 |
| hex | 340 | 40 | 0 |
| evolution | 359 | 325 | 161 |

移動前は、全グリッドで自己交差する面は0だった。

**影響**

- UI の頂点ドラッグ（`ui/CityEditorPage.ts` の pointermove 処理）は、この `moveVertex` を直接呼んでいる。
- `splitFace` で凹んだ面を外側の対角線で割る操作も、面積が残るので通ってしまう。
- 生成側は `tryMoveVertex`（passages.ts）、`moveVertexWithNeighbors`（meshDeformation.ts）、`finishCityGeometry` の3か所が、それぞれ独自に交差チェックを持っている。`validate()` の穴を個別に補っている構図である。

**対策**

動いた頂点に接する面だけについて、「単純多角形か」と「向きが元と同じか」を検査する処理を `validate` 側にまとめる。生成側の3か所の重複はそれで置き換える。

### 2. Undo→Redo で生成結果の一部が消える（実測）

**原因**

`DocPatch`（`core/history.ts`）が差分の対象にしていないフィールドがある。

- `waterAreas`
- `importedRoadCount`
- `waterAccess`
- `biome`

生成はこの4つを書き換えるが、履歴はそれを記録しない。

**実測**

`waterAreas` と `importedRoadCount` を持つ文書を commit し、undo→redo した。`generationSeed` は戻ったが、`waterAreas` と `importedRoadCount` は `undefined` になった。河港や河川の水域が失われる。

**対策**

フィールドを足すたびに `DocPatch`・`diffDocument`・`applyPatch` の3か所を手で直す作りなので、同じ漏れが再発する。トップレベルのキーを総なめにする汎用の差分にする。

### 3. 橋の直角原則（AGENTS.md）をコードが保証していない

- `core/bridgeDeck.ts` の `bridgeDecks` 後半の分岐（「Roads can cross between mesh vertices」）は、橋の向き（デッキ）を河川の法線ではなく**道路自身の向き**で作る。斜めの橋を意図的に描くコードである。
- `straightenRiverCrossing` は、腕の頂点が門・城壁・ロック済み・他の河川上のいずれかだと動かさない（`bridgeArmIsFixed`）。
- `tryMoveVertex` は移動量を1、1/2、1/4、1/8と縮めて試すので、途中までしか動かないこともある。
- それでも最終検証（`validGeneratedCrossings` / `explainGeneratedCrossingFailures`）は、十字に交わっているかどうかだけを見ている。**角度は検査していない**。

**対策**

- 角度の上限を検証に入れ、違反した案は採用しない。
- 斜めのデッキは描かず、診断として出す。

### 4. テストスイートが大量に失敗している（実測）

`npx vitest run city-editor` を実行した。完了した分だけで、**25ファイル・約48件が失敗**した。失敗には次の橋関連テストも含まれる。

- `generate.bonenfeld.test.ts`「short perpendicular bridge」2件
- `gen/bridgeCrossing.test.ts`

所要時間も長い。`completeCity.test.ts` だけで507秒（14件失敗）かかり、全体は10分を超える。この状態ではリグレッションが起きても気づけない。

## 重大度：中

### 5. 面の向きがグリッドによって違う（実測）

- Voronoi と evolution は全面が CW、hex は全面が CCW だった。design.md は CCW を規定している。
- `geom.ts` の `inwardNormal` は「重心がどちら側にあるか」で内側を判定しているので、凹多角形では逆向きになる。C字形で `bufferPolygon` を実行すると、オフセットが凹みの側へはみ出すことを確認した。
- 現在 CE でこれを使っているのは、どこからも呼ばれていない `bufferPolygon` / `shrinkPolygon` だけである。ただし、向きに依存する処理を新しく書くと罠になる。

### 6. `simplifyPolyline(..., closed=true)` が最後の頂点を必ず落とす（実測）

- 閉じた輪郭を分割すると、後半の弧が先頭の頂点に戻らない。そのため最後の頂点が常に消える。
- 実測では、許容誤差0.25mに対して5mずれた頂点が消えた。
- `core/gen/riverPortShore.ts` は河岸の多角形にこれを使っている。その結果、輪郭を閉じる辺が弦になって岸を横切る。

### 7. A* のヒューリスティックが距離を過大評価している

- `core/gen/streets.ts` の `ringWeight` は、辺の長さに0.45倍や0.75倍を掛ける。
- そのため、直線距離を使うヒューリスティックが実際のコストを上回る。
- 結果として、環状道路の経路が最短にならない。
- `edgeGraph.ts` の `aStar` のコメントにある「コストは辺の長さ以上」という前提に反している。

### 8. ID の再利用と墓地の参照切れ（推定）

- `mesh.ts` の `nextNumericId` は、削除された ID を再び使う。design.md §9 が避けるとしている衝突そのものである。
- `mergeFaces` は `cemeteries[].faceId` と `coastalOceanFaceIds` を付け替えない。
- UI の `commit` は墓地を同期しない。
- その結果、古い墓地が残ったり、後で同じ ID を得た別の面に結び付いたりする可能性がある。

### 9. 性能

- ポインタが動くたびに、文書全体の `structuredClone` が走る。
- 同じく、O(E) の線形探索（`edgeBetween` / `incidentEdges` / `incidentFaces` / `protectedVertex`）も走る。
- `indexMeshEdges` という索引があるが、`mesh.ts` 内の操作では使われていない。
- `history.ts` のコメントは「参照の同一性で差分を省略できる」としている。しかし mesh の操作はすべて文書を丸ごと clone するので、実際には JSON 文字列で比較している。
- `fabric.generation.input` が生成前の文書をまるごと抱えているので、clone と比較のコストが倍になる。

## 重大度：低（構造・ドキュメント）

- **巨大な関数**
  - `applyPlan` 1167行
  - `runPlan` 933行
  - `mountCityEditor` 4872行。`let` で宣言された状態変数が139個ある。
- **`meshFromCells` の頂点統合**
  - 1m以内の頂点を「最寄り」ではなく「最初に見つかったもの」に統合する。
  - 3枚以上の面が同じ辺を使っても、`leftFace` / `rightFace` が黙って上書きされる。
- **design.md が実装とずれている**
  - §2 のモジュール一覧にある8ファイルは存在しない（validate.ts、geometry.ts、commands.ts、fromGeneration.ts、voronoiEdit.ts、Toolbar.ts、Inspector.ts、palette.ts）。
  - 初期格子の出どころが、廃止予定の city-generator のままになっている。
  - §5 で約束している検証は実装されていない（指摘1）。
  - これに対して generation-process.md は現状に詳しく沿っていて、よく保守されている。
- **一時ファイルが混ざっている**
  - `docs/city-editor/temp/`（1105行の Gemini ログなど）
  - `src/city-editor/temp/astra.md`
- **置き場所の問題**
  - `core/housingBatch.ts` と `core/housingReport.ts` は `worldContext` を import している。
  - 使っているのはツールのスクリプトとテストだけなので、CE のバンドルは汚れていない。
  - ただし `core/` に置くと、CE 本体の一部だと誤解される。
- **ライセンス境界**
  - 改善計画は、TownGeneratorTS（GPL）を「読んで関数単位で再実装する」方針を取っている。
  - 由来がたどれるよう、`core/gen/LICENSE-NOTE.md` の運用を続けることを推奨する。

## 良い点

- 乱数は決定論的（mulberry32 + xmur3）で、シードの派生方法も一貫している。
- 履歴は差分とチェックポイントの方式で、メモリ使用量に配慮した設計になっている。
- ランドマーク SVG の読み込みは、許可したタグと属性だけを通すので安全である。
- 生成を Worker に逃がしている。
- 失敗した生成の診断（`explainGeneratedCrossingFailures`、デバッグ用 SVG）が詳しい。

## 推奨する順序

1. テストスイートを緑に戻す。
2. `validate` に、面ごとの局所的な幾何検査を入れる（指摘1）。
3. 履歴の差分を汎用化する（指摘2）。
4. 橋の角度を検証に入れ、斜めのデッキを描く分岐をなくす（指摘3）。
5. 面の向きを統一し、`inwardNormal` を符号付き面積で判定するように直す（指摘5）。
6. `simplifyPolyline` の閉じた輪郭の処理と、A* の重みを直す（指摘6・7）。
