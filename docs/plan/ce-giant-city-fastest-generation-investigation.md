# CE巨大都市の最速生成 調査・試作計画

作成日: 2026-10-15
状態: 計画のみ（未着手）

人口215,000人級の巨大都市を、**手段を選ばず最速で生成する**ための調査・試作・計測の計画。問いは「街道・河川・市壁の経路と直線化の処理量を考えると、[骨格先行（Skeleton-first）](../city-editor/plan/skeleton-first-generation.md)にすべきか」。捨てる前提の試作を許し、計測で採否を決める。

前提資料:

- [CE人口215,000人の生成性能計測](ce-population-215000-performance-report.md) — 本書の数値の出所（seed `ppi409`、Vite開発サーバー）
- [CE都市生成の最速化計画](ce-generation-max-speed-plan.md) — 通常規模596都市の最速化（S0〜S3完了）
- [骨格先行生成 設計書](../city-editor/plan/skeleton-first-generation.md)、[S3記録](../city-editor/reviews/1014-skeleton-first-s3.md)
- [橋の斜交規約](bridge-skew-policy.md) — 高速化でも緩めない（`src/utils/bridgeSkewPolicy.ts`）

## 0. 結論（先に）

**現在の骨格先行（S3の実装）に乗り換えても、巨大都市は速くならない。** ただし骨格先行の考え方を「道路まで」広げた別方式は、最有力の試作候補である。理由は次の4点。

1. **骨格先行が置き換えるのは、時間のかからない部分だけ。** 骨格先行は `planCoast`〜`planDefenses` を置き換え、`planRoads`・`planWards`・`applyPlan`（経路接続）と後段の修復（`straightenThroughStreets` など）は現行のまま通す（設計書§4.7）。215,000人の都市では、置き換わる計画段は2.4秒、平滑化と壁の接合を足しても約4秒。Worker 37.6秒の大半を占める直線化約10秒、経路接続約8.4秒、Voronoi調整約4.3秒、住宅約3.9秒はそのまま残る。
2. **骨格先行の利点は「失敗を安く捨てる」ことだが、巨大都市は1回目で成功している。** 215,000人の計測は両回とも試行1回目で成功した。やり直しの削減はゼロになる。
3. **実測では、骨格先行のほうが遅い。** FMG連携86都市で、中央値 454 → 839 ms、p95 2.9 → 45.6 s、最大 175 s（S3記録§5）。骨格に沿うメッシュ（K6）の細かい面を、後段が大量に調べるため。
4. **骨格先行は二重城壁に未対応。** 計測した都市は二重城壁である（S4の残り）。

遅さの本体は、方式（メッシュ先行か骨格先行か）ではなく、**編集のたびに文書全体を複製して全体を検証する実装**にあると考える（§2）。これは両方式に共通する。したがって本計画は次の2本を並べて試し、計測で決める。

- **路線A（エンジン）**: 編集を「その場で変更し、失敗したら戻す」方式に変え、検証を局所化する。方式に依らず全工程に効く。
- **路線B（道路の骨格化）**: 道路の経路探索と直線化を、メッシュ上の頂点移動ではなく、粗いグラフ上のベクトル線として行い、最後にメッシュを線に沿わせる。直線化の工程そのものを無くす。骨格先行のK6を道路にも使う形になる。

さらに、メインスレッドの描画データ構築（8.7秒）と、領域を分けた並列化を別系統で試す（路線C・D）。

## 1. 現状の数値（第3段の後、215,000人、2回目）

| 区間 | 時間 | 備考 |
| --- | ---: | --- |
| クリックから表示完了 | 47.7 s | |
| Worker内の生成 | 37.6 s | |
| 　通過道路の直線化 `through-streets` | 約10.5 s | 第2段で事前判定を入れた後 |
| 　経路接続（`applyPlan` 内） | 約8.4 s | 内訳は未計測（`road-routing` は `elapsedMs=0` を送る） |
| 　Voronoi街区の形状調整 | 約4.3 s | |
| 　住宅の配置・集計 | 約3.9 s | |
| 　計画（地区の割り当てが2.15 s） | 約2.4 s | 骨格先行が置き換えるのはこの部分 |
| 　城壁の接合＋内壁 | 約3.1 s | 1.8 s + 1.2 s |
| 　平滑化・fabric計画ほか | 約4 s | |
| 結果受信からUI更新 | 約9.8 s | うち初回 `town-fabric` 8.7 s |

メッシュは9,021面、建物は推定約47,900棟。第2段・第3段の時間は一部の工程を足した値で、全体の内訳は第0段の表から推定した。§3 E0で測り直す。

## 2. 仮説: なぜ巨大都市で遅いのか

