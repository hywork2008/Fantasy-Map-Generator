# CE 生成の性能調査と改善（総当たり処理の除去）

実施日: 2026-10-14
契機: 全体テストで10件が `Test timed out in 120000ms` になった（[S1記録](1014-skeleton-first-s1.md) §5.1）。タイムアウトの値を延ばさず、生成処理そのものの無駄を調べた。

## 1. 方法

- `node --cpu-prof` で mesh-first 生成のCPUプロファイルを取り、自己時間と呼び出し元別の包含時間を集計した（small voronoi 3条件＋tiny evolution の24都市）。
- 変更ごとに、固定 seed の20都市（5条件×4 seed）の**文書全体のJSONのハッシュ**を変更前後で比べ、完全一致を確かめた。失敗する1都市（`tiny-evolution-cape` 3、8試行すべて不採用）も同じ結果である。
- 速度は同じ20都市の生成時間の合計で比べた。

## 2. 見つかった無駄

どれも、位置や集合が変わらない間に同じ問いを何度も、メッシュの全辺（約1,700本）や全多角形に対して総当たりで解いていた。

| 場所 | 内容 | 影響（初回プロファイル） |
| --- | --- | --- |
| `mesh.ts` `validate` | 川の頂点ペアごとに `edgeBetween`（全辺を走査）。`splitFace`・`moveVertices`・`insertEdgeVertex` の編集のたびに全体を検証する | 17% |
| `passages.ts` `explainGeneratedCrossingFailures` / `validGeneratedCrossings` | 頂点ごとに `vertexHasCrossing`。その中で全辺の走査（`incidentEdges`）と、辺の種類別の集合・索引の作り直し（`kindEdgeIds`）を毎回行う | 約10% |
| `frameRoadJunction.ts` | 候補の移動ごとに `explain(work)` を再計算（`work` は採用されるまで同一） | 上に含む |
| `finishCityGeometry.ts` | 道路×城壁、道路×川、道路×墓地、城壁×川の全組合せに線分間距離を計算し、頂点を動かすたびに（4分割×最大8段階×10回）その全ペアを再評価。`clearanceAt` の呼び出しは約354万回 | 約26% |
| `riverWallRouting.ts` `repairRiverWalls` | 試行ごと（207回）に、全面の重心が市街地の全多角形に入るかを総当たりで判定（`interior`）。A\* の辺判定が川の全辺との距離を毎回計算 | 約35%（うち `interior` が約24%） |
| `completeRoadRouter.ts`、`gateApproaches.ts` | 頂点ごとの `throughEdgesAt`、道路の頂点ペアごとの `edgeBetween` | 約8% |

## 3. 変更

挙動は変えない最適化だけを行った。

- `validate`: 辺の端点の索引を1回だけ作る。`indexMeshEdges` も、辺ごとの `Set` の生成をやめた。
- `passages.ts`: `IncidentEdges`（頂点→辺の索引）を、`orderedIncidentEdges`・`vertexHasCrossing`・`throughEdgesAt` と `kindEdgeIds` の任意引数にした。引数なしの既定動作は変えていない。文書が変わらない範囲では、`crossingQueries` が索引と辺の種類別の集合を1回だけ作る。
- `frameRoadJunction.ts`: 文書ごとの失敗件数を `WeakMap` で記憶する。文書は `moveVertices` が複製を返すため、その場で書き換わらない。
- `finishCityGeometry.ts`:
  - 外接矩形の距離で、遠いペアの計算を省く（外接矩形の距離は線分間距離の下限であり、結果は変わらない）。
  - 頂点は「元の位置から目標位置への線分」の上しか動かないので、辺ペアが縮められる距離の上限（両辺の端点の最大移動量の和）がわかる。初期の下限距離からその上限を引いても要求距離に届くペアは違反しないので、検査から外す。
  - 近傍の判定用の関数を、呼び出しごとに作らず外へ出した。
- `riverWallRouting.ts`: 試行の間は変わらないメッシュの索引と川の辺集合を使う。壁の辺集合は、壁が置き換わる時だけ作り直す。`allowedEdge`・`clearVertex` を、壁ごとにメモ化する。`transverseArm` は頂点に接する辺だけを見る。`interior` は、多角形の外接矩形の外にある重心を先に除く。
- `completeRoadRouter.ts`、`gateApproaches.ts`: 索引を1回作る。メッシュが変わるまで同じ索引を使う（メッシュのインスタンスが変わった時に作り直す）。

