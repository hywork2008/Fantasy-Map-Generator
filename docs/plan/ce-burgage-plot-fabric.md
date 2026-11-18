# CE 史実の短冊形区画（burgage plot）で街区を作るオプション

作成: 2026-11-18
状態: 設計のみ。未実装。
関連: [ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md)、[ce-medieval-facility-district-packing.md](ce-medieval-facility-district-packing.md)、[ce-facility-block-allocation.md](ce-facility-block-allocation.md)、[bv-workhome-facade-variation.md](bv-workhome-facade-variation.md)、[ce-meshless-gate-ribbon-growth.md](ce-meshless-gate-ribbon-growth.md)

## 1. 目的と範囲

### 1.1 起きていること

`medieval-facilities` で都市を作ると、Town Trades と Workhome の施設が住宅用の街区を 1 つ丸ごと使ってしまう。その結果、通りに沿って「道・施設・道・施設」と並び、建物がまばらに見える。

原因は、今の街区が「奥行きの浅い住宅を 2 列、背中合わせに並べる」大きさで切られていることである（§3）。施設は住宅 1 列の奥行きより深いため、裏の列まで届き、街区の幅をすべて使ってしまう。

史料では、中世ヨーロッパの都市の多くの手工業は、住宅と同じ短冊形の区画（burgage plot、Hofstatt）の中で営まれていた。間口は狭く奥行きは深い。表通り側が店と住居で、奥が工房・中庭・付属屋である。大きい施設でも、隣の区画を 2〜3 筆合わせるだけだった（§2）。

### 1.2 本書で行うこと

- 今の街区の切り方（住宅だけを前提にした、浅く小さい街区）は**そのまま残す**。これを `compact` と呼ぶ。
- 史料に基づく短冊形区画で街区を作る生成方式を、**別のオプション** `burgage` として加える。
- `burgage` では、施設は「区画を 1〜3 筆合わせたもの」として置く。同じ街区に住宅と施設が混ざる。

### 1.3 範囲に入れる

- メッシュなし CE（skeleton-first）の `medieval` と `medieval-facilities`。
- 区画の寸法の表（地域の型・時代ごと）、街区と裏小路の作り方、区画の中の建物と裏庭、施設を合筆して置く処理、都市の大きさの見積もり、保存形式。

### 1.4 範囲に入れない

- 今の `compact` の関数（`organicLayout`、`frontageBuildings` の `packAttachedHouses`、`placeFacilitiesOnLots`）の変更。`compact` の出力は変えない。
- 施設の正確な敷地面積の合わせ込み。Workhome の大きさは「住宅より大きい施設がある程度」とだけ扱う（2026-11-18 のユーザー方針）。外観と大きさのばらつきは [bv-workhome-facade-variation.md](bv-workhome-facade-variation.md) で扱う。
- メッシュあり CE（mesh-first）への適用。B6 で判断する（§8）。
- 経済（Economy）の結果を区画に反映すること。Economy がオンのときに CE へ経済の値を渡す方針はあるが、本書では人口から決まる施設数だけを使う。
- CG。

## 2. 史料と寸法

### 2.1 主な史料