| # | 仮説 | 根拠 | 確かめ方 |
| --- | --- | --- | --- |
| H1 | **編集1回ごとに O(N) の作業がある。** `moveVertices` は文書の複製（`clone`）、全面の走査（`movedGeometryErrors`）、全体の検証（`validate`）を毎回行う。直線化はさらに `crossingFailureCount`、`frameRoadApproachBend` も毎回行う。候補の数も N に比例して増えるので、全体は O(N²) に近い | [mesh.ts](../../src/city-editor/generators/mesh.ts) の `moveVertices`・`validate`、[frameRoadJunction.ts](../../src/city-editor/generators/frameRoadJunction.ts) の `straightenThroughStreets` | E0の規模別の増え方、E1の呼び出し回数 |
| H2 | 経路接続も、試行ごとに文書全体を作り直す編集の連続になっている | 第0段の「経路接続8.4秒」。内訳は未計測 | E1 |
| H3 | 決まった値を、全体を走査して何度も求めている（地区の割り当て、Voronoi調整） | 第0段 P2 | E1のプロファイル |
| H4 | メインスレッドが、Workerで作ったものと同じfabricを作り直している | 初回 `town-fabric` 8.7 s | E6 |
| H5 | Vite開発サーバーの値で、製品ビルドとの差が不明 | 全計測が開発サーバー | E0 |
| H6 | GCが2割前後を占める（通常規模の計測） | 最速化計画§12.3 | E0の `--cpu-prof` |

H1が正しければ、骨格先行でも路線Aなしでは同じ問題が残る。骨格先行のK6は面が細かく N が大きくなるので、むしろ悪化する。§0の3の実測と合う。

## 3. 実験の一覧

すべて**捨ててよい試作**として、ブランチ `proto/giant-*` で行う。各実験に「打ち切りの条件」を決めておく。品質の基準は§5。

### E0 計測の土台（最初に行う。捨てない）

- **ブラウザを使わないCLI** `npm run ce:perf:giant` を作る。`generateCity` をNodeから直接呼び、人口 15k / 50k / 100k / 215k / 300k、seed 5個で、工程ごとの時間を `ProcessingProfiler` からJSONLに出す。既存の `scripts/benchmarkCePopulation.mjs` と `ce:perf` の部品を使う。
- 各工程について、**規模に対する増え方の指数**（時間 ∝ 面数^k）を求める。k > 1.3 の工程が路線Aの対象。
- `road-routing` に実際の時間を入れ、経路接続を「経路探索 / メッシュ編集 / 橋と門の接続」に分ける。
- 製品ビルド（`vite build` + `vite preview`）で、`profileCePopulation.mjs` を1回流し、開発サーバーとの差を記録する（H5）。
- 出力の同一性を比べる指紋（`fingerprint.document`）を、巨大都市にも使えるようにする。
- 計測は負荷が揺れるので、**同じ日に `git stash` した基準と比べる**。

完了条件: 215k の Worker 37.6 s の内訳が、10工程以上に分かれて合計が一致する。

### E1 複製と検証の量を数える（半日）

`clone`・`validate`・`movedGeometryErrors`・`crossingFailureCount` の呼び出し回数・合計時間・処理した要素数を、呼び出し元の工程ごとに数える。

- 判定: 4つの合計が Worker 時間の40%以上なら、路線Aを最優先にする。20%未満なら H1 を捨て、E3（路線B）とE5（並列）に重みを移す。

### E2 路線A: 取り消し可能な編集（試作 2〜3日）

`MeshTransaction` を作る。文書を複製せずに直接書き換え、変更前の値を記録しておき、失敗したら記録から戻す。検証は**変更した頂点に接する面・辺と、空間索引で近くにある辺だけ**で行う。

1. 最初は `straightenThroughStreets` だけに使う。第2段の `createVertexMovePreflight` の索引を流用する。
2. `crossingFailureCount` と `frameRoadApproachBend` を、動かした頂点の近くの橋・街道だけで差分評価する。橋の判定そのもの（`bridgeSkewPolicy`）は変えない。
3. 効果が出たら、`gates`・`castlePlacement`・経路接続の編集に広げる。
4. 安全網: テストでは、取引を確定するたびに従来の全体検証も走らせて結果を比べる（S3で配列を凍結したのと同じ考え方）。

- 期待: 直線化10.5 s → 1 s以下。経路接続と城壁の接合にも効く。
- 打ち切り: 直線化に入れても5 s以上かかる、または全体検証との差を潰しきれない。

### E3 路線B: 道路の骨格化（試作 3〜5日、捨てる前提）

道路を「メッシュの辺を辿る線」ではなく「先に決める線」にする。骨格先行の道路版である。

1. 粗い経路グラフ（地区の中心と門、橋の着地点を節点とする、数百節点の graph）で、全ての門・橋・中心をつなぐ経路を探す。
2. 経路をベクトルの折れ線として直線化・平滑化する。折れ線の長さ L に対して O(L) で済み、メッシュの検証は要らない。橋は折れ線と川の線分の交点で決め、`bridgeSkewPolicy` の上限を超える交点では架けずに経路を曲げる。
3. 骨格先行のK6（鏡像の種点の対）で、壁・川・**幹線道路**を辺として含むVoronoiを作る。
4. 後段（地区、街路、建物）は現行を使う。`straightenThroughStreets`・`straightenGateCrossings` は呼ばない。

