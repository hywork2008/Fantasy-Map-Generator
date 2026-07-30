# 大都市経済モデル: 独立した食料生産・輸入・都市化

## 0. 決定記録

**2026-07-30 改訂**: 本計画は、`cells.capacity`から食料生産を直接導く案を採用しない。代わりに、地形・気候・水利から決まる独立した`foodPotential`を導入する。また、食料生産に必要な農業人口を残して、余剰の農村人口がBurgへ移住できる仕組みと、都市の食料不足時に農村へ戻る人口流出を実装対象に含める。

**2026-07-30 追記**: `foodPotential`と`settlementDevelopmentPotential`はcoreの`pack.cells`には追加しない。economy拡張が所有する`simulation.extensions.economy`のセルID直結`Float32Array`として、地図の環境データから決定的に再生成する。これは拡張専用の派生キャッシュであり、coreのPackedGraphスキーマを増やさない。

**2026-07-30 実装状況**: Phase 2の基盤として、`cultivableArea`、`cultivatedArea`、`yieldPerArea`、`ruralFoodCapacity`、`farmLaborRequired`、`migratableAdults`をeconomy sliceへ追加した。面積・気候・森林から得る作物上限と、当年人口から得る作付面積・必要農業労働力を分離し、四半期食料台帳は新しい列が存在する地図で作付率・労働充足率を使う。農村から成人を実際に取り出して都市／漂泊キューへ渡す人口移動は、次の移住フェーズで接続する。

**実装状況**: Phase 1を開始済み。potential列の生成・再生成と、非ロックBurgの年次group再評価は実装した。食料台帳の置換、移住、昇格候補へのpotential接続は後続Phaseで行う。

この決定により、食料輸入は「未使用の農村人口上限を都市へ振り替える」仕組みではなく、後背地の生産力・農業労働力・在庫・輸送網が実際に都市人口を支える仕組みになる。

本書は設計・実装計画である。Phase 1の基盤実装は本改訂と同時に開始し、以降のPhaseはこの契約を満たす順序で進める。

## 1. 目的

> **会計境界の精査（2026-07-30）**: 現行Marketは物資在庫・価格の主体であり、独立した貨幣残高を持たない。農村からMarketへの供給にも対価支払いはない。Food LedgerへMarket残高を加える際は、既存の一般Goods会計を一度に置換せず、まず市場間の食料取引だけを局所的に決済する。詳細は[Economy Market Accounting Audit](../simulation/economy-market-accounting-audit.md)を参照。

**決定**: `marketTreasury`は、まずFood Ledgerの市場間食料取引だけを決済する独立会計とする。一般Goodsの`Markets.sell()`/`buy()`/`runGlobalTrade()`、農村生産者への対価、商人利益・賃金・地代の配分は後続タスクへ分離する。

地形・気候的に豊かでない土地でも、後背地・遠隔地からの食料調達、交易網、政治・産業の集積によって大都市が成長・維持・崩壊するシミュレーションを実現する。

- **江戸**: 関東だけでなく海運による廻米で100万人規模を維持した。
- **古代ローマ**: アノナを通じ、エジプト・北アフリカ・シチリアから穀物を輸入した。
- **近世ロンドン**: 沿岸海運と広域後背地が都市成長を支えた。

同時に、後背地では食料生産に必要な人口だけが農業に残り、非農業人口は都市へ移住できる。輸送路・生産力・在庫が失われた都市では、飢餓だけでなく農村への人口流出も起こる。

## 2. 現状と問題

### 2.1 `capacity`と現在の食料余剰の関係

セルの人口上限は`src/main.ts`の`rankCells()`で、バイオーム、河川、標高、海岸条件などから生成される。Burgの基礎人口上限は`src/generators/burgs-generator.ts`でセルのsuitability、首都、接続性から生成される。

現在の`FoodProductionModule.generateQuarterlyLedger()`は、セルの`capacity`と人口から食料を導く。

```ts
const saturation = rural / capacity;
const cultivation = 0.25 + 0.75 * saturation;
foodProduced = capacity * GROSS_FOOD_NEED * cultivation;
ruralNeed = rural * GROSS_FOOD_NEED;
```

年単位に簡略化し、農村人口を`R`、セル容量を`C`、食料必要係数を`G`とすると、都市消費を引く前の農村余剰は次になる。

```text
foodProduced - ruralNeed = 0.25 × G × (C - R)
```

そのため余剰は存在するが、`R < C`の未充足容量からしか生まれない。農村人口が`capacity`へ近づくほど余剰は消え、さらに輸出可能なのは残余の`RURAL_MARKETABLE_SHARE`だけである。農業技術、水利、耕地利用、貯蔵が伸びても、生産だけを増やす状態変数は存在しない。

これは「人口と食料生産がほぼ不可分」という問題であり、持続的な食料輸出地域や大都市の後背地を表現するには不十分である。

### 2.2 都市化経路の欠落

`simulateDemographics()`は農村セルが過密なとき、同一Stateの隣接セルへの移住を試みる。一方で、農村からBurgへ人口を送る経路はなく、Burgも過密時には飢餓で減少するだけである。

よって現状では、農村の余剰労働力が都市の職人・商人・港湾労働者になる過程も、輸入依存都市が補給停止後に人口流出する過程もない。

### 2.3 既存の暫定実装

現在の作業ツリーには、`burg.demographics.effectiveCapacity`、四半期の`FoodFlowEdge`、輸入容量ボーナスを追加する暫定実装がある。これはルート距離、腐敗、治安、供給残量を結ぶ検証用の足場としては有用である。

ただし暫定実装は既存の`capacity`由来の余剰を前提にするため、本計画の最終モデルでは置き換える。以降のフェーズで`foodPotential`・農業労働力・在庫を導入した後にのみ、`effectiveCapacity`への入力として使用する。

### 2.4 再利用する既存基盤

- `src/generators/landRouteGraph.ts` / `seaRouteGraph.ts`: Dijkstraベースの陸路・海路グラフ。陸路は季節閉鎖を考慮できる。
- `src/extensions/economy/generators/markets-generator.ts`: Burgをハブとする市場圏。
- `src/extensions/economy/generators/caravans.ts` / `caravanMovement.ts`: 実キャラバン、陸海移動、季節、役畜。
- `src/extensions/economy/generators/tradeSecurity.ts`: 治安・戦争による輸送リスク。
- `src/generators/demography-simulator.ts`: 年齢・性別バケットを持つ人口状態。

## 3. 目標モデル

### 3.1 状態の責務と単位

| 状態 | 所有者 | 単位 | 意味 |
| --- | --- | --- | --- |
| `cells.capacity` | core world | 人口ポイント | 土地に居住する農村人口の基礎K値。食料生産量そのものではない。 |
| `cultivableArea[cellId]` | economy simulation | 面積ポイント | 森林・水域・気候・地形から得る、通常技術で耕作へ転用できる上限面積。 |
| `cultivatedArea[cellId]` | economy simulation | 面積ポイント | 当期に実際に作付・維持する面積。需要、労働力、開墾状態で変化する。 |
| `yieldPerArea[cellId]` | economy simulation | 年間食料 / 面積ポイント | 気候、水利、地形、技術から決まる作付面積当たり収量。 |
| `foodPotential[cellId]` | economy simulation | 年間食料単位 | 全`cultivableArea`を十分な農業労働力で耕した場合の上限。人口からは導かない。 |
| `ruralFoodCapacity[cellId]` | economy simulation | 人口ポイント | `foodPotential`から逆算した、外部食料なしで持続できる農村人口上限。既存`cells.capacity`との整合性監査に使う。 |
| `foodProductivityModifier[cellId]` | economy simulation | 倍率 | 水利、技術、戦禍、洪水、干ばつ、開墾などの動的補正。 |
| `farmLaborRequired[cellId]` | economy simulation | 成人労働者ポイント | 当期の`cultivatedArea`を維持・収穫するために必要な農業労働力。人口比からは導かない。 |
| `sustainableAdultOutflow[cellId]` | economy simulation | 成人労働者ポイント / 年 | 当年に子どもから成人へ到達する人数を原資に、農業・再生産予備を差し引いた、平時に農村を縮小させず都市へ出せる成人単独移住の上限。 |
| `settlementDevelopmentPotential[cellId]` | economy simulation | 無次元スコア | 港、河川、道路・海路結節、資源、政治中心性から得る都市化の立地優位。 |
| Market food ledger / stock | economy simulation | 食料単位 | 生産、消費、在庫、輸出余力、輸入、輸送損失を記録する。 |
| `burg.demographics.effectiveCapacity` | core world | 人口ポイント | 基礎Burg容量と、安定して到着する食料に支えられる追加容量の合計。 |

`foodPotential`と`settlementDevelopmentPotential`はどちらも地図環境から導出するが、economyだけが消費するため`simulation.extensions.economy`に置く。セルIDで直接引くTypedArrayなので、`pack.cells`の列と同じ計算量で全セル走査できる。マップのロード・economy有効化・地図再生成で決定的に再生成し、セーブデータの正規値としては扱わない。市場在庫、輸送中食料、技術・災害補正、四半期集計も同じextension sliceに置く。

### 3.2 `foodPotential`の生成

`foodPotential`は`capacity`のコピーや単純な倍率にしない。両者は地形条件から相関してよいが、別の生成式・正規化・テスト対象を持つ。

初期式は以下の要因を使う。

```text
cultivableArea = usableLandArea × initialCroplandShare
foodPotential = cultivableArea × yieldPerArea

yieldPerArea = baseGrainYield
             × grainTemperatureFactor
             × precipitationFactor
             × waterAccessFactor
             × terrainFactor
             × baseAgriculturalTechnology
```

- `usableLandArea`: セル面積から水域・極端な高地・不毛地を除いた土地面積。
- `initialCroplandShare`: `forestCover`、湿地・氾濫林などから決める初期の耕地比率。開墾で変化する余地を残し、森林だけで将来の発展を永久に否定しない。
- `grainTemperatureFactor` / `precipitationFactor`: 年平均温度と降水から得る穀物生産適性。降水は少雨で減衰し、十分な値で飽和する。
- `waterAccessFactor`: 河川流量、湖、沿岸低地などによる**自然の**水利・沖積地の補正。地形から一度だけ決まる静的値であり、`foodPotential`に焼き込む。人為的な灌漑インフラの状態（`cellAgriculturalModifier`）や国家の灌漑政策水準（`stateAgriculturalProductivity`）とは別の層であり、同じ水利を二重計上しない（詳細は[population-food-supply.md](../simulation/population-food-supply.md) §3.1）。
- `terrainFactor`: 高度・急峻さ・土壌悪化の減衰。
- `baseAgriculturalTechnology`: 時代・世界設定による全体係数。後の技術システムの接続点。

`cells.area × distanceScale²` を物理面積へ換算し、`cells.capacity × populationRate` と食料から独立に比較する。現行の`cells.capacity`は、すでに suitability・面積・河川・海岸・危険度を含む居住適性由来の値であるため、`foodPotential`を capacity から復元してはならない。詳細な面積・収量・開墾率の監査式は [population-food-supply.md](../simulation/population-food-supply.md) に定義する。

生成後は、既存ワールドが初回のeconomy有効化で直ちに飢饉にならないよう、現行人口を満たす最低値へ正規化する。ロード済みのextension sliceに配列があっても、地図環境が変わった可能性を避けるため、同じ決定的生成器で再構築する。`capacity`だけから直接復元するのは移行用の最後のフォールバックに限定する。

### 3.3 生産と農業労働力

食料生産は全農村人口ではなく、当期の実作付面積を耕す成人の農業労働力に依存する。農業労働者を人口比で直接固定しない。

```text
farmLaborRequired = cultivatedArea × laborDaysPerArea / workableDaysPerAdult
laborCoverage = min(1, farmLaborAllocated / farmLaborRequired)
foodProduced = cultivatedArea × yieldPerArea × foodProductivityModifier × laborCoverage
```

- `farmLaborAllocated`はセルの男女成人バケットから農業へ割り当てた人数であり、子ども・高齢者を含めない。
- `cultivatedArea`は地域消費・目標在庫・確定輸出需要から求め、`cultivableArea`を超えない。
- `farmLaborRequired`未満では生産が比例して低下する。農業に不要な成人は、農村の非農業需要と安全余力を除いて都市移住の候補になる。
- 実際に都市へ出せる成人は、農業余剰`migratableAdults`だけで決めず、年次の`sustainableAdultOutflow`も満たす必要がある。災害がない場合に成人在庫を一度に都市へ移して農村を空洞化させないためである。
- 初期校正では結果として成人労働力の70〜80%級が農業へ配分される範囲を目標にするが、この比率を移住計算の固定入力にはしない。
- 初期v1では規模の経済・作物別季節性を持ち込まず、一律の`"food"`タグを維持する。ただし、World Configuratorの地図中央緯度と赤道・極地温度から導く地図共通の軽い四半期収穫補正は適用する。作物別の腐敗・収穫暦は後続課題とする。

この分離により、農村人口が`cells.capacity`未満でも十分な農業労働力に達していれば、安定した余剰が生まれる。また、技術・水利・戦争が`foodProductivityModifier`を変えれば、人口を変えずに生産力だけが変化する。

### 3.4 在庫、消費、輸送

**決定**: v1の食料在庫はMarket単位の共通在庫`foodStock`として所有する。市場圏の農村生産、Burgの消費、輸出入、腐敗・略奪損失はすべてこの在庫を増減させる。これにより、同一市場圏に属する農村と都市の食料を二重計上せず、輸入到着・備蓄・不足を一つの保存則で解決できる。在庫上限は当該Marketの年間食料需要の**9か月分**（`annualDemand × 0.75`）とする。個別農家在庫を分離しないv1でも、秋の収穫から翌夏までを同じ集約在庫で支えるためである。地図生成時および既存セーブでeconomyを初めて有効化する時の初期在庫は、年間需要の**6か月分**（`annualDemand × 0.5`）とする。1月1日開始後の最初の二四半期に得る生産で補充できる余地を残しつつ、初期飢饉を避ける。

