# City Editor 生成アルゴリズム ↔ TownGeneratorTS — 乖離の分析と改善案

`~/Projects/TownGeneratorTS/src`（GPL、**コードは読むだけ・移植は手本にした再実装**）の
`Model.build()` を基準に、**City Editor のランダム生成**（`src/city-editor/`）が工程ごとに
どこで乖離し、なぜ「現実に当てはめるとおかしい」出力・「触れない・見えない」開発体験に
なるかを突き合わせ、改善案をまとめる。

本書は `docs/city-editor/改善計画.md` に従う **City Editor の分析** である。

- **手本**: TownGeneratorTS `Model.ts` / `CurtainWall.ts` / `Topology.ts` / `Voronoi.ts`。
  目指す最低品質とアルゴリズムの手本。河川・海は無く、城壁の囲いも粗い。GPL。
- **改善対象**: City Editor の生成経路。現状 `src/city-editor/core/generate.ts` が
  `src/city-generator/core/*` の純粋関数を document のメッシュ上で走らせている。改善計画の
  決定に従い、必要なアルゴリズムは **`src/city-editor/core/gen/` へ再実装（手本移植）** し、
  `generate.ts` の `city-generator` 依存を断つ。
- **`src/city-generator/`（旧 City Generator）**: 廃棄予定。**凍結・参照専用**。本書では
  「先行実装がどこで壊れたか」の反面教師としてのみ言及する。修正しない。commit `1b7f70188`
  / `120973c4f`（「Claudeの命令無視1/2」）で旧モジュール側に入った改良（門・nPatches 等）は、
  **移植時に City Editor 側へ持ち込む**。旧モジュールには残さない。

---

## 0. 要旨

| 症状 | 根本原因 | 改善案 |
| --- | --- | --- |
| **セル整形アルゴリズムをステップ実行で見られない**。Document パネルに TownGen の「Grid evolution」相当が無い。`document.ts` は `buildGrid(...).at(-1)` で最終 Lloyd 段だけ取り、途中を捨てる | 格子生成が「作って終わり」で、for ループ 1 周単位のスナップショット・Delaunay/Voronoi の可視化・母点編集の口が無い | **A**: `buildPatches` を手本に City Editor へ再実装し、散布ループ／逐次 Voronoi／relax 各周をスナップショット化。Grid evolution スライダー＋ Delaunay/Voronoi/母点オーバーレイ＋母点の数・位置の指定/編集 UI |
| 市街地の輪郭がガタガタ／不定形 | パッチ生成が別物。TownGen＝「螺旋散布→中心数点だけ relax→距離順ソートで先頭 15 パッチ＝市街地」。City Editor＝「可変半径 Bridson 青ノイズ＋ Lloyd×1 の全面格子」に半径/楕円 flood-fill 選択（`classifyUrban`） | **A** で格子を粗く TownGen 型に寄せる／**B**（既存）: flood-fill を個数しきい値に(`urbanNPatches`) |
| 門の数・位置・本数のオプションが無い | `synthSite` が道路を出しすぎ（内陸 3〜4、川で +2、海＋川で最大 6）、`suggestedGates` がそのまま門数。門の目標本数・間隔・候補（街区の角 限定か）を UI から調整できない | **C**: 門本数モデル（形状由来 or 道路由来 or 手動）と間隔・候補・外郭 split をオプション化。移植済み `placeGates`（角候補＋弧長間引き）を City Editor へ持ち込む |
| 河川のランダム生成に方式・強さのオプションが無い | `synthRivers` / `walkRiver` の本数・通過形態（through/beside/toCoast）・蛇行・合流・幅・コリドー追従が固定値 | **D**: river 生成オプション（本数・通過形態・蛇行量・合流・海への到達方式）を Generate パネルに出す。既存の頂点列モデル（design §3.1）を真実源に保つ |
| 街道の伸び方・海/河川との関わりが不自然 | `buildStreets` の A\* が海セル頂点をコスト 1 で自由通過。門が海側を向くと landward road が湾を横断。街道の遠方点・放射スタブ・海除外がオプション化されていない | **E**: 水域を跨ぐ道路/街路/城壁/建物を弾く現実性フィルタ（最優先）＋ 街道の伸長方式（記述子端 / 放射 / 手動方位）と沿岸回避をオプション化 |
| ボロノイのカクカクが街区境界に残る | 平滑化が街路に乗ったセル辺だけ。青ノイズの小セルは非街路の短辺が無数に生のジグザグのまま | **F**: reserved 以外の全 interior 頂点へ弱 Laplacian／`smoothPath` 強化。**A** で大セル化すれば大幅縮小（A が本命） |