## 4. 結果

| 段階 | 24都市のCPU時間（プロファイル） | 20都市の生成合計 |
| --- | ---: | ---: |
| 変更前 | 96.8 s | 56.7 s |
| `validate`・`passages`・`frameRoadJunction` | 69.0 s | 28.3 s |
| `finishCityGeometry` の枝刈り | 49.3 s | 28.3 s |
| `repairRiverWalls` の索引・メモ化・外接矩形 | 34.4 s | 22.4 s |
| `completeRoadRouter`・`gateApproaches` | — | 20.0 s |

- 20都市の生成合計は56.7秒から20.0秒（約65%減）。文書全体のハッシュは全段階で変更前と一致した。
- CE全体のテスト（`npx vitest run city-editor --maxWorkers=4`）は、1,416件中 1,397件成功・19件スキップ・失敗0。所要時間は345秒から245秒。
- 最も遅い試験は `aerialLandmarks.test.ts` の「draws a granary…」の68秒で、120秒の上限まで余裕は2倍弱。ほかは27秒以下。

## 5. 残る候補（未実施）

最新のプロファイル（34.4秒の時点）での上位。

| 場所 | 包含時間の割合 | 内容 |
| --- | ---: | --- |
| `harborShips.ts` `planHarborShips` | 14.8% | 未調査 |
| `blockInfill.ts` `buildBlockFabric`（`finishCoastalBuildings`） | 14.5% | 未調査 |
| `wards.ts` `placeTemple` → `civicPlacement.ts` `nudgeRectOffPolylines` / `hazardGap` / `orientedRectPolylineDistance` | 12.5% | 矩形と折れ線の距離を、候補ごとに全折れ線について計算している可能性 |
| `passages.ts` `throughEdgesAt` / `kindEdgeIds` の残りの呼び出し元 | 約8% | `repairRiverWalls` の別の呼び出し、`explain...` 以外 |
| `mesh.ts` `moveVertices` / `splitFace` | 7% | 呼ぶたびに文書全体を複製（`cloneMesh`）して検証する |

`aerialLandmarks` の試験が最も重いので、その経路（`aerialLandmarks.ts`）も確認する価値がある。

## 6. `planHarborShips` の調査（開始）

小 voronoi の bay・cape・random と tiny evolution の同3条件の計6条件×4 seed（24都市）で、`harbor-ships` 配下のProcessingProfilerの所要を集計した（生成合計 33.6 s）。

| パス | 所要 | 自己時間 | 呼び出し |
| --- | ---: | ---: | ---: |
| `harbor-ships` | 11.3 s（34%） | 0.005 s | 22 |
| `…/ship-plan`（`planHarborShips` 本体） | 11.3 s | 0.24 s | 22 |
| `…/block-fabric`（`buildBlockFabric`） | 11.1 s | 0.004 s | 21 |
| `…/block-fabric/coastal-reservations`（`finishCoastalBuildings`） | 7.5 s | 7.5 s | 21 |
| `…/block-fabric/legacy-fabric` | 3.3 s | 2.5 s | 21 |
| `…/block-fabric/harbor-fabric`（`planHarbor`） | 0.4 s | 0.4 s | 21 |

わかったこと:

- 船の配置そのもの（衝突判定など）は 0.24 s（2%）で無視できる。`planHarborShips` の 98% は `buildBlockFabric` である。
- §5 の `buildBlockFabric`（`finishCoastalBuildings`）の 14.5% は、この呼び出しとほぼ重複している。別の候補ではなく、同じ原因である。
- `harborShips.ts` は桟橋の一覧（`fabric.harbor.piers`）だけを使う。その `docFabric?.harbor` は `FabricPlan` にあたり、この時点では存在しないため、22回中21回で建物区画を含む完全なファブリックを作り直している。
- プロファイラを渡すと `buildBlockFabric` のキャッシュは使われない（`!profiler` の条件）。本番の呼び出しでキャッシュが効くかは未確認。

次の候補:

1. 桟橋の計算だけを取り出す。`planHarbor` が必要とするのは道路（`base.lanes`）と墓地の障害物だけで、建物区画（`finishCoastalBuildings`）は不要。ただし桟橋の位置が建物配置に依存していないことを確認する必要がある。
2. 後段で同じ文書のファブリックを作るなら、その結果を共有する。
3. どちらも、文書全体のJSONハッシュが変更前と一致することを確かめる。

