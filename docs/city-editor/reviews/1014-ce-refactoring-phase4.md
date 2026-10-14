# CE リファクタリング Phase 4 実装記録

着手日: 2026-10-14。着手時コミット: `e3b9cb176`。
設計: [アーキテクチャ規約](../architecture.md) §6。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。

着手時の `render/svg.ts` は4,085行。`renderEditorSvg` が約1,500行の単一関数で、基準の `render/` テスト（13ファイル・151件）は全件成功している。

## 1. svg.ts の generator 呼出し分類（ロードマップ4-1）

`renderEditorSvg` 内の `core/` 呼出しを、都市の事実を決めるものと描画専用計算に分けた。事実を決める呼出しは、描画の都度に再計算されている点が問題である。

### 都市の事実（生成または読み取り専用の準備工程へ移す対象）

| 呼出し | 現在位置 | 決める事実 |
| --- | --- | --- |
| `buildBlockFabric` / `buildCityBuildings` | 建物lot、農地、公園、港、水車、空撮ランドマーク | 建物・農地・桟橋の存在と位置 |
| `measureHousingCapacity` | 同上 | 住宅収容量、未配置住戸（`data-*` 属性へ出力） |
| `buildWatermillPlan` / `buildParkLawns`（fabric無しの経路） | 同上 | 水車・公園の存在 |
| `farmSheds` | 農地描画内 | 農小屋の存在 |
| `ferryPlan` | river connection描画 | 渡し船の着岸点・航路 |
| `computeCemeteryBoundary` / `layoutCemetery` | `renderCemeteries` | 墓地の境界・墓の配置 |
| `harborWaterField` / `seaBerthIsNavigable` / `riverPortShore` | 桟橋・船・クエイ描画 | 停泊可否、河港の実岸線 |
| `bridgeDecks` / `overSkewedBridgeDecks` | 橋描画 | どの橋を描くか（斜交規約は `bridgeSkewPolicy` に集約済み） |
| `currentFixedCrossingApproaches` / `frameRoadTownConnection` / `externalRoadLabels` | frame道路・approach | 外部道路の接続・目的地 |
| `MoatReservation.roadParts` | feature描画 | 堀を渡る道路の橋区間 |

### 描画専用計算（renderers に残す）

`roundedFarmPolygon`、cobble・縁石・舗装の帯、`dryRuns` 等のクリップによる表示用の切出し、`riverRibbons` による道路の切断表示、アイコン・装飾（`renderTempleSvg`、`renderCastle`、wall/gate/tower decoration、ship SVG）、質量表示の `townExtentMeters` 由来の品質判定。

### 判断が残る箇所

- `dryRuns` / `roadRunsOutsideRivers` / `clipPolylineToExterior`: 道路の存在は変えず表示区間だけを切るため描画専用とする。ただし橋区間（`MoatReservation.roadParts`）は橋の存在を決めるため、事実側の準備工程へ移す。
- `fixedDocumentGeometry`: 固定地図由来の読み取り専用準備。事実側のpreparationとして扱う。

## 2. 実装済みの変更

### 2-1. overlays と SVG 基本部品の分離（ロードマップ4-4の一部、4-5の一部）

動作を変えない機械的な移動のみ。

| 新ファイル | 責務 |
| --- | --- |
| `render/svgPrimitives.ts` | `element`/`line`/`polygon`/`centroid`/`isPoint`/`edgeGroupPoints`/`NS`。形状→文字列とDOMノード生成のみ |
| `render/overlays.ts` | grid scrub、hover、measure、選択ラベル、route preview。`GridOverlay`/`RenderSelection`型 |

- `svg.ts` は overlays のAPIを再exportする互換窓口を持つ。利用者（`CityEditorPage.ts` 等）の移行と再export削除はPhase 6で行う。
- `overlays.ts` は `svg.ts` を import しない（循環なし）。DOM書込は `svgPrimitives.element` に限る。
- 文書への書込・新しい長寿命参照・キャッシュは追加していない。

検証:
- `npx tsc --noEmit` エラー0。
- `npx vitest run src/city-editor/render`: 13ファイル・151件成功（着手前と同数）。

### 2-2. 町ビューの事実準備（ロードマップ4-2の一部）

`render/townFacts.ts` の `prepareTownFacts(document)` が、block fabric・建物lot・住宅収容量・水車計画・公園を、DOM書込の前に一度だけ読み取り専用で用意する。`renderEditorSvg` はその結果を使う。条件分岐・呼出し順・出力属性は従来どおり。公園の準備は描画中から前へ移ったが、純粋計算で文書を変更しないため結果は同じ。fabricの再利用は既存の `buildBlockFabric` 内cacheが引き続き所有し、新しいcacheは追加していない。残りの事実（ferry・墓地・港・橋deck・外部道路接続・堀の橋区間）は未移行。

