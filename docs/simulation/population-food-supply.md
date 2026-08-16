# 人口・食料供給シミュレーション

関連する大都市化・食料輸入の実装計画は [megacity-food-import-economy.md](../plan/megacity-food-import-economy.md) を参照する。本書は、その計画で使う環境・農業労働・人口吸引の根拠と、実装前に確定した設計判断を記録する。

## 1. 前提と目的

現行の食料生産はセルの `capacity` と農村人口に強く結び付いている。このため、農村の人口が容量へ近づくと輸出余剰が消え、農村が十分な食料を生みながら都市へ労働力を送り出す状態を表せない。

新モデルでは、次を明確に分離する。

| 概念 | 意味 | 人口との関係 |
| --- | --- | --- |
| `cells.capacity` | 居住する農村人口の基礎的な上限 | 食料生産の直接入力ではない |
| `cultivableArea` | 地形・水域・気候の上限と、現在開いている土地から決まる耕作可能面積 | `forestStock` の増減で変化する導出値 |
| `cultivatedArea` | 現在、実際に作付・維持されている面積 | 労働力・市場需要・開墾によって変化する |
| `yieldPerArea` | 作付面積当たりの食料収量 | 気候、水利、技術、災害で変化する |
| `foodPotential` | 全耕作可能面積を十分な労働力で耕したときの上限 | 人口からは導かない |
| `farmLaborRequired` | 実作付・狩猟・漁撈・果樹・牧畜を月次で合算した最大成人労働力 | 共通の月次作業配列から導く |

これにより、食料を生む土地と、それを耕す人、余剰として都市へ移れる人を別々に扱う。

## 2. 現在の地図データとの対応

各 Packed cell は `pack.cells.g[cellId]` を通じて Grid cell に対応する。食料適性の生成器は次を直接読む。

- `grid.cells.temp[pack.cells.g[cellId]]`: 年平均気温の代理値
- `grid.cells.prec[pack.cells.g[cellId]]`: 降水量の代理値
- `pack.cells.forestCover[cellId]`: 森林被覆率
- `pack.cells.h`, `r`, `fl`, `area`, `biome`: 高度、水系・流量、面積、バイオーム

`settlementFoundation` にも温度・降水の居住適性判定があるが、これは人が居住できるかの広い判定である。穀物生産はそれより狭い条件を持つため、`foodPotential` は `biomesData.habitability` を主入力にせず、上記の気候・森林・水利を直接評価する。

## 3. 食料生産ポテンシャル

### 3.1 基本式

```text
cultivableArea = usableLandArea × initialCroplandShare
foodPotential = cultivableArea × yieldPerArea
```

```text
yieldPerArea = baseGrainYield
             × grainTemperatureFactor
             × precipitationFactor
             × waterAccessFactor
             × terrainFactor
             × baseAgriculturalTechnology
```

`foodPotential` は「そのセルに住む人口が多いほど増える値」ではなく、十分に耕作・維持した場合の年間上限である。地図ロード、economy 有効化、地図再生成で `simulation.extensions.economy.foodPotential` に決定的に再生成する。国家・局地の発展差はこの環境上限を上書きせず、実収量に別係数を掛けて表す。

```text
actualFoodProduced = foodPotential
                   × stateAgriculturalProductivity
                   × cellAgriculturalModifier
                   × cultivatedAreaCoverage
```

- `stateAgriculturalProductivity`: 技術、統治制度、治安、灌漑投資による**国家単位**の動的生産性。v1は全Stateで`1.0`とし、後続の技術・統治システムが更新する。
- `cellAgriculturalModifier`: 開墾、水利、土壌疲弊、局地災害による**セル単位**の動的生産性。v1は全セルで`1.0`とする。
- 実装では両者の積を`foodProductivityModifier[cell]`として持てる。`foodPotential`自身は人口・国家技術で正規化しない。
- **2026-07-31 追記**: `cellAgriculturalModifier`のうち「Tools(鉄製農具)普及・役畜」由来の技術要因は[rural-agtech-investment.md](../plan/rural-agtech-investment.md)で実装した。ただし同設計は`yieldPerArea`側の乗数（§3.1式の`baseAgriculturalTechnology`相当）として`agriculturalLandUse.ts`内に直接織り込む形を取り、本節が定義する`actualFoodProduced`側の別係数としては実装しない（二重計上を避けるため）。
- **2026-07-31 追記(Phase 2)**: `stateAgriculturalProductivity`のうち「技術・灌漑投資」要因も同設計の§6.1で実装した(同じく`yieldPerArea`側の乗数として)。「統治制度」要因は未実装。
- `cultivatedAreaCoverage = cultivatedArea / cultivableArea`: 開墾可能な全面積のうち、当期に実際に作付けている割合。
- `farmLaborRequired` は、主食・狩猟・漁撈・果樹・牧畜の月次作業が最大となる月に必要な成人数を示し、雇用・移住の計算に使う。`cultivatedArea` はすでに維持されている畑を表すため、Goods 表示および Food Ledger で労働力による二重の生産減衰は行わない。