- 測るもの: 1〜3の合計時間、K6の面数、後段の時間（S3でFMGが遅くなった原因の細かい面が、巨大都市で再発しないか）。
- 期待: 直線化と経路接続（合計約19 s）を、両方合わせて2 s以下にする。
- 打ち切り: K6の後段が現行より遅い。または橋・門の不採用が増えて1回目で成功しなくなる。
- E2が先に目標に届いた場合も、E3は1日だけ試して「速度の下限」を記録する。

### E4 現在の骨格先行をそのまま測る（半日、比較用）

単一城壁に変えた同じseedで、`generationMethod: "skeleton-first"` を 15k〜215k で流し、E0の工程表に並べる。§0の結論を実測で確かめるための対照で、改良はしない。

### E5 路線D: 領域を分けて並列に作る（試作 3日、捨てる前提）

骨格（壁、川、幹線道路、地区の境界）が決まれば、地区の内側（街路、区画、建物、住宅）は地区ごとに独立に作れる。

- 骨格の後、地区を8〜10の束に分け、Workerプールで並列に fabric と建物を作り、つなぎ合わせる。境界の街路は骨格に含めて固定する。
- 決定論: 束ごとに `seed + 束ID` の乱数を使う。分け方が変わると出力も変わるので、束の分け方は設定でなく都市の骨格だけから決める。
- 期待: 住宅・fabric・Voronoi調整（合計約12 s + メインスレッド8.7 s）を、M4の10論理CPUで3〜4倍速くする。
- 打ち切り: 束の境界で、建物の重なりや井戸のアクセス不能が出て直せない。
- 前提: 路線BかA（骨格が速く決まること）。最速化計画のS4（Workerプール）と同じ部品を使う。

### E6 路線C: 描画データをWorkerから受け取る（1〜2日、捨てない可能性が高い）

メインスレッドの初回 `town-fabric` 8.7 s は、Workerがすでに作ったfabricの作り直しである（H4）。

- Workerが完成fabric（建物、井戸、小屋、通路）を `Float64Array` 中心の平らな形にして transferable で送り、メインスレッドは受け取って描くだけにする。
- さらに、描画の重い部分をSVGから Canvas / OffscreenCanvas に移す案を、建物47,900棟で別に測る（12,186の表示群をSVGで描くのが何秒か）。
- 期待: UI更新 9.8 s → 1.5 s以下。
- 打ち切り: 転送量が数百MBを超え、転送と復元で3 s以上かかる。

### E7 データ構造（試作 2日、E1の結果次第）

GCが2割前後を占める（H6）。メッシュを `Record<Id, {...}>` から、半辺構造（half-edge）の型付き配列に移した試作を、`validate`・`facePoints`・Voronoi調整で比べる。E2の取り消し可能な編集とは相性が良い（配列の書き換えと記録）。全面移行は大きいので、E1でGCとオブジェクト走査が上位に残るときだけ行う。

## 4. 進め方と判断の時点

| 週 | 実施 | 判断 |
| --- | --- | --- |
| 1 | E0、E1、E4 | 工程の増え方の指数と、複製・検証の割合で、路線A/Bの重みを決める |
| 2 | E2（直線化のみ）、E6 | E2が10.5 → 1 s台に届けば路線Aを他の工程へ広げる |
| 3 | E3（道路の骨格化）| E2と並べ、経路接続＋直線化の合計で比べる。速いほうを残す |
| 4 | E5（並列）、必要ならE7 | 骨格が決まる時間 + 並列fabric の合計で目標に届くか |
| 5 | 採用した路線の本実装、捨てた試作の記録 | 不採用の試作も、数値と理由を本書に残す |

目標（215k、製品ビルド、M4）:

| 段階 | クリックから表示完了 | Worker | UI更新 |
| --- | ---: | ---: | ---: |
| 現在 | 47.7 s | 37.6 s | 9.8 s |
| 第1目標（A + C） | 15 s | 12 s | 1.5 s |
| 第2目標（B または A を全工程 + D） | 5 s | 4 s | 1 s |

第2目標の根拠となる下限の見積りも E0 で取る: 9,000点のVoronoi計算、47,900棟の矩形の生成、そのSVG/Canvas描画を、それぞれ単独で測った時間の合計を「この都市の物理的な下限」とする。

## 5. 品質の基準（速度の達成条件にしないもの）

最速化計画§3.2と同じく、次は削らない。

- 人口215,000人の全配分、未配置0、住戸需要の充足。
- 井戸・小屋・通路などの地物を減らさない。
- **橋はAGENTS.mdの原則と `bridgeSkewPolicy` を満たす。** 直角からのずれの上限を超える橋は描かない。川と平行に近い橋、川の上で折れる橋は不可。路線Bで橋をベクトルで決める場合も、判定は `bridgeSkewPolicy.ts` だけで行う。
- 全ての門から中心へつながる。メッシュの全面が単純多角形で、保存・再読込で同じ文書になる。
- 同じseed・設定で同じ結果になる（並列化しても）。