工程は概ね忠実だが、**(1) セル整形の可視化・編集が無い、(2) パッチ生成が別物、
(3) 門・河川・街道のオプションが無い、(4) 海が後段の妥当性チェックに繋がっていない** の
4 点で「らしさ」と「調整できる感」が崩れる。着手推奨は **A（土台）→ E（最優先バグ）→
C（門）→ D（河川）→ F（仕上げ）**。

---

## 1. 工程対応表

| 段階 | TownGeneratorTS `Model.build()` | City Editor（現状：`generate.ts` が `city-generator/core` を document メッシュ上で実行） | 主な差 | 移植後の担当（`src/city-editor/core/gen/`） |
| --- | --- | --- | --- | --- |
| 格子 | `buildPatches` [Model.ts:167]：`sa+√i·5` の螺旋で `nPatches*8=120` 点散布 → `Voronoi.build`（逐次 `addPoint`）→ **中心 `[0,1,2,nPatches]` の 4 点だけ** `Voronoi.relax` ×3 → `points.sort(by \|p\|)` → 先頭 `nPatches=15` を `inner`（市街地）、`nPatches` 番目を任意で citadel。ステップは `captureGenerationStep("2.1 Delaunay / Voronoi", {delaunay, voronoi, sites})` [Model.ts:154] | `document.ts` → `buildGrid`（`city-generator/core/grid.ts` = 可変半径 Bridson 青ノイズ、`spacing≈cityRadius/3.5`、水際 0.5×）＋ `lloydPasses:1` を全セルに → `GridStage[]` を作るが **`.at(-1)` で最終段だけ採用、途中を破棄**。Document パネルにスライダー無し | 散布方法（螺旋・距離順・内密外疎 vs 一様青ノイズ）、relax 対象（中心 4 点 vs 全セル）、**途中段・Delaunay/母点の可視化と母点編集の有無** | `gen/patches.ts`（散布＋逐次 Voronoi＋relax、各周キャプチャ）、`gen/gridEvolution.ts`（スナップショット型）、Document パネルの Grid evolution UI |
| 交点整理 | `optimizeJunctions` [Model.ts:396]：`dist(v0,v1)<8` の辺を、共有 `Point` を平均して in-place で潰す（全パッチ同時に動き watertight）→ 重複除去 | `mesh.ts optimizeJunctions`（City Editor 独自・ブラシ式）：`< maxGap` の辺を `mergeVertices`＋`moveVertex(midpoint)` で 1 本ずつ潰す。route/gate 参照は保持 | 全域一括 vs ブラシ選択。City Editor は恒久 ID を保つため 1 本ずつ | 既存 `mesh.ts` を流用（全域一括モードを generate 用に追加） |
| 城壁形状 | `CurtainWall` [CurtainWall.ts:17]：`Model.findCircumference(inner)` → `smoothVertex(v, min(1,40/n))` [CurtainWall.ts:27] で丸め（reserved 除外） | `generate.ts componentBorderLoops` [generate.ts:821]：`urban` 連結成分ごとに **実メッシュ辺** の外周ループを `traceBoundaryLoops` で追跡（`shapeEnvelope`/`reachEnvelopeToShore` は**使わない**）→ `EdgeRef[]` で Wall グループ化 | City Editor は実辺をなぞる（凹み埋め・海際延長という別工程が無い）。旧 City Generator の envelope 整形バグは City Editor には無い | `gen/borders.ts`（既存ロジック維持。任意で TownGen の `smoothVertex` 丸めを option 化） |
| 門 | `buildGates` [CurtainWall.ts:39]：候補 `entrances` ＝ 円周頂点のうち **2 パッチ以上が集まる交点** − reserved。ループ「ランダムに 1 つ選び gate に、周囲 2〜3 個を splice」を `entrances.length>=3` の間 → **概ね 3〜5 門**。各門で外郭ウォードを `outer.shape.split(gate, farthest)` [CurtainWall.ts:74] して街道の抜けを作り、`gate.set(smoothVertex(gate))` | `placeGates` [`city-generator/core/interior.ts`]（commit 1b7f7 で改良済み）：候補＝**2 つ以上の urban セルが共有する border 頂点**、目標 `target = clamp(round(suggestedGates·0.7),3,6) + (wet?1:0)`、道路方位に近い順で貪欲、選択後は同ループ上で弧長 `perimeter/(target+1)` 未満を間引き。`markWaterGate` / `markSeaSurroundedGates` で海側の門を water 化。**外郭 split は無い** | 本数モデルの調整余地・外郭 split の有無・門候補（角限定 or 任意頂点）の切替が UI に無い | `gen/gates.ts`（`placeGates` 相当を移植 ＋ 本数/間隔/候補/外郭 split をオプション化） |
| 街路 | `buildStreets` [Model.ts:292]：`Topology`＝全パッチ辺グラフ（壁・城郭頂点は `blocked`、gate 除外）。門ごとに A\*(gate→plaza 最寄り or 中心)＝street、border gate は A\*(遠方＝`gate.norm(1000)`最寄り→gate)＝road。`tidyUpRoads` で結合 → `smoothStreet`＝`smoothVertexEq(3)` を**共有 Point に書き戻し** | `buildStreets` [`city-generator/core/streets.ts`]：`buildEdgeGraph(interiorCells)`（**海セル含む**）上で street＝gate→plaza（`urbanNodes` マスク）、road＝`farNodeFor`→apron ＋ 放射スタブ。`waterPolygon`/`seaNodes` を受ける口はあるが `generate.ts` からの現実性検査は最終 polyline に無い。`smoothPath(_,2)` | road の遠方点（放射 vs 記述子端）、**海を跨ぐ道路の最終検査が無い**（TownGen は海が無いので問題化しない）、平滑化の強さ、伸長方式の option 化 | `gen/streets.ts`（移植）＋ `gen/plausibility.ts`（水域跨ぎフィルタ、下記 §3.E） |
| 描画 | `SvgMapLayer`：`roads`（二重線）＋ ward 建物 ＋ 壁。**内部 street は最終図に描かない**（overlay のみ） | `render/svg.ts`：セル塗り＋建物＋二重線 road ＋ river band ＋ overlay。**同じく内部 street は描かない** | ほぼ一致 | 変更なし（step overlay の追加のみ） |
| 地区割当 | `createWards` [Model.ts:434]：固定 36 配列、plaza→Market、gate 近傍→GateWard、`rateLocation` で min 選択、余り→Slum、外→Farm/Ward | `assignWards` [`city-generator/core/wards.ts`]：35-mix を `ceil(n/35)` 複製＋Fisher–Yates、`rateLocation`、harbor/temple/shanty | ほぼ忠実 | `gen/wards.ts`（移植） |
| 建物形状 | `Ward.createGeometry`：`getCityBlock`（inset）→ `createAlleys` / `createOrthoBuilding` / `filterOutskirts` | `buildGeometry` [`city-generator/core/buildings.ts`]：`cityBlock` → `createAlleys`/`createOrtho`/`ringSlices` ＋ `withinCell` スライバ除去 | ほぼ忠実 | `gen/buildings.ts`（移植） |
| （なし） | 海・河川の概念なし | `classifyCoast` [`classifySea.ts`] ＋ river band。ただし後段（道路・建物・城壁）の妥当性チェックに接続されていない | **海が後段に効いていない** | `gen/plausibility.ts`（§3.E） |