`waterAccessFactor`（`yieldPerArea`側）と`cellAgriculturalModifier`の「水利」、`stateAgriculturalProductivity`の「灌漑投資」は同じ言葉を使うが指す層が異なり、二重計上ではない。`waterAccessFactor`は河川流量・湖沼・沿岸低地など**地形が持つ自然な水アクセス**であり、`foodPotential`に一度だけ焼き込まれるセル固定値である。`cellAgriculturalModifier`の水利は、灌漑用水路・堤防など**そのセルに実在する人工インフラの状態**（戦禍による破壊、開墾による新設など）を表す動的値である。`stateAgriculturalProductivity`の灌漑投資は、特定セルの設備ではなく**State全体の技術・統治能力としての灌漑政策水準**を表す動的値である。したがって「自然条件（静的・foodPotential側）」「セル単位の設備状態（動的）」「国家単位の政策水準（動的）」の3層は互いに独立した入力であり、同じ物理的水利を重複して数えているわけではない。

国家係数は各期にセルの現在の領有Stateから読む。領土移転後は次期の生産から新しい国家係数を適用するが、征服前から残る灌漑・開墾・土壌改良などはState係数に含めず、将来の`cellAgriculturalModifier`として保持する。

戦時は、生産量を一律に減らしたり State 単位の飢餓死亡を加えたりしない。実際に進行中の紛争だけが市場の戦時係数を通じて食料価格を上昇させる。恒久的な荒廃を扱う場合は、将来のセル局地係数に分離する。

Food Ledgerの飢餓死亡総数は、文化ごとの食料配分規範を表す`FamineMortalityWeights`で子供・男女成人・高齢者へ割り振る。未設定文化は子供`1.3`、男女成人各`1.0`、高齢者`1.2`を既定の相対比とし、居住地の実際の年齢構成で正規化する。これにより、文化によって子供または老人を優先する配給を後から設定できる。文化はこの内部配分にだけ使い、死亡統計は文化別に保持しない。

v1はculture IDごとに一組の規範を農村・都市へ共通適用する。国家、宗教、階層、為政者による差は後続で文化既定値へ重ねる。

初期地図では生産量を人口需要へ自動一致させない。Market・Stateごとの国内生産対需要比を監査し、地図条件による不足・余剰を可視化する。これにより、後の国家技術・制度や局地投資が実際に不足を改善できる。

### 3.2 セル面積・人口上限との整合性監査

`pack.cells.area` は SVG 地図座標上の polygon 面積である。表示・物理換算に使う面積は、現在の距離スケールを適用して次で求める。

```text
cellAreaKm2 = cells.area[cellId] × distanceScale²
cellAreaHa  = cellAreaKm2 × 100
capacityPeople = cells.capacity[cellId] × populationRate
currentRuralPeople = cells.pop[cellId] × populationRate
```

ただし `cells.capacity` は独立した農地データではない。現行の `rankCells()` は概ね `suitability × cells.area / meanCellArea` で容量を作り、その suitability 自体にバイオーム、河川・水域、標高、海岸、危険度を入れている。したがって、**容量から `foodPotential` を導くことは禁止する。** それは同じ環境要因と人口上限を二重に使う循環となる。

容量の正しい役割は、食料から独立に求めた持続可能人口との監査である。

```text
edibleGrainNeedKg = people × stapleNeedKgPerPersonYear
grossGrainNeedKg  = edibleGrainNeedKg / edibleShareAfterSeedLossStock
requiredSownHa    = grossGrainNeedKg / netYieldKgPerSownHa
requiredFieldHa   = requiredSownHa / annualSownShare

maxSupportedPeople = maxCroplandHa
                   × annualSownShare
                   × netYieldKgPerSownHa
                   × edibleShareAfterSeedLossStock
                   / stapleNeedKgPerPersonYear

ruralFoodCapacity = maxSupportedPeople / populationRate

agriculturalConsistencyRatio = capacityPeople / maxSupportedPeople
```

- `requiredFieldHa` は当年の人口・在庫目標・輸出契約を満たすための実作付面積である。農業労働力はこの面積から算出する。
- `maxCroplandHa` は物理面積そのものではなく、地形・バイオーム・森林・湿地を考慮した開墾可能上限である。
- `annualSownShare` は休閑・輪作を含む、耕地のうち一年に播種される比率である。v1 では作物別輪作を持たず、世界設定の一律値にする。
- `netYieldKgPerSownHa` は種子、収穫・保管損失、共同体の予備を差し引いた市場・消費可能な収量であり、気候、水利、技術で補正する。