出力が現行と同一である必要はない（路線B・Dは出力を変える）。比べるのは、上の条件と、最速化計画 `ce:perf:query quality` の項目。路線A・Cは出力不変を目標にし、指紋で確かめる。

## 6. リスクと未確認事項

- E0のCLIは、Workerとメインスレッドの分担を再現しない。表示まで含む値は従来どおり `profileCePopulation.mjs` で測る。
- seed `ppi409` の1都市しか測っていない。港町、城あり、河川2本以上の巨大都市で、どの工程が増えるかは未知。E0で最低5 seed、うち港町を含める。
- 路線Bの道路の骨格は、現行の「メッシュの辺を辿る道路」と見た目が変わる（直線的になる）。採用前に画像で比べる。
- 路線Dは境界で地物が切れる。束の境界を骨格の街路に一致させる前提が崩れると成り立たない。
- 骨格先行の S4 残り（二重城壁、城、堀）は本計画では進めない。路線Bを採用する場合に、その一部として再検討する。

## 7. E0・E1 の結果（2026-10-15）

### 7.1 作ったもの

| ファイル | 内容 |
| --- | --- |
| `scripts/profileCePopulation.mjs` | `CE_CAPTURE_REQUEST=<path>` で、実際のUIがWorkerへ送った入力（文書・設定・seed）をそのまま保存する |
| `scripts/benchmarkCeGiant.mjs`（`ceGiantWorker.mjs`、`lib/ceGiantEntry.ts`） | 保存した入力をNodeで再生する。人口・seedを変え、1回ごとに新しいプロセスで生成し、工程別時間・指紋・品質指標をJSONLに出す。`--probe` で E1 の計数、`--cpu-prof <dir>` でCPUプロファイル |
| `scripts/lib/ceGiantSummary.mjs` | JSONLの要約（工程の自己時間、文書全体の操作の回数と時間） |
| `scripts/lib/cpuProfileTop.mjs` | `.cpuprofile` の自己時間・包括時間。祖先の関数名で絞れる |
| `src/city-editor/generators/meshOpProbe.ts` | `clone`・`validate`・`movedGeometryErrors`・`moveVertices`・`crossingFailureCount` の回数と時間を工程ごとに数える。既定は無効で、無効時の費用は真偽値1回の判定 |

入力: `temp/giant/request-ppi409.json`（seed `ppi409`、Voronoi、二重城壁、河川1本、Age of Exploration）。同時に取ったブラウザの基準は、クリックから表示完了 45.7 s、Worker 35.8 s で、人口報告は第3段と全項目一致した（`temp/giant/browser-baseline.json`）。

Node（vite module runner、production mode）では 215k が 49.5 s で、ブラウザのWorkerより約4割遅い。以下の数値は**Node内の比較用**で、ブラウザの秒数とは直接比べない。計数の有無で時間はほぼ変わらない（49.5 s / 48.9 s）。

### 7.2 規模と時間（E0）

人口が変わると、基準セル幅も段階的に変わる。15k → 619面、30k・60k → 約2,400面、120k・215k → 約9,000面になる。300k は入力上限（220,000人）を超えて、直ちに失敗した。

| 工程（自己時間） | 15k（619面） | 30k（2,440面） | 215k（9,021面） | 増え方 k（時間 ∝ 面数^k） |
| --- | ---: | ---: | ---: | ---: |
| `apply-plan` | 0.42 s | 3.20 s | 15.62 s | 1.35 |
| `through-streets` | 0.01 s | 1.02 s | 12.94 s | **2.56** |
| `rectify-voronoi` | 0.04 s | 0.03 s | 5.78 s | 1.89 |
| `population-housing` | 0.20 s | 0.75 s | 5.24 s | 1.22 |
| `plan` | 0.05 s | 0.15 s | 3.58 s | 1.63 |
| `fabric-plan` | 0.02 s | 0.17 s | 2.91 s | 1.93 |
| `finish-geometry` | 0.11 s | 0.59 s | 2.42 s | 1.14 |
| 合計 | 0.91 s | 6.28 s | 49.60 s | 1.49 |

k > 1.3 の工程が、時間の8割を占める。いずれも面数に対して2乗に近い増え方をする。

### 7.3 文書全体の操作（E1）

215k（9,021面）での回数と時間。`moveVertices` は内側で `clone`・`validate`・`movedGeometryErrors` を呼ぶので、行を足し合わせない。

| 操作 | 回数 | 合計 | 1回あたり |
| --- | ---: | ---: | ---: |
| `moveVertices` | 173 | 9.04 s | 51 ms |
| `validate` | 373 | 8.28 s | 22 ms |
| `crossingFailureCount` | 308 | 4.77 s | 15 ms |
| `clone` | 518 | 3.96 s | 7.5 ms |
| `movedGeometryErrors` | 173 | 1.97 s | 11 ms |