検証: `tsc` エラー0、`render/` 151件成功。

### 2-3. 橋deckと墓地計画の準備（4-2の続き）

`townFacts.ts` に `drawableBridgeDecks`（斜交上限超過の橋を除いたdeck。AGENTS.mdの規約判定は `overSkewedBridgeDecks` / `bridgeSkewPolicy` のまま、閾値の複製なし）と `resolveCemeteryPlans`（保存済み計画、無ければ墓地wardの面から導出。文書は変更しない）を移した。`svg.ts` は結果を描くだけになった。`ferryPlan` は既存の接続単位cache（document・riverFlows世代で無効化）が所有するため、移さず現状維持とした。

検証: `tsc` 0、`render/` 151件成功、`lint:architecture` 違反なし。

### 2-4. `renderEditorSvg` の責務別分割（4-3）

`svg.ts` を4,085行から2,309行へ縮小した。機械的な移動で、挙動・描画順は変えていない。`RenderContext`（`renderContext.ts`）は一回の描画で共有する読み取り専用の入力（document/tool/selection/zoom/town/fixedMode/fixedGeometry/lightweight/minimal/hide*/preview）だけを持ち、各層は書き換えない。

| 新ファイル | 責務 |
| --- | --- |
| `featureLayerSvg.ts` | 道路・河川・城壁・橋のfeature群、河川接続道路と渡し船、approach label。`.ce-features` 群を返す（後段が城壁・橋を取り出すため） |
| `moatSvg.ts` | 堀、跳ね橋、城門の堀判定 |
| `frameRoadSvg.ts` | frame道路、石畳、固定crossingとの重複判定 |
| `cityElementsSvg.ts` | city element marker（井戸・神殿・船等）と歴史ランドマーク |
| `landmarkSvg.ts` | ward landmark・要素marker・樹木・正規化ランドマークSVG |
| `castleStyle.ts` | 新様式の城判定 |
| `approachLabelSvg.ts` | 外部道路ラベル |
| `pickInfo.ts` | `SvgPickInfo` / `parsePickInfo` |

`svg.ts` は従来のexportを再exportする互換窓口を保つ（Phase 6で撤去）。新ファイルは `svg.ts` をimportしない。

検証: `tsc` 0、`render/` 151件成功。**出力同一性**: 3シナリオ×3seedの生成都市で、`renderEditorSvg`（detailed/light）と `serializeCitySvg` のSHA-1を分割前後で比較し、27件すべて一致（`artifacts/city-editor/phase4-20261014/hash-{before,after}.json`）。

### 2-5. 残りの描画層の分離（4-3 完了）

`svg.ts` は互換窓口のみ（22行、再exportだけ）になり、描画本体は `editorSvg.ts`（`renderEditorSvg`、約350行の工程調停）へ移った。

| 新ファイル | 責務 |
| --- | --- |
| `townFabricSvg.ts` | 建物・農地・公園・小路と占有率`data-*`。後段が使う `TownLayerPlans`（港・公園・水車・空撮ランドマーク）を返す |
| `townStructuresSvg.ts` | feature層より上の町要素（桟橋・水車・barbican・城壁・要塞・公園・樹木） |
| `quaySvg.ts` / `watermillSvg.ts` / `townFortificationSvg.ts` | 水辺施設と城壁・堀まわりの描画 |
| `castleLayerSvg.ts` / `cemeterySvg.ts` | 城・墓地レイヤー |
| `coastalShoreSvg.ts` | 自然海岸の砂浜帯。ランドスケープの保護領域も更新 |
| `fixedCrossingLayerSvg.ts` | 固定crossingのapproachと橋 |
| `gateLayerSvg.ts` / `editHandlesSvg.ts` / `sceneFrameSvg.ts` | 城門marker、頂点handle・生成ステップ軌跡、scene領域と最終クリップ枠 |
| `standaloneSvg.ts` | 単独SVGの構築（`renderStandaloneCitySvg`、スタイル） |

### 2-6. 形状計算とDOM書込・出力の分離（4-5）

- 形状計算（DOMなし）: `labelLayout.ts`（選択ラベルの大きさと配置、vertex handle半径）、`townShapes.ts`（`roundedFarmPolygon`、固定approachの `corridorPathData`）。DOM書込側はそれらを呼ぶだけ。
- 出力調停: `serializeSvg.ts` の `serializeSvgFile` がXML宣言とserializeを一か所で担当。`standaloneSvg.ts`・`previewSvg.ts` が共有する（以前は二重実装）。構築（`renderStandaloneCitySvg`）と出力文字列化は別関数。
- `services/io` への移設（`serializeCitySvg` 等の置き場）は呼出し元が多く（UI・スクリプト・テスト・vi.mock）、互換窓口の整理と合わせてPhase 6で行う。

