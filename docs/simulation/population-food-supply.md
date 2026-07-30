# 人口・食料供給シミュレーション

関連する大都市化・食料輸入の実装計画は [megacity-food-import-economy.md](../plan/megacity-food-import-economy.md) を参照する。本書は、その計画で使う環境・農業労働・人口吸引の根拠と、実装前に確定した設計判断を記録する。

## 1. 前提と目的

現行の食料生産はセルの `capacity` と農村人口に強く結び付いている。このため、農村の人口が容量へ近づくと輸出余剰が消え、農村が十分な食料を生みながら都市へ労働力を送り出す状態を表せない。

新モデルでは、次を明確に分離する。

| 概念 | 意味 | 人口との関係 |
| --- | --- | --- |
| `cells.capacity` | 居住する農村人口の基礎的な上限 | 食料生産の直接入力ではない |
| `cultivableArea` | 地形・森林・水域・気候から決まる耕作可能面積 | 静的な環境派生値 |
| `cultivatedArea` | 現在、実際に作付・維持されている面積 | 労働力・市場需要・開墾によって変化する |
| `yieldPerArea` | 作付面積当たりの食料収量 | 気候、水利、技術、災害で変化する |
| `foodPotential` | 全耕作可能面積を十分な労働力で耕したときの上限 | 人口からは導かない |
| `farmLaborRequired` | その時点の実作付面積を維持・収穫するための成人労働力 | 面積から導く |

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

`foodPotential` は「そのセルに住む人口が多いほど増える値」ではなく、十分に耕作・維持した場合の年間上限である。地図ロード、economy 有効化、地図再生成で `simulation.extensions.economy.foodPotential` に決定的に再生成する。

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

これにより、食料は capacity のコピーにならず、食料不足だけが農村の持続可能人口を制限する。

### 3.3 開墾可能面積と初期作付面積

```text
maxCroplandHa = cellAreaHa
              × terrainCroplandShare
              × biomeCroplandCeiling

initialCultivatedHa = min(
  maxCroplandHa,
  requiredFieldHa(currentRuralPeople + committedUrbanDemand) × 1.10
)
```

`terrainCroplandShare` は水域、急斜面、極端な高地を除く割合である。`biomeCroplandCeiling` は森林・湿地・乾燥地により異なる開墾上限である。森林被覆は初期開墾の費用・速度を上げるが、発展可能性を永久にゼロにはしない。

- `initialCultivatedHa / maxCroplandHa` が初期開墾率となる。
- 現在の Phase 2 基盤では `committedUrbanDemand = 0` とし、セル自身の農村人口と10%の予備だけを作付へ反映する。Market の確定輸出・都市需要をこの項へ渡すのは、在庫契約を導入する次の段階である。
- 低い比率は、将来の人口増加や輸出に対する開墾余地を意味する。
- 高い比率は、余剰人口の都市移住、土地劣化、食料不足への脆弱性を意味する。
- `requiredFieldHa > maxCroplandHa` は、開墾率では解決できない赤信号であり、収量改善・輸入・人口減少のいずれかが必要である。

この値は `foodPotential` と混同しない。`foodPotential` は `maxCroplandHa` を十分な労働力で耕した場合の生産上限、`cultivatedArea` は当年の市場需要に応じて実際に使う面積である。

### 3.4 森林と耕作可能面積

森林は土地を永続的に不毛にするのではなく、初期時点で田畑に使われていない面積として扱う。

```text
initialCroplandShare = clamp(0.10, 0.95, 1 - 0.85 × forestCover)
```

- 森林被覆 90% のセルでも、初期耕地を約 15% 残す。河畔・集落周辺の小規模耕地を表すためである。
- 将来追加する `clearedLand` は森林を開墾して `cultivableArea` を増やす動的状態とする。静的な `forestCover` だけで、森林地帯の発展可能性を永久に封じない。
- 湿地・氾濫林など排水条件を表せるバイオームは、v1 では低い `initialCroplandShare` で表す。土壌排水や水田作は別の農業技術モデルができるまで導入しない。

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
| 降水 `< 8` | 0、河川沿いは 0.25 | 雨水農業は困難だが、水利があれば最低限の生産を許す |
| `8 ～ 20` | 0.40 ～ 0.75 | 乾燥域からの立上り |
| `20 ～ 60` | 0.75 ～ 1.0 | 十分な水分へ飽和 |
| `>= 60` | 1.0 | v1 では追加の増産を与えない |