- **回数は少なく、1回が重い。** 直線化の移動は154回しかないが、1回ごとに全面・全辺を走査するので、1回が51 msかかる。15k では同じ操作が 2.3 ms だった。回数も面数も増えるため、全体は2乗で増える。
- `through-streets` 12.9 s は、ほぼ全てが `moveVertices`（7.9 s）と `crossingFailureCount`（4.7 s）。直線化の計算そのものは無視できる。
- 重複を除いた文書全体の操作は約 20.6 s で、全体の **約42%**。§3 E1の判定基準（40%以上）により、**路線Aを最優先とする。**

### 7.4 CPUプロファイル（215k、`temp/giant/cpu/`）

経路接続 `applyPlan` の包括 14.4 s のうち、経路探索そのもの（`aStar`、`weight` など）は約1.4 s。残りはメッシュ全体の走査である。

| 関数 | 自己時間（全体） | 内容 |
| --- | ---: | --- |
| GC | 4.5 s | |
| `channelIntervals`（bridgeDeck） | 2.8 s | `crossingFailureCount` の中で、橋の甲板を毎回すべて作り直す |
| `cloneMesh` | 2.8 s | |
| `indexMeshEdges` | 2.7 s | 全辺の索引を、呼び出しのたびに作り直す |
| `validate` 本体 | 2.7 s | 加えて、河川の判定用の全辺索引 `hasEdge` に 1.9 s |
| `edgeBetween` | 2.4 s | 全辺を線形に探す |
| `districtBoundary`（fabricDistricts） | 2.2 s | |
| `incidentEdges` / `incidentFaces` | 1.8 s / 0.6 s | 全辺・全面を線形に探す |
| `mergeVertices`、`rebuildFaceSides`、`nextNumericId` | 1.4 s / 1.0 s / 0.4 s | 全体の作り直し、IDの線形探索 |

通常規模の計測（最速化計画§1.3）では「メッシュの O(E) 走査は問題ではない」としたが、9,000面では支配的になる。

### 7.5 骨格先行についての判断（§0の確認）

E1により、時間の本体は「線をどう決めるか」ではなく、**メッシュを編集・照会するたびに全体を走査する実装**にあると確かめられた。経路探索は1.4 s、計画は3.6 s にすぎない。骨格先行に移しても、後段の `applyPlan`・直線化・Voronoi調整は同じ関数を通るので、この費用は残る。E4（骨格先行の実測）は優先度を下げ、路線Aの後に回す。

### 7.6 次（E2の範囲を広げる）

E2を「直線化のみ」から、次の3つの組み合わせに広げる。

1. **持続する隣接索引**: メッシュに頂点→辺、端点の組→辺、頂点→面の索引を持たせ、構造を変える編集（分割・併合・挿入）で差分更新する。`edgeBetween`・`incidentEdges`・`incidentFaces`・`indexMeshEdges`・`hasEdge`・`nextNumericId` を O(1) にする。
2. **取り消し可能なその場編集**: `moveVertices` の複製をやめ、変更前の座標を記録して戻す。検証は動かした頂点に接する面・辺だけで行う。
3. **差分の交差判定**: `crossingFailureCount` は、動かした頂点の近くに川・壁・門・橋が無ければ数え直さない。

いずれも出力不変を目標にし、`benchmarkCeGiant` の `fingerprint.document` で 15k / 30k / 215k を比べる。

## 8. E2 の結果（2026-10-15）

路線A（取り消し可能なその場編集と局所検証）を、出力不変のまま4段階で入れた。全段階で `fingerprint.document` が変更前と一致する。

### 8.1 実施した変更

| 段 | 変更 | ファイル |
| --- | --- | --- |
| 1 | **辺の端点索引を `mesh.edges` ごとに保持する。** `edgeBetween`・`incidentEdges`・`indexMeshEdges`・`validate` の河川判定が、全辺の走査や毎回の索引作成をやめ、O(1) で引く。辺を足す・消す・付け替えるその場編集（`splitFaceInPlace`、`mergeFaces`、`insertEdgeVertexInPlace`、K6の `meshTopology`）は `meshEdgesChanged` で索引を捨てる。複製は新しい `edges` を持つので、元の索引を読まない。テストでは、小さいメッシュ（2,000辺未満）は毎回、大きいメッシュは64回に1回、全走査の結果と照合し、捨て忘れがあれば例外にする | [mesh.ts](../../src/city-editor/generators/mesh.ts)、[meshTopology.ts](../../src/city-editor/generators/generation/skeleton/meshTopology.ts) |
| 2 | **頂点移動のセッション** `createVertexMoveSession`。妥当で城の無い文書に限り、1回だけ複製し、移動はその場で行って、不採用なら元の座標に戻す。城が無ければ `validateFortifications` は位相だけを見るので、移動で変わり得るのは動かした頂点に接する辺・面だけ。辺の長さ・面の面積・単純性・向きは既存の `createVertexMovePreflight`、新しい辺の交差は辺の格子索引で調べる。`straightenThroughStreets` はこれを使い、条件を満たさない文書では従来の経路（`straightenThroughStreetsByCopies`）を通る | [mesh.ts](../../src/city-editor/generators/mesh.ts)、[frameRoadJunction.ts](../../src/city-editor/generators/frameRoadJunction.ts) |
| 3 | **交差の失敗数の差分評価** `crossingLocality`。失敗数が読むのは、門・河川・城壁・橋の頂点での角度（その隣の頂点を含む）と、川の近くの道路区間（橋の甲板）だけで、残りは位相である。動かす頂点がどちらにも当たらないときは数え直さない。215kで155回 → 17回 | [frameRoadJunction.ts](../../src/city-editor/generators/frameRoadJunction.ts) |
| 4 | **面分割のセッション** `createFaceSplitSession`。同じ条件で1回だけ複製し、分割はその場で行う。新しい辺の長さ、2つの半分の面積・単純性・向き・面積の和を、変更の**前**に `splitFace`＋`validate` と同じ条件で調べるので、取り消しは要らない。辺の左右の面、端点索引、次の空きIDは、分割した部分だけ更新する。`shortcutExteriorRoads` はこれを使う | [mesh.ts](../../src/city-editor/generators/mesh.ts)、[gateApproaches.ts](../../src/city-editor/generators/generation/routing/gateApproaches.ts) |