### 1.1 ステップ実行（for ループ 1 周単位）の現状

- **後段 6 工程（①海岸〜⑥地区）は既にスクラブ可能**：`CityEditorPage.ts` の `◀ / ▶` が
  `STEP_FNS`（`generateCoastWalkStep` / `generateRiverWalkStep` / `generateUrbanPatchStep` /
  `generateGateStep` / `generateRoadStep` / `generateWardStep`）で「walk 頂点 1 個」「flood-fill
  セル 1 個」「門 1 個」「road 1 本」「セル 1 個」単位に前進する。③ には `urbanNPatches`
  の tuning ノブもある。
- **足りないのは S0（格子）**：`buildGrid` の散布→ Lloyd の各周、そして TownGen 2.1 の
  Delaunay / Voronoi / 母点は一切スクラブできず、母点の数・位置も指定できない。改善計画
  「Grid evolution のスライダーのセル修正アルゴリズムを改善する為」に直結するのはここ。

---

## 2. 乖離の詳細と「おかしく見える／触れない」理由

### 2.1 セル整形がステップ実行・編集できない（改善計画の最優先）

- TownGen `buildPatches` [Model.ts:167] は 3 つのループの連なり：
  1. **螺旋散布**：`for i in 0..nPatches*8` で `a = sa + √i·5`、`r = i===0 ? 0 : 10 + i·(2 + rand)`
     ── 中心が密、外周へ行くほど疎。i=0 は必ず原点。
  2. **逐次 Voronoi**：`Voronoi.build` が点を 1 個ずつ `addPoint`（Bowyer–Watson 型の
     incremental Delaunay）で入れる。
  3. **relax ×3**：毎回 `Voronoi.relax(voronoi, [pt0, pt1, pt2, pt_nPatches])` ── **中心付近
     4 点だけ**を重心へ寄せて張り直す。外周は動かさない＝サイズ勾配（中心大→外周小）が残る。
  4. **距離順ソート** `points.sort((a,b)=>sign(|a|-|b|))` [Model.ts:193] の後、先頭
     `nPatches` 個をそのまま `inner`（市街地）に。＝中心から詰まった 15 枚の大パッチ。
  各段は `captureGenerationStep` で不変コピーが `generationSteps[]` に積まれ、TownApp の
  「Drawing process」/「Grid evolution」スライダーが `<g>` の表示を切り替える。
  「2.1 Delaunay / Voronoi」段では `delaunay`（三角形の辺）・`voronoi`（領域ポリゴン）・
  `sites`（母点）を赤で重ねる [SvgMapLayer.ts:231]。