Burgごとの倉庫、農村世帯の自家備蓄、輸送中の個別貨物はv1では分離しない。これらを導入する場合は`Market.foodStock`を初期の集約値として移行し、所有者別の在庫・容量・腐敗率へ分割する後続タスクとする。

**決定**: Market間輸送はv1から実移動日数を持つ。出発時に供給Marketの`foodStock`から積載量を控除して`FoodShipment`を作成し、到着まで輸送中食料として保持する。四半期更新では、移動日数90日以下の貨物は出発四半期末、91〜180日の貨物は次四半期末というように、`arrivalQuarter = dispatchQuarter + ceil(travelDays / 90) - 1`で到着期を決める。到着貨物はその四半期の消費を遡って満たさず、次の四半期以降の利用可能在庫となる。腐敗・治安損失は出発時の経路条件から確定して`FoodShipment`に記録し、到着量だけを到着Marketの在庫へ加える。

**決定**: 輸出元Marketは、次の一四半期を餓死なく消費できる最低在庫`exportReserve = annualDemand × 0.25`だけを残し、それを超える`foodStock`を輸出候補にできる。赤道直下では均等な四半期供給と対応する3か月分の近似である。緯度・気温から得る四半期重みは需要ではなく予定生産量を変えるため、収穫期には余剰が輸出へ回り、農閑期や不作には最低在庫だけでは直ちに不足し得る。これは中世相当の脆弱な食料経済を意図する。将来、Character拡張の用心深い商人などがMarketを支配する場合は、この最低量へ性格・予見・政治状況に基づく追加備蓄を加える。

**決定**: Food Ledgerで当期消費を満たした後、輸出留保3か月分を超える主食は一般GoodsのGrain在庫として取引可能にする。Grainの市場価格をFood Ledgerの輸入入札・決済単価に用いる。これにより、主食余剰は他の交易品と同じ市場在庫・価格表示へ現れる。Food Ledgerの年齢在庫と一般Goods在庫を二重計上しない正本・同期方法は次問で確定する。

**決定**: Food Ledgerの`foodStockAge0`・`foodStockAge1`・`foodStockAge2`を主食物量の唯一の正本とする。一般GoodsのGrain `stock`は、輸出留保を超えて取引可能なFood Ledger余剰を映す同期ビューであり、別の物量在庫ではない。一般Goods上のGrain売買・隊商積載は、Food Ledger正本を`Age2 → Age1 → Age0`のFIFO順で同時に控除する。

**決定**: `Good.tags`へ`stapleFood`を追加し、v1ではGrainだけに付与する。Food Ledgerが有効な間、`stapleFood` Goodsを既存の月次`Markets.collectRuralProduction()`、Burg需要充足、`Markets.runGlobalTrade()`から除外する。主食の生産、人口消費、Market間輸送はFood Ledgerだけが処理し、一般Goods側には取引可能余剰と価格だけを同期する。既存の`food`タグに含まれるWine、Beer、Honey、Fish、Cattleなど非主食Goodsは従来の一般Goods経路に残す。これにより旧来のGoods経路とFood Ledgerが同じ主食を二重に生産・消費・輸送しない。

**決定**: v1では`stapleFood`以外のFish、Cattle、Olives、WineなどのGoodsをFood Ledgerの人口需要・飢餓判定へ換算しない。これらは一般Goodsとしての嗜好品・副次的商品・生産投入物に留める。肉、魚、油脂などを主食不足の代替カロリーへ換算する栄養モデルは後続タスクとする。

**決定**: Cattleはv1ではFood Ledger外の一般Goodsとして維持する。現行のCattleは保存食・チーズ・革の原料であり、農耕・輸送の労働力には接続されていない。後続で役牛と食肉・畜産物を分け、役牛を耕作可能面積・農作業日数・陸上輸送力へ接続する。

**決定**: Food Ledgerの生産・在庫・市場間輸送は四半期単位で処理する一方、Grain価格は商人から消費者への小売価格として毎月更新する。価格はFood Ledgerの直近確定在庫と、次の主収穫期までの予定生産量・需要を見込む。収穫直前で通常の収穫が見込める場合は、現在庫が少なくても価格を急騰させない。反対に、次の収穫までの供給見込みを含めても需要・必要備蓄を満たせない場合に価格を上げる。通常の需給・収穫見込みによる価格帯は平時基準の0.8〜2.0倍に制限する。2〜4倍は戦時経済、封鎖、戦争由来の治安崩壊などの危機だけが使える領域とし、戦争・治安補正を月次価格へ適用する。年平均の前近代飢饉価格が2倍超となる例は多くない一方、1315年イングランドの小麦は平時の4倍、1648年ナポリは約3〜3.5倍、1770年ベンガルの米は約3.8倍に達した。これらは上限の歴史的参照であり、v1では戦争由来の危機に限って4倍までを使う。価格だけで飢餓を判定せず、Food Ledgerの実在庫・未充足需要・死亡判定を並行して用いる。

**決定**: 通常時の需給価格倍率は`coverageRatio = 次の主収穫までの予定供給量 / 同期間の予定需要量`から`clamp(1 / coverageRatio, 0.8, 2.0)`として求める。完全に均等な赤道型マップでは、主収穫の代わりに当期・次期のローリング供給予測を用いる。これにより、収穫前で現物在庫が少なくても、次の通常収穫で需要を満たせる見込みなら価格は過度に上がらない。

**決定**: `coverageRatio`の予定供給量には、価格計算時点の食用在庫、次の主収穫までに確定している地域生産、すでに積み出され到着予定が確定したFoodShipmentだけを数える。まだ入札・積出をしていない輸入要求は含めない。価格が輸入入札額を決めるため、未確定輸入を見込み供給へ入れて循環参照にしない。

**決定**: Grainの平時基準価格は既存の`Goods.Grain.value = 1`をそのまま用い、全Marketで共通の基準単価とする。地域固有の基準単価を別途生成せず、地域差は月次の需給倍率、危機係数および市場間輸送費で表す。

**決定**: 戦時経済・封鎖・戦争由来の治安崩壊がある時だけ、通常の需給価格倍率へ危機係数`1.0〜2.0`を掛ける。最終倍率は`min(通常需給倍率 × 危機係数, 4.0)`とし、これを最終都市小売価格へ適用する。戦争由来でない収穫不良・通常の在庫不足だけでは2倍を超えない。

**決定**: 危機係数は新たな乱数イベントではなく既存の状態から決定的に求める。`warIntensity`（既存の`0〜2.5`）を`1.0〜2.0`へ正規化した戦争係数、封鎖による輸入経路喪失率を`1.0〜2.0`へ換算した封鎖係数、戦争に起因する経路上の治安損失率を`1.0〜2.0`へ換算した治安係数の最大値を危機係数とする。複数要因を掛け合わせないため、同時発生しても意図せず4倍へ張り付かない。戦争と無関係な通常の野盗・静的な危険度は輸送損失には影響しても、この危機係数には直接加えない。

**決定**: Food LedgerはMarketごとに`marketBlockadeSeverity: 0〜1`を持つ。初期値は`0`とし、戦争・外交システムが将来この値を書き込む。`0`は封鎖なし、`1`は完全封鎖であり、封鎖係数は`1 + marketBlockadeSeverity`とする。季節閉鎖、平時の経路未接続、通常の供給不足は封鎖に含めず、通常の供給・輸送計算だけへ反映する。

**決定**: FoodShipmentは腐敗、通常の野盗・危険度、戦争起因の治安損失を別々に記録する。各輸入Marketの治安係数は、直近3か月に戦争中で積み出した量に対する戦争起因損失量の比を`0〜1`へ丸めた`1 + lossRatio`とする。戦争中でも実害がなければこの係数は`1.0`に留める。通常の野盗・静的危険度は到着量と在庫原価には影響するが、危機係数へは加えない。

**決定**: 通常時の都市Grain小売価格の下限は平時基準の`0.8`倍とする。農村仕入れ値は当月小売価格の80%という既定を維持するため、通常の価格下落ではMarketの基礎差額も維持される。平時基準の`0.5`倍まで下落するのは、将来の明示的な豊作イベント・豊作補正を導入した場合だけとし、現時点の通常在庫だけでは到達させない。

**決定**: 当月Grain価格は都市消費者への小売価格とする。都市で満たした主食需要は小売収入となり`marketTreasury.balance`へ加わる。農村人口はFood Ledgerの主食在庫を預かる生産者側であり、農村需要を小売収入として計上しない。農村生産がMarket在庫へ入る時の仕入れ単価・支払先は、農村現金残高を持たないv1ではMarket側の仕入原価としてだけ記録する。

**決定**: Food Ledgerの`Age0`・`Age1`・`Age2`は、それぞれ数量と平均仕入れ単価を持つ。生産・輸入は数量と取得原価を新しい`Age0`へ加重平均で混ぜ、FIFO消費・輸出・略奪・輸送は取り出した年齢バケットの原価を用いる。都市向け主食販売では、当月小売価格とFIFOで取り出した在庫原価との差額をMarketの粗利益として記録する。これにより、今季の生産量と農村の古い在庫消費を不正に相殺しない。

**決定**: 農村からMarketへ入るGrainの仕入れ値は、当月の都市Grain小売価格の80%とする。残る20%は、Market圏内の保管、資本費、通常損耗、取扱いおよび商人利益をまとめた基礎差額である。中世イングランドでは保管損失・倉庫費が年価値の約5%、1300年以前の資本費が約10〜11%と推計される。長距離穀物商では輸送費が価格差の大きな部分を占めるため、市場間輸送費・護衛費・略奪損失はこの20%へ混ぜず、FoodShipmentの別原価として後続で扱う。輸入時も、この20%の地域内マージンは残す。

**決定**: 農村Grainが`Age0`へ入る時、Marketは仕入れ値に相当する債務を負う。`marketTreasury.balance`から支払える分を即時に支払い、残額を`ruralGrainPayable`として記録する。食料物量は支払可否にかかわらず全量をFood Ledgerへ入れる。v1では個別農家の現金残高を作らず、未払金をMarket側の負債としてのみ保持する。

**決定**: 都市小売・食料輸出でMarket残高へ収入が入る時は、次の食料輸入の資金に回す前に`ruralGrainPayable`を優先して返済する。v1では農村生産者への未払いを抱えたまま輸入だけを続けることを防ぐ。将来は商人Characterの強欲さ、信用、統治者との癒着によって返済優先度を変更できる。

**決定**: 市場間FoodShipmentの輸送費は、輸入MarketがGrain代金へ上乗せして支払う。輸送費の全額は、当面、輸出Marketを隊商手配者とみなしてその輸送収入へ移す。これにより貨幣を消さず、距離・移動日数が長いほど輸入を不利にする。実際の運び手への賃金、飼料、船舶維持費の配分は後続タスクとする。

**決定**: FoodShipmentの初期版輸送費は、既存一般Goods交易と同じく距離比例の単位当たり費用`×`積出量に、移動日数比例の隊商維持費を加えて求める。ただし、品目単独の採算を出航条件にしない。一般Goods交易とFoodShipmentを統合する後続フェーズでは、経路単位の便に固定出航費・積載容量・残余容量を持たせる。高価値貨物が出航費の大半を負担する便には、Grainを限界費用で相乗りさせる。Grain単独便は全固定費を負担し、遠距離では河川・海運、飢饉価格、国家補助などの条件を要する。固定費は品目価格ではなく重量・嵩・容量占有を基準に配分する。

**決定**: FoodShipmentの距離比例運賃には輸送モード係数を掛ける。陸路を`1.0`、河川を`0.5`、海運を`0.125`とする。中世イングランドの穀物輸送に関する陸路・河川・海運およそ`8:4:1`の推計を正規化した初期近似である。河川・海運で低価格・大容量のGrainを長距離輸送でき、陸路は近距離または極端な不足に限られやすくする。

**決定**: 輸入Grainの到着時単価は、積出量に対して支払ったGrain代金と輸送費の合計を、実際の到着量で割って求める。この単価と到着量を新しい`Age0`へ加重平均で混ぜる。腐敗・略奪で到着量が減るほど、無事に到着したGrainの単価は上がる。全損時は在庫を増やさず、支払総額を`foodTransportLoss`として記録する。

参考資料:

- [Gregory Clark, *Markets and Economic Growth: The Grain Market of Medieval England*](https://www.researchgate.net/publication/228747088_Markets_and_economic_growth_The_grain_market_of_medieval_England): 中世ロンドンの倉庫費・損耗・資本費を整理する。
- [The Baltic Grain Trade in Amsterdam, EH.net review](https://eh.net/book_reviews/the-mother-of-all-trades-the-baltic-grain-trade-in-amsterdam-from-the-late-sixteenth-to-the-early-nineteenth-century/): 近世長距離穀物商の価格差における輸送費と純利益の関係を紹介する。
- [Claridge, *Transport in Medieval England*](https://static1.squarespace.com/static/5a4d52ff7131a5845cdd5162/t/5a503b02652dea46dba01c55/1515207426683/Claridge%2BTransport%2BMedieval%2BEngland.pdf): 穀物を中心とする陸路・河川・海運のトンマイル費をおよそ8:4:1と整理する。

**決定**: 四半期重みが完全に均等な赤道型マップでは、主収穫期を設定しない。Grain価格は当期と次期の予定生産・需要を使うローリング予測で決め、便宜的な第1四半期収穫による人工的な年次価格周期を作らない。

参考資料:

- [Famine of 1315 (Johannes de Trokelowe)](https://sourcebooks.web.fordham.edu/source/famin1315a.asp): 1313年の小麦1 quarter 5シリングに対し、1315年には20シリング。
- [Cormac Ó Gráda, *Famines Are Not What They Used to Be*](https://www.ucd.ie/t4cms/WP16_03.pdf): 前近代ヨーロッパの年平均価格は飢饉でも2倍超が稀としつつ、ナポリ・ベンガルなどの例外的急騰を整理する。
- [Campbell & Ó Gráda, *Harvest Shortfalls, Grain Prices, and Famines in Preindustrial England*](https://www.cambridge.org/core/journals/journal-of-economic-history/article/abs/harvest-shortfalls-grain-prices-and-famines-in-preindustrial-england/A6BD779A911DD17910EA44DF8ADF7613): 連続的な収穫不足と前近代の飢饉の関係を検証する。

**決定**: 食料の消費と通常輸出は先入先出（FIFO）とする。各期の生産・到着食料は一度Market在庫へ入り、9か月の在庫上限を超えた分だけを`storageOverflow`として輸出候補にできる。これは倉庫を通らない通常輸出ではなく、豊作時に保管しきれない追加供給の処分経路である。輸出先がなく残った`storageOverflow`は、v1では食用在庫へ戻さず量だけを記録する。将来は貧民への施しによる不満低下・治安回復、畜産飼料、堆肥としての農地還元へ接続する。

**決定**: `foodStock`はMarketごとに3か月単位の年齢バケット`foodStockAge0`（0〜3か月）、`foodStockAge1`（3〜6か月）、`foodStockAge2`（6〜9か月）で保持する。消費・通常輸出は`Age2 → Age1 → Age0`の順で取り崩し、四半期更新の終端で残量を一つ古いバケットへ送る。9か月を超えた食用残量は`storageOverflow`へ移す。生産物と到着輸入は`Age0`へ入れる。v1は穀物・魚・肉などの品目別賞味期限を持たず、後続の品目別在庫モデルへ置き換え可能な集約表現とする。

**決定**: Food Ledgerの生産・市場間輸送・年齢更新は四半期単位、主食消費は月次単位とする。四半期の開始時に当期の農村生産を`Age0`へ加える。各月、まず農村・都市双方の月次需要と総在庫から、同じ不足率（既定の決定的な小変動を含む）でそれぞれの充足量を確定する。次に、農村の確定充足量を`Age2 → Age1 → Age0`のFIFO順で共通在庫から先に控除する。残る在庫・予定生産・戦争補正から都市Grain小売価格を決め、都市の確定充足量を販売・FIFO控除して小売収入と農村未払金返済を処理する。したがって農村の在庫処理を先にしても、農村だけを優先して都市へ不足を押し付けない。四半期末に最低輸出備蓄を残して通常輸出を積み出し、上限超過分も輸出候補へ回す。次に残る`Age2`を`storageOverflow`へ移し、`Age1 → Age2`、`Age0 → Age1`と年齢を進め、当期末に到着した輸入を新しい`Age0`へ加える。この到着分は次期からしか消費・輸出できない。

**決定**: 地図生成時およびeconomy初回有効化時の初期在庫6か月分は、`Age0 = annualDemand × 0.25`、`Age1 = annualDemand × 0.25`、`Age2 = 0`として配分する。1月1日の開始直後に期限切れ在庫を作らず、最初の二四半期で通常のFIFO循環へ移行する。

**決定**: Marketの食用在庫が農村・都市の当期需要合計を満たせない場合、欠乏の**人口比率**を農村・都市で原則同じにする。`commonShortfallRate = totalUnmetNeed / (ruralNeed + urbanNeed)`として、基本は`ruralUnmetNeed = ruralNeed × commonShortfallRate`、`urbanUnmetNeed = urbanNeed × commonShortfallRate`とする。例えば農村100人・都市10,000人がともに50%不足する場合、農村50人相当・都市5,000人相当が同じ食料ストレス／飢餓死亡の対象となる。各Market・四半期では決定的な乱数で農村不足率を共通不足率の80〜120%へ揺らし、都市側の不足率は総不足量を保存するよう逆算する（0〜100%へ制限し、余りは他方へ再配分する）。これにより都市が農村を常に優先して食料を奪うモデルにはせず、双方が欠乏の被害を受ける。将来のCharacter・政治システムは、この比率を操作して仁君の農村保護や都市・軍の優先配給を表現できる。

Marketごとに四半期台帳を次の順で解決する。

1. 各セルの`foodProduced`を市場へ集計する。
2. 農村消費、都市消費、前期在庫、目標在庫を差し引く。
3. 輸出留保を超えた主食余剰を一般GoodsのGrain取引可能在庫とし、残量を`exportable`、在庫不足を`importNeed`とする。
4. 一般GoodsのGrain市場価格が高い需要側を優先し、供給側の残量制約下で割り当てる。
5. `landRouteGraph` / `seaRouteGraph`、`tradeRouteDuration.ts`、`tradeSecurity.ts`で移動日数、腐敗、治安損失を適用する。
6. 到着量を輸入先の在庫へ加え、未充足消費を記録する。

食料は市場間で保存則を守る。供給側から出た量、輸送中に腐敗・略奪で失われた量、到着した量を別々に記録し、`effectiveCapacity`は到着後の安定供給だけから計算する。

### 3.5 都市容量と崩壊

```text
effectiveCapacity = baseBurgCapacity + stableImportedFood / annualFoodNeedPerPerson
```

`stableImportedFood`は単発の到着量ではなく、直近複数四半期の到着量と在庫充足率から得る移動平均にする。これにより、一度だけの豊作や輸送では人口上限が急上昇せず、補給線の遮断時にも即時ゼロではなく在庫を使い切った後に危機が表面化する。

coreの`simulateDemographics()`はBurgのK値として`effectiveCapacity`を読む。economy無効時、または対応する食料データがない旧セーブでは必ず`effectiveCapacity === capacity`へフォールバックする。

## 4. 人口移住モデル

### 4.0 発展可能性とBurg group

移住先を既存のcityだけに限定すると、地図生成時の`Burg.group`が将来の発展を固定してしまう。`Burg.group`は発展可能性の原因ではなく、人口・立地・交易の結果として更新される表示上の発展段階とする。

```text
地理・資源・交通・政治 → settlementDevelopmentPotential
市場規模・食料安定性・人口 → 都市吸引力
都市吸引力 + 移住 → Burgの人口とgroupの昇格・降格
```

`settlementDevelopmentPotential`は、港、河川・渡河点、道路・海路の接続数、資源、首都・市場中心性を集約する。既存Burgの移住先順位だけでなく、coreの既存`getSettlementPromotionCandidates()`が選ぶ新Burg候補を補強する入力として使う。

- 年1回、ロックされていない既存Burgのgroupを現在人口から再評価する。これによりvillageは人口増でtown/cityへ昇格できる。
- 人口閾値にはヒステリシスと年単位の評価周期を設け、tickごとのgroup往復を防ぐ。
- `burg.lock`は明示的な手編集として尊重し、自動昇格・降格を行わない。
- 人口が十分で、かつ高い発展可能性を持つBurgのないセルは、新Burg昇格の有力候補になる。

### 4.1 農村から都市への移住

移住は自然出生とは別の人口移動であり、v1では同一State内から開始する。Market境界は移住候補の足切りに使わない。Marketは国家境界を少し越える野心的な商人圏を表し得るため、同一Stateかつ同一Marketへ限定すると、その商業圏に接した農村の都市化可能性を不当に失わせる。v1では越境移住や難民は扱わない。

移住元セルは、移住後にも次を満たす場合だけ候補にする。

```text
remainingFarmLabor >= farmLaborRequired × farmLaborReserveRatio
remainingPopulation >= minimumRuralCommunityPopulation
```

移住先Burgは以下をすべて満たす必要がある。

- `population < effectiveCapacity × urbanMigrationTargetRatio`
- 市場への食料供給が安定している
- 首都、港、plaza、既存の生産・交易需要など、都市吸引力がある

候補者は年齢・性別バケットを壊さずに移す。通常の就職移住は男女成人だけを移し、子ども・高齢者は出身農村へ残す。`cells.pop`とBurgの`population`、双方のdemographicsバケットを同一操作で更新し、人口を複製・消滅させない。家族単位の避難・開拓・結婚定住は別イベントとする。

移住量は、農村の余剰労働力、都市の空室、到着食料の余力の最小値とする。さらに年あたりの最大移住率を設け、単一tickで村が消滅しないようにする。

**決定**: 通常の農村→都市就職移住は成人単独とし、子ども・高齢者は農村に残す。奉公・徒弟・日雇いとしての若年単身移住を近似するためであり、世帯単位の避難・開拓・結婚定住は別イベントとする。農村から外部就業を探しに出る成人量は`min(migratableAdults, sustainableAdultOutflow, ruralReleasePressure)`を超えない。`urbanLaborIntakeRemaining`は出発量を抑える条件ではなく、出発者が都市へ定着できるかを決める条件である。定着できない成人は既定どおり`mobileAdultCohort`へ移す。`sustainableAdultOutflow`は、当年に子どもから成人へ到達する人数を原資として年1回算出し、既存成人の在庫を都市へ取り崩さない。男女の移住量は既存の子ども→成人更新と同じ到達比率（現在は男女各50%）で分ける。village/cityの初期`femaleAdults`構成比にある0.01程度の差は、この移住近似で補正しない。これにより、災害がない時間進行では農村の次世代再生産を損なわない。

**決定**: `sustainableAdultOutflow`の範囲で農村から出た成人は、出発時点で都市の受入枠がなくても農村へ戻さず、`mobileAdultCohort`として近隣最大三都市の雇用を探す。一年目は漂泊を継続し、翌年も未就職の場合に開拓申請、野盗、死亡・域外流出へ配分する。これは農村再生産を維持する年次流出制約とは別に、都市雇用不足が生む社会的不安定を表す。

**決定**: 成人単独移住者は徒歩圏内の近隣最大三都市を候補とする。候補順位は残り`urbanLaborIntake`を主軸とし、`settlementDevelopmentPotential`を加点、距離を減点する。単純な最短都市への固定流入にはせず、資源・首都・港・河川・交易結節の立地優位を、雇用枠を別途増やす前から移住先の選択へ反映する。

**決定**: 一つの都市の年次`urbanLaborIntake`を上回る成人単独移住希望者が集まった場合、都市ごとに応募者を一括して選考する。定着者は移動日数が短い順、同順位なら出身セルID順に決め、枠からあふれた成人は`mobileAdultCohort`へ移す。移住元セルの処理順や乱数によって採用結果が変わらないようにする。

**決定**: 成人単独移住者は最大三都市へ順位付きで応募する。第一希望を全員分一括選考し、不採用者だけを第二希望、さらに不採用者だけを第三希望へ回す年次三ラウンド方式とする。各ラウンドで都市の残余受入枠だけを使い、第三希望にも採用されない成人を`mobileAdultCohort`へ移す。

**決定**: `mobileAdultCohort`の漂泊一年間はFood Ledgerの農村・都市需要に含めない。翌年の開拓35%、行き場を失った成人25%、死亡／域外流出40%は、漂泊中の食料不足、病気、旅費不足、偶発的な就労・移動をまとめた生存結果として一括解決する。個別の野営地在庫・月次飢餓・都市の施しは後続の浮動人口システムへ分離する。

**決定**: `mobileAdultCohort`は男女成人を別バケットで保持し、出身State・出身セルを履歴として残す。開拓35%と死亡／域外流出40%は男女成人へ同率で適用する。一方、行き場を失った25%は男性を野盗集団へ移し、女性を都市に残留する`urbanSexWorkCohort`へ移す。v1では女性野盗をこの経路から生成しない。文化、治安、Character、個人技能による職業選択・女性野盗は、後続の人物・職業システムで上書きできる。

**決定**: 開拓へ向かう35%の男女成人は、個別に新集落を作らず、同一State内の男女別`frontierApplicantPool`へ集約する。これは既存`FrontierExpansion`を置き換える独立の開拓ではなく、国家主導の前哨地・入植事業へ優先的に編入される入植者供給である。年次に`FrontierExpansion`の候補地選定へ渡し、各事業の入植定員をまずプールの成人で満たし、不足分だけを既存農村セルから家族単位で補う。同じ成人を農村セルとプールの両方から引き抜かない。これにより、国家は行き場を失った成人を早期に開拓へ吸収しつつ、子ども・高齢者を含む家族の移住を必要に応じて組み合わせられる。

**決定**: `FrontierExpansion`の同時開拓事業上限を固定の3件にしない。Stateごとに、資金で支えられる数と食料で支えられる数の最小値を当年の`frontierProjectSlots`とする。戦争中・重度食料ストレス中は既定どおり新規開拓を止める。護衛、行政、補給網は国家が全開拓者へ直接提供する必須枠とはしない。候補地の`danger`、既存の前哨地支援・失敗判定、将来の経路危険システムを通じて開拓の危険と失敗へ反映する。既存の人口規模・道路接続数は候補地到達性・補給コストへ残せるが、富裕で食料のある国家が何百年も3事業で頭打ちになる固定上限は廃止する。

**決定**: 各新規開拓枠は、初期設営費に加えて次の一年の予測支援費・食料を確保できる場合だけ開く。三年の集落化支援期間を前払いで予約しない。Stateの資金・食料・既存前哨地支援能力は年次に再評価し、翌年に支援できなくなれば既存の`FrontierExpansion`の停滞・失敗判定へ渡す。開拓余力を過度に凍結せず、戦争・不作・財政悪化が継続事業を失敗させ得る中世的な不安定さを残す。

**決定**: `TREASURY_RESERVE`はState共通ではなく、各前哨地が独立して必要とする非常用の備えとして維持する。Stateが同時に三つの前哨地を支えるなら、三件分の準備金、各件の設営費、次年度の予測支援費・食料を確保する。支援を受けた年が累計三年に達して`settlement`となった開拓地は、直接の国家支援枠から外す。代わりに、集落化・編入後の3年間は免税とし、国家支出を伴わない定着誘因へ切り替える。免税対象の具体的な税種は後続の税制で決める。

**決定**: 一進一退の前哨地は、支援可能な年には支援を再開し、支援不能な年だけ`failedSupportYears`を増やす。支援不能が三年連続した時は国家が支援を打ち切って前哨地を放棄し、人口・物資の残存分を再配分せず消失・離散として扱い、空いた開拓枠を別候補地へ回す。これは有望でも脆弱な地点へ無期限に資源を注ぎ込まない近似である。

**決定**: Stateは軍隊運用と前哨地支援に使う独自の`stateFoodReserve`を持つ。これはMarketの商人在庫とは別の国家所有在庫である。農民への現物税は、農民が直接国家倉庫へ運ぶのでなく、Market商人へ委託して納入する近似とする。実装上、Stateは所属する国内Marketから当月都市Grain小売価格の80%でGrainを購入し、MarketのFIFO Food Ledger在庫を減らして代金を`marketTreasury`へ払い、同量を`stateFoodReserve`へ移す。`state.foodStock`はMarket在庫の集計・戦略表示に留め、国家備蓄として直接消費しない。

**決定**: 平時のState食料調達は、各Marketが農村・都市の次四半期需要と3か月の輸出留保を確保した後の余剰だけから行う。ただし`stateFoodReserve`が危機的に不足する時は、住民用留保を侵食して調達する非常徴発を許す。非常徴発の開始閾値と侵食量は、将来の`rulerFoodRequisitionPolicy`（為政者Character・政策）で決める。国家食料庫を守るため農民・都市住民の不足が増える可能性を、通常調達の安全規則で完全に排除しない。

**決定**: 為政者Character・国家政策が未実装のv1では非常徴発を発動しない。`stateFoodReserve`が危機的に不足しても、通常の住民留保を侵食せず、軍隊・前哨地側の食料不足とその既存の失敗処理へ渡す。非常徴発は、将来に明示的な政策または為政者判断が選んだ時だけ有効にする。

**決定**: `stateFoodReserve`が軍隊維持・前哨地支援・新規前哨地設営をすべて満たせない時は、軍隊の維持、既存前哨地の支援、新規前哨地の設営の順に配分する。新規開拓は常に最後に回し、まず既存の軍事力と既に入植した人々を守る。前哨地へ回らない残量は既存の停滞・失敗判定へ渡す。

**決定**: `stateFoodReserve`はGrainだけを受け入れ、Market Food Ledgerと同じ0〜3、3〜6、6〜9か月の三つの年齢バケットで保存する。軍隊・前哨地への配分は`Age2 → Age1 → Age0`のFIFO順とし、9か月を超えた残量は廃棄として記録する。国家備蓄にも期限のない食料を作らない。

**決定**: Stateの食料調達は各四半期の人口消費後に行う。各Marketが次四半期の農村・都市需要と3か月の輸出留保を確保した余剰だけを、Stateが通常輸出より先に購入できる。国内の現物税・軍備用調達を、商人による外部Marketへの通常輸出より優先する。

**決定**: Stateの食料買付は、既存前哨地に約束済みの`TREASURY_RESERVE`合計を侵食しない余剰資金だけで行う。資金が尽きれば`stateFoodReserve`を補充できず、軍隊・前哨地は既定の優先順で食料不足・停滞・失敗を受ける。v1では国家債務・強制借入・貨幣発行で不足を埋めない。

**決定**: `frontierProjectSlots`は固定式で求めない。年初に既存前哨地すべての準備金・次年度支援費・食料を先に確保し、残る資金・`stateFoodReserve`で候補地を順位順に一件ずつ追加する。各追加時に新規前哨地の準備金、設営費、次年度支援費・食料を引き当て、どちらかが尽きた時点で当年の新規開拓を止める。これにより、資源に応じて3件を超える開拓が可能になる一方、既存前哨地の支援を犠牲にした無制限の新設を防ぐ。

**決定**: v1の`stateFoodReserve`はState首都Burgの国家倉庫に物理的に保管する。国内Marketから購入したGrainは、首都倉庫を到着先とするState用`FoodShipment`として積み出し、移動日数、到着期、腐敗・治安損失を経てから`stateFoodReserve`の`Age0`へ入る。即時に国家備蓄へ湧かせず、地方の分散軍用倉庫・前線補給拠点は後続タスクとする。

**決定**: State用`FoodShipment`は、積出Grainの当月都市小売価格80%と通常FoodShipmentと同じ輸送費をState treasuryから支払う。MarketはGrain代金と輸送収入を受け、Stateは積出量ではなく実到着量だけを`stateFoodReserve`へ入れる。輸送中の腐敗・治安損失・全損はState側の食料損失として記録する。

**決定**: 首都倉庫から軍隊・前哨地へ送るState補給Shipmentは、商人・荷車隊が運送し、軍が護衛する近似とする。通常の野盗・静的経路危険による損失だけを通常FoodShipmentの10%へ軽減する。戦争に起因する敵軍の襲撃・封鎖損失と腐敗は軽減しない。国家直営の恒常的な輜重隊、運賃ゼロ、野盗損失ゼロに近い輸送は、より中央集権的・常備軍的な後続技術として扱う。

**決定**: State補給Shipmentの運送費は通常FoodShipmentと同額をState treasuryから支払う。軍の護衛費は既存の軍事維持費へ含まれるものとして、v1で別の賃金・飼料・兵員控除を計上しない。商人・荷車隊の運送採算を残し、護衛隊の細かな編制費は後続の軍事兵站システムへ分離する。

**決定**: v1の軍隊は`stateFoodReserve`とState補給Shipmentだけから食料を受ける。現地Marketからの購入、住民からの徴発、都市・農村の略奪、採集・飼料調達は後続の軍事兵站システムへ分離する。現時点ではBurgごとの物理食料備蓄がなく、Market共通在庫だけを都市略奪対象にすると不正確なためである。

**決定**: 各軍団は、個人携行分ではなく荷車・随伴商人を含む30日分の`unitFoodReserve`を持つ。残量が15日分を下回ると、State首都倉庫へ補給を要求する。補給要求はState補給Shipmentの到着時期・損失を受けるため、遠隔地、戦争、首都備蓄不足では軍団も食料不足になり得る。

**決定**: v1では騎兵も兵員数ぶんのGrainだけを消費する。軍馬の飼い葉・飼料、弓矢・弩矢・火薬などの弾薬、武器・装備の消耗品は主食Food Ledgerへ混ぜず、別Goods・軍事兵站の後続タスクとする。

**決定**: 軍団の食料不足は、5%以上で当期の戦闘力・行軍速度を25%下げる。10%以上の不足が一四半期続くと`troops × shortfallRate × 0.10`を脱走として減らし、同じ不足が二期連続した時は同量を死亡・離散として減らす。民間より先に脱走を出し、補給不能な軍が無損失で戦い続けないようにする。

**決定**: 食料不足で軍団を脱走した兵は、死亡としても民間人口へも戻さず、既存の`banditCohort`（野盗集団）へ合流させる。合流した集団の出身Stateには、脱走した軍団の所属Stateを記録する。給与・補給が途絶えた軍が野盗・傭兵集団化した中世ヨーロッパの実例に近い近似であり、既存の野盗・農村略奪の仕組みをそのまま再利用できる。個別の出身地、帰還先、脱走後の消息はv1で追跡しない。同じ不足が二期連続した時の`死亡・離散`は`banditCohort`へも加えず、軍団からだけを減らす。二期にわたる飢餓で逃走にも耐えられなかった兵の実質的な死亡・離散として扱う。`banditCohort`合流は軍団と民間人口の対応関係を必要としないため、manpower simulationの有効・無効を問わずこの扱いを統一する。

**決定**: 前哨地は90日分の`outpostFoodReserve`を持ち、残量が45日分を下回ると首都倉庫へState補給Shipmentを要求する。到着分だけを補充し、補給不能で不足した時は既存の前哨地停滞・失敗判定へ渡す。常設の地方倉庫ではなく、前哨地自身が持つ小規模な運用在庫である。

**決定**: v1の軍隊へのState補給Shipmentは、Burg、fort、frontier outpostに駐留している軍団だけが受け取れる。行軍中の軍団は30日分の`unitFoodReserve`だけで行動し、補給隊が移動先を追う、野戦補給所を設ける、行軍路上で待ち合わせる仕組みは後続の軍事兵站システムへ分離する。

**決定**: `stateFoodReserve`の通常目標量は、今後90日間の軍隊維持需要、既存前哨地支援需要、および当年に確定した新規前哨地の設営食料の合計とする。Stateは四半期ごとにこの目標までの補充を試み、国家も原則として3か月を超える長期備蓄を持たない。戦争、輸送遅延、Market余剰不足により目標を満たせない時は、国家備蓄・軍団・前哨地の既定不足処理へ渡す。

**決定**: 地図生成時・Food Ledger初回有効化時のStateは、Marketから購入せずに、生成時点の全軍団と既存前哨地を半年間維持する必要量を最初から`stateFoodReserve`として持つ。初期量は`Age0`に3か月分、`Age1`に3か月分、`Age2`は0として配分する。これはシミュレーション開始前に徴収・保管済みの国家備蓄を近似するためであり、State treasury、Market在庫、Market treasuryを初期化時に動かさない。以後の補充だけを国内Marketからの購入・輸送で行う。

**決定**: Stateの補充買付は、最安値・最短到着順に集中させない。住民用留保を超える余剰がある国内Market全域へ、必要調達量を等分して割り付ける。割当量に足りないMarketは、その余剰までだけを売り、未達分をまだ余剰のある他の国内Marketへ再び均等配分する。全Marketが余剰を使い切った時だけ国家調達を未充足で終える。これにより、国家が首都近傍・安価な一市場だけから食料を吸い上げず、現物税を各地域から広く集める近似とする。

**決定**: 複数StateにまたがるMarketでは、各Stateが調達できる余剰を、そのStateに属するBurg人口比で按分する。Stateは自国按分枠までだけを現物税・国家調達として買え、他State按分のMarket物量を取得しない。国境を少し越える商人圏を認めつつ、国外の穀物まで国家が直接取り上げる近似を避ける。

**暫定既定値**: 生成時点で軍団も既存前哨地もないStateは、国家備蓄を0から開始する。`stateFoodReserve`は住民用の一般備蓄ではなく、軍隊・開拓支援専用の在庫だからである。以後に軍団を編成する、新規前哨地を設営する場合は、Stateが通常調達で必要な食料を確保してから開始する。首都Burgまたは国内Marketを持たないStateは、国家倉庫・通常調達を行えず、新規編成・新規開拓を始められない。既存の軍団・前哨地が残っている場合だけ、保持済み在庫を使い切るまで既定の不足処理を続ける。

**決定**: `urbanSexWorkCohort`は、成人女性が第三希望まで応募した最後の都市へ残留する。その都市の通常`urbanLaborIntake`を消費しないが、Burg人口の女性成人バケットとFood Ledgerの都市需要へ直ちに加える。`effectiveCapacity`を超えても残留を許し、過密、食料不足、飢餓死亡のリスクを通常の都市人口と同じく受ける。v1ではこの残留を支える収入・顧客・住居を個別計算せず、後続の職業・賃金・治安システムで置き換える。

**決定**: `urbanSexWorkCohort`は都市へ入った時点で通常の女性成人バケットへ統合し、職業ラベルは`urbanSexWorkInflow`の履歴だけに残す。個別の職業継続、収入、顧客、妊娠はv1で追跡せず、後続の職業・世帯システムで扱う。

**決定**: 現段階の`settlementDevelopmentPotential`は移住先の順位付けだけに使い、年次`urbanLaborIntake`の総量を増やさない。受入枠は当面、Burg人口の年率2%に景気変動・空き容量を掛ける暫定式を維持する。資源・首都・港・水運・交易が何人を雇用するかは、静的立地とは別の`employmentDemand`として後続フェーズで導入する。

**決定**: 二年目も未就職で開拓申請となった成人は、既存`FrontierExpansion`の候補地選定へ渡す。定着には同一State内の到達可能性、`cultivableArea`と食料余力、既存の開拓地条件を満たすことを要求する。候補地がない申請者は人口を新規生成せず、漂泊・野盗・死亡／域外流出の未解決処理へ戻す。

**決定**: Food Ledger導入後の野盗による農村略奪は、野盗集団の出身Marketが持つ共通食料在庫を対象にする。Marketは広い農村圏を表すため、出身セル以外のMarketへ限定しない。略奪は`foodStockAge0`、`foodStockAge1`、`foodStockAge2`からランダムに選んだ非空バケットより控除し、通常の市場消費・輸出にだけ適用するFIFO順序を意図的に乱す。各野盗集団は四半期に一度、`raidCapacity = banditAdults × GROSS_FOOD_NEED / 4`を上限として略奪する。これは野盗成人が次の四半期を生き延びる基本食料量であり、追加の換金・大規模な略奪経済は後続システムとする。隊商への襲撃は引き続き`TradeSecurity`が扱う。

**決定**: 野盗集団が略奪で必要量を得られなかった場合、5%以上の不足で弱体化状態を記録し、10%以上の不足が二期連続したとき、`banditAdults × shortfallRate × 0.10`を死亡・離散として集団から除く。野盗には農村・都市への帰還移住を与えず、食料を奪えない集団だけが縮小する。

**決定**: 輸入不足Marketの通常目標在庫は、当期消費後の年間需要6か月分（`annualDemand × 0.5`）とする。輸入要求は当期の不足だけでなく、この水準までの補充量を含む。9か月は保管上限、3か月は輸出元が残す最低生存備蓄、6か月は輸入で回復を目指す平時の運用備蓄である。

**決定**: 複数Marketの輸入要求を供給側在庫が満たせない場合も、緊急備蓄・不足の深刻さによる優先枠は設けない。輸入は常に市場の買値順に配分する。供給不足は食料価格を上げ、高値を出せるMarketが先に購入するため、豊かな都市・交易圏が食料を確保し、貧しいMarketは不足・食料ストレスへ落ち得る。

**決定**: Food Ledgerの輸入代金はMarket自身の貨幣残高`marketTreasury.balance`から支払う。Marketは中心Burgの財布ではない。新規地図と旧セーブ移行時のどちらも、初回だけ所属する全Burgの`treasury`合計へ`0.5〜1.0`の決定的な乱数係数を掛け、Marketの独立した初期商人資本として`marketTreasury.balance`を与える。Burg treasuryからの人口比負担・移転は行わない。残高が不足するMarketは、価格が高くても代金を払える量までしか輸入できない。

**決定**: 食料輸入の代金は、輸出元Marketの`marketTreasury.balance`へ全額を移す。Marketを取引の相手方とし、取引ごとの貨幣総量を保存する。生産者・農村・所属Burgへの収益配分は、将来の賃金、税、地代および商人の利益配分の設計として分離する。

**決定**: 新規MarketとFood Ledgerを初めて得る旧セーブの初期商人資本は、初回の生産サイクル後に、そのMarketへ所属する全Burgの`treasury`合計へ`0.5〜1.0`の決定的な乱数係数を掛けて`marketTreasury.balance`へ与える。これはBurgから徴収・移転する資金ではなく、世界開始時から商人・商会が保有する独立した初期資本である。Burgの`treasury`は減らさない。

**決定**: 一般Goods取引の決済が`marketTreasury`へ接続されるまで、輸入依存Marketの残高が尽きた場合、Food Ledger内の食料輸出などで残高を得るまで輸入できない。初期資本後の人工的な定期補充はしない。これにより食料輸入への依存、購買力の格差およびその帰結を隠さない。

**決定**: Food Ledgerの輸入Marketは、当月の都市Grain小売価格を`P`、単位輸送費を`F`として、輸出元への穀物入札額を`max(0, 0.8P - F)`と提示する。輸入Marketは積出量`×`この入札額を輸出Marketへ支払い、輸送費`F × 積出量`を別途負担する。損失がなければ積出単位当たりの取得原価は`0.8P`となり、残る20%の地域内マージンを保つ。損耗・略奪で到着量が減れば実到着単位当たり原価はこれを上回る。遠距離輸入は十分に高い都市小売価格がなければ成立しにくい。輸出量の配分はこの卸入札額の高い順に行う。輸送中の損耗・略奪による未着分の代金と運賃も、初期版では輸入側が負担する。

**決定**: 通常の輸出留保を超えた主食は、輸入Marketの卸入札額が輸出元の当月都市Grain小売価格`Ps`の80%（`0.8Ps`）以上の場合だけ輸出する。すなわち`0.8Pb - F >= 0.8Ps`を満たす時だけ取引を成立させる。輸入先の小売価格、輸出元の地元価値、距離に応じた輸送費が、取引の可否と買い手優先順位へ一貫して反映される。

**決定**: 9か月の保管上限を超えた`storageOverflow`は、腐敗・処分を避けるため通常輸出の`0.8Ps`下限を適用しない。買い手の卸入札額が0以上で、輸入側が輸送費を回収できる場合は安値で輸出できる。通常在庫は地元の食料価値を守り、保管しきれない超過分だけが安価な外部供給となる。

**決定**: 同じ四半期のFoodShipmentは一括清算する。各Marketは、月次小売と農村未払金返済を反映した清算開始残高へ、その期のFoodShipment輸出受取額を足し、輸入代金と運賃を引いて清算する。輸出代金を同期期の輸入原資に使え、FoodShipmentの貨幣移転は取引の反復順に依存させず清算確定後にまとめて適用する。清算の結果`marketTreasury.balance < 0`となったMarketは、Food Ledgerを含む新規Goods買付を一切停止し、手持ち在庫の販売収入で残高が0以上へ戻るまで再開しない。残高不足を理由に確定済みFoodShipmentを取り消して再配分する処理はv1では行わない。負残高の発生時はMarketダイアログに原因・残高・買付停止中であることを明示する。債権・証券による解消は後続タスクとする。

### 4.2 都市から農村への人口流出

食料到着量や在庫が低下しても、都市住民が直ちに農村へ避難できるとは限らない。農村には土地・親族・雇い主・入植許可がないことが多く、住民はまず施し、借金、資産売却、配給、次の収穫への期待に頼る。都市→農村避難は、都市部の当期不足率10%以上が三期連続した時にだけ試みる。二期連続で始まる飢餓死亡を経ても、受入先のある世帯だけが後背地へ移れる近似である。

- 移住先は、同一State内の農村セルとする。Market境界は受入候補・順位に使わない。
- Market在庫は避難受入れの根拠に使わない。次の収穫で得るセル生産から、既存農村人口が次収穫までに必要とする食料と3か月の安全分を引いても余るセルだけが受入候補になる。
- 空き人口容量があり、かつ`farmLaborRequired`を満たしていないセルを候補に含める。
- 流出者は都市から農村へ、元の年齢・性別構成比を保って世帯単位で移す。通常の成人単独就職移住と異なり、飢饉・封鎖から後背地へ逃れる避難として子ども・高齢者も含める。
- 受入先がない、または食料不足がState全域に及ぶ残余だけを既存の飢餓・死亡処理に渡す。

これにより、港湾封鎖や戦争で補給が断たれた大都市は「全員が即座に死亡する」のではなく、まず後背地へ人口を失い、それでも支えられない部分で飢饉になる。

**決定**: 農村・都市のいずれも、当期需要の5%以上が未充足なら`foodStress`と移住圧を受ける。これは90日四半期のおよそ4〜5日分に当たる早期警戒閾値であり、死亡は発生させない。当期需要の10%以上が未充足なら重度不足とし、同じ部門の重度不足が連続する二四半期で続いたとき、その部門の継続的な不足人口を飢餓死亡の候補にする。10%は約9日分の完全配給相当であり、「約10日」の近似とする。5〜10%の不足は継続してもストレス・移住圧だけを与える。飢餓死亡候補となった部門では、各死亡四半期に`deaths = population × shortfallRate × 0.10`を適用する。したがって10%不足で人口の1%、20%不足で2%、50%不足で5%が死亡する。

**決定**: 重度不足の連続カウンタは、当期の不足率が10%未満になった時点で即時にリセットする。食料ストレスは不足率が5%未満になった時点で解除する。したがって5〜10%の不足はストレスと移住圧だけを継続し、飢餓死亡の連続判定には加算しない。

**決定**: 都市→農村避難は5%の食料ストレスでは開始しない。都市部の10%以上の不足が二期連続した時点で飢餓死亡を始め、同じ重度不足が三期連続した時に、受入農村がある世帯だけが避難を試みる。受入先のない世帯は都市に留まり、Food Ledgerの不足・死亡判定を継続する。これは都市の無産層が農村に直ちに生活基盤を得られず、移動判断が遅れる中世的な脆弱性を表す。[1315年飢饉の同時代記録](https://sourcebooks.web.fordham.edu/source/famin1315a.asp)

**決定**: 都市→農村避難が始まっても、一四半期の避難量は`min(urbanPopulation × 0.05, max(0, urbanPopulation - effectiveCapacity), reachableRuralReceivingCapacity)`を上限とする。一度に余剰人口全員を移さず、家族の情報、資産、移動手段、受入先の制約を近似する。

**決定**: `reachableRuralReceivingCapacity`はMarket在庫を含めず、各候補セルの次収穫の生産余力だけから求める。既存農村人口の次収穫までの需要と3か月の安全分を差し引いても残る食料、`cells.capacity`の空き、食料由来`effectiveRuralCapacity`の空きの最小値とする。避難民は原則として次の収穫期以後に到着し、将来の収穫見込みだけで、今すぐ飢えた家族を受け入れたことにはしない。これはFood Ledgerとは別の農村在庫を作らず、セルの将来生産を受入れの安全証明にだけ使う。

**決定**: 農村が避難民を受け入れた時は、避難民比率と出発都市の重度不足継続期間から疫病リスクを発生させる。発症時は避難民と既存農村住民の双方へ死亡・労働力低下・次期生産低下を与える。拒否または暴力的排除では、避難民側が死亡・離散・野盗化する。受入れの食料余力と疾病・治安リスクを別々に扱い、農村が避難民を無償かつ無危険に吸収する抜け道を作らない。

**決定**: 受入余力を満たす農村セルについても、v1では`mapSeed`・`cellId`・年・四半期から再現可能に導く`refugeeReceptionRoll`で受入、拒否、暴力的排除を判定する。避難民比率による補正前の基準配分は、受入80%、非暴力的拒否15%、暴力的排除5%とする。受け入れる避難民が既存農村人口に占める比率が大きいほど、拒否・排除の側へ寄せる。これにより、食料上は受入可能でも疫病・治安・共同体の負担を恐れて受入れない事態を表現し、セーブ再開や同一seedの再計算で結果をぶらさない。将来は文化、宗教、領主・商人Character、State政策がこの基礎判定を補正または置換する。

**決定**: 疫病は、受入れた避難世帯が到着する四半期に最初の発症判定をする。発症して疫病死亡者が出た避難イベントは`activeRefugeeEpidemic`として残し、次四半期にも死亡判定を行う。疫病死亡者が0人となった四半期で当該イベントは終息し、以後は再判定しない。最初に非発症だった避難イベントも終了する。持続感染の係数、再流行、近隣セルへの伝播は後続の疫病システムへ分離する。

**決定**: 到着時の疫病発症確率は、`clamp(0.05 + 0.50 × refugeePopulation / existingRuralPopulation + 0.05 × (originSevereShortageQuarters - 3), 0.05, 0.60)`とする。避難民比率と、出発都市で10%以上の不足が続いた期間が長いほど危険を増し、最低5%、最高60%に制限する。発症判定にも`mapSeed`・移住元／移住先・到着期を使う決定的な乱数を用いる。

**決定**: 疫病死亡が発生した四半期は、避難民人口の15%、既存農村人口の5%を死亡させる。避難民側をより脆弱にしつつ、受入農村にも明確な人口・労働力の代償を与える。

**決定**: `activeRefugeeEpidemic`の継続四半期における発症確率は、初回発症確率の半分、さらに次期はその半分という`initialOutbreakRisk × 0.5^elapsedQuarters`で減衰させる。各期に死者が出れば次期も判定し、死者が0人なら終息するため、避難に伴う一時的な感染拡大を表しつつ無期限の固定ペナルティにしない。

**決定**: 疫病死亡が出た農村セルには、死亡による年齢バケット・労働者数の減少とは別に、翌四半期だけ`epidemicFarmLaborModifier = 0.85`を掛ける。看病、罹患者、作業中断を近似する一時的な実働力・生産量の15%減衰である。継続疫病で再度死者が出ても同じ四半期へ累積加算せず、最小係数0.85に留める。

**決定**: 非暴力的に拒否された避難世帯は都市へ戻さず、その世帯の全人口を`famine`による即時死亡として年齢・性別バケットから除く。食料を失った避難民が都市にも農村にも戻れず途中で力尽きた結果を近似し、次期以後のFood Ledger不足・避難再試行・人口分割を発生させない。死亡は出発都市の現在State（無所属なら無所属枠）のPopulation Overviewへ集計する。

**決定**: 暴力的排除では、避難世帯全体の10%を即時死亡させる。生存した成人の10%だけを野盗集団へ移し、子ども・高齢者を野盗化させない。残る生存者は都市へ戻さず域外離散としてマップ上の人口から除く。これにより、農村側の排除が避難民側の死亡・離散・治安悪化を生み、都市へ戻して次期以後のFood Ledger・避難判定を繰り返す状態を作らない。

**決定**: 暴力的排除後の域外離散者は死亡として数えず、`forcedDisplacementOutflow`として出発都市と現在State（無所属なら無所属枠）の人口流出履歴へだけ記録する。Population Overviewの`famine`へは、暴力的排除の即時死亡10%だけを加算する。域外離散者の行き先、再流入、他Stateへの定住は後続の越境移住・難民システムで扱う。

**決定**: 避難を扱う四半期内の順序は、(1) 月次Food Ledger消費、(2) 飢餓死亡、(3) 到着待ち`pendingRuralEvacuation`への都市死亡反映、(4) 到着・移動損失・農村への人口移動、(5) 新規避難の受入判定・予約、とする。同じ期に死亡した人を避難・到着させず、避難決定で当期の食料不足を前倒し解消しない。

**決定**: 都市→農村避難の受入候補は、同一State内かつ既存の道路・小道ネットワークで到達できる農村セルとする。Market境界を候補条件・順位に使わない。食料上の受入安全証明を満たすセルを、移動日数が短い順、予約後も残る次収穫余力が大きい順、未充足の`farmLaborRequired`が大きい順に選ぶ。情報と移動が遅い時代のため、すぐ分かる距離と食料余力を優先し、農業労働力不足は最後の補助条件に留める。

**決定**: 都市→農村避難には徒歩換算の最大移動日数を設けない。同一State内で食料上の受入安全証明を得られる遠隔農村も候補に残す。遠距離の避難は候補から機械的に除外するのでなく、移動日数に応じた損失で失敗し得る死の行軍として表す。

**決定**: 避難の`travelDays`は海運を使わない徒歩移動として、既存の道路・小道ネットワーク上だけを通る。道路・小道のない地形を横断する避難はv1では禁止し、未接続セルを候補に含めない。健康な成人だけの世帯の基準速度は15 km/日とし、実際の世帯速度は`15 / (1 + 0.5 × childrenShare + 1.5 × eldersShare)` km/日とする。子ども40%・高齢者15%なら約10.5 km/日、成人と高齢者が半々なら約8.6 km/日となる。既存のtrade・軍隊行軍と同じ経路の上り坂負荷をこの徒歩日数にも加える。これは交易用の荷車・船の移動日数を避難世帯へ流用せず、老人同行の遅さと地形を到着日数・移動損失の双方へ反映するための別計算である。

**決定**: 避難が決まっても、世帯は次の収穫期に受入先へ到着するまで都市人口として残る。滞在中は都市のFood Ledger需要、不足、飢餓死亡判定を継続して受け、到着四半期に移動中の損失を引いた生存者だけを都市の年齢・性別バケットから減らして農村セルへ移す。避難決定だけで直ちに都市の需要を消さず、餓死寸前の家族が将来の農村収穫見込みだけで救済されることを防ぐ。

**決定**: 農村セルが避難世帯を承認した時点で、到着予定人数ぶんの`cells.capacity`、食料由来`effectiveRuralCapacity`、および次収穫の生産余力を`pendingRuralEvacuation`として予約する。同じ余力を別の都市・次期の避難へ二重に割り当てない。到着時には受入判定をやり直さず、承認済み世帯を移す。予約後の不作、戦争、疫病などで生じる不足は避難を取り消す根拠にはせず、到着後の通常Food Ledger不足として扱う。

**決定**: `pendingRuralEvacuation`は子ども・男女成人・高齢者の4区分を保持し、到着までに都市で生じる飢餓死亡を都市全体と同じ年齢別比率で受ける。到着時にはさらに移動損失を各区分へ適用する。子ども・高齢者は移動中に力尽きやすく、同行する扶養者比率が高いほど歩みが遅くなり若い成人の移動損失も増える。予約された容量・将来生産余力の未使用分は、実際の生存到着人数に応じて解除する。

**決定**: 避難の到着時移動損失は、`baseTravelLoss = travelDays / 1200`へ`1 + dependentShare`を掛け、子ども`1.5`、男女成人`1.0`、高齢者`2.0`の年齢係数を掛けて求める。最終損失率だけを100%で打ち止める。`dependentShare`は避難世帯における子どもと高齢者の比率である。したがって、30日徒歩なら扶養者のいない成人は約2.5%、扶養者比率50%の成人は約3.8%となり、子ども・高齢者はより高い損失を受ける。近距離の避難は従来どおりだが、極端な遠距離では全滅し得る。これは安全な避難経路を保証せず、家族を伴う移動の遅さと脆弱さを近似する。

死亡係数0.10は、`× 0.25`では最低の重度不足でも人口の2.5%／四半期となり、IPCの飢饉判定下限である約1.8%／四半期を上回るため採用しない。アイルランド大飢饉の全期間平均（概算0.8%／四半期）とソマリア2010〜2012年危機の全期間平均（概算0.6%／四半期）は、地域・月ごとのピークを均した値である。比較資料は[IPC Famine Classification](https://www.ipcinfo.org/ipc-manual-interactive/ipc-acute-food-insecurity-protocols/ipc-famine-classification-special-additional-protocols/en/)、[Irish Famine Commemoration](https://www.irishfamine.ie/an-gorta-mor/)、[UNICEF Somalia](https://www.unicef.org/somalia/press-releases/rains-fail-again-catastrophic-hunger-looms-over-somalia)を参照する。

### 4.3 更新順序

四半期更新では以下の順序を固定する。

1. coreの年齢・出生・通常死亡を更新する。
2. economyがセル別生産、在庫、Market輸出余力を計算する。
3. Market間の食料輸送と到着量を解決する。
4. 安定食料量からBurgの`effectiveCapacity`を更新する。
5. 農村→都市の移住、次に都市→農村の流出を解決する。
6. 移住後の農業労働力・消費・在庫を再計算し、不可能な移住を確定しない。
7. 残った過密・欠乏を既存の飢餓ロジックへ渡す。

手順6は必須である。移住で農業労働力を必要水準未満に落としたり、都市の新規消費を二重計上したりしない。実装では上限付きの反復、または保守的な余力予約を使い、無制限の固定点計算は避ける。

### 4.4 未回答細部に対するv1の暫定既定値

以下は個別インタビューを続けずに実装へ進めるための既定値である。いずれも歴史の厳密な再現値ではなく、seed固定で再現でき、設定・テストで後から調整できる近似として扱う。定数は散在させず、economy設定の一か所へ集める。

| 領域 | v1の暫定既定値 |
| --- | --- |
| 四半期境界 | 四半期末に確定した生産と到着Shipmentを次期の`Age0`在庫として利用可能にする。期首に在庫を一段古くし、消費・略奪・国家配分は`Age2 → Age1 → Age0`で控除する。これにより、同じ物量を当期消費と輸出・到着で二重に使わない。 |
| 年次処理 | 年初に年齢更新、作付計画、`sustainableAdultOutflow`、`urbanLaborIntake`、Stateの開拓余力を一度だけ決める。通常移住とFrontier応募はこの年次枠だけを消費し、四半期途中に再抽選しない。 |
| Stateの新規需要 | 軍団編成・新規前哨地は、必要な初期食料をState所有在庫から実際に引き当てられる時だけ開始する。食料・資金不足なら翌四半期または翌年へ延期し、住民用Food Ledgerを自動徴発しない。 |
| Stateの供給失敗 | 調達Shipmentまたは補給Shipmentが未着・全損なら代替Marketを同じ期に再探索しない。次の定期調達・補給要求で再試行する。これにより、同一期の無限再試行と食料の二重予約を防ぐ。 |
| Marketの会計 | 負残高のMarketは全ての新規買付を停止するが、既存在庫の小売、確定済みShipmentの到着、農村未払金の返済、輸出による収入は続ける。残高が0以上になった次の月から買付を再開する。 |
| 越境 | 通常移住、都市避難、国家調達、Frontier応募はv1では同一State内に限定する。Marketの越境は食料交易とState別の按分だけに留める。戦争・外交・難民制度を実装してから越境移住を追加する。 |
| 立地と雇用 | `settlementDevelopmentPotential`は候補順位の加点にだけ使う。首都、資源、港、河川、水運、交易結節が雇用人数を直接生む処理は`employmentDemand`として後続に分離し、現段階の年率2%受入枠を上書きしない。 |
| 不足の記録 | 全ての在庫廃棄、輸送損失、未充足需要、死亡、脱走、離散、域外流出、略奪は、原因・期・State/Market/居住地を含む履歴へ記録する。自動補填、負の在庫、人口の暗黙生成は行わない。 |

State、Market、Burg、セル、軍団、前哨地のいずれにも、同一物量を同時に所有させない。保有者を移す処理は必ず出発元の年齢別在庫または人口バケットを先に減らし、到着期までShipmentまたはpending cohortとしてだけ保持する。v1で個別所有をまだ分離していない農村・都市住民については、Market Food Ledgerを唯一の正本とする。

技術、政策、Character、雇用、作物別栄養、世帯別財産といった後続システムは、この暫定既定値を置換してよい。ただし、食料・貨幣・人口の保存則、StateとMarketの所有境界、決定的な再現性は維持する。

## 5. データ契約

```ts
// Economy simulation slice: dynamic and extension-owned
interface EconomyFoodCellColumns {
  foodPotential: Float32Array;
  /** Effective local modifier: state agricultural productivity × local agricultural conditions. */
  foodProductivityModifier: Float32Array;
  farmLaborRequired: Float32Array;
  settlementDevelopmentPotential: Float32Array;
}

interface StateAgriculturalProductivity {
  stateId: number;
  /** Technology, institutions, security, and irrigation investment. Defaults to 1.0. */
  multiplier: number;
}

interface FoodLedger {
  foodProduced: number;
  ruralNeed: number;
  urbanNeed: number;
  ruralUnmetNeed: number;
  urbanUnmetNeed: number;
  stockStart: number;
  stockEnd: number;
  targetStock: number;
  exportable: number;
  importNeed: number;
  satisfiedImport: number;
  importCapacityBonus: number;
  unmetNeed: number;
  foodStockAge0: number;
  foodStockAge1: number;
  foodStockAge2: number;
  foodStockAge0UnitCost: number;
  foodStockAge1UnitCost: number;
  foodStockAge2UnitCost: number;
  /** Money paid for FoodShipment cargo and freight that never reached this Market. */
  foodTransportLoss: number;
}

/** State-owned Grain stored at the capital; distinct from every Market ledger. */
interface StateFoodReserve {
  stateId: number;
  capitalBurgId: number;
  foodStockAge0: number;
  foodStockAge1: number;
  foodStockAge2: number;
  targetStock: number;
}

interface StateFoodShipment {
  stateId: number;
  fromMarketId?: number;
  fromBurgId?: number;
  toBurgId?: number;
  toOutpostId?: string;
  toRegimentId?: string;
  purpose: "procurement" | "armySupply" | "outpostSupply" | "outpostSetup";
  loadedVolume: number;
  arrivedVolume: number;
  arrivalQuarter: number;
  spoilageLoss: number;
  normalSecurityLoss: number;
  warSecurityLoss: number;
}

interface UnitFoodReserve {
  regimentId: string;
  foodDays: number;
  supplyRequested: boolean;
}

interface MarketTreasury {
  /** Market-owned liquid purchasing power used for food and other market-wide imports. */
  balance: number;
  /** Aggregate unpaid farm-gate price owed to rural Grain producers. */
  ruralGrainPayable: number;
  /** Gross transport revenue for FoodShipment before carrier wages and maintenance are modeled. */
  foodTransportRevenue: number;
  /** A negative balance stops all new purchases until sales restore a non-negative balance. */
  purchasesSuspended: boolean;
}

interface MarketFoodSecurityState {
  ruralFoodStressQuarters: number;
  urbanFoodStressQuarters: number;
  ruralSevereDeficitQuarters: number;
  urbanSevereDeficitQuarters: number;
}

interface FamineMortalityWeights {
  children: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
}

/** Optional culture-specific food-allocation norms; missing cultures use the global fallback. */
type FamineMortalityWeightsByCulture = Record<number, FamineMortalityWeights>;

interface FoodFlowEdge {
  fromMarketId: number;
  toMarketId: number;
  loadedVolume: number;
  arrivedVolume: number;
  travelDays: number;
  spoilageLoss: number;
  normalSecurityLoss: number;
  warSecurityLoss: number;
}

interface PopulationMigration {
  fromCellId?: number;
  fromBurgId?: number;
  toCellId?: number;
  toBurgId?: number;
  population: number;
  reason: "urbanOpportunity" | "foodShortage";
}
```

**決定**: `foodPotential`、`farmLaborRequired`、`settlementDevelopmentPotential`のような環境・人口から再計算できる派生列は保存せず、ロード時に再生成する。`foodProductivityModifier`は保存された国家・局地生産性係数から再計算する。一方、Food Ledgerの年齢別在庫・平均原価・未払金・食料ストレス、`marketTreasury`残高・買付停止状態、輸送中FoodShipment、および将来の国家・局地生産性係数はextension-ownedの保存データへ直列化し、ロード時に同じ値で復元する。これらを再生成して食料・貨幣・輸送中貨物、技術・投資の成果を失わせない。Food Ledgerを持たない旧セーブはeconomy初回有効化と同じ移行として扱い、既定の初期在庫・初期商人資本を一度だけ生成する。

**決定**: `foodPotential[cell]`は地形・気候・面積から得るセル固定の環境上限とし、人口や国家技術で正規化しない。実際の収量は§3.3の`foodProduced = cultivatedArea × yieldPerArea × foodProductivityModifier × laborCoverage`で求め、`foodProductivityModifier[cell] = stateAgriculturalProductivity[state] × cellAgriculturalModifier[cell]`とする。`foodPotential`（全耕作可能面積を耕した場合の上限）に`foodProductivityModifier`だけを掛けた値は、作付率・労働充足率を考慮しない理論上限としてのみ扱い、実収量の算出式には使わない。国家係数は技術、統治制度、治安、灌漑投資を表し、局地係数は開墾、水利、土壌疲弊、災害などを表す。v1の初期値はどちらも`1.0`とする。初期生成時に生産量を需要へ自動一致させず、Market・Stateごとの国内生産対需要比を監査・表示して不整合を検出する。

**決定**: 作付面積は播種前に年1回決める。農村・都市の年間需要と確定輸出契約を最低生産量とするが、Marketの目標在庫は生産上限にしない。耕地・労働力が許す限り作付けして余剰を生み、Food Ledgerの在庫、輸出、`storageOverflow`へ渡す。未確定の輸出入入札は作付計画に含めない。

**決定**: 年次作付では、先に`sustainableAdultOutflow`と農村非農業者を労働力から予約する。残った常住成人で耕せる面積を`laborAffordableCultivatedArea`とし、その範囲まで作付を拡大する。成人到達分として許可された通常の都市流出は、農業の最大生産方針によって取り消さない。

**決定**: v1では農業労働力をMarket内・セル間で融通せず、各セルが残った常住成人で耕せる面積まで作付する。Marketは食料在庫・流通の単位に留める。将来の労働市場では、播種・収穫期だけ都市から農村へ短期労働者を呼び、作業後に都市へ戻す季節雇用を追加する。

**決定**: v1の`ruralNonFarmWorkers`は`0`とし、農村の鉱山・伐採・運送などへ成人を推定で差し引かない。実際の資源事業・労働市場を実装してから、各事業の明示的な必要人数だけを農業労働力から控除する。

**決定**: 各セルの`laborAffordableCultivatedArea`は、`min(cultivableArea, (ruralAdultWorkers - sustainableAdultOutflow - ruralNonFarmWorkers) × workableDaysPerAdult / (laborDaysPerArea × 1.15))`で求める。成人流出を先に予約し、分母の`1.15`で農業労働の15%安全余力を残した上で、残る労働力で耕せる面積まで作付する。

**決定**: 各セルの`ruralReleasePressure`は、最低食料計画に必要な`minimumFarmAdults = minimumCultivatedArea × laborDaysPerArea × 1.15 / workableDaysPerAdult`を成人労働者から引いた正の余力とする。最大生産を理由に成人を農村へ縛らず、この余力と判定された成人到達者が通常の外部就業・開拓を目指せる。残った成人は、その後に可能な限り作付を広げて余剰を作る。

**決定**: `ruralReleasePressure`がある成人到達者は、都市の受入枠が直ちになくても村へ残さず、外部の職を探す`mobileAdultCohort`へ移す。これは、最低限の農業に必要ない若年成人が、奉公、都市就業、開拓の場を村外へ探す状態を近似する。都市に定着できない集団は、既定どおり翌年に開拓申請、野盗、死亡・域外流出へ進む。

**決定**: 国家の農業生産性は、各期に各セルの現在の所属Stateを参照して実収量へ適用する。領土移転後は次期生産から新しい国家係数を使う。征服後も残る灌漑、開墾、土壌改良などは国家係数に混ぜず、セル局地係数として後続で保持する。

**決定**: 既存`agriculturalStress`が戦争期の播種・収穫妨害から作るState `foodStress`は、`cells.capacity`やBurg容量を恒久的に削らない。翌年の実収量へ`max(0.15, 1 - 0.65 × foodStress)`を一時的な国家生産性補正として掛ける。戦争が収まれば既存の持越し分を除いて回復し、農地・人口上限を傷つける恒久的な荒廃は将来のセル局地係数として設計する。

**決定**: Food Ledgerが有効な間、既存`agriculturalStress`のState一括・直接的な飢餓死亡処理は実行しない。戦争由来の`foodStress`は収量低下だけへ使い、食料不足、移住圧、死亡はFood LedgerのMarket在庫と農村・都市別の不足率から一度だけ決める。economy無効時は既存の直接処理を維持する。Food Ledgerによる死亡は既存の人口損失集計へ`famine`として記録し、Population Overviewへ表示する。

**決定**: Food LedgerはMarket単位で農村・都市の不足率を決めるが、死亡は居住地単位で適用する。農村分は各セル、都市分は各Burgの現在の所属Stateへ`famine`死亡として記録し、Population OverviewではState別に合算する。Stateに属さない居住地は無所属枠へ集計する。Marketが複数Stateへまたがっても、食料配分の単位と死亡の政治的帰属を混同しない。

**決定**: Food Ledgerが算出した各居住地の飢餓死亡総数は、子供・男女成人・高齢者の年齢バケットへ相対比で配分する。配分比は文化ごとの`FamineMortalityWeights`として持ち、子供を優先して老人の死亡比を高める文化、老人を優先して子供の死亡比を高める文化を表現できる。未設定文化の既定比は子供`1.3`、男女成人各`1.0`、高齢者`1.2`とし、居住地の実際の年齢構成で正規化して決めた死亡総数を保存する。文化は配分比を選ぶ内部条件にだけ使い、文化別の死亡記録・集計は作らない。

**決定**: v1の`FamineMortalityWeights`はculture IDごとに一組だけ持ち、同じ文化なら農村・都市で共通に使う。国家、宗教、階層、為政者による配給差は後続で文化既定値へ重ねる上書き層として追加する。

`FoodFlowEdge`と`PopulationMigration`は履歴・デバッグ用の四半期スナップショットとして保持する。レンダラーはこれらを読むだけとし、食料・人口状態を書き換えない。

## 6. 実装フェーズ

進捗はコードとテストで確認できる状態だけを`[x]`とする。`[ ]`に補足がある項目は、設計または下位基盤のみ実装済みで、当該フェーズの完了条件はまだ満たしていない。

### Phase 0 — 暫定実装の隔離と基準テスト

- [x] 現在の`capacity`由来の食料余剰・輸入容量実装を「暫定」と明示し、新モデルに置換できる境界へ隔離する。`FoodProduction`の旧式計算は、農地列がない旧地図・テスト用の互換経路に限定した。
- [ ] 現行ワールドで、人口・市場・既存ルートを固定した再現性テストを作る。
- [x] economy無効時に`effectiveCapacity`が必ず基礎`capacity`へ戻る回帰経路を追加する。`resetEffectiveCapacities()`を無効化・輸入解決開始時に実行し、food importのテストで検証する。

**完了条件**: 旧式と新式の食料計算を同じfixtureで個別に実行でき、意図せず混在しない。

### Phase 1 — extension-owned potentialの生成

- [x] `simulation.extensions.economy`へ`foodPotential`と`settlementDevelopmentPotential`のTypedArrayを追加し、環境要因だけから決定的に生成する。
- [ ] Stateごとの国内生産対需要比を監査・表示し、国家・局地の農業生産性係数を実収量へ適用する。初期時点で人口や地図全体を基準に`foodPotential`を自動正規化しない。
- [x] 農業の初期時代を13世紀ごろの北西ヨーロッパ型とし、基準収量450 kg/ha、労働投入45日/ha、農業可能日140日/成人年、安全余力15%と決定する。
- [x] v1では季節雇用・出稼ぎ移住を個別には扱わず、15%の農業労働安全余力へ含め、労働市場モデルへ後送すると決定する。
- [x] economy有効化、マップロード、再生成時の再計算を実装する。派生キャッシュなので、旧セーブへの列追加やPackedGraphの保存形式変更は行わない。
- [ ] `agriculturalStress`の`capacity`直接削減を廃止し、State `foodStress`から一時的な食料生産性補正を適用する（設計決定済み、未実装）。
- [x] ロックされていないBurgのgroupを年1回再評価する更新点を追加する。

**完了条件**: 同一の地図環境で同じpotential配列が得られ、人口値だけを変えても`foodPotential`は変わらない。人口が変化した非ロックBurgは、次の年次評価でgroupを更新できる。

### Phase 2 — 農業労働力・市場在庫・セル生産

- [x] `cells.area × distanceScale²` を使って物理面積へ換算し、`cultivableArea`、`cultivatedArea`、面積当たり収量と成人バケットから、`farmLaborRequired`と生産量を求める。
- [ ] 初期農村人口と`cells.capacity`について、必要農地面積・最大開墾面積・`ruralFoodCapacity`の整合性監査を実装する。`ruralFoodCapacity`列は生成済みだが、監査結果の集計・警告は未実装である。capacityを食料生産の直接入力には戻していない。
- [ ] `FoodLedger`を在庫開始・終了、未充足需要、輸出可能量を含む契約へ移行する。現在は四半期の生産・需要・輸出入余力を持つが、繰越在庫と未充足需要の正規状態はまだ持たない。
- [x] v1の在庫所有者をMarket単位の共通在庫`foodStock`と決定する。Burg倉庫・農村自家備蓄・輸送中貨物への分離は後続タスクとする。
- [x] Market在庫上限を年間需要の9か月分（`annualDemand × 0.75`）と決定する。
- [x] 地図生成時・economy初回有効化時の初期在庫を年間需要の6か月分（`annualDemand × 0.5`）と決定する。
- [x] 食料の通常消費・輸出をFIFOとし、9か月の上限超過分だけを輸出候補にする方針を決定する。輸出できない超過分の施し・飼料・肥料化は後続タスクとする。
- [x] Market在庫を0〜3、3〜6、6〜9か月の3年齢バケットで管理し、古いものから消費・輸出するFIFO方式を決定する。
- [x] 四半期の生産・輸送・年齢更新と、月次FIFO消費・Grain価格・都市小売・未払金返済を組み合わせた更新順序を決定する。
- [x] 1月1日の初期在庫6か月分を`Age0`・`Age1`へ各3か月分ずつ配分し、`Age2`を空にすると決定する。
- [x] 欠乏時の農村・都市負担を、人口に対する不足率が原則同じになる方式と決定する。Market・四半期ごとの決定的な小さな揺らぎ、Character・政治による配給偏りは後続タスクとする。
- [ ] 四半期をまたぐ在庫を実装する。地図中央緯度とWorld Configuratorの赤道・極地温度による地図共通の軽い季節配分は実装済みだが、在庫繰越は未実装である。
- [ ] 旧来の`capacity × cultivation`生産式を削除する。農地列を持たない旧セーブの互換経路として当面残す。

**完了条件**: 同じ`foodPotential`でも農業労働力が不足すれば生産が下がり、必要量を満たせば人口増なしで余剰を維持できる。

### Phase 3 — 食料輸入ネットワークの置換

- [ ] `FoodFlowEdge`をloaded / arrived / lossへ拡張し、供給側在庫からのみ輸送する。現状は`volume`、腐敗減衰、治安リスクを記録し、当期の輸出余力を減らすが、出発・到着在庫の永続状態はない。
- [x] v1の輸送到着時期を、移動日数を90日単位で切り上げた四半期末到着として決定する。出発時に供給在庫を控除し、到着量は次期以降の在庫として使う。
- [x] 輸出可能量を、次四半期の最低消費量（年間需要の25%、赤道直下で約3か月分）を超えるMarket在庫に限定すると決定する。将来の商人Characterによる追加備蓄は後続タスクとする。
- [x] 既存の道路・海路、移動日数、季節閉鎖、治安リスクを再利用し、供給不足時も例外なく市場の買値順に輸入を配分すると決定する。
- [ ] 到着食料の移動平均と在庫充足率から`effectiveCapacity`を計算する。現状は当期の到着量から直接、輸入容量ボーナスを与える暫定実装である。
- [ ] 供給不足、海上封鎖、治安悪化、豊作・不作のテストを追加する。基本的な輸入・腐敗・治安リスクのテストはあるが、長期シナリオは未追加である。

**完了条件**: 供給地の食料が保存則を守り、輸送遮断後は在庫を使い切った都市だけが容量低下する。

### Phase 3.5 — 国家備蓄・開拓・軍事補給

- [ ] State首都の`stateFoodReserve`、3年齢バケット、初期半年分の軍団・既存前哨地需要、およびMarket在庫との所有分離を実装する。
- [ ] 国内Marketから首都への国家調達Shipmentと、首都から軍団・前哨地へのState補給Shipmentを実装する。通常のState調達は住民留保後・通常輸出前、国内余剰の均等配分とする。
- [ ] 軍団の30日`unitFoodReserve`、15日での補給要求、駐留地だけへの補給、食料不足による能力低下・脱走・死亡／離散を実装する。脱走兵は`banditCohort`へ合流させ、死亡・離散は軍団人数だけから減らす。この扱いはmanpower simulationの有効・無効を問わない。
- [ ] `frontierProjectSlots`を、既存前哨地の資金・食料支援を先に確保する資源制約型の年次計算へ置換し、`frontierApplicantPool`を優先編入する。
- [ ] State備蓄不足、Market余剰不足、補給中の戦争損失、Stateに首都・国内Marketがない場合を含む統合テストを追加する。

**完了条件**: State・Market・軍団・前哨地の食料が二重計上されず、軍事・開拓の規模と継続が国家の資金・食料・輸送により制限される。

### Phase 4 — 農村→都市移住

- [ ] 年齢・性別バケットを保った人口移動ユーティリティを作る。成人をBurgへ加える最小操作はあるが、セルとBurgの全人口バケットを保存する共通ユーティリティは未実装である。
- [ ] 農業労働力の安全余力と最低共同体人口を守る農村移住元選定を実装する。`migratableAdults`は計算済みだが、農村から実際に取り出す処理へ未接続である。
- [x] 通常の農村→都市就職移住を成人単独とし、農業余剰に加えて年次`sustainableAdultOutflow`で平時の農村再生産を守る方針を決定する。世帯単位の避難・開拓・結婚定住は後続イベントとする。
- [x] 通常の就職移住を同一State内に限定し、Market境界では制限しないと決定する。越境移住・難民は後続システムとする。
- [x] 年齢区分は既存の子ども・男女成人・高齢者の4区分を維持し、`sustainableAdultOutflow`の原資を当年の子ども→成人到達人数、男女配分を同じ到達比率と決定する。
- [x] 都市雇用が即時にない成人単独移住者も農村へ戻さず、近隣都市を探す`mobileAdultCohort`として扱うと決定する。
- [x] 徒歩圏内の最大三都市を、残り雇用枠、`settlementDevelopmentPotential`、距離の順で順位付けして移住先を選ぶと決定する。
- [x] `settlementDevelopmentPotential`を当面は移住先順位だけに用い、年次`urbanLaborIntake`総量は既存の暫定式を維持すると決定する。実雇用量の`employmentDemand`は後続フェーズとする。
- [x] 未就職者の開拓申請を既存`FrontierExpansion`へ渡し、食料・耕地・同一State内の到達可能性を満たす場合だけ定着させると決定する。
- [x] 野盗の農村略奪を出身Marketの共通在庫へ適用し、`Age0`・`Age1`・`Age2`からランダムに奪うと決定する。略奪は四半期に一度、野盗成人数の一四半期分の食料を上限とすると決定する。
- [x] 略奪不足の野盗集団を、5%で弱体化、10%の二期連続不足から`banditAdults × shortfallRate × 0.10`の死亡・離散で縮小すると決定する。
- [x] 輸入不足Marketの通常目標在庫を、当期消費後の年間需要6か月分と決定する。
- [x] Food Ledgerの輸入代金をMarket自身の貨幣残高から支払い、新規地図・旧セーブ移行時とも一度だけ独立した初期商人資本を与え、Burg人口比負担は行わないと決定する。
- [x] 食料輸入の代金を輸出元Marketの貨幣残高へ全額移し、生産者・Burgへの収益分配は後続課題へ分離すると決定する。
- [x] `marketTreasury`をFood Ledgerの市場間食料取引に限る独立会計として先行導入し、一般Goods・農村生産者への決済は後続課題へ分離すると決定する。
- [x] 新規地図・旧セーブ移行時の初期商人資本を、初回生産後の所属Burg treasury合計に0.5〜1.0の決定的係数を掛けて生成し、Burg treasuryからは移転しないと決定する。
- [x] Food Ledgerだけの段階で輸入依存Marketの残高が尽きた時は、人工補充せず食料輸出等の収入まで輸入不能と決定する。
- [x] Food Ledger輸入の卸入札額を`max(0, 都市小売価格 × 0.8 - 単位輸送費)`とし、輸入側に20%の地域内マージンを残すと決定する。
- [x] 通常輸出は買い手の卸入札額が輸出元の地元仕入れ相当額（都市小売価格の80%）以上の場合だけ成立すると決定する。
- [x] `storageOverflow`だけは通常輸出の地元価格下限を外し、輸送費を回収できる安値での輸出を許可すると決定する。
- [x] 同一四半期のFoodShipmentをMarketごとの純受取・純支払で一括清算し、負残高は取消・再配分せず買付停止とダイアログ警告で扱うと決定する。
- [x] Food Ledgerの消費後に輸出留保3か月分を超える主食余剰を一般GoodsのGrain在庫として取引可能にし、その市場価格を輸入入札・決済へ使うと決定する。
- [x] Food Ledgerの3年齢バケットを主食物量の唯一の正本とし、一般GoodsのGrain stockは取引可能余剰の同期ビュー、売買時はFood LedgerをFIFO控除すると決定する。
- [x] Food Ledgerが有効な間は`stapleFood`（v1はGrain）を既存の月次生産・Burg需要充足・一般Goods市場間交易から除外し、Food Ledgerを唯一の主食処理経路にすると決定する。既存`food`タグの非主食Goodsは従来経路に残す。
- [x] v1では`stapleFood`以外のGoodsをFood Ledgerの人口需要・飢餓判定へ換算せず、代替カロリーの栄養モデルは後続課題へ分離すると決定する。
- [x] Cattleはv1ではFood Ledger外の一般Goodsとして維持し、役牛と食肉・畜産物の分離および農耕・輸送力への接続は後続課題へ分離すると決定する。
- [x] Grain価格を、直近確定在庫と次の主収穫期までの予定生産・需要、戦争・治安補正を見込んで月次更新し、通常の需給要因は平時基準の0.8〜2.0倍へ制限すると決定する。
- [x] 価格見通しの予定供給を、現在庫・確定地域生産・到着確定FoodShipmentに限定し、未確定輸入要求を除外すると決定する。
- [x] Grainの既存`value = 1`を全Market共通の平時基準価格とし、地域差は需給・危機・輸送要因で表すと決定する。
- [x] Grain価格を戦時経済・封鎖・戦争由来の治安崩壊時だけ最大4倍とし、最終都市小売価格へ上限を適用すると決定する。
- [x] 危機係数を既存の戦争強度、封鎖、戦争由来の経路治安損失から決定的に求め、複数要因は最大値で合成すると決定する。
- [x] 封鎖をFood Ledgerの`marketBlockadeSeverity`として明示し、戦争・外交システムだけが設定する将来拡張点と決定する。
- [x] FoodShipmentの戦争起因損失を分離記録し、直近3か月の実損失率から戦時治安係数を求めると決定する。
- [x] 環境由来の派生列はロード時に再生成し、Food Ledger・Market残高・輸送中FoodShipmentは保存時点の値を復元すると決定する。
- [x] 国家の農業生産性は各セルの現在の領有Stateを毎期参照し、征服後も残る農業基盤はセル局地係数へ分離すると決定する。
- [x] Food Ledger有効時は既存のState一括飢餓死亡を停止し、Food Ledger由来の死亡だけを`famine`としてPopulation Overviewへ記録すると決定する。
- [x] Food Ledgerの飢餓死亡を文化別の年齢バケット配分比で割り振り、未設定文化には子供1.3・成人1.0・高齢者1.2の既定比を使うと決定する。
- [x] v1の飢餓死亡配分はculture IDごとに一組とし、農村・都市の差や国家・宗教・階層の上書きは後続に分離すると決定する。
- [x] 通常時のGrain都市小売価格の下限を平時基準の0.8倍とし、0.5倍への下落は将来の明示的な豊作補正だけに限定すると決定する。
- [x] 四半期重みが完全に均等な赤道型マップでは主収穫期を置かず、当期・次期のローリング供給予測でGrain価格を決めると決定する。
- [x] Food Ledgerの各年齢バケットへ平均仕入れ単価を持たせ、都市小売の粗利益をFIFOで取り出した在庫原価と当月小売価格の差額で記録すると決定する。
- [x] 農村からMarketへ入るGrainの仕入れ値を当月都市小売価格の80%とし、市場間輸送費・護衛費・略奪損失は別原価として後続に分離すると決定する。
- [x] 農村Grainの仕入れはMarket残高から即時に支払える分を支払い、残額を`ruralGrainPayable`としてMarket側に記録すると決定する。
- [x] 都市小売・食料輸出のMarket収入は、次の食料輸入より`ruralGrainPayable`の返済を優先すると決定する。
- [x] FoodShipmentの輸送費を輸入MarketがGrain代金へ上乗せして負担し、輸出Marketの輸送収入へ移すと決定する。
- [x] FoodShipment初期版の輸送費に既存の距離比例費・日数比例維持費を使い、後続では経路単位の便・固定費・積載容量へ一般Goods交易と統合してGrainを相乗り可能にすると決定する。
- [x] FoodShipmentの距離比例運賃へ、陸路1.0・河川0.5・海運0.125の輸送モード係数を掛けると決定する。
- [x] 輸入GrainはGrain代金と輸送費の合計を実到着量で割った原価でAge0へ入り、全損額は`foodTransportLoss`として記録すると決定する。
- [x] 食料余力・都市容量・年次`annualUrbanLaborIntake`の残枠から移住先Burgを選ぶ下位基盤を実装する。受入枠はBurg人口の年率2%を基礎とし、State単位の好況・不況とBurgごとの小変動で年一回決める。
- [x] 近隣の最大三都市でも受入枠を得られない`mobileAdultCohort`を解決する基盤を実装する。一年後の未就職者は開拓申請35%、野盗25%、死亡・域外流出40%へ配分する。ただし、農村余剰をこのキューへ投入する処理は未実装である。
- [x] 野盗集団の`banditPressure`を既存`TradeSecurity`へ接続し、隊商損失を増やす。Food Ledger導入後の出身地以外の農村在庫略奪は未実装である。
- [ ] `settlementDevelopmentPotential`を移住先と新Burg昇格候補の順位付けへ接続する。現状は年次Burg group再評価のみで、候補順位には未接続である。
- [ ] 移住量の上限、同一State/Market制約、移住履歴を実装する。都市受入側の同一State・最大三都市制約はあるが、実際の農村移住と履歴は未実装である。

**完了条件**: 食料生産を維持したまま農村人口が減り、年次受入枠を得たBurgだけが出生だけより速く増える。未就職者は人口複製・消滅を起こさず、漂泊・開拓・野盗・死亡のいずれかへ記録される。

### Phase 5 — 都市→農村流出と飢饉

- [ ] 都市の10%以上の不足が三期連続した時だけ、空き容量・農業労働力不足の農村セルへ世帯単位の避難を試みる。
- [ ] 避難受入れをMarket在庫でなく次収穫のセル生産余力から判定し、再現可能なセル別受入判定、受入れの疫病リスク、拒否・排除時の避難民損失を実装する。
- [ ] 受入先がない残余だけを飢餓死亡へ渡す。
- [ ] 封鎖・戦争・季節閉鎖の長期シナリオをE2Eまたは統合テストにする。
- [ ] Food Ledger由来の飢餓死亡がPopulation Overviewの`famine`へ正しく集計・表示される統合テストを追加する。
- [x] 5%以上の不足を食料ストレス・移住圧、10%以上の不足が同じ部門で二期連続した場合を飢餓死亡候補とする二段階を決定する。死亡四半期は`population × shortfallRate × 0.10`を適用する。
- [x] 重度不足の連続カウンタを10%未満で、食料ストレスを5%未満でそれぞれ即時リセットする回復規則を決定する。
- [x] 食料危機時の都市→農村流出は、元の年齢・性別構成を保つ世帯単位の避難として扱うと決定する。

**完了条件**: 補給停止都市は人口流出を経て縮小し、全員の即時死亡や人口複製を起こさない。

### Phase 6 — UI・可視化・バランス

- [ ] Burg詳細に、基礎容量、輸入由来容量、在庫日数、輸入依存度、直近の流入・流出を表示する。
- [ ] Market画面に生産、消費、在庫、輸出・輸入、未充足需要を表示する。
- [ ] `marketTreasury.balance`が負になったMarketについて、買付停止、負残高の原因、回復に必要な販売収入をMarketダイアログで警告する。
- [ ] デバッグレイヤーで`FoodFlowEdge`と`PopulationMigration`を描画する。WebGL hybridでは既存のtrade overlay方針に従う。
- [ ] seed固定の人口曲線を比較し、地域別の都市規模・飢饉頻度・移住速度を調整する。

## 7. 不変条件とテスト観点

- 食料は生産・在庫・輸送損失・消費の間で保存される。負の在庫は作らない。
- 人口移住は出発元と到着先の人口・年齢・性別バケットを保存する。
- 農村→都市移住後も農業労働力の安全余力を下回らない。
- economy無効時は新しい食料・移住tickを実行せず、coreの既存人口挙動に戻る。
- `foodPotential`は人口変化で変わらず、環境再生成・明示的な技術/災害補正だけで変わる。
- rendererは`foodPotential`、食料台帳、フロー、移住履歴を変更しない。
- 保存・読込後、同じ四半期から同じ食料・人口結果を再現できる。

## 8. 将来の拡張

- Market在庫の上限超過食料を、貧民への施し、不満低下・治安回復、畜産飼料、堆肥による農地還元へ振り分ける。v1では`storageOverflow`の記録のみとする。
- Character拡張の商人・市場管理者が、性格、予見、政治状況から`exportReserve`を上積みする備蓄行動を導入する。
- FoodShipmentと一般Goods交易を、経路単位の便・固定出航費・積載容量・貨物別容量占有へ統合する。高価値貨物が出航費の大半を負担した便へGrainを相乗りさせ、Grain単独便は全固定費を負担する。運賃の固定費配分は品目価格でなく重量・嵩・容量占有を使う。
- FoodShipmentと一般Goodsをまたぐ債権・証券システムを導入し、支払期日、相殺、商人信用、国家保証、負残高の解消手段および戦時の信用収縮を表現する。v1では負残高のMarketは買付停止として扱う。
- 野盗、害獣、戦争、季節・地形を共通に扱う人員移動の経路危険システムを導入する。避難民、開拓民、通常移住者、隊商の損失へ接続し、v1の避難世帯固有の距離・扶養者移動損失と重ねて扱う。
- 性病を含む都市の接触感染を、職業、貧困、居住密度、移動履歴と接続した後続の疫病システムとして導入する。v1の`urbanSexWorkInflow`は感染状態・伝播を持たない履歴に留める。
- Burg・農村世帯・軍隊・輸送中へ食料在庫を分離した後、軍隊の現地Market購入、徴発、都市・農村略奪、採集・飼料調達を導入する。現在のMarket共通在庫を都市略奪の対象にしない。
- 軍馬・役畜の飼い葉、弓矢・弩矢・火薬などの弾薬、武器・装備の消耗品を別Goodsとして導入し、騎兵・輸送隊・軍団行動の継続コストへ接続する。

`getUrbanConcentrationBonus(burgId)`は、次の技術・文化システムが利用できる形で提供する。

```ts
export function getUrbanConcentrationBonus(burgId: number): {
  importDependencyRatio: number;
  populationBeyondBaseCapacity: number;
  nonAgriculturalPopulation: number;
};
```

食料輸入に支えられる人口と農村から移住した非農業人口は、職人、学者、芸術家、行政、軍事動員の母集団になり得る。具体的な技術・文化ポイント式は別計画で設計する。

## 9. 後続で精密化する事項

v1の実装開始を止める未決定事項は残さない。次の項目は上記の暫定既定値で進め、対応する上位システムを導入する時にだけ置換する。

- 国家農業生産性は、v1では全State `1.0`から始め、戦争由来の`foodStress`だけを一時減衰として適用する。技術、制度、治安、灌漑投資が実装された時点で、それぞれが明示的なState係数またはセル局地係数を更新する。
- 越境移住・難民は、国境管理、外交・戦争状態、道路・港の到達性、移動費、受入側の政治判断を持つ独立フェーズとして追加する。v1は同一State制約を維持する。
- 都市吸引力は、まず明示的な`employmentDemand`（資源採掘、港湾、水運、交易、行政、首都機能）の合計で`urbanLaborIntake`を置換する。賃金、地代、階層、Characterの選好はその後に追加する。
- 主食はFood Ledgerが成熟するまでGrainだけを`stapleFood`として扱う。魚・肉・油脂などの代替カロリー、作物別の収穫暦・腐敗率、家畜飼料は、品目別栄養・世帯在庫モデルを導入する段階で分離する。