| 史料 | 内容 | 本書での使い方 |
| --- | --- | --- |
| M.R.G. Conzen, *Alnwick, Northumberland: A Study in Town-Plan Analysis* (1960) | 街路・街区・区画の階層の分析。「burgage cycle」（区画の奥が付属屋や工房で埋まっていき、大きな用途には隣の区画を合わせる） | 区画の構成（§5.4）、合筆（§5.5）、建て込み（B5） |
| T.R. Slater, "The analysis of burgage patterns in medieval towns", *Area* 13 (1981) ほか | Stratford-upon-Avon、Ludlow などの区画の寸法。Stratford は 1196 年の特許状で 3½ × 12 perch（約 17.6 × 60 m） | `english-burgage` の寸法 |
| Maurice Beresford, *New Towns of the Middle Ages* (1967) | イングランド・ウェールズ・ガスコーニュの計画都市の区画寸法 | `english-burgage`、`bastide` |
| Freiburg im Breisgau の建設文書（1120 年） | 区画（area）は 50 × 100 フィート（約 15 × 30 m） | `hofstatt` |
| ツェーリンゲン家の都市（Bern など） | Hofstatt は 60 × 100 フィート前後 | `hofstatt` |
| 南西フランスのバスティード（Monpazier 1284 年など） | 格子状の街区に、間口の狭い区画を背中合わせに並べる | `bastide` |
| Derek Keene, *Survey of Medieval Winchester* (1985) | 区画ごとの所有と用途の記録。工房と住居が混ざっている | 街区内の用途の混在（§5.5） |
| York, Coppergate の発掘 | 間口 5〜6 m 程度の区画の奥で、金属加工・木工を行っていた | 区画の奥の作業場（§5.4） |
| John Schofield, *Medieval London Houses* (1994)／Schofield & Vince, *Medieval Towns* (2003) | 店・工房・中庭・倉庫の配置 | 区画の中の建物の配置（§5.4） |
| 『メンデル家十二兄弟財団の家の書』（ニュルンベルク、15 世紀〜） | 職人が家の表側の間で作業する図 | 工房が通りに面した 1 階にあること |

**注意**: 上の寸法は、本書を書いた時点で原典と照らし合わせていない概数である。B0 で原典を確認し、§2.2 の表を確定する。確定するまでは、コードの表に `provisional` の印を付ける。

### 2.2 寸法の目安

| 型 | 区画の間口 | 区画の奥行き | 街区の作り | 主な地域 |
| --- | --- | --- | --- | --- |
| `english-burgage` | 5〜10 m（1〜2 perch、多いのは 1 perch ≈ 5 m 単位） | 30〜100 m。壁の中の古い区画は 30〜60 m | 2 列を背中合わせに並べるか、1 列の裏を裏小路（back lane）にする | イングランド、ウェールズ、スコットランド |
| `hofstatt` | 建設時は約 15 m。後に半分（約 7.5 m）や 3 分の 1 に割られる | 約 30 m | 2 列を背中合わせ | ドイツ南西部、スイス、ハンザ都市（ハンザは間口 6〜10 m、奥行き 30〜50 m） |
| `bastide` | 約 8 m | 20〜25 m | 格子の街区に 2 列を背中合わせ | 南西フランス |

### 2.3 史料から取る取り決め

- **R1 細長い区画**: 区画は通りに狭く面し、奥に深い。奥行きは間口の 3〜10 倍。
- **R2 表と裏**: 区画の表に建物（店・住居・工房の 1 階）、奥に裏庭・作業場・付属屋・菜園・井戸・汚水溜めを置く。
- **R3 工房は区画の中に収まる**: 手工業の施設は区画 1 筆で完結する。大きな施設（宿屋・商館・醸造所）は隣の 2〜3 筆を合わせる。街区を丸ごと使うのは、修道院・施療院・城館・大きな市場くらいである。
- **R4 街区は区画の奥行きで決まる**: 街区の短い辺は、区画 2 本分の奥行き（2 列を背中合わせ）か、区画 1 本分と裏小路である。長い辺には区画が 10〜30 筆並ぶ。
- **R5 区画の奥の端**: 区画の奥は、裏小路・市壁・川・隣の街区の区画の奥に接する。
- **R6 建て込み**: 人口が増えると、区画は縦に割られて間口が半分になり、奥には裏の棟が建ち並ぶ（burgage cycle）。壁の中の古い都市ほどこれが進んでいる。
- **R7 外側に出す業種**: なめし革・染色・屠畜は川沿いや下流、壁の際に置く。今の tanners' row（[ce-meshless-tanners-row.md](ce-meshless-tanners-row.md)）はこの取り決めに合っているので、そのまま使う。

## 3. 今の実装の調査

### 3.1 街区の切り方（`compact`）

メッシュなし CE は、骨格の街区（district）を [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) の `perimeterJobs` で受け取り、[organicBlocks.ts](../../src/city-editor/generators/organicBlocks.ts) の `planOrganicStreetCells` と `buildOrganicStreetCell` で街区（street block）と区画に分ける。