- **City Editor には対応物が無い**。`document.ts:34` は
  `buildGrid(params, EMPTY_GEO, makeRng(seed)).at(-1)?.cells` ── `GridStage[]`（`scatter` /
  `Lloyd 1`）を作っておきながら最後の 1 段しか使わず、Document パネルは
  `Map size / New grid / Scale / Smoothing` だけ。散布の各点追加、Lloyd の各周、Delaunay 三角形、
  母点位置 ── どれも見えず、母点の個数も座標も与えられない。
- アルゴリズムも別物：City Editor の格子は `city-generator/core/grid.ts` の
  **可変半径 Bridson 青ノイズ ＋ Lloyd×1**（水際で 0.5× に密）。TownGen の
  「中心密・外周疎の螺旋 ＋ 中心のみ relax」とはサイズ分布が逆で、`classifyUrban` が
  この一様な小セル群を半径/楕円 flood-fill で選ぶと外周に凹凸が乗る（§2.2）。

### 2.2 市街地の輪郭（パッチ生成）

- TownGen は距離順ソート後、先頭 `nPatches` 個を**定義的に** `inner` にする（`Model.ts:214`）。
  ＝中心から詰まった 15 枚の大パッチ。外周は 12〜18 頂点の素直な多角形で、`CurtainWall` が
  `smoothVertex(f = min(1, 40/15) = 1)` で更に丸める。
- City Editor は `classifyUrban` [`city-generator/core/classifyUrban.ts`]：
  `cost(c) = reach(c) − gatePull(c)`、`reach` は円（内陸）または楕円
  （`ALONG_SHORE 1.9 / CROSS_SHORE 0.72`）、`frontier` を毎回ソートして最小コストから膨張。
  `GATE_PULL 0.35` が門コーン（±22°）方向にコブを作る。→ 青ノイズの小セルだと外周に凹凸。
- **既存の緩和**：`classifyUrban` は `nPatches` 引数を持ち、
  `targetN = nPatches ?? round(π·(R/cellSize)²)` で「コスト昇順の先頭 N セル」を取れる
  （commit 1b7f7）。`GenerationSettings.urbanNPatches` → ③ の tuning フィールドで露出済み。
  半径しきい値ではなく個数しきい値にすると輪郭が安定する。
- **本命は §3.A**：格子自体を「中心大・外周小」の TownGen 型にすれば、`classifyUrban` の
  結果も自然に安定し、短辺由来のカクカク（§2.6）も激減する。

### 2.3 門の数・位置・オプション

- `synthSite` が道路を出しすぎる [synthSite.ts:494-498]：`landwardBearings(shoreAz, 3)` または
  `spreadBearings(3|4)` に加え、川が site を横切ると `axisAzimuthDeg ± 90` の **2 本** を無条件
  追加。→ 内陸 3〜4、川あり 5〜6、海＋川で最大 6。
  `suggestedGates = roads.filter(r => r.group !== "searoutes").length` [synthSite.ts:143]。