橋の斜交の判定（`bridgeSkewPolicy`）、検証の条件、生成の手順は変えていない。

### 8.2 計測（Node、`benchmarkCeGiant`）

seed `ppi409`、各段の累積:

| 段 | 15k | 30k | 215k |
| --- | ---: | ---: | ---: |
| 変更前 | 0.92 s | 5.93 s | 48.50 s |
| 1 端点索引 | 0.89 s | 5.02 s | 42.47 s |
| 2 移動セッション | 0.87 s | 4.37 s | 36.26 s |
| 3 交差の差分 | 0.89 s | 4.24 s | 34.96 s |
| 4 分割セッション | 0.84 s | 2.93 s | **29.28 s（-39.6%）** |

215k の `through-streets` は 12.9 s → 1.8 s。

別の seed と、再試行（2〜3回）が起きる都市も含めた10件で、すべて指紋が一致した（`temp/giant/e2-seeds-*.jsonl`）。

| seed | 人口 | 変更前 | 変更後 | 差 |
| --- | ---: | ---: | ---: | ---: |
| a1〜f6（6件） | 30k | 4.4〜11.2 s | 2.7〜7.1 s | -30〜-40% |
| a1（3回目で成功） | 120k | 82.5 s | 36.8 s | -55.4% |
| a1 / b2 | 215k | 45.3 / 52.7 s | 29.6 / 26.4 s | -34.8 / -49.9% |
| b2 | 120k | 50.4 s | 31.3 s | -37.9% |

### 8.3 ブラウザ（実際のUI、開発サーバー、seed `ppi409`）

| 区間 | E0の基準 | E2後 |
| --- | ---: | ---: |
| クリックから表示完了 | 45.7 s | **30.5 s** |
| Worker内の生成 | 35.8 s | **21.4 s** |

人口報告は全項目一致した（`temp/giant/browser-e2.json`）。

### 8.4 検証

- 新しいテスト6件（[mesh.test.ts](../../src/city-editor/generators/mesh.test.ts)）: Voronoi・hex・evolution のそれぞれで、移動セッションと `moveVertices` の連鎖（300回、呼び出し側の不採用を含む）、分割セッションと `splitFace` の連鎖（200回）の結果のメッシュが一致し、元の文書を変えないことを確かめる。
- CE全体: 1,456件成功、失敗3件。`CityEditorPage.skeleton` と `CityEditorPage.worker` の2件は変更前から失敗している（`git stash` で確認）。`population` の hex の1件は全体実行の負荷による120秒の時間切れで、単独では15件すべて成功した。
- `tsc --noEmit`、Biome は成功。

### 8.5 残り（215k、Node）

`apply-plan` 約8 s、`rectify-voronoi` 6 s、`population-housing` 5 s、`plan` 3.5 s、`fabric-plan` 2.6 s、`finish-geometry` 2.2 s。文書全体の `validate`・`clone` はまだ `rectify-voronoi`（61回）と `finish-geometry` に残る。次の候補は、同じセッションの方式をこれらの工程の編集（`mergeFaces`・`moveVertices`）に広げること、そして E6（メインスレッドの `town-fabric` 8.7 s）。

## 9. 六角格子との比較（2026-10-15）

「六角格子なら形と大きさが一定で、経路が決まるので速いのでは」という案を、E2後の同じ入力で `gridKind` だけを `hex` に替えて測った（`benchmarkCeGiant --grid hex`、`temp/giant/grid-hex*.jsonl`）。