| 箇所 | 値 | 意味 |
| --- | --- | --- |
| [perimeter.ts:236](../../src/city-editor/generators/vector/generation/perimeter.ts#L236) `ceParameters` | `lotArea: 80`、`laneWidth` は設定の 2.4 m（[urban.ts:60](../../src/city-editor/generators/vector/generation/urban.ts#L60)） | 住宅 1 戸の敷地 80 m²（[housing.ts:8](../../src/city-editor/generators/housing.ts#L8) `DWELLING_LOT_M2`） |
| [organicBlocks.ts:206-210](../../src/city-editor/generators/organicBlocks.ts#L206-L210) | `houseDepth = √80 × 1.1 ≈ 9.8 m`、`pairedSpan = 2 × 9.8 + 2.4 + 0.7 ≈ 22.4 m` | 住宅 2 列を背中合わせにした幅 |
| [organicBlocks.ts:50-51](../../src/city-editor/generators/organicBlocks.ts#L50-L51) | `COARSE_STREET_CELL_METERS = 50`、`COARSE_STREET_WIDTH_METERS = 5` | 骨格の街区を約 50 m 角の街区に切る |
| [organicBlocks.ts:286-291](../../src/city-editor/generators/organicBlocks.ts#L286-L291) `subdivide` | 短い辺は `pairedSpan` ＋ 0〜3 m（32% は中庭付きで ＋ 6〜14 m）。長い辺は `pairedSpan` × 1.65〜2.6 | 最後の街区は約 22〜37 m × 37〜58 m |
| [frontageBuildings.ts:194](../../src/city-editor/generators/frontageBuildings.ts#L194) `packAttachedHouses` | コメントに「Compact houses, not elongated burgage holdings」 | 区画は家の外形そのもので、裏庭を持たない |

### 3.2 施設が街区を占有する経路

[facilityLots.ts:50-56](../../src/city-editor/generators/vector/generation/facilityLots.ts#L50-L56) の `placeFacilitiesOnLots` は、施設 1 つに 1 つの街区の隣り合う住宅区画を何筆か割り当てる。施設の敷地が触れた区画は、区画の線まで全部を施設のものにする。

- 住宅 1 列の奥行きは約 9.8 m しかない。Workhome や Town Trades の敷地はそれより深いので、裏の列の区画にも触れる。
- 裏の列まで施設のものになると、施設が街区の幅（約 22 m）をすべて使う。表と裏の両方の通りに施設が面し、その街区には住宅が残らない。
- 街区の長い辺も 37〜58 m しかない。施設が 2 つ入ると長い辺も埋まり、街区全体が施設だけになる。

区画の大きさ（住宅の 80 m²）と施設の大きさの比が合っていないことが根本の原因である。施設の配置の探索を直しても解決しない。

### 3.3 都市の大きさの見積もり

[urbanSizing.ts](../../src/city-editor/generators/vector/generation/urbanSizing.ts) の `meshlessCityRadius` は、`MESHLESS_DWELLINGS_PER_M2_STOREY = 0.0068`（道を含めて 1 戸・1 階あたり約 147 m²）で市域の半径を決める。`compact` の区画の大きさから求めた値なので、`burgage` には使えない（§6）。

### 3.4 使える部品

- 骨格の街区を受け取る処理（`perimeterJobs`）、district と街区の安定した ID（`vectorDistrictId`、`ringHash`）、乱数の流れ（`growthRandom`、`makeRng`）。
- 区画・小路の保存形式（fabric の記録、[vector/fabric](../../src/city-editor/generators/vector/fabric)）。
- 住宅の階数（`vectorHousingHeights`）、地域の型（`vectorHousingCulture` → `BuildingAppearanceProfile`）。
- tanners' row の予約（`reserveTanneryRow`）。
- 空き地の木（[vacantLotTrees.ts](../../src/city-editor/generators/vacantLotTrees.ts)）。裏庭の木と菜園に使う。

## 4. 方針

1. **`compact` は変えない**: 新しい処理は別のモジュールに書く。既存の関数を書き換えて分岐を足すことはしない。`compact` の固定入力の出力は、直列化した文書の SHA-256 が変更前と一致することで確かめる。
2. **設定の追加**: `GenerationSettings` に `plotFabric?: "compact" | "burgage"` を加える。値がないときは `compact`。`VectorUrbanSettings` にも同じ項目を持たせる。施設の有無（`mode`）とは別の軸とし、`medieval`（住宅だけ）でも `burgage` を選べる。
3. **UI**: Urban area & housing に「Plot pattern」を加える。選択肢は `Compact (houses only)` と `Burgage plots (historical)`。文言は多言語化のファイルに置く。
4. **アルゴリズムの版**: `burgage` を選んだときだけ `vector-urban-v19` とする。`compact` は v18 のまま出力が変わらない。保存済みの文書は、保存された版のまま扱う。
5. **区画が単位**: `burgage` では、区画が所有と配置の単位になる。住宅も施設も区画の上に建つ。施設は区画の線をまたいで置かず、区画を合わせて広げる。
6. **史料の寸法は表で持つ**: §2.2 の寸法は `burgageProfiles.ts` の表に置く。生成の処理に数値を直接書かない。

## 5. 区画のモデル

### 5.1 型の選び方

| 地域の型（`BuildingAppearanceProfile`） | 区画の型 |
| --- | --- |
| `atlantic`、`northern-wooded`、`legacy` | `english-burgage` |
| `northern-urban` | `hofstatt` |
| `mediterranean` | `bastide` |
| `stone-upland` | `english-burgage`（奥行きを短い側に寄せる。斜面で深い区画が取りにくいため） |

型は自動で選ぶ。上書きの設定は B1 では作らず、必要が出たら加える（§9）。

### 5.2 区画の寸法の決め方

区画 1 筆ごとに、型の範囲の中から間口と奥行きを乱数で決める。乱数は街区の ID から作り、ほかの街区の結果に左右されない。

- **間口**: 型の範囲の中で、街の中心（市場）に近いほど狭くする。中心に近い区画ほど、割られて間口が狭くなっているため（R6）。
- **奥行き**: 1 つの街区の 1 列の中では、ほぼ揃える（差は ±10% 以内）。史料の区画の奥の線は、1 列の中で揃うことが多いため。
- **壁の中と外**: 壁の中は範囲の短い側、壁の外の街道沿い（[ce-meshless-gate-ribbon-growth.md](ce-meshless-gate-ribbon-growth.md) の roadside ribbon）は範囲の長い側を使う。街道沿いに 1 列だけ並ぶ区画は、典型的な burgage の並び方である。

### 5.3 街区と裏小路

`compact` の「約 50 m 角に切る」処理の代わりに、区画の奥行きから街区の大きさを決める。

- **短い辺**: 区画の奥行き × 2（背中合わせ）。または区画の奥行き ＋ 裏小路の幅（1 列と裏小路）。`english-burgage` は両方を使い、`hofstatt`・`bastide` は背中合わせを基本にする。
- **長い辺**: 区画が 10〜30 筆並ぶ長さ（60〜200 m）。主要道路に沿う辺を長い辺にする。区画の正面は主要道路か街路に向ける。
- **横の小路**: 長い辺が長すぎて奥へ行けない場合は、60〜120 m ごとに狭い横の小路（1.5〜2.5 m、英国の wynd・vennel に当たる）を通す。
- **裏小路**: 幅 2〜3 m。区画の奥にある裏口と作業場への出入りに使う。裏小路にも家は面さない（区画の奥の付属屋は B5 で扱う）。
- **骨格の街区の形が合わない場合**: 三角形の角や細い先端は、区画の奥行きを短くして埋める。奥行きが型の下限の半分より短くなる部分は、空き地（菜園・木）として残す。三角形の家は作らない（`packAttachedHouses` と同じ考え方）。

### 5.4 区画の中

区画を、表から奥へ 3 つの帯に分ける。

| 帯 | 奥行き | 中身 |
| --- | --- | --- |
| 表 | 建物の奥行き（住宅は 8〜12 m、施設はモデルの奥行き） | 表通りに面した建物。隣とは壁を接し、連続した町並みにする |
| 中庭 | 残りの前半 | 作業場・井戸・薪置き。施設の付属の敷地はここに入る |
| 奥 | 残りの後半 | 菜園・果樹・汚水溜め・付属屋（B5） |

- 区画の境界は、2D では細い線、3D では低い石垣・板塀・生垣で描く（B4）。
- 建物が建たない区画（`lotOccupancy` < 1 で空いた区画）は、区画全体を菜園や空き地として描く。
- 区画 1 筆の住宅の戸数は、表の建物の大きさと階数から今の `perimeterHouseDwellings` で決める。

### 5.5 施設を区画に置く

`compact` の `placeFacilitiesOnLots` とは別に `placeFacilitiesOnPlots` を作る。

1. 施設の必要数と置く順序は今と同じ（`buildPopulationFacilityRequests`、`facilityPlacementOrder`）。
2. 施設の**間口**だけから、合わせる区画の数を決める: `ceil(施設の幅 / 区画の間口)`。奥行きは区画の中に収まればよい。施設の正確な面積は合わせない（§1.4）。
3. 1 つの街区の**同じ通りに面して隣り合う**区画を合わせる。施設の建物は合わせた区画の表に置き、残りは施設の中庭と奥の帯になる。
4. 上限:
   - 1 つの施設が合わせる区画は 3 筆まで（R3）。宿屋・ギルドホールのような大きい施設は 4 筆まで認める。
   - 1 つの街区の 1 つの辺のうち、施設が使う区画は半分まで。残りは住宅にする。
   - 1 つの街区で、通りに面したすべての辺が施設だけになる配置はしない。
5. 施設の奥行きが区画の奥行きより深い場合、その施設は「街区規模の施設」として扱う。この扱いを許すのは、修道院・施療院・大きな市場の建物など、表で指定した種類だけにする。それ以外は、置けなかった理由 `plot-depth` として報告する。
6. 用途の位置は今の考え方を引き継ぐ。商業は中心に近い区画、川を使う業種は川に近い区画、なめし革は tanners' row（R7）。
7. 置けなかった施設は、今と同じく `unplacedFacilities` に理由を付けて残す。上限を破って数だけ満たすことはしない。

施設の区画が決まった後、残りの区画に住宅を建てる。施設の区画と住宅の区画は区画の線で接し、間に余りの土地はできない。

### 5.6 Workhome の幅との関係

[bv-workhome-facade-variation.md](bv-workhome-facade-variation.md) の V4（間口の幅を連続して受け取る外装、4.8〜7.2 m）は、「区画の作り方の方針（FF の後継）が決まってから」となっている。`burgage` の区画の間口（5〜10 m）は、この範囲とほぼ重なる。

- B3 では、Workhome は今の 3 種類の外形（narrow 4.8 m・standard 6 m・wide 7.2 m）のうち、区画の間口に収まる一番広いものを選ぶ。
- V4 が実装されたら、区画の間口を外装の幅として渡す。

## 6. 都市の大きさ

`burgage` の区画は裏庭を持つので、1 戸あたりの土地が `compact` よりかなり広い。例として `english-burgage` の壁の中で間口 6 m・奥行き 40 m とすると、区画は 240 m² で、道を含めると 1 筆あたり約 300 m² になる。`compact` の 1 戸あたり約 147 m²（1 階あたり）と比べると、同じ人口で市域の面積が 1.5〜2 倍前後になる見込みである（概算。B2 で計測する）。

- `meshlessCityRadius` に、区画の型ごとの「1 筆あたりの土地（道を含む）」を渡す引数を加える。値は B2 で固定入力から計測して決め、`compact` の値は変えない。
- 壁の中では、R6（間口を割る・奥を短くする）で密度を上げる。壁の中に入りきらない分は、今と同じく門の外の街道沿いへ回す。
- 市域が広がると、壁・門・道の数も増える。[ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md) の上限（道の数・記録の数・文書の長さ）に当たらないかを B2 で確かめる。

## 7. 保存形式

- fabric の街区（`VectorFabricCell`）に、区画の記録 `plots` を加える。区画 1 筆は、輪郭（`packPoints` で詰めた環）、正面の線の ID、合わせた施設の ID（あれば）を持つ。
- 住宅の記録は今と同じ形のまま、どの区画に建つかを持つ。
- `burgage` の文書は native の版を 1 つ上げる。`compact` の文書の形は変えない。
- 区画は保存された値を展開して描く。読み込みや描画のたびに区画を作り直さない（[ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md) §3 の方針 2）。

## 8. 段階

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| B0 | §2 の史料を原典で確認し、§2.2 の表を確定する | 型ごとの間口・奥行き・街区の作りに出典（書名・頁）が付いている。`provisional` の印を外せる |
| B1 | 設定（`plotFabric`）、型の表（`burgageProfiles.ts`）、純関数 `planBurgageCell(ring, profile, context)`（区画・裏小路・横の小路を返す） | 単体テスト: すべての区画が通りに面する、区画が重ならない、奥行きが間口の 3 倍以上、街区からはみ出さない |
| B2 | メッシュなしの生成に接続する。`perimeterJobs` の後で、`plotFabric` によって `compact` と `burgage` の処理を選ぶ。住宅の配置、都市の大きさ（§6）、保存・読込、v19 | `compact` の固定入力の SHA-256 が変わらない。`burgage` の 1,000・5,000 人で未収容の住宅 0。生成時間が `compact` の 1.5 倍以内 |
| B3 | `placeFacilitiesOnPlots`（§5.5） | `medieval-facilities` の 1,000・5,000 人で、施設だけの街区が 0（街区規模の施設を除く）。施設の 9 割以上が 1〜3 筆。置けた施設の数が `compact` の 9 割以上 |
| B4 | 区画の境界と裏庭を描く（2D の線、3D の塀・生垣、菜園、木） | 2D と 3D で区画の線が見え、空いた区画が菜園になる。3D の描画の数が許容範囲に収まる |
| B5 | burgage cycle: 人口の密度と時代で、間口を割り、区画の奥に裏の棟を建てる | 壁の中の密度が B2 の見積もりより上がり、市域が狭くなる。裏の棟が裏小路か中庭から出入りできる |
| B6 | メッシュあり CE への適用を判断する | メッシュあり CE の利用状況と、`localInfill.ts` の `buildPerimeterBlocks` に同じ処理を渡すときの費用を比べて決める |

テストは AGENTS.md の方針に従い、変更した範囲に関係するものだけを実行する。B2 以降の FMG での確認は、Settlement pattern を Standard にした地図で行う。

**次に進める作業**: B0（史料の原典確認と寸法表の確定）。B1 は B0 と並行して、`provisional` の値で始めてよい。

## 9. 受入の指標

生成ごとに次の値を報告（`VectorUrbanReport`）に出し、`compact` と比べる。

- 施設だけの街区の数と割合（街区規模の施設を除く）
- 施設 1 つあたりの区画の数の分布
- 区画の間口・奥行き・縦横比の分布（型ごと）
- 未収容の住宅、置けなかった施設とその理由
- 市域の面積、壁の長さ、生成時間、文書の長さ

## 10. 未決事項

- 区画の型を地域の型から自動で選ぶだけでよいか、ユーザーが選べるようにするか。
- `burgage` を新しい都市の既定にするか。本書では既定を `compact` のままにする。
- 裏小路を道路グラフの道として持つか、fabric の小路として持つか。今の小路と同じく fabric の小路とする案が有力。
- 区画の奥の付属屋（B5）を、MV のモデルにするか、CE の簡単な箱にするか。
- 橋は増やさない。区画の配置で新しい橋は作らないので、[bridgeSkewPolicy.ts](../../src/utils/bridgeSkewPolicy.ts) の判定には影響しない。ただし、川に沿う区画の奥の端は川岸で止め、川の上に区画を作らない。