初期の実装値は `stapleNeedKgPerPersonYear = 200 kg`、`edibleShareAfterSeedLossStock = 0.65`、`annualSownShare = 0.67` を基準とし、`netYieldKgPerSownHa` は世界全体の校正値に気候補正を掛ける。FAO の近年の直接食用穀物は世界平均で一人年約149 kgであり、穀物比重が高い前近代的な仮想世界では200 kgを保守的な出発値にできる。[FAO Cereal Supply and Demand Brief](https://openknowledge.fao.org/3/cd1158en/CD1158EN_cereals.pdf) ただしこれは史実を一点再現する定数ではない。種子・備蓄・休閑・技術による差が大きいため、初期時代と地域設定を決めた後に校正する。

監査は二段階で行う。

1. `currentRuralPeople` に必要な `requiredFieldHa` が `maxCroplandHa` を超えないことを確認する。超えるセルは、初期地図の段階で食料不足である。
2. `capacityPeople` が `maxSupportedPeople` を超えないことを確認する。超過は「将来、開墾・灌漑・輸入・非穀物生産なしには到達できない居住上限」として警告する。

この監査で不整合を検出しても、v1 で直ちに `cells.capacity` を書き換えない。港・漁業・交易・政治的安全性も既存 capacity に混ざっているためである。代わりに `ruralFoodCapacity` を別に保持し、人口シミュレーションの実効上限を将来次で求める。

```text
effectiveRuralCapacity = min(cells.capacity, ruralFoodCapacity + verifiedExternalFoodSupport)
```

`verifiedExternalFoodSupport`は、そのセルが属するMarketの安定した輸入余剰のうち、当該セルへ帰属させられる分を指す想定であり、Burg側の`effectiveCapacity`が使う`stableImportedFood`（[megacity-food-import-economy.md](../plan/megacity-food-import-economy.md) §3.5）と同種の「一時的な豊作・単発輸送では動かない移動平均」であるべきだが、Market共通在庫から特定の農村セル一つへ配分する具体的な算出規則はv1でまだ設計していない。この式自体もv1の実装対象ではなく、将来`effectiveRuralCapacity`を実際に人口シミュレーションへ接続する段階で確定する。それまでは`ruralFoodCapacity`（外部支援なしの自給上限）と`cells.capacity`の監査比較だけをv1の観測範囲とする。

これにより、食料は capacity のコピーにならず、食料不足だけが農村の持続可能人口を制限する。

### 3.3 開墾可能面積と初期作付面積

```text
maxCroplandHa = cellAreaHa
              × terrainCroplandShare
              × biomeCroplandCeiling

initialCultivatedHa = min(
  maxCroplandHa,
  requiredFieldHa(localFoodPeople) × 1.10
)
```

`terrainCroplandShare` は水域、急斜面、極端な高地を除く割合である。`biomeCroplandCeiling` は森林・湿地・乾燥地により異なる開墾上限である。森林被覆は初期開墾の費用・速度を上げるが、発展可能性を永久にゼロにはしない。

- 地図生成時と年次更新時には、`cells.pop × populationRate` から必要な穀物量、必要作付面積を順に計算し、`initialCultivatedHa` を置けるだけの開放地になるまで `forestStock` を減らす。これにより、森林が完全に残る (`clearance = 0%`) セルが最初から Grain を生産する状態を作らない。
- `initialCultivatedHa / maxCroplandHa` は農地利用率であり、森林開墾率そのものではない。森林開墾率は `1 - forestStock / forestCover` として導出する。森林以外の自然開放地があるため、両者は一般には一致しない。
- 生成時に取り除かれた木材は地図開始前の歴史的な開墾として扱い、市場の Wood 在庫には追加しない。開始後の伐採は通常どおり Wood 供給と同じ `forestStock` を減らす。
- 通常モードでは `localFoodPeople = currentRuralPeople + currentUrbanPeople` とする。Burg の都市人口も同じセルの Grain 畑で支えるため、都市を持つ通常セルには Grain 生産が存在する。
- `ruralUrbanMigration = "megacity"` のときだけ `localFoodPeople = currentRuralPeople` とし、都市人口をセル内の作付面積から外す。このモードだけが、周辺 Market や市場間輸入で支えられる、Grain 色のない大都市を許す。
- 低い比率は、将来の人口増加や輸出に対する開墾余地を意味する。
- 高い比率は、余剰人口の都市移住、土地劣化、食料不足への脆弱性を意味する。
- `requiredFieldHa > maxCroplandHa` は、開墾率では解決できない赤信号であり、収量改善・輸入・人口減少のいずれかが必要である。

この値は `foodPotential` と混同しない。`foodPotential` は `maxCroplandHa` を十分な労働力で耕した場合の生産上限、`cultivatedArea` は当年の市場需要に応じて実際に使う面積である。

### 3.3.1 食料の表示と診断

- Goods レイヤーの Grain は `biomeOutputByTag` の候補表示ではなく、`cultivatedArea` と `foodPotential` から得るセル自身の実生産を表示する。通常モードでは、人口がある土地セルは自給用の作付を持つため、Grain の着色範囲は Population レイヤーの居住セルと一致する。都市人口も同じセルの農地需要に含むため、Grain 色がない都市セルは発生しない。Megacity モードでは都市人口だけを持つセルの畑からの Grain 出力を省略し、Market・輸入に依存する都市を許す。
- Burg Editor の `Cell Grain` はそのセルの年次出力、`Market Grain` はその burg が所属する Market 圏全体の当四半期出力を示す。前者が 0 でも後者が正なら、都市は同じ Market 圏内の別セルの農村に支えられている。
- `Food imports` は当四半期に**他 Market から物理的に到着した量**と、Market 全体の当四半期需要に対する比率である。都市の有効収容力から逆算する値ではない。
- `Food reserve gap` は目標備蓄を満たすために要求したが到着しなかった量であり、即時の飢餓人数ではない。`Market food stock` は年齢別在庫の合計と、現在需要で何か月支えられるかを示す。

### 3.4 森林と耕作可能面積

森林は土地を永続的に不毛にするのではなく、立木が占めるあいだは田畑に使えない面積として扱う。

```text
openLandHa = cellAreaHa × (1 - standingForestCover)
cultivableAreaHa = min(maxCroplandHa, openLandHa)
```

- 開始時の畑は固定比率で残さない。住民が必要とする穀物から必要な作付面積を求め、そのぶんだけ `forestStock` を開く。河畔・集落周辺など元から開いた土地があれば、先にその面積を使う。
- `forestCover` は気候・地域が持つ**潜在森林容量**、`simulation.cells.forestStock` は現に立っている木材量である。開墾面積は `forestCover - forestStock`、開墾率はその潜在容量に対する比率として導出する。`clearedLand` のような別の近似列は持たない。
- Wood の採取と造船用伐採は同じ `forestStock` を減らす。耕作地として利用されていない伐採跡だけが森林回復の対象となるため、静的な `forestCover` だけで森林地帯の発展可能性を永久に封じない一方、現役の畑が自動的に森林へ戻ることもない。
- 湿地・氾濫林など排水条件を表せるバイオームは、v1 では低い `biomeCroplandCeiling` で表す。土壌排水や水田作は別の農業技術モデルができるまで導入しない。

### 3.5 気温と降水

FAO ECOCROP は、作物生産性に温度と年間降水量の最小・最大値の双方が必要であるとしている。[ECOCROP](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en) したがって、降水を無制限に加点する設計にはしない。過湿・湛水は収量を下げ、メタ分析では小麦も減収を示す。[水ストレス・湛水のメタ分析](https://pmc.ncbi.nlm.nih.gov/articles/PMC7933672/)

ただし現行マップは土壌排水・洪水頻度を十分に保持していない。そのため v1 の降水は「少雨を減点し、十分な雨量で飽和する」までに留め、過湿の直接減点は導入しない。湿地・森林の面積補正と二重計上しないためである。

| 入力 | v1 の係数 | 根拠と意図 |
| --- | --- | --- |
| 気温 `<= -5` | 0 | 年平均値しかないため、極寒地を栽培不能とする |
| `-5 ～ 2` | 0.15 ～ 0.45 | 冷涼な麦類を含む限定的な生産 |
| `2 ～ 7` | 0.45 ～ 1.0 | 低温マップでも生産地を残す立上り |
| `7 ～ 18` | 1.0 | 穀物の基準適温帯 |
| `18 ～ 28` | 1.0 ～ 0.65 | 高温による穀物適性の逓減 |
| `> 28` | 0.3 | 高温ストレスを簡略表現 |
| 降水 `< 8` | 0、河川沿いは 0.25 | 雨水農業は困難だが、水利があれば最低限の生産を許す。隣セルの川、または prec ≥ 8 の雨水井戸は frontier の開拓・維持でも同じ水利として扱う（`cellWaterAccess.ts`） |
| `8 ～ 20` | 0.40 ～ 0.75 | 乾燥域からの立上り |
| `20 ～ 60` | 0.75 ～ 1.0 | 十分な水分へ飽和 |
| `>= 60` | 1.0 | v1 では追加の増産を与えない |

降水の数値は FMG 内の相対値であり、mm への換算値ではない。初期値は地図全体が飢饉にならないよう、既存人口分布に対して全体校正する。作物別・季節別の閾値は、季節気候と土壌データを導入してから置き換える。

## 4. 面積ベースの農業労働力

### 4.1 決定

農業労働者を人口比で直接決めない。**その時点の `cultivatedArea` から必要労働力を求める。** 人口比は歴史的な校正目標としてのみ使い、計算式の入力にはしない。

```text
farmLaborRequired = cultivatedArea × laborDaysPerArea / workableDaysPerAdult
foodProduced = cultivatedArea × yieldPerArea × foodProductivityModifier
```

- `laborDaysPerArea`: 播種、除草、収穫、脱穀、維持に必要な年間労働日。技術・作物・水利による補正対象である。
- `workableDaysPerAdult`: 当該時代設定で農業へ投入できる成人一人当たりの年間労働日。
- `farmLaborAllocated`: 将来の明示的な雇用配分で使う予約値。現行では `cultivatedArea` を「維持済み」として記録するため、生産量を二重に減らす係数にはしない。
- `cultivatedArea`: 地図の最大面積ではなく、当期に作付・維持する面積。市場需要、在庫目標、利用可能な労働者、開墾状態から決める。

したがって、人口が増えても耕作面積が増えなければ必要な農業人数は増えない。逆に、輸出契約・都市需要・開墾で作付面積を増やせば、人口を農村に残す必要が生じる。

前近代社会では農業が総労働力の大部分を占めることが多く、70〜80%級という史学上の概観は初期値の妥当性確認に使える。[Cambridge の農業史概説](https://www.cambridge.org/core/books/abs/atlas-of-material-life/agriculture/3A0D6809B2D2C65CBAFE9C682734F160) ただし、これは面積当たり必要人数の普遍的な定数ではない。作物、輪作、家畜利用、収穫期の共同労働、対象時代で大きく変わるため、FMG 固有の地図単位へ直接転記しない。

### 4.2 作付面積の決定と移住上限

作付面積は播種前に年1回決める。地域消費と確定輸出は最低生産量とするが、備蓄目標は作付の上限にしない。情報が乏しく自然条件も厳しい世界観では、耕地と労働力が許す限り多く作付けし、実際の余剰は在庫・輸出・上限超過処理へ渡す。

```text
minimumFood = localConsumption + committedExport
minimumCultivatedArea = minimumFood / expectedYieldPerArea
minimumFarmAdults = minimumCultivatedArea
                  × laborDaysPerArea
                  × 1.15
                  / workableDaysPerAdult
ruralReleasePressure = max(0, ruralAdultWorkers - minimumFarmAdults)
laborAffordableCultivatedArea = min(
  cultivableArea,
  (ruralAdultWorkers - sustainableAdultOutflow - ruralNonFarmWorkers)
    × workableDaysPerAdult
    / (laborDaysPerArea × 1.15)
)
cultivatedAreaTarget = laborAffordableCultivatedArea
```

- `minimumCultivatedArea`を満たせない場合は、食料不足・移住停止・輸入需要へつながる。
- `ruralReleasePressure`は最大生産ではなく最低食料計画を基準にした成人余力である。ここで余力と判定された成人到達者が通常の外部就業・開拓を目指せる。残った成人が、次に可能な限り作付を広げて余剰を作る。
- `ruralReleasePressure`がある成人到達者は、都市の受入枠が直ちになくても村へ残さず、外部の職を探す`mobileAdultCohort`へ移す。都市に定着できなければ翌年の開拓・野盗・死亡／域外流出へ進む。
- `cultivatedAreaTarget`は最低面積で止まらず、労働力で耕せる範囲まで拡大する。余剰はFood Ledgerの在庫、輸出、`storageOverflow`へ流れる。
- 年次作付では、先に`sustainableAdultOutflow`と農村非農業者を労働力から予約する。残った常住成人で耕せる面積を`laborAffordableCultivatedArea`とする。したがって、成人到達分として許可された通常の都市流出は「可能な限り多く作る」方針によって取り消されない。
- **2026-08-15 実装**: `calculateAgriculturalLandProfile()` は `requiredArea × 1.1` で打ち切らず、残った耕せる成人の `laborAffordableArea` まで作付する。独立成長では予約は `children / CHILD_COHORT_YEARS` のみ。Megacity ではさらに成人の 32%（`MEGACITY_LABOR_EXPORT_SHARE`、30〜40%校正の中央）を都市送りとして畑に入れず、残った農民だけで開墾可能な限り耕す。これにより後背地は「人」と「余剰穀物」を同時に都市へ出せる。収穫月の不足は隣村の相互扶助と子供・高齢者の世帯労働で埋める。雇用台帳の `farmLaborRequired` は収穫ピークではなく年次通年労働から求める。過湿でカタログ作物が全滅していたのは選択バグであり、湿ったセルは雨に強い作物（エンドウなど）を選ぶ。寒冷・高地で畑労働がほとんどないセルの住民は、当初から採集・牧畜・漁撈の自給容量で置かれている。彼らを「失業した農民」にせず、その生業を雇用として数え、Megacity の 32% 労働輸出予約も掛けない。人口の間引きは `subsistenceCapacity`（自給できない人を置かない）が担い、雇用台帳で二重に消さない。
- `1.15`を分母へ入れるため、最大生産を選んでも農業労働の15%安全余力を残す。
- v1では`ruralNonFarmWorkers = 0`とし、鉱山・伐採・運送などの農村非農業者を推定で控除しない。実際の資源事業や労働市場を導入してから、その事業が必要とする明示的な人数だけを控除する。
- Marketの6か月目標在庫は輸入回復の目標であり、農民へ「そこまでしか作らない」と命じる生産上限ではない。
- v1ではセル間・Market内で農業労働力を融通せず、各セルが残った常住成人で耕せる面積まで作付する。将来の季節雇用では、播種・収穫期だけ都市から農村へ短期労働者を呼べるようにする。
- 15% の安全余力は、病気・季節的な欠勤・収穫期の変動を個別にシミュレートしない保守幅である。月次の共通労働配分器が主食・狩猟・漁撈・果樹・牧畜を合算し、配分後のピークから `farmLaborRequired`、`migratableAdults`、`ruralReleasePressure` を一度だけ導出する。未充足の希望作業は `seasonalLaborShortage[cellId * 12 + month]` に残し、後続の季節雇用市場だけが充足できる。詳細は [季節別作物暦・農繁期・混合農業労働](../plan/seasonal-crop-calendars.md) を参照。

### 4.3 初期時代の絶対校正

v1の基準時代は、13世紀ごろの北西ヨーロッパに見られる、雨水依存の穀物・混合農業とする。近代的肥料や機械化は前提にしない。初期パラメータは次の通りとする。

| パラメータ | 初期値 | 役割 |
| --- | ---: | --- |
| `BASE_NET_YIELD_KG_PER_SOWN_HECTARE` | 450 kg/ha | 気候補正前の低収量側の穀物基準収量 |
| `LABOUR_DAYS_PER_HECTARE` | 30 日/ha | 年間の作付・維持・収穫・脱穀・運搬を含むモデル上の労働投入 |
| `WORKABLE_DAYS_PER_ADULT` | 140 日/年 | 全労働日ではなく、成人が農作業へ割り当てられる日数 |
| `FARM_LABOUR_SAFETY_MARGIN` | 1.15 | 病気・季節欠勤・収穫期変動をまとめた15%の余力 |

史料を単一の普遍定数として扱わない。Clarkの1300年ごろの推計は、耕地1 acre当たり成人男性11〜14日、すなわち約27〜35日/haを示す。FMGの30日/haはこの史料範囲の中央〜やや上寄りにそのまま収まる値であり、家畜世話・運搬・脱穀など帳簿に現れにくい作業を上乗せする追加の仮定は置かない。成人の全労働日を140日と主張するものでもなく、農作業へ実際に配分可能な日数である。

**2026-07-30 再校正**: 当初は27〜35日/haへ帳簿外作業の上乗せとして45日/haを採用したが、これは`BASE_NET_YIELD_KG_PER_SOWN_HECTARE`(450 kg/ha)・気候補正済み収量・成人人口比(0.45)という他の確定済み定数と組み合わせると、既定フォールバック気候（気温12℃・降水45mm・河川なし、climateYield≈0.90）ですら必要農業労働力が成人の102%に達し、自給すら赤字になることが判明した。本計画は後背地の食料余剰と都市移住の両方を同じ農村成人プールから同時に賄う設計であるため、典型セルに輸出余剰・移住余剰双方の原資となる明確な余力を残す必要がある。史料範囲の上限（45日相当）ではなく中央〜やや上寄り（30日/ha）を採用することで、既定フォールバック気候で成人の約68%、良好な気候・河川ありのセルで約57%の従事率となり、輸出・移住双方に約32〜43%の余力を残せる。気候係数が0.615を下回る寒冷・乾燥の辺境セルは、この値でも自給困難のままであり、これは意図した挙動である。[Gregory Clark, *The Long March of History*](https://faculty.econ.ucdavis.edu/faculty/gclark/papers/echr2006.pdf)

収量は土地・作物・経営形態で大きく変わる。中世ノーフォークの62荘園を使った研究も、播種量、作付頻度、作物構成、地域差を同時に考慮する必要を示している。したがって450 kg/haは低収量側の共通出発点に過ぎず、国家生産性、セル局地係数、気候補正で差を表す。[Bruce M. S. Campbell, *Arable Productivity in Medieval England*](https://www.cambridge.org/core/journals/journal-of-economic-history/article/abs/arable-productivity-in-medieval-england-some-evidence-from-norfolk/75CD5C8160488863D54BA7EBED38EB89)

この組合せでは、既定フォールバック気候（climateYield≈0.90）のセルで成人の概ね65〜70%、気候・水利に恵まれたセルではそれ以下（55〜60%程度）が農業へ残ることを校正目標とする。単一の固定比率ではなく、気候条件で変動する幅として扱う。寒冷・乾燥な辺境セル（climateYield ≲ 0.615）は、この校正でも自給困難のままとなり、輸入依存または人口減少で調整されることを想定する。この比率は移住式への固定入力ではなく、面積と労働日から算出した結果の監査値である。

v1では収穫期の季節雇用や、一時的な都市から農村への出稼ぎを個別の人口移動として扱わない。通常の移住判定は常住成人の余剰だけで行い、季節的な不足・欠勤・共同作業は`FARM_LABOUR_SAFETY_MARGIN = 1.15`へ含める。季節雇用は将来の労働市場モデルで、賃金・移動費・農繁期を持つ別の仕組みとして導入する。

将来の季節雇用では、播種・収穫期に都市から農村へ短期労働者を呼び、作業後に都市へ戻すことを許す。これは常住人口の移住・農業労働力とは別の、一時的な労働契約として扱う。

### 4.4 地図全体の軽い収穫時期補正

Food Ledger は毎月決済し、主食の収穫をセルの作物混合と `seasonRegion × zone × crop × cohort` の月次重みから投入する。年一作・二期作・継続収穫の可否は作物 profile と気候ゾーンで決まり、単に赤道近傍だから均等収穫にはならない。通常市場供給も同じ作物暦を使い、家畜・魚・加工品は作物用の秋ピークを受けない。

### 5.1 農村世帯の私的食料在庫

農村で収穫された主食を、収穫と同時に全量 Market 在庫へ移してはならない。各セルは個々の世帯を詳細化しない集約値`ruralHouseholdFoodStock[cell]`を持ち、通常は住民一年分の`GROSS_FOOD_NEED`を私的な食料庫として保持する。これは Market の在庫でも、取引可能な Grain でもない。

```text
harvest = cultivatedArea × yieldPerArea × productivityModifier × seasonalWeight
householdTarget = ruralPeople × GROSS_FOOD_NEED × 1 year
householdRetained = min(harvest, max(0, householdTarget - householdStock))
marketWholesale = harvest - householdRetained
```

- 月次の農村消費はまずセルの`householdStock`から引き、尽きた不足分だけを所属 Market の Food Ledger から引く。したがって凶作時も Market 備蓄・輸入・飢饉判定は救済経路として残る。
- Market へ入る`marketWholesale`だけが農家への farmgate 決済と Market の Grain 在庫に入る。自家消費分を売買・決済してはならない。
- 新規生成および旧セーブ移行では、農村世帯在庫を一年分で一度だけ初期化する。以後は保存される可変状態であり、`foodPotential`のような再生成キャッシュではない。
- Market の通常備蓄目標は都市・宿泊者の需要を基準とする。農村の通常消費は私的在庫で充足されるため、農村全員の一年分を Market に重複備蓄しない。

人口規模はこの在庫総量と耕作・多様化の余地に効かせる。豊凶の平均収量を人口だけで上げる倍率には使わない。小規模なセルでは作物多様性の不足などによる局地的な振れ幅を大きくできるが、広域の天候ショックそのものは人口で相殺しない。
- `DEFAULT_QUARTERLY_WEIGHTS`は、旧セーブや不完全な地理・気候設定の後方互換フォールバックとする。

これは市場別・作物別の収穫暦を導入する前の共通下地である。将来は同じインターフェースのまま、北部・赤道・南部の少数の季節地域と、生産地セルに生成時に割り当てる農業気候ゾーン・作物・技術・必要な作付コホートによる市場別重みへ置き換える。月次にセル別気候を再計算せず、`seasonRegion × zone × crop × cohort` のキャッシュを参照する。実装順、月次 Food Ledger への移行、二期作の制約、労働カレンダーは [季節別作物暦・農繁期・混合農業労働](../plan/seasonal-crop-calendars.md) に固定する。

初期校正では、既存の農村セルに対し「その時代の通常技術・通常作付で、既定フォールバック気候のセルは成人労働者の概ね 65〜70%、気候・水利に恵まれたセルはそれ以下が農業へ配分される」範囲に `laborDaysPerArea` を調整する。これは結果の検証条件であり、移住計算に固定比率を混入させない。

## 5. 都市への人口吸引

### 5.1 静的立地と動的雇用を分ける

単一の加算スコアでは、発見済みの鉱床や港適地が永遠に人口を吸い続ける。よって次を分離する。

| 状態 | 内容 | 用途 |
| --- | --- | --- |
| `settlementDevelopmentPotential` | 未枯渇鉱床、河川合流、高流量河川、港適地、道路結節、耕地 | 集落の発生・昇格候補となる立地優位 |
| `employmentDemand` | 稼働中の鉱山・伐採、首都行政、実際に接続された港、交易・市場 | 当年の移住先の受入れ余力 |

資源の存在は前者へ小さく加点する。後者には、埋蔵量ではなく稼働中事業の必要労働者を用いる。資源が枯渇・休止すれば雇用需要も消え、人口流出や都市の降格が起こり得る。

### 5.2 v1 の優先順

人口吸引は次の順で評価する。

1. 稼働中の資源事業と首都行政
2. それらへ結び付く輸送結節
3. 河川水運
4. 海路へ実際に接続した港
5. 道路・市場による陸上交易

河川と港は地形タグだけでは雇用を生まない。河川は一定以上の `fl`（流量）と到達可能な市場・資源・集落を持つ場合だけ「水運」として評価する。港も `harbor` だけでは弱く、`port` と有効な `searoute` がそろってから強い雇用・輸送結節になる。

辺境の小規模経済では、木材・鉱石・穀物を集散できる河川の価値を、単独の海港適地より高く置く。水運の運賃・積載率・接続路線が立地条件を左右するという考え方は、歴史的な河川輸送の研究とも整合する。[河川蒸気船輸送の費用研究](https://www.cambridge.org/core/journals/journal-of-economic-history/article/abs/economies-of-scale-in-western-river-steamboating/BDAA5DF8C1D9BED59776FDFD160F2AC3)

首都は安定した行政需要を生むが、食料と輸送の基盤を満たす場合にだけ強く加点する。首都化による成長が経済的基盤と補完関係にあるという研究結果とも矛盾しない。[The Political Geography of Cities](https://www.aeaweb.org/articles?id=10.1257%2Fapp.20230301)

### 5.3 v1 の正規化

係数そのものを特定時代の史実として扱わない。対象時代・地域が未指定のためである。v1 は次の相対制約をテスト可能な仕様とする。

- 同条件なら、稼働中資源事業のある集落は未開発鉱床だけの集落より大きな `employmentDemand` を持つ。
- 高流量・接続済み河川の結節は、海路未接続の `harbor` より高い吸引力を持つ。
- `port && searoute` は、同程度の道路結節を上回る吸引力を持つ。
- 首都補正は、食料不足または輸送孤立を打ち消さない。

### 5.4 暫定の年次都市受入枠

詳細な職業、賃金、技能、既存住民の失業は後続の雇用モデルまで扱わない。ただし、農村からの移住を実装する前に、都市が翌年に何人の新しい成人労働者を定着させられるかは必ず決める。

`annualUrbanLaborIntake` は既存都市の雇用総数ではなく、**当年の純新規受入枠**である。初年度の既存都市人口は雇用済みとみなし、不況によって遡及的に追放しない。

```text
baseIntake = burg.population × annualUrbanIntakeRate
annualUrbanLaborIntake = min(
  baseIntake × stateBusinessCycle × burgLocalVariation,
  effectiveCapacity - burg.population
)
```

- `annualUrbanIntakeRate` の初期値は年率 2% とする。初期バランス調整では 1〜3% の範囲で調整可能とする。
- `stateBusinessCycle` は State ごとに年一回、0.5〜1.5 の決定的乱数で引く。同じ地域の都市が同時に好況・不況になる。
- `burgLocalVariation` は Burg ごとに 0.85〜1.15 の決定的乱数で引く。地域景気だけでは同質になりすぎることを防ぐ。
- 食料に支えられる `effectiveCapacity` の残余を絶対上限とする。職があっても、食料や住居の余地がなければ定着できない。
- 住居側の天井は Economy の `ConstructionOperations.constrainEffectiveCapacity()` が `buildingStock`（住居飽和度）から年次・四半期で再適用する。住戸台帳と文化建材は [urban-housing-system.md](../plan/urban-housing-system.md)。

この暫定値は `simulation.extensions.economy.urbanLaborIntakes` に年次 ledger として保存する。資源・港・産業別の雇用枠は、後続の詳細雇用モデルでこの ledger の基礎率を置き換える。

### 5.5 移住失敗、開拓、野盗

農村の面積ベース余剰労働力は、まず出身 State 内で近隣の最大三都市へ順に職を探す。v1 の近隣判定は地図上の徒歩圏を直線距離で近似し、道路・地形・宿駅を持つ移動時間モデルは後続とする。

```text
rural excess adults
  → annualUrbanLaborIntake の残枠
  → 近隣都市を最大3回探索
  → 一年の漂泊（mobileAdultCohort）
  → 開拓申請 / 野盗集団 / 餓死・流出
```

- 初回に職を見つけられない人は `mobileAdultCohort` として一年だけ保持する。
- 翌年も未就職なら、35% を開拓申請、25% を野盗集団、40% を餓死・域外流出とする。この比率は物語上の初期値であり、後に食料在庫・治安・開拓適地で置き換える。
- 開拓申請者は直ちに人口から消さず、既存の Frontier Expansion が受け取るまで extension slice 内に保持する。
- 野盗は個人を描画せず `banditCohort` として集計する。出身 cell/state を保持し、将来の農村略奪では出身地自身を標的から外す。
- 野盗人数から得る `banditPressure` は既存の `TradeSecurity` へ接続し、当面は State 単位で Caravan の損失率を上げる。農村在庫略奪は Food Ledger 導入後に同じ pressure へ接続し、その時点で保持済みの出身 cell を使って出身地自身を標的から外す。

この段階では、農村の余剰を `cells.capacity` 超過から作らない。Phase 2 が作る `migratableAdults` だけが `mobileAdultCohort` の入力になる。

## 6. 実装への反映

- `foodPotential` の生成器は、現在の `habitability` 中心の暫定係数を、本書の森林・気温・飽和降水式へ置き換える。
- economy simulation に `cultivableArea`、`cultivatedArea`、`yieldPerArea`、`farmLaborRequired`、`farmLaborAllocated` を追加する。
- 農村からの移住は `migratableAdults` を上限とし、移住後に作付面積・必要労働力・在庫を再計算して確定する。
- 都市吸引の実装は、静的な `settlementDevelopmentPotential` と年次の `employmentDemand` を別配列・別集計として実装する。
- 詳細雇用モデルまでの暫定として、年次 `annualUrbanLaborIntake`、`mobileAdultCohort`、`banditCohort` を実装する。都市人口は受入枠を得た成人だけ増やす。
- Burg の group 昇格・降格は、人口だけでなく食料安定性と `employmentDemand` の持続を条件にする。`burg.lock` は常に優先する。

## 7. 未解決事項

- どの歴史的な地域・技術水準を初期時代の基準にするか。これを決めると `laborDaysPerArea` と `workableDaysPerAdult` の絶対校正が可能になる。
- 開墾をどの速度・費用・森林減少で進めるか。
- 河川の航行可能性を、流量閾値だけで始めるか、季節・勾配・船舶技術まで持つか。
- 作物を単一の `food` とする v1 の終了時点、および水田・牧畜・漁業を導入する順序。
- `effectiveRuralCapacity`（§3.2）の`verifiedExternalFoodSupport`を、Market共通在庫からどう特定の農村セルへ配分するか。Burg側`stableImportedFood`と同じ移動平均の考え方を流用できるかを含め、農村セルへの人口シミュレーション接続時に確定する。
