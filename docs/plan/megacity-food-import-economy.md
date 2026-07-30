# 大都市経済モデル: 独立した食料生産・輸入・都市化

## 0. 決定記録

**2026-07-30 改訂**: 本計画は、`cells.capacity`から食料生産を直接導く案を採用しない。代わりに、地形・気候・水利から決まる独立した`foodPotential`を導入する。また、食料生産に必要な農業人口を残して、余剰の農村人口がBurgへ移住できる仕組みと、都市の食料不足時に農村へ戻る人口流出を実装対象に含める。

**2026-07-30 追記**: `foodPotential`と`settlementDevelopmentPotential`はcoreの`pack.cells`には追加しない。economy拡張が所有する`simulation.extensions.economy`のセルID直結`Float32Array`として、地図の環境データから決定的に再生成する。これは拡張専用の派生キャッシュであり、coreのPackedGraphスキーマを増やさない。

**実装状況**: Phase 1を開始済み。potential列の生成・再生成と、非ロックBurgの年次group再評価は実装した。食料台帳の置換、移住、昇格候補へのpotential接続は後続Phaseで行う。

この決定により、食料輸入は「未使用の農村人口上限を都市へ振り替える」仕組みではなく、後背地の生産力・農業労働力・在庫・輸送網が実際に都市人口を支える仕組みになる。

本書は設計・実装計画である。Phase 1の基盤実装は本改訂と同時に開始し、以降のPhaseはこの契約を満たす順序で進める。

## 1. 目的

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
| `foodProductivityModifier[cellId]` | economy simulation | 倍率 | 水利、技術、戦禍、洪水、干ばつ、開墾などの動的補正。 |
| `farmLaborRequired[cellId]` | economy simulation | 成人労働者ポイント | 当期の`cultivatedArea`を維持・収穫するために必要な農業労働力。人口比からは導かない。 |
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
             × waterAccessModifier
             × terrainModifier
             × baseAgriculturalTechnology
```

- `usableLandArea`: セル面積から水域・極端な高地・不毛地を除いた土地面積。
- `initialCroplandShare`: `forestCover`、湿地・氾濫林などから決める初期の耕地比率。開墾で変化する余地を残し、森林だけで将来の発展を永久に否定しない。
- `grainTemperatureFactor` / `precipitationFactor`: 年平均温度と降水から得る穀物生産適性。降水は少雨で減衰し、十分な値で飽和する。
- `waterAccessModifier`: 河川流量、湖、沿岸低地などによる水利・沖積地の補正。
- `terrainModifier`: 高度・急峻さ・土壌悪化の減衰。
- `baseAgriculturalTechnology`: 時代・世界設定による全体係数。後の技術システムの接続点。

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
- 初期校正では結果として成人労働力の70〜80%級が農業へ配分される範囲を目標にするが、この比率を移住計算の固定入力にはしない。
- 初期v1では規模の経済・作物別季節性を持ち込まず、四半期重みと一律の`"food"`タグを維持する。作物別の腐敗・収穫暦は後続課題とする。

この分離により、農村人口が`cells.capacity`未満でも十分な農業労働力に達していれば、安定した余剰が生まれる。また、技術・水利・戦争が`foodProductivityModifier`を変えれば、人口を変えずに生産力だけが変化する。

### 3.4 在庫、消費、輸送

Marketごとに四半期台帳を次の順で解決する。

1. 各セルの`foodProduced`を市場へ集計する。
2. 農村消費、都市消費、前期在庫、目標在庫を差し引く。
3. 残量だけを`exportable`とし、在庫不足を`importNeed`とする。
4. 需要側を既存の`Markets.customerBuyPrice`で優先し、供給側の残量制約下で割り当てる。
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

移住は自然出生とは別の人口移動であり、同一State・同一Market内から開始する。v1では越境移住や難民は扱わない。

移住元セルは、移住後にも次を満たす場合だけ候補にする。

```text
remainingFarmLabor >= farmLaborRequired × farmLaborReserveRatio
remainingPopulation >= minimumRuralCommunityPopulation
```

移住先Burgは以下をすべて満たす必要がある。

- `population < effectiveCapacity × urbanMigrationTargetRatio`
- 市場への食料供給が安定している
- 首都、港、plaza、既存の生産・交易需要など、都市吸引力がある

候補者は年齢・性別バケットを壊さずに移す。家族単位を近似するため、成人だけでなく対応する子ども・高齢者も同じ比率で移動する。`cells.pop`とBurgの`population`、双方のdemographicsバケットを同一操作で更新し、人口を複製・消滅させない。

移住量は、農村の余剰労働力、都市の空室、到着食料の余力の最小値とする。さらに年あたりの最大移住率を設け、単一tickで村が消滅しないようにする。

### 4.2 都市から農村への人口流出

食料到着量や在庫が低下して`population > effectiveCapacity`になった場合、既存の飢餓処理の前に人口流出を試みる。

- 移住先は、同一State・同一Marketを優先する農村セルとする。
- 空き人口容量があり、かつ`farmLaborRequired`を満たしていないセルを最優先する。
- 流出者は都市から農村へ年齢・性別バケットごとに移す。
- 受入先がない、または食料不足がState全域に及ぶ残余だけを既存の飢餓・死亡処理に渡す。

これにより、港湾封鎖や戦争で補給が断たれた大都市は「全員が即座に死亡する」のではなく、まず後背地へ人口を失い、それでも支えられない部分で飢饉になる。

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

## 5. データ契約

```ts
// Economy simulation slice: dynamic and extension-owned
interface EconomyFoodCellColumns {
  foodPotential: Float32Array;
  foodProductivityModifier: Float32Array;
  farmLaborRequired: Float32Array;
  settlementDevelopmentPotential: Float32Array;
}