降水の数値は FMG 内の相対値であり、mm への換算値ではない。初期値は地図全体が飢饉にならないよう、既存人口分布に対して全体校正する。作物別・季節別の閾値は、季節気候と土壌データを導入してから置き換える。

## 4. 面積ベースの農業労働力

### 4.1 決定

農業労働者を人口比で直接決めない。**その時点の `cultivatedArea` から必要労働力を求める。** 人口比は歴史的な校正目標としてのみ使い、計算式の入力にはしない。

```text
farmLaborRequired = cultivatedArea × laborDaysPerArea / workableDaysPerAdult
laborCoverage = min(1, farmLaborAllocated / farmLaborRequired)
foodProduced = cultivatedArea × yieldPerArea × laborCoverage
```

- `laborDaysPerArea`: 播種、除草、収穫、脱穀、維持に必要な年間労働日。技術・作物・水利による補正対象である。
- `workableDaysPerAdult`: 当該時代設定で農業へ投入できる成人一人当たりの年間労働日。
- `farmLaborAllocated`: 農村の成人のうち、農業に実際に割り当てた人数。子供・高齢者は含めない。
- `cultivatedArea`: 地図の最大面積ではなく、当期に作付・維持する面積。市場需要、在庫目標、利用可能な労働者、開墾状態から決める。

したがって、人口が増えても耕作面積が増えなければ必要な農業人数は増えない。逆に、輸出契約・都市需要・開墾で作付面積を増やせば、人口を農村に残す必要が生じる。

前近代社会では農業が総労働力の大部分を占めることが多く、70〜80%級という史学上の概観は初期値の妥当性確認に使える。[Cambridge の農業史概説](https://www.cambridge.org/core/books/abs/atlas-of-material-life/agriculture/3A0D6809B2D2C65CBAFE9C682734F160) ただし、これは面積当たり必要人数の普遍的な定数ではない。作物、輪作、家畜利用、収穫期の共同労働、対象時代で大きく変わるため、FMG 固有の地図単位へ直接転記しない。

### 4.2 作付面積の決定と移住上限

各期の目標作付面積は、まず地域消費と目標在庫を満たし、次に市場が有効に買い取る輸出需要を満たす範囲で決める。

```text
targetFood = localConsumption + targetStockChange + committedExport
cultivatedAreaTarget = min(cultivableArea, targetFood / expectedYieldPerArea)
requiredRuralAdults = farmLaborRequired × 1.15
migratableAdults = max(0, ruralWorkingAdults - ruralNonFarmWorkers - requiredRuralAdults)
```

15% の安全余力は、病気・季節的な欠勤・収穫期の変動を個別にシミュレートしない v1 の保守幅である。四半期の食料台帳は維持するが、作物別の繁忙期・臨時雇用は v2 以降に分ける。

### 4.3 地図全体の軽い収穫時期補正

四半期台帳の供給配分には、セル別ではなく地図全体で共通の軽い季節補正を適用する。World Configurator が設定する地図中央緯度、赤道温度、北極・南極温度から季節温度振幅を求め、均等配分 `[0.25, 0.25, 0.25, 0.25]` と北半球基準の収穫配分 `[0.20, 0.23, 0.34, 0.23]` を最大10%だけ補間する。南半球中心の地図では配列を半年回転する。

- 赤道付近または赤道・極地の温度差がない設定では均等配分のままになる。
- 高緯度かつ温度勾配が大きいほど、第3四半期（南半球では第1四半期）へわずかに供給が寄る。
- 年間の`foodPotential`、需要、農業労働力は変えない。変わるのは年間生産を四半期へ割り振る時期だけである。
- `DEFAULT_QUARTERLY_WEIGHTS`は、旧セーブや不完全な地理・気候設定の後方互換フォールバックとする。

これは市場別・作物別の収穫暦を導入する前の共通下地である。将来は同じインターフェースのまま、生産地の緯度・作物・技術による市場別重みへ置き換える。

初期校正では、既存の農村セルに対し「その時代の通常技術・通常作付で成人労働者の概ね 70〜80% が農業へ配分される」範囲に `laborDaysPerArea` を調整する。これは結果の検証条件であり、移住計算に固定比率を混入させない。

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