### 2-7. 派生キャッシュの規約（4-6）

`render/derivedCaches.ts` に所有者・キー・無効化・解除の一覧を記載した。要点:

- 派生結果は保存せず、正しさに必要としない（再計算で同じ結果）。保存形式への追加なし。
- block fabric: 文書オブジェクト＋内容fingerprintで無効化（in-place編集も検知）。文書のGCで解放。共有LRUは256件上限。
- ferry plan: connection・document・`riverFlows` の同一性で無効化。connectionのGCで解放。
- 事実準備（`prepareTownFacts`、橋deck、墓地計画）は意図的に非キャッシュ。高コスト部分はfabricのcacheが担い、文書全体のfingerprintは節約分より高くつくため。新規cacheは計測と本表への追記を条件とする。
- 解除地点: `clearRenderDerivedCaches()`（`clearBlockFabricCache` を含む）をエディタのmount時に呼ぶ。文書置換ごとの呼出しはPhase 5のライフサイクル整理で追加する。

### 2-8. 残りの事実を準備工程へ（4-2 完了）

描画関数から次の「何が存在するか」の決定を外し、読み取り専用の準備関数に移した。描画側は結果を描くだけで、これらのcore関数を直接呼ばない。

| 準備モジュール | 決める事実 | 描画側 |
| --- | --- | --- |
| `harborPierFacts.ts` | 計画桟橋のうち着岸陸地が残るもの、桟橋が無い港の海岸に置く桟橋（水域内・乾地・入江でない）、係留船の港陸地の有無 | `quaySvg.ts`、`cityElementsSvg.ts` |
| `moatRoadFacts.ts` | 道路ranを堀で分け、乾いた部分と橋deckを得る（`MoatRoadSplitter`） | `featureLayerSvg.ts` |
| `approachFacts.ts` | 外部道路ラベル（文言・関係・位置・分岐先）、河川接続道路と渡し船、frame道路legと町縁の接続、固定approach（epoch一致時のみ） | `approachLabelSvg.ts`、`featureLayerSvg.ts`、`frameRoadSvg.ts`、`fixedCrossingLayerSvg.ts` |

桟橋は `TownLayerPlans`（`townFabricSvg.ts`）が `plannedPiers` / `fallbackPiers` として運ぶ。港計画に桟橋がある場合は従来どおり代替桟橋を計算しない。表示用の乾地クリップ（`dryRuns` 等）は道路の存在を変えないため描画側に残した。

検証: `tsc` 0。出力同一性の153件は着手コミットと再び完全一致。`render/` と関連core（gate approach、frame road、河港、港）のテスト成功。唯一の失敗2件（`gateApproaches.test.ts`）はPhase 0基準の既存失敗。

## 3. 検証

- 型検査・biome・`lint:architecture`: エラー/違反なし。
- 出力同一性: 分割前（着手コミットのworktree）と現在で、3シナリオ×3seed×17条件（品質3×選択2×ツール2、建物非表示、プレビュー、scene可視性、グリッド表示）＋単独SVGの計153件のSHA-1が完全一致（`artifacts/city-editor/phase4-20261014/hash-matrix-{before,after}.json`）。
- 新規 `render/renderContract.test.ts`（4件）: 描画で文書JSONが変わらない、再描画で要素が蓄積せず出力が同一（cache解除後も同一）、レイヤー順、pick metadataと単独SVGの自己完結性。
- 描画時間（中央値15回、ms、前→後）: landlocked detailed 100.3→93.7、light 60.4→60.7、coast detailed 147.7→146.7、light 119.2→116.3、bay detailed 169.4→169.8、light 130.8→128.7。退行なし（`perf-{before,after}.json`）。
- 再計算: 各描画は従来どおり `buildBlockFabric` のcacheを利用し、新しい重複計算は追加していない。

## 4. 残る事項

- `landscape.ts`（951行）、`shipSvg.ts`（1,822行）、`templeSvg.ts`（1,621行）、`townFabricSvg.ts`（397行）等の大きい描画モジュールは今回対象外。Phase 7で責務として残す理由を記録する。
- `svg.ts` 互換再exportの撤去とcacheのmount以外の解除地点はPhase 5/6。

## 5. 後続フェーズでの完了確認（2026-10-14追記）

上記は各実施時点の記録を維持している。互換再exportはPhase 6で撤去し、文書置換・disposeでのcache解除はPhase 5〜7で確認した。大きい描画moduleの残置理由、生成・描画不変性、大都市の同条件比較と終了後の参照回収は[Phase 7総合検証](1014-ce-refactoring-phase7.md)に記録した。Phase 4の残事項は収束済み。