interface FoodLedger {
  foodProduced: number;
  ruralNeed: number;
  urbanNeed: number;
  stockStart: number;
  stockEnd: number;
  targetStock: number;
  exportable: number;
  importNeed: number;
  satisfiedImport: number;
  importCapacityBonus: number;
  unmetNeed: number;
}

interface FoodFlowEdge {
  fromMarketId: number;
  toMarketId: number;
  loadedVolume: number;
  arrivedVolume: number;
  travelDays: number;
  spoilageLoss: number;
  securityLoss: number;
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

`FoodFlowEdge`と`PopulationMigration`は履歴・デバッグ用の四半期スナップショットとして保持する。レンダラーはこれらを読むだけとし、食料・人口状態を書き換えない。

## 6. 実装フェーズ

### Phase 0 — 暫定実装の隔離と基準テスト

- 現在の`capacity`由来の食料余剰・輸入容量実装を「暫定」と明示し、新モデルに置換できる境界へ隔離する。
- 現行ワールドで、人口・市場・既存ルートを固定した再現性テストを作る。
- economy無効時に`effectiveCapacity`が必ず基礎`capacity`へ戻る回帰テストを追加する。

**完了条件**: 旧式と新式の食料計算を同じfixtureで個別に実行でき、意図せず混在しない。

### Phase 1 — extension-owned potentialの生成

- `simulation.extensions.economy`へ`foodPotential`と`settlementDevelopmentPotential`のTypedArrayを追加し、環境要因だけから決定的に生成する。
- 初期値を現行人口・気候帯別に正規化する。
- economy有効化、マップロード、再生成時の再計算を実装する。派生キャッシュなので、旧セーブへの列追加やPackedGraphの保存形式変更は行わない。
- `agriculturalStress`は`capacity`を直接減らすだけでなく、食料生産性を一時的に下げる補正へ移行する設計を確定する。
- ロックされていないBurgのgroupを年1回再評価する更新点を追加する。

**完了条件**: 同一の地図環境で同じpotential配列が得られ、人口値だけを変えても`foodPotential`は変わらない。人口が変化した非ロックBurgは、次の年次評価でgroupを更新できる。

### Phase 2 — 農業労働力・市場在庫・セル生産

- `cultivableArea`、`cultivatedArea`、面積当たり収量と成人バケットから、`farmLaborRequired`と生産量を求める。
- `FoodLedger`を在庫開始・終了、未充足需要、輸出可能量を含む契約へ移行する。
- 四半期をまたぐ在庫を実装し、季節性の既存重みを適用する。
- 旧来の`capacity × cultivation`生産式を削除する。

**完了条件**: 同じ`foodPotential`でも農業労働力が不足すれば生産が下がり、必要量を満たせば人口増なしで余剰を維持できる。

### Phase 3 — 食料輸入ネットワークの置換

- `FoodFlowEdge`をloaded / arrived / lossへ拡張し、供給側在庫からのみ輸送する。
- 既存の道路・海路、移動日数、季節閉鎖、治安リスク、価格優先を再利用する。
- 到着食料の移動平均と在庫充足率から`effectiveCapacity`を計算する。
- 供給不足、海上封鎖、治安悪化、豊作・不作のテストを追加する。

**完了条件**: 供給地の食料が保存則を守り、輸送遮断後は在庫を使い切った都市だけが容量低下する。

### Phase 4 — 農村→都市移住

- 年齢・性別バケットを保った人口移動ユーティリティを作る。
- 農業労働力の安全余力と最低共同体人口を守る農村移住元選定を実装する。
- 食料余力・都市容量・年次`annualUrbanLaborIntake`の残枠から移住先Burgを選ぶ。受入枠はBurg人口の年率1〜3%を基礎とし、State単位の好況・不況とBurgごとの小変動で年一回決める。
- 近隣の最大三都市でも受入枠を得られない成人を`mobileAdultCohort`へ入れる。一年後も未就職なら、開拓申請、野盗集団、餓死・域外流出へ集計配分する。
- 野盗集団の`banditPressure`を既存`TradeSecurity`へ接続し、隊商損失を増やす。Food Ledger導入後は出身地以外の農村在庫略奪にも接続する。
- `settlementDevelopmentPotential`を移住先と新Burg昇格候補の順位付けへ接続する。
- 移住量の上限、同一State/Market制約、移住履歴を実装する。

**完了条件**: 食料生産を維持したまま農村人口が減り、年次受入枠を得たBurgだけが出生だけより速く増える。未就職者は人口複製・消滅を起こさず、漂泊・開拓・野盗・死亡のいずれかへ記録される。

### Phase 5 — 都市→農村流出と飢饉

- 食料不足都市から、空き容量・農業労働力不足の農村セルへ人口を戻す。
- 受入先がない残余だけを飢餓死亡へ渡す。
- 封鎖・戦争・季節閉鎖の長期シナリオをE2Eまたは統合テストにする。

**完了条件**: 補給停止都市は人口流出を経て縮小し、全員の即時死亡や人口複製を起こさない。

### Phase 6 — UI・可視化・バランス

- Burg詳細に、基礎容量、輸入由来容量、在庫日数、輸入依存度、直近の流入・流出を表示する。
- Market画面に生産、消費、在庫、輸出・輸入、未充足需要を表示する。
- デバッグレイヤーで`FoodFlowEdge`と`PopulationMigration`を描画する。WebGL hybridでは既存のtrade overlay方針に従う。
- seed固定の人口曲線を比較し、地域別の都市規模・飢饉頻度・移住速度を調整する。

## 7. 不変条件とテスト観点

- 食料は生産・在庫・輸送損失・消費の間で保存される。負の在庫は作らない。
- 人口移住は出発元と到着先の人口・年齢・性別バケットを保存する。
- 農村→都市移住後も農業労働力の安全余力を下回らない。
- economy無効時は新しい食料・移住tickを実行せず、coreの既存人口挙動に戻る。
- `foodPotential`は人口変化で変わらず、環境再生成・明示的な技術/災害補正だけで変わる。
- rendererは`foodPotential`、食料台帳、フロー、移住履歴を変更しない。
- 保存・読込後、同じ四半期から同じ食料・人口結果を再現できる。

## 8. 将来の拡張

`getUrbanConcentrationBonus(burgId)`は、次の技術・文化システムが利用できる形で提供する。

```ts
export function getUrbanConcentrationBonus(burgId: number): {
  importDependencyRatio: number;
  populationBeyondBaseCapacity: number;
  nonAgriculturalPopulation: number;
};
```

食料輸入に支えられる人口と農村から移住した非農業人口は、職人、学者、芸術家、行政、軍事動員の母集団になり得る。具体的な技術・文化ポイント式は別計画で設計する。

## 9. 未解決事項

- `foodPotential`を地図生成時にどの程度地域差へ正規化するか。
- 初期時代・地域をどこに置き、`laborDaysPerArea`と成人一人当たりの年間農業可能日をどう絶対校正するか。季節雇用をv1に含めるか。
- 市場圏を跨ぐ農村→都市移住と、難民・越境移住をいつ導入するか。
- 都市吸引力に雇用・賃金・政治的首都補正をどの順序で導入するか。
- 食料を単一`"food"`タグのままにする期間と、穀物・魚・肉の腐敗差を導入する時期。