調査用の集計スクリプトは、スクラッチ領域にあり、リポジトリには入れていない。

### 6.1 実施: 桟橋計画だけを作る

`blockInfill.ts` に `buildHarborPlan` を追加し、`planHarborShips` はこれを使うようにした。`buildBlockFabric` と同じ `legacy-fabric` → `planHarbor` を実行し、`finishCoastalBuildings` と成長整形（どちらも `harbor` を変えない）は省く。中世パターンの文書は従来どおり `buildBlockFabric` を呼ぶ。

- 12ケース相当（default・bay・cape・random × 2グリッド × 3 seed = 24都市）で、文書全体のJSONハッシュが変更前後で全件一致した。
- 生成合計は 29.2 s から 21.4 s（約27%減）。
- `harborShips`・`poilleneuzyHarbor` のテスト（19件）は成功、`tsc` も通った。CE全体のテストは未実行。
- 残り: `legacy-fabric`（約3.3 s／24都市）が `planHarborShips` 内に残る。後段で同じ文書のファブリックを作るなら共有できる（候補2）。

CE全体のテスト（`npx vitest run city-editor --maxWorkers=4`）: 1,416件中 1,397件成功・19件スキップ・失敗0。所要 233 s（前回 245 s）。

候補2（`legacy-fabric` の共有）は見送る。`spawnHarborShips` の後も `finishFixedConnections` などが文書を変えるため、同じ文書のファブリックを再利用できる場面が限られ、誤った古い結果を使うリスクのほうが大きい。

## 7. `buildBlockFabric`（`finishCoastalBuildings`）の調査

§6.1 の後に同じ24都市（default・bay・cape・random × 2グリッド × 3 seed）を再計測した（生成合計 21.5 s）。

- 標準の生成（`descriptor` なし）で `buildBlockFabric` を呼ぶのは `harbor-ships` だけだった。§5 の 14.5% は §6 と同じ原因で、`coastal-reservations`（`finishCoastalBuildings`）は計測に現れなくなった。この項目は解決済み。
- 残る `buildBlockFabric` 系は、`harbor-ships/ship-plan/block-fabric/legacy-fabric` の 2.8 s（13%、自己時間 2.1 s、`local-fabric` 0.65 s）。`planHarbor` は 0.3 s。
- `generateCity.ts` の `buildBlockFabric(result, new FabricCache())`（成長計画の前）は FMG の `descriptor` があり `urbanMorphology` がある場合だけ動く。上の計測の対象外で、未計測。
- 自己時間の上位は、`apply-plan` 8.5 s（40%）、`plan` 5.1 s（24%）、`legacy-fabric` 2.1 s、`finish-geometry` 1.6 s、`through-streets` 1.4 s。`apply-plan` と `plan` は内訳を計測しておらず、次に調べる価値がある。

## 8. `plan` と `apply-plan` の内訳

同じ24都市で、観測の区間計測（`generationTimer`）と `node --cpu-prof` を使った（生成合計 21 s、プロファイル 22.3 s）。`runPlan`・`applyPlan` にはプロファイラが渡されていないため、関数単位の内訳は CPU プロファイルから取った。包含時間は同じ関数の再帰と複数の呼び出し元を重ねて数えないよう、呼び出し元ごとに集計した。

### 8.1 `plan`（4.9 s、23%）

ほぼすべてが `wards`（4.4 s）で、その中身は1点に集中している。

| 関数 | 包含時間 |
| --- | ---: |
| `assignWards` → `placeTemple` → `placeTempleFootprint`（`civicPlacement.ts`） | 4.1 s（19%） |
| └ 無名関数（候補の列挙） | 2.3 s |
| └ `placeAndClearTempleRect` → `nudgeRectOffPolylines` | 1.8 s（呼び出し元別。全体では 2.7 s） |
| 　└ `hazardGap` → `orientedRectPolylineDistance` | 2.1 s（うち距離計算 2.0 s） |

`wards` の残り（`fillInner` 0.09 s ほか）は無視できる。§5 の `placeTemple`（12.5%）は、実際にはこの 19% の一部である。

### 8.2 `apply-plan`（8.1 s、39%）