| seed（215k） | Voronoi | hex | hex の試行 | hex の不採用理由 |
| --- | ---: | ---: | ---: | --- |
| ppi409 | 29.3 s | 67.7 s | 3 | `invalid-crossings` ×2 |
| a1 | 29.6 s | 48.2 s | 2 | `unconnected-gates` |
| b2 | 26.4 s | **19.7 s** | 1 | — |

- 1回で成功した b2 では、hex が25%速い。主な差は `rectify-voronoi`（Voronoiの街区の形の調整、5〜8 s）が無いこと。
- 一方で、再試行が増え、平均では遅い。`invalid-crossings` は、六角格子の辺が3方向しか無く、任意の向きの川に対して直角からのずれが最大30°になり、橋の斜交の上限（中世の石造で15°）を超えやすいためと考える（未検証）。
- 経路探索そのもの（`aStar` など）は215kでも約1.4 s で、格子が規則的になっても縮む余地は小さい。時間の多くは、格子の種類に依らないメッシュの編集・検証にある。
- 結論: 格子を六角に替えるだけでは速くならない。`rectify-voronoi` が要らない利点は、川・壁・門の周りだけ線に沿わせる（骨格先行のK6と同じ方法）組み合わせなら活かせる可能性がある。これは路線Bの試作（E3）で扱う。

## 10. 粗いセル＋細かい街区の案（2026-10-15）

「グリッドは small 相当のまま（セルを大きく）、教会・墓地はセルではなく街区に収め、街区と住宅の描き込みを細かくすれば、経路探索の負荷は small 相当で済むのでは」という案を測った。

人口からの生成はセル幅を常に 50 m に固定している（`populationPlan.ts`）。試作として、計測時だけセル幅を上書きする仕組みを入れた（`globalThis.__ceCellWidthOverride`、Workerへは `cellWidthOverride`、`benchmarkCeGiant --cell`、`profileCePopulation` の `CE_CELL_WIDTH`。**いずれも試作で、採用時には正式な設定に置き換えるか削除する**）。

### 10.1 速度（Node、215k、E2後）

| セル幅 | 面数 | ppi409 | a1 | b2 |
| --- | ---: | ---: | ---: | ---: |
| 50 m（現行） | 約9,000 | 29.3 s | 29.6 s | 26.4 s |
| 100 m | 約2,400 | 4.8 s | 7.9 s（2回目で成功） | 7.8 s（2回目） |
| 150 m | 約1,070 | 2.2 s | 3.3 s（2回目） | 4.1 s（3回目） |
| 200 m（4.8 km四方で small と同じ約24×24） | 約630 | **2.1 s**（2回目） | **1.8 s** | **1.6 s** |

ブラウザ（seed `ppi409`、200 m）: クリックから表示完了 **5.6 s**（50 m で 30.5 s）、Worker **1.6 s**（50 m で 21.4 s）。残りの約4 sはメインスレッドの描画データ作成（E6の対象）。

### 10.2 人口と品質

- 全てのセル幅・seedで、215,000人を全員配置した（未配置0、`reasons` 空）。
- 200 m では推定棟数が約1割少なく（47,900 → 41,500〜43,300）、市街地コア面積も 5.6 → 4.8〜5.0 km² になる。住宅の階数が上がり、街路の面積が減るため。
- 橋の斜交の上限超え・交差の不備は、全ての条件で0。
- 道路の数と路地は減る（215k ppi409: 道路群 29 → 17、路地 5,573 → 3,782）。

### 10.3 見た目（`temp/giant/browser-cell200.png`）

二重城壁・門・川・橋は描ける。しかし、**市内の街路網がほとんど無く、200 m のセルがそのまま一つの大きな街区になる。** 住宅は詰まっているが、街路で区切られた街区の表情が無い。現在の fabric は、セルの中に新しい街路を作らないためである。

### 10.4 結論と次の試作（E8）

案は速度の面で裏付けられた。Worker の生成は 21.4 s → 1.6 s（約13倍）で、路線A・Bのどちらよりも効く。足りないのは「街区と住宅の描き込みを細かく」の部分で、次の2つを試作する。

1. **セルの中の街路（街区の分割）**: 粗いセルを、メッシュではなく fabric の段で、ベクトルの街路により 40〜60 m 程度の街区に分ける。主要な通りはセルの辺（＝経路探索した道路）につなぎ、細い路地は街区の中に置く。メッシュを細かくしないので、経路探索・検証の費用は増えない。
2. **教会・墓地などを街区に収める**: 現在はセル単位で置いている施設を、分割後の街区に収まる大きさ・形で置く。

検証: 200 m セルで、表示完了までの時間（目標: 5 s 以下）、人口の全配置、橋の規約、そして 50 m の都市と並べた見た目の比較。

## 11. E8 の結果: 粗いメッシュに 50 m の街区を描く（2026-10-15）

§10 の試作を、正式な設定として実装した。

### 11.1 実施した変更