- `placeGates`（commit 1b7f7 で改良済み）は既に：候補＝2 urban セル共有の border 頂点、
  `target = clamp(round(suggestedGates·0.7), 3, 6) + (wet?1:0)`、道路方位マッチ貪欲、選択後
  弧長 `perimeter/(target+1)` 未満を間引き ── TownGen `entrances` の thin-out に近い形。
- **足りないのは調整の口**：
  - 門本数モデルの選択（**形状由来**＝TownGen 式で `entrances` から決める / **道路由来**＝
    `suggestedGates` 連動 / **手動**＝数値指定）。
  - 最小間隔（弧長）係数。
  - 門候補の限定（街区の角のみ / border 上の任意頂点も可）。
  - **外郭 split**（TownGen `outer.shape.split(gate, farthest)` [CurtainWall.ts:74]）＝門ごとに
    外側の rural セルを門→外向きに 1 回割って road の抜けを作る。City Editor には無く、
    `buildStreets` の A\* が外を回り込むだけ（回れないと road が消える、§2.5）。
  - `synthSite` の川 `±90` 追加を「実際に市街を横切る川のみ・1 本」に制限。

### 2.4 河川のランダム生成オプション

- 生成は「頂点列を真実源、通過辺は導出」（design §3.1）で正しい。`walkRiver` は
  セル辺グラフ上のバイアス付きウォークで、`stop = 水ポリゴン内` で岸に止まり
  `trimAtWater` / `finalizeEnds` / prune で後処理される。
- **固定値ばかり**でオプションが無い：
  - 本数（`config.rivers.length` 0〜2、`riversForCount` で 1 本目は `toCoast`、以降 `meander`）。
  - 通過形態（`through` 市街分断 / `beside` かすめる / `toCoast` 河口）。
  - 蛇行量（`walkRiver` の `wander 0.7`、`meanderScale`、`meanderProfileFor`）。
  - 合流（現状は独立河川のみ。design §3.1 の「共有頂点で upstream の mouth を downstream に
    接続」は未実装）。
  - 幅プロファイル（`6 + 10·(i/n) + rng(-1,1)`）。
  - コリドー追従の強さ（`corridorPull 1.5`）。
- Generate パネルは `Coast / Rivers(0/1/2) / Relief` のみ。上記を出せば「街の近くや内部を
  通過する経路の不自然さ」を対話的に詰められる。

### 2.5 街道の伸び方・海/河川との関わり（現実性バグ・最重要）

- `buildStreets` の `buildEdgeGraph(interiorCells)` は **海セルも含む** 全セルの辺グラフ。
- `roads` の通行判定 `nonUrban(a,b)`：urban node を含めば ∞、さもなくば 1。
  **海セル頂点は non-urban ＝ コスト 1 で自由に通れる。**
- `farNodeFor(gate)` は記述子道路端（方位一致）または gate 放射方向を `half·0.985` で
  クランプするだけ。**海の中でも goal になる。**
- 海岸都市：`classifyUrban` の楕円で市街地は岸沿いリボン、門は border 上に方位配置。
  岸沿い方位の門 ＋ 岸平行な synth 道路（川 `±90` が `shoreAz` とほぼ直交＝岸平行）
  → A\* が湾内の海セルを突っ切って goal へ → **海上に街道が描かれる**。
- `markWaterGate` は 1 門だけ `water:true` 化（`roads` は `gate.water` でスキップ）。port off
  の湾では 0 門 water → 全門が landward road を引く。
- river 側は `walkRiver` が `stop = pointInPolygon(p, waterPolygon)` で岸で止まり、
  後処理済み。**`generate.ts` の最終 polyline 検査が roads/streets/arteries に無い。**
- **付随リスク**：`farNodeFor` の goal が対岸の陸に着地すると A\* が `null` → その門は
  road 無し。`placePrecincts` の citadel enceinte は `!sea.has(n)` で海隣接を落とすので
  岸ギリギリだと enceinte が 1〜2 セルに縮む。岸セルの inset がスライバを残すと海にはみ出た
  建物が残りうる（`withinCell` で概ね除去済み）。

### 2.6 カクカクの街区境界（仕上げ）

- 「内部街路を最終図に描かない・セットバック隙間で表現」は TownGen と一致。
- 差は**街区境界線（セル辺）の平滑化**：
  - TownGen `smoothStreet` は artery 内部頂点を `smoothVertexEq(3)` で均し、**共有 Point を
    書き戻す** → artery に乗った街区辺が滑らかに。乗ってない辺は 15 枚しか無く元々長い。
  - City Editor は artery / road を平滑化してもセル辺（メッシュ頂点）には書き戻さない。
    `foldArteriesIntoCells` 相当が generate 経路に無く、青ノイズの小セルの非街路短辺は
    Voronoi の生のジグザグのまま。`smoothPath(_, 2)` は TownGen の `f=3 ×1` より弱い。
