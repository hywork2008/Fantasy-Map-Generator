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