| 段階 | 包含時間 | 主な中身 |
| --- | ---: | --- |
| `applyGates` | 4.1 s | `repairRiverWalls` 2.7 s、`finishCityGeometry` 0.9 s |
| `applyRoads` | 2.7 s | `shortcutExteriorRoads`（`gateApproaches.ts`）1.3 s、`applyCrossings` 0.4 s、`connectDryCellInteriors` 0.3 s、`completeRoadRouter` 0.2 s |
| `finalizeAssembly` | 0.8 s | — |
| `applyCircuits` | 0.3 s | — |

`repairRiverWalls` と `finishCityGeometry` は §3 で最適化済みだが、依然として最大の塊である（合わせて 3.6 s、17%）。区間計測の `wall-junctions` 1.7 s・`route-junctions` 2.7 s・`smooth-boundaries` 0.9 s は、これらとおおむね対応する。

### 8.3 自己時間の上位

`nearestOnPolyline` 1.6 s、`pointInPolygon` 1.5 s、GC 1.4 s、`orientedRectPolylineDistance` 1.2 s、`cloneMesh` 1.1 s、`indexMeshEdges` 1.0 s。メッシュの複製と索引の再作成（`cloneMesh`・`indexMeshEdges`・`incidentFaces`・`incidentEdges`・`validate`）の自己時間の合計は約 4.4 s で、`moveVertices`・`splitFace` の呼び出しが原因である（§5 の最後の行）。

### 8.4 次の候補（効果の大きい順）

1. `placeTempleFootprint`（4.1 s）: 矩形と折れ線の距離を、候補ごとに全折れ線について計算している。折れ線の外接矩形で遠いものを除く、距離が閾値を超えると分かった時点で打ち切る、などで削れる見込み。
2. `repairRiverWalls`（2.7 s）: 残りの内訳を測る。
3. `shortcutExteriorRoads`（1.3 s）と、`moveVertices`・`splitFace` の複製と検証（約 4.4 s）。

## 9. 実施: `placeTempleFootprint`（§8.4 の1）

`civicPlacement.ts` の2点を、結果を変えずに改めた。

- `orientedRectPolylineDistance`: 矩形の外接矩形から遠い線分を、交差判定と最短距離の計算から外す。交差の後に残る「貫入ゼロの救済」の処理（直前までの線分が交差し貫入が0の間は、後続の線分も評価する）は従来どおり通す。距離の計算は `nearestOnPolyline` と同じ式を使い、現在の最小値より外接矩形の隙間が大きい線分だけを省く（許容 1e-6）。
- `placeTempleFootprint`: ソートの比較関数が比較のたびに `score`（その中の `wet`・`streeted`＝セル内部の全折れ線判定）を再計算していたので、スコアを1回だけ計算して使う。`wet`・`streeted` も、セルごとにメモ化する。

結果:

- 36都市（12条件×3 seed）の文書全体のJSONハッシュが、変更前後で全件一致した。
- 生成合計は 30.0 s から 23.6 s（約21%減）。そのうち、外接矩形の枝刈りが約3 s、スコアとメモ化が約3.5 s。
- CE全体のテスト: 1,416件中 1,397件成功・19件スキップ・失敗0（217 s）。`tsc` も通った。
- `placeTempleFootprint` は 4.1 s から約0.8 s 前後に減る見込み。再プロファイルで確認していない。

## 10. `repairRiverWalls` の残りの内訳（調査）

§9 の後に再プロファイルした（24都市、プロファイル 18.4 s）。`repairRiverWalls` は 2.7 s（15%）で、一つの重い箇所はなく、次のように分散している。

| 内訳 | 時間 | 内容 |
| --- | ---: | --- |
| `splitFace` | 0.44 s | `validate` 0.15 s、`clone` 0.13 s、`rebuildFaceSides` 0.06 s |
| `openRiverWallPassage` | 0.34 s | 中で `insertEdgeVertex` 0.11 s と `splitFace` 0.11 s |
| `clone`（試行ごとの文書複製） | 0.30 s | ほぼ `cloneMesh` |
| 試行本体（A\* ほか） | 約 0.7 s | `aStar` 0.13 s、辺の許可判定ほか |
| `vertexHasCrossing` ほか | 約 0.26 s | `orderedIncidentEdges` が 0.09 s |
| `edgeBetween` | 0.15 s | 全辺走査 |

つまり約 1.3 s（半分弱）は、メッシュを複製して全体を検証するコストである。これは `moveVertices`（`clone` 0.63 s、`validate` 0.49 s、`movedGeometryErrors` 0.41 s）と同じ構造で、生成全体では `cloneMesh`・`indexMeshEdges`・`validate` などの自己時間が合計で約 4 s（20%）ある。