- **A で大セル化すれば短辺自体が激減**し、この問題は大幅に縮小する（A が本命）。

---

## 3. 改善案

すべて **`src/city-editor/core/gen/`** への実装。`generate.ts` は移植後の `gen/*` だけを
呼び、`city-generator` を import しない。決定論（`(document, settings, seed, step)` で不変）を
維持する。GPL コードは読むだけ・関数単位で手本移植する。

### A. セル整形を TownGen 型へ再実装＋ステップ可視化＋母点編集（土台・最優先）

1. **`gen/patches.ts`** ── `buildPatches` [Model.ts:167] を手本に：
   - 螺旋散布ループ（`nPatches*8` 点、中心密・外周疎）。母点数 `nPatches` は引数。
   - 逐次 Voronoi（`delaunator` で三角形分割 → 有界 Voronoi。FMG 既存の
     `src/city-generator/core/voronoi.ts` と同方式だが **City Editor 側にコピー**）。
   - `relax` は **中心付近 K 点のみ**（`[0,1,2,nPatches]` 相当、K は option）× パス数（option）。
   - `points.sort(by |p|)` → 先頭 N を urban 候補として `Cell[]` を返す。
2. **`gen/gridEvolution.ts`** ── スナップショット型：

   ```ts
   interface GridStage {
     label: string;                 // "scatter i=42" / "addPoint 42/120" / "relax pass 2" / "Lloyd 1"
     sites: Point[];
     delaunay: [Point, Point][];     // 三角形の辺（2.1 相当の可視化用）
     cells: { polygon: Point[]; site: Point }[];
   }
   ```

   散布は「点 1 個追加」単位、Voronoi は「`addPoint` 1 回」単位、relax / Lloyd は「1 パス」単位で
   1 stage。`◀ / ▶` と range スライダーでスクラブ。
3. **Document パネル UI**：
   - 「Grid evolution」スライダー ＋ `◀ First / Prev / Next / Last ▶` ＋ ラベル表示
     （既存の Generate パネルの step 行と同じ作り）。
   - レイヤートグル：Delaunay 三角形 / Voronoi セル / 母点。
   - **母点の数**（`nPatches` 相当）と **relax 対象点数 K / パス数** を数値入力。
   - **母点の位置編集**：Voronoi sites tool（design §4.2 に既記載、未実装）で母点を
     add / move / delete → 再計算プレビュー。移管レポート（design §5.1）は既存方針を踏襲。
   - 「この格子を採用」で `meshFromCells` を通して現在の `CityDocument.mesh` を置換。
4. **`document.ts`**：`createDocument` は `gen/patches.ts` 経由に切替。`buildGrid`
   （`city-generator`）への依存を除去。`New grid` は最終段、スライダーは途中段。
5. **回帰**：`classifyUrban` の `urbanNPatches` 個数しきい値をデフォルト化するか計測して決める
   （§2.2）。`cellSizeMeters` 相当は `cityRadius / (2.0〜2.3)` 程度に粗く。

**テスト**：`gen/patches.test.ts`（決定論、母点数 → セル数、中心セルが最大・外周が小、
`relax` 対象数を変えると中心だけ動く）、`gen/gridEvolution.test.ts`（stage 数 = 散布点数 +
Voronoi 追加数 + パス数、各 stage が単調に 1 点/1 パスだけ進む）。

### B.（済・移植のみ）市街地コアの個数しきい値

`classifyUrban` の `nPatches` 分岐は commit 1b7f7 で実装済み。`gen/urban.ts` へそのまま移植し、
`GenerationSettings.urbanNPatches` を維持。A で格子が TownGen 型になれば既定値
`N ≈ π·(R/cellSize)²` で安定するはず ── まず計測。

### C. 門をオプション化（見た目に直結）

`gen/gates.ts`（`placeGates` [`interior.ts`] を移植）＋ `GenerationSettings.gates`:

```ts
gates: {
  countModel: "shape" | "roads" | "manual";   // 既定 "roads"
  manualCount?: number;                        // countModel === "manual"
  minSpacingFactor: number;                    // 弧長 perimeter/(target+1) の係数、既定 1.0
  candidates: "corners" | "anyBorderVertex";   // 既定 "corners"
  outerSplit: boolean;                         // 外郭 rural セルを門向きに 1 回 split、既定 true
}
```

- `"shape"` ＝ TownGen 式：border 頂点のうち「2 urban セル共有」の角だけを候補に、
  `entrances.length>=3` の間ループしながら周囲を splice（`CurtainWall.buildGates` 相当）。
- `"roads"` ＝ 現状：`target = clamp(round(suggestedGates·minSpacingFactorに依らず 0.7),3,6) + wet`。
- `outerSplit` ＝ 門ごとに外側 rural セルを `splitFace(faceId, gate近傍v, farthest v)` 相当で
  1 回割り、road 用の隙間を作る（TownGen `outer.shape.split`）。City Editor は `splitFace` を
  既に持つのでメッシュ操作として実装可能。
- `synthSite` 移植先（`gen/site.ts`）で川の `±90` 追加を「市街を横切る川のみ・最大 1 本」に。
- `◀ / ▶` の `generateGateStep` は既存のまま（門 1 個ずつ）。

**テスト**：`gen/gates.test.ts`（countModel 3 種で本数が仕様どおり、`minSpacingFactor` を上げると
本数が減る、`candidates:"corners"` では全門が 2-urban 共有頂点、`outerSplit` で門外に新セルが
1 個増える）。

### D. 河川のランダム生成オプション

`gen/rivers.ts`（`walkRiver` / `synthRivers` を移植）＋ `GenerationSettings.rivers`:

```ts
rivers: {
  count: number;                               // 0..3
  passage: ("through" | "beside" | "toCoast")[]; // 河川ごと、既定は count と coast から導出
  meander: number;                             // walkGraph の wander、0..1、既定 0.7
  confluence: boolean;                         // 2 本目以降を 1 本目へ合流させる、既定 false
  widthScale: number;                          // 幅プロファイル倍率、既定 1.0
  corridorPull: number;                        // コリドー追従、既定 1.5（小さいほど暴れる）
}
```

- `confluence` ＝ design §3.1 の未実装分：2 本目の walk の goal を 1 本目の頂点列上の点にし、
  最初に触れた共有頂点で `RiverGroup.mouth = { kind: "river", targetId }` として接続。
  下流は別 group のまま。
- `passage:"through"` は `classifyRiver` の bank 分割で「市街が 2 連結成分に割れる」→ §4 の
  「2 本の独立城壁ループ」を後段が自然に扱う（無理に 1 本のギャップ付き城壁にしない）。
- 頂点列＝真実源、通過辺は導出、水域内 river edge を持たない（design §3.1 / §3.2 B 案）を厳守。
- `◀ / ▶` の `generateRiverWalkStep` は既存のまま（walk 頂点 1 個ずつ、複数河川対応済み）。

**テスト**：`gen/rivers.test.ts`（count どおりの本数、`passage` 別に bank 成分数が変わる、
`meander` を上げると総折れ角が増える、`confluence` で 2 本目の mouth が 1 本目の頂点になる、
どの設定でも water face 接続頂点以外に mouth が来ない）。

### E. 現実性フィルタ ＋ 街道の伸長方式（最優先バグ）

`gen/plausibility.ts`（新規・純関数、pipeline 末尾）＋ `gen/streets.ts` の伸長オプション。
`waterPolygon`（複数可）を唯一の真実源にする。

1. **道路 × 水域**
   - `buildStreets` に `seaNodes: Set<number>`（海セル頂点）を渡し、`nonUrban` を
     「`seaNodes` を含む辺は ∞」に拡張 → A\* が海を通らない。
   - `farNodeFor` の goal が `pointInPolygon(goal, waterPolygon)` なら、`goal→gate` 線分と
     shoreline の交点から陸側へ `cellSize` の点に置換。
   - それでも A\* が `null` の門は road を引かず `water:true` に再マーク（quay 描画）。
   - 生成済み `roads` / `arteries` を最終検査し、`waterPolygon` 内に落ちる区間があれば
     road を drop、または shoreline でクリップ。
2. **城壁 × 水域**：`borders` 各辺の mid が `waterPolygon` 内なら wall 区分を `coast` に強制、
   「海側は塞がない」。