| 変更 | ファイル |
| --- | --- |
| **メッシュ解像度の設定** `PopulationGenerationSettings.meshCellMeters`（50 / 100 / 150 / 200、未指定は 50 m）。生成パネルの「メッシュ解像度」で選ぶ。既定は従来どおり 50 m。§10 の試作のグローバル変数と Worker への受け渡しは削除した | [population.ts](../../src/city-editor/types/contracts/population.ts)、[populationPlan.ts](../../src/city-editor/generators/populationPlan.ts)、[populationControls.ts](../../src/city-editor/components/populationControls.ts)、i18n（en/ja） |
| **街区の大きさを文書に記録** `frame.streetCellMeters`。セルが 75 m より粗いとき、人口からの生成が 50 を入れる。fabric の作成時に `populationPlan` は外されるので、frame に持たせた。保存・再読込で残る | [document.ts](../../src/city-editor/types/document.ts)、[populationGeneration.ts](../../src/city-editor/generators/populationGeneration.ts) |
| **セルの中の街路** `buildOrganicBlocks` の `partition`。粗いセルを、長い方向に横切る 5 m の街路で、約 50 m の街区に分ける（面積が 50²×1.6 を超え、長さが 62.5 m を超える間）。切った線は街路であり、両側の街区の前面の境界でもある（住宅は街路に面し、街路の幅の半分＋余白だけ下がる）。各街区は、その後は 50 m セルの面と同じ手順（周回の路地、区画の分割、住宅）で埋める | [organicBlocks.ts](../../src/city-editor/generators/organicBlocks.ts)、[localInfill.ts](../../src/city-editor/generators/localInfill.ts) |
| **教会を街区に収める** 粗いメッシュでは、教会の面を丸ごと予約しない。面は街区・住宅で埋め、教会と境内に重なる建物・路地は既存の `buildingHitsCivicLandmark`・`laneHitsCivicLandmark` で除く。広場（plaza）は従来どおり面を予約する | [localInfill.ts](../../src/city-editor/generators/localInfill.ts) |
| **墓地を街区に収める** 粗いメッシュでは、墓地の境界を面の一端の約2街区分（5,000 m²以下）に切り詰める（`coarseCemeteryGround`）。面の残りは街区・住宅で埋め、墓地を通る路地は除く。面の ward は `cemetery` のままにし、墓地を扱う他の処理は変えない | [cemeteryLayout.ts](../../src/city-editor/generators/cemeteryLayout.ts)、[localInfill.ts](../../src/city-editor/generators/localInfill.ts) |

いずれの変更も `frame.streetCellMeters` があるときだけ働く。50 m の生成は、15k / 30k / 215k で `fingerprint.document` が E2 後と一致した（`temp/giant/e8-50.jsonl`）。

### 11.2 計測

Node（`benchmarkCeGiant --cell 200`、215k）:

| seed | 50 m | 200 m＋E8 | 未配置 | 推定棟数（50 m → 200 m） |
| --- | ---: | ---: | ---: | --- |
| ppi409 | 28.8 s | 2.2 s（2回目で成功） | 0 | 47,898 → 39,087 |
| a1 | 29.6 s | 1.9 s | 0 | 49,561 → 40,519 |
| b2 | 26.4 s | 1.7 s | 0 | 47,448 → 40,682 |

橋の斜交の上限超え・交差の不備は、全て0。路地・街路の数は 3,782（§10の200 m）→ 4,563（50 m では 5,573）。

ブラウザ（実際のUIでメッシュ解像度を「最速 · 200 m」にして生成、seed `ppi409`）:

| 区間 | 50 m（E2後） | 200 m＋E8 |
| --- | ---: | ---: |
| クリックから表示完了 | 30.5 s | **6.1 s** |
| Worker内の生成 | 21.4 s | **1.6 s** |

人口 215,000人を全員配置した。見た目は `temp/giant/z-e8c-zoom.png`（200 m、拡大）と `temp/giant/z-cell50-zoom.png`（50 m）を参照。5 m の街路で約 50 m ごとに区切られ、教会の周りと墓地の隣に住宅が並ぶ。

### 11.3 検証

- 新しいテスト（[population.test.ts](../../src/city-editor/generators/population.test.ts)「draws 50 m street blocks in a giant city on a coarse mesh」）: 215,000人、200 m、河川、二重城壁で、全員の配置、`validPopulationPlan`、橋の規約、5 m の街路、墓地の面積上限、保存・再読込を確かめる。
- CE全体: 1,458件成功、失敗2件（`CityEditorPage.skeleton`・`CityEditorPage.worker`、変更前から失敗）。i18n のテスト14件成功。`tsc --noEmit`、Biome は成功。

### 11.4 残りと注意

- 200 m で推定棟数が約2割少ない。各棟の階数が上がり、街路の面積が増えるため。人口の配置は満たすが、50 m と同じ密度の見た目にはならない。
- 教会の周りに空き地（境内）がやや広く残る。
- 表示までの 6.1 s のうち約 4.5 s はメインスレッドの描画データ作成で、次は E6（Worker で作った fabric を受け取って使う）。
- 既定は 50 m のまま。200 m を既定にするか、人口に応じて自動で選ぶかは未決定。