小さく確実に削れる箇所（`edgeBetween` の索引化、`vertexHasCrossing` の索引共有）の効果は合わせて 0.3 s 程度にとどまる。大きな効果を得るには、次のどちらかの構造変更が要る。

1. 文書の複製をコピーオンライトにする（試行が触る面・辺・頂点だけを複製する）。
2. `validate` を変更箇所に限った差分検証にする。

どちらも `mesh.ts` の全呼び出し元に影響するため、方針を決めてから進める。

## 11. コピーオンライト複製の実現性（調査、未実施）

結論: 全体の `clone` をコピーオンライトにするのは、現状のコードでは安全に行えない。実装は見送り、判断を待つ。

- メッシュのレコード（頂点・辺・面）は、複製後に呼び出し側が**その場で書き換える**前提になっている。`city-editor` 配下で、`mesh.faces/vertices/edges[...]` への直接代入が14か所、`properties.x = …` が約60か所、`face/vertex/edge.boundary/point/a/b/leftFace/rightFace = …` が16か所ある。別名を介した書き換えは、この数に含まれない。
- `clone(` の呼び出し元は104か所。レコードを複製元と共有すると、これらの書き換えが複製元の文書に漏れ、他の試行や元の文書を壊しうる。
- 凍結（`Object.freeze`）や `Proxy` による検出も使われていない。

限定的な形（`repairRiverWalls` の内部だけで共有し、返す直前に1回だけ深い複製をする）なら安全にできる。ただし `splitFace`・`insertEdgeVertex`・`moveVertices`・`openRiverWallPassage` を、書き換える前にレコードを複製する版に直す必要があり、それらは `mesh.ts` の他の呼び出し元と共有されている。見込める効果は、`repairRiverWalls` の複製分の約 0.7〜0.8 s（生成全体の約4%）にとどまる。

## 12. `aerialLandmarks.test.ts` の「draws a granary…」（68 s → 数秒）

単独実行で 45 s（並列実行時の 68 s は負荷の影響）。内訳は、`buildBlockFabric` が 21 s、`renderEditorSvg` が 22 s。後者は `prepareTownFacts` が同じ文書の `buildBlockFabric` を再度作るため（試験は別の `FabricCache` で作ったので既定のキャッシュに載らない）、実体は同じ処理の2回分である。

`--cpu-prof` では、全体の約8割（37 s）が `finishCoastalBuildings` → `absorbCellars`（`cellarAbsorption.ts`）→ `growAll` → `growRear` で、`roadDistance`→`nearestOnPolyline` が 16 s、`growRear` 自身が 21 s だった。ワインなどの貯蔵庫（cellar）の面積を家の奥行きに足す処理で、次の無駄があった。

- 家ごとに、全道路の全線分に対する最短距離を、辺の中点・頂点・移動後の頂点ごとに総当たりで計算していた。
- 4段階の縮尺（1, 0.5, 0.25, 0.1）で同じ家の距離を毎回やり直していた（縮尺に依存しない値）。
- 隣家との干渉判定が、全家 × 全家の `pointInPolygon` だった。

変更（挙動は変えない）:

- `RoadIndex`: 道路の線分を一様格子（40 m）に入れ、近い格子から順に探す。未探索の格子に今の最短より近い線分が無いと言えた時点で打ち切る。距離は `nearestOnPolyline` と同じ式で計算するので、最小値は全走査と一致する。
- `rearPlan`: 家ごとに、縮尺に依存しない値（辺の中点の距離、後ろの辺、法線、頂点の距離、元の面積）を1回だけ計算し、4段階で共有する。移動後の距離は、動いた2頂点だけを計算し直す。
- 隣家の判定は、外接矩形（許容 1e-6）の外にある点をポリゴン判定から外す。面の輪郭は、面ごとに1回だけ作る。

結果:

- 試験の `buildBlockFabric` は 21.7 s から 2.0 s。生成物（`JSON.stringify` の SHA-1）は変更前後で一致した。
- CE全体のテスト: 1,416件中 1,397件成功・19件スキップ・失敗0（209 s）。`tsc` も通った。
- この処理は、貯蔵庫（cellar）を持つ都市（FMGの経済データがあるもの）で動く。標準の合成生成の計測（24都市）には現れないため、生成合計の短縮には含まれない。