3. **建物 × 水域**：`withinCell` に `&& !pointInPolygon(centroid(piece), waterPolygon)` を追加。
4. **門 × 陸**：land gate の外側 `cellSize·1.5` が全て sea なら water gate 化。
5. **孤立**：road が 1 本も無い land gate が過半なら、synth 道路方位を派生 seed で作り直して
   1 回だけリトライ。
6. **街道の伸長方式**（`GenerationSettings.streets`）：

   ```ts
   streets: {
     farNode: "descriptorEnd" | "radial" | "manualBearings";
     manualBearings?: number[];
     avoidSea: boolean;         // 既定 true（= 1〜5 を有効化）
     foldSmoothing: boolean;    // §F、既定 true
   }
   ```

**テスト**：`gen/plausibility.test.ts`（4 海岸シナリオ × 複数 seed、
「road / artery / building / wall いずれも `waterPolygon` を跨がない」を assert）。

### F. セル辺の平滑化を街路以外にも（仕上げ）

- S5 後に「reserved（border/citadel/gate/river/coast）以外の全 interior 頂点」へ弱 Laplacian
  1〜2 パス（`p' = (Σ neighbor + p)/(deg+1)`、reserved 固定）。
  ※「Laplacian はほぼ無効果（既に Lloyd 済）」は coarse-grid 化**前**の話。現状の小セルなら
  効くはず ── まず計測。
- `foldArteriesIntoCells` 相当を `gen/streets.ts` に追加：平滑化した artery/street 頂点を
  対応するメッシュ頂点へ書き戻す（TownGen `smoothStreet` の共有 Point 書き戻しと同効果）。
  City Editor は route を `EdgeRef[]` / 頂点列で持つので、`smoothFeatureGroup` の既存
  ロジック（`features.ts`）を generate 直後に自動適用する形でよい。
- `smoothPath` 既定を `2 → 3` 反復、または `f` を TownGen の 3 に合わせて
  `(p[i-1] + 3p[i] + p[i+1])/5` に。
- **A で大セル化すれば短辺が激減**し縮小する（A が本命）。

---

## 4. モジュール境界（改善計画の決定）

- **`src/city-generator/` は凍結**：`generate.ts` / `document.ts` / `mesh.ts` /
  `generate.test.ts` からの import を全て `src/city-editor/core/gen/` の再実装へ差し替える。
  差し替え完了後、`src/city-editor/` 配下に `city-generator` の文字列が 0 であることを
  CI 相当でチェック。
- 移植は**関数単位の手本再実装**。GPL の TownGeneratorTS は読むだけ。`city-generator` は
  MIT（FMG 本体と同一ライセンス）なので機械的コピー可だが、**改良を旧モジュールに戻さない**。
- `src/city-generator/` と `src/city/`（standalone ページ）と `vite.config.ts` の `city` input、
  FMG Burg エディタの `openCityGenerator()` は **別フェーズで撤去/切替**（§実装計画 Phase G5）。
  それまで standalone ページは現状のまま放置してよい（凍結＝触らない）。

---

## 5. 着手順と対象ファイル

| 優先 | 案 | 主対象（すべて `src/city-editor/`） |
| --- | --- | --- |
| 1 | **A** セル整形の再実装＋ Grid evolution＋母点編集 | `core/gen/patches.ts`・`core/gen/gridEvolution.ts`・`core/voronoi.ts`（新規コピー）・`core/document.ts`・`ui/CityEditorPage.ts`（Document パネル）・`render/svg.ts`（overlay）・各 `*.test.ts` |
| 2 | **E** 現実性フィルタ＋街道伸長 | `core/gen/plausibility.ts`（新規）・`core/gen/streets.ts`・`core/gen/geom.ts`・`core/generate.ts`・`plausibility.test.ts` |
| 3 | **C** 門オプション | `core/gen/gates.ts`・`core/gen/site.ts`（`synthSite` 移植）・`ui/CityEditorPage.ts`（Generate パネル）・`gates.test.ts` |
| 4 | **D** 河川オプション | `core/gen/rivers.ts`・`core/gen/site.ts`・`ui/CityEditorPage.ts`・`rivers.test.ts` |
| 5 | **F** 平滑化 | `core/gen/streets.ts`・`core/gen/edgeGraph.ts`・`core/features.ts` |
| 6 | **B** 個数しきい値の既定化（計測次第） | `core/gen/urban.ts` |

City Editor「Generate」パネルと Document パネルの両方に直結する。詳細な工程・受入条件は
`docs/city-editor/実装計画.md` を参照。
