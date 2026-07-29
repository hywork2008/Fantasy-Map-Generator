# 大都市経済モデル: 食料輸入によるキャパシティ突破

## 1. 課題

現在、セルおよびBurg(都市)の人口には生成時に決まる固定の上限(`capacity`)があり、これは周辺のセルの状態と一切連動しない。そのため、地形・気候的に豊かでない土地でも交易・政治・産業の中心地として爆発的に人口を集める「東京(江戸)」「ローマ」「ロンドン」のような大都市が生まれ得ない。

現実の歴史では、大都市は自セルの食料生産力ではなく、後背地・遠隔地からの食料調達力によって人口上限を突破してきた。

- **江戸**: 関東平野の生産力だけでは支えられない人口(最盛期100万人超)を、東廻り航路・西廻り航路による廻米(かいまい)、および参勤交代に伴う消費集中で維持した。
- **古代ローマ**: アノナ(Annona)と呼ばれる国家運営の穀物供給制度により、エジプト・北アフリカ・シチリアからの海上輸送でローマ市民に穀物を配給し、100万人規模の都市を維持した。
- **近世ロンドン**: 沿岸海運によるノーフォーク・イングランド東部からの穀物輸送とニューカッスルからの石炭輸送が都市成長を支えた。

本ドキュメントは、この「後背地からの食料調達による人口上限突破」を本フォークの都市成長シミュレーションに組み込む設計を提案する。将来的にはこの「身の丈を超えた人口集中」を技術開発・文化芸術発展の下地として使う拡張ポイントも合わせて設計する。

## 2. 現状の実装分析

### 2.1 人口上限(capacity)の決定式

セルの人口上限は`src/main.ts`の`rankCells()`で生成時に一度だけ計算される。

```ts
// src/main.ts:1731-1758 (rankCells)
let score = biomesData.habitability[packCells.biomeCode[i]];   // biome
if (meanFlux) score += normalize(packCells.fl[i] + packCells.conf[i], meanFlux, maxFlux) * 250; // river flux
score -= (packCells.h[i] - 50) / 5;                            // elevation penalty
if (packCells.t[i] === 1) { /* coastal: estuary / lake / harbor bonus */ }
packCells.s[i] = score / 5;                                    // suitability
packCells.capacity[i] = packCells.s[i] > 0 ? (packCells.s[i] * packCells.area[i]) / meanArea : 0;
```

Burgの人口上限は`src/generators/burgs-generator.ts`の`Burgs.definePopulation()`で、同じ`suitability`スコアに首都補正・接続性補正をかけて決まる。

```ts
// src/generators/burgs-generator.ts:698-713
let population = pack.cells.s[cellId] / 5;
if (burg.capital) population *= 1.5;
const connectivityRate = Routes.getConnectivityRate(cellId); // road/trail/searoute density
if (connectivityRate) population *= connectivityRate;
population *= gauss(1, 1, 0.25, 4, 5);
const capacity = rn(Math.max(population, 0.01), 3);           // burg.demographics.capacity
```

どちらも**生成時に一度だけ決まる固定スカラー**であり、周辺セルの生産余剰や交易網の状態には一切依存しない。

### 2.2 成長シミュレーションのギャップ

`src/generators/demography-simulator.ts`の`simulateDemographics()`は、`capacity`をロジスティック成長のK値として使う。

```ts
const roomForGrowth = capacity > 0 ? Math.max(-0.5, 1 - currentTotal / capacity) : 0;
```

ここで、**農村セルとBurgで挙動が非対称**になっている。

- 農村セル: `roomForGrowth < 0`(過密)の場合、同一State内の隣接セルへ余剰人口を移住させる経路(`bestNeighbor`探索)がある。
- Burg: 過密になっても移住先がなく、`starvationRate`でそのまま餓死するだけ。

つまり「都市が自セルの上限を超えて成長する」ための経路が構造的に存在しない。これが本ドキュメントで埋めるべきギャップである。

`docs/simulation/population-dynamics.md`もこのロジスティックK・農村スピルオーバーモデルを前提として書かれており、食料輸入による上限突破には触れていない。

### 2.3 economy拡張の食料台帳(未接続)

`src/extensions/economy/generators/foodProduction.ts`の`FoodProductionModule.generateQuarterlyLedger()`は、Market(交易拠点Burgを中心としたセル・Burgの商圏)ごとに食料の需給を集計している。

```ts
// src/extensions/economy/generators/foodProduction.ts:36-72
const rural = pack.cells.pop[cellId] * populationRate;
const capacity = pack.cells.capacity[cellId] * populationRate;
const saturation = capacity > 0 ? rural / capacity : 0;
const cultivation = minmax(0.25 + 0.75 * saturation, 0.25, 1);
annualFoodProduced += capacity * GROSS_FOOD_NEED * cultivation; // GROSS_FOOD_NEED = 0.43
...
const foodBalance = ruralSurplus - urbanNeed;
const exportable = rn(Math.max(0, foodBalance) * RURAL_MARKETABLE_SHARE, 2); // 0.7
const importNeed = rn(Math.max(0, -foodBalance), 2);
market.foodLedger = { foodProduced, ruralNeed, urbanNeed, exportable, importNeed, targetStock };
```

これは本ドキュメントが必要とする仕組みにほぼそのまま使える土台だが、**`importNeed`と`exportable`はどこからも消費されていない**(リポジトリ全体をgrepしても型定義と自分自身以外に参照がない)。つまり「食料が足りないMarket」も「食料が余っているMarket」も計算だけはされているのに、両者の間で実際に食料を動かす仕組みも、輸入が満たされたときに人口上限へフィードバックする仕組みも存在しない。

### 2.4 capacity可変の既存前例

`src/generators/agriculturalStress.ts`の`applyCapacityScar()`は、戦争による農地荒廃で`cells.capacity`と`burg.demographics.capacity`を**年最大8%減少させる**。これは「capacityは生成時固定値ではなく動的に変化しうる」という前例であり、本設計はこれを逆方向(増加方向)に拡張するものと位置づけられる。ただし現状は減少方向のみで、増加させる仕組みはまだない。

### 2.5 再利用可能な物流基盤

以下がすでに実装されており、食料輸送網の実装にそのまま使える。

- `src/generators/landRouteGraph.ts` / `seaRouteGraph.ts`: Dijkstraベースの陸路・海路グラフ(`findLandRouteDistance`, `findReachableLandCells`, `findLandRoutePath`など)。季節closure(冬季閉鎖)も考慮済み。
- `src/extensions/economy/generators/markets-generator.ts`: MarketはBFS/優先度キューでハブBurgを中心に広がる商圏(セル・Burgの集合)としてすでにモデル化されている。
- `src/extensions/economy/generators/caravans.ts` / `caravanMovement.ts`: 陸海の実キャラバンが役畜種別・季節・グレードを考慮して物理的に移動するシミュレーションがすでにある。
- `src/extensions/economy/generators/tradeSecurity.ts`: 海賊・盗賊リスクによる交易減衰。
- `src/extensions/economy/controllers/marketTradeOpportunities.ts`: Market間の価格差から利益機会を探す既存ロジック(距離・輸送コストの計算式を含む)。

つまり「食料タグ付きGoodの需給台帳」「商圏としてのMarket」「実輸送シミュレーション」「距離・治安による減衰」は個別にはすべて存在しており、欠けているのは**それらを繋いでcapacityにフィードバックするループ**だけである。

## 3. 提案設計

### 3.1 コンセプト: baseCapacity と effectiveCapacity

- `cells.capacity[i]` / `burg.demographics.capacity` は**そのセルの土地生産力のみで決まる上限**として現状のまま維持する(baseCapacityとしての意味を保つ)。`agriculturalStress.ts`による戦禍スカーもこれを対象に据え置く。
- 新たに`burg.demographics.effectiveCapacity`をWorldContext側(coreのpackスキーマ)に追加する。デフォルト値は`capacity`と同一。economy拡張が有効な場合のみ、食料輸入ネットワークの解決結果でこれを`capacity`以上に引き上げる。
- `demography-simulator.ts`のロジスティック成長は、Burgに対しては`capacity`ではなく`effectiveCapacity`をK値として読む(農村セルは現状通り`capacity`のまま — スピルオーバー機構は温存)。

この分離により、economy拡張が無効な場合は`effectiveCapacity === capacity`で完全に現状動作へフォールバックする。coreはeconomy拡張の存在を一切知る必要がなく、「core所有のフィールドをeconomy拡張が条件付きで書き込む」という既存の`pack`/`grid`書き込みルール(AGENTS.md §1のGenerator層の権限)の範囲内に収まる。

### 3.2 データモデル拡張

```ts
// src/extensions/economy/generators/foodProduction.ts の MarketFoodLedger を拡張
export interface MarketFoodLedger {
  foodProduced: number;
  ruralNeed: number;
  urbanNeed: number;
  exportable: number;
  importNeed: number;
  targetStock: number;
  // 追加:
  satisfiedImport: number;      // このtickで実際に輸送された食料量(0..importNeed)
  importCapacityBonus: number;  // satisfiedImportを人口換算した値(GROSS_FOOD_NEEDの逆算)
}
```

```ts
// 新規: src/extensions/economy/generators/foodImportNetwork.ts
export interface FoodFlowEdge {
  fromMarketId: number;
  toMarketId: number;
  volume: number;        // 輸送された食料量
  travelDays: number;    // tradeRouteDuration.ts の既存計算を再利用
  spoilageDecay: number; // 0..1、距離減衰
  securityRisk: number;  // tradeSecurity.ts の既存計算を再利用
}

export function resolveFoodImportNetwork(worldContext: Readonly<WorldContext>): FoodFlowEdge[];
```

### 3.3 食料輸入ネットワークの解決アルゴリズム

`resolveFoodImportNetwork()`は、既存の`foodLedger`が計算された後(quarterly ledgerの後段)に実行する。

1. `importNeed > 0`のMarket(需要側)と`exportable > 0`のMarket(供給側)を洗い出す。
2. 各需要側Marketについて、`landRouteGraph`/`seaRouteGraph`の距離を使い、一定の実効輸送コスト(後述)内で到達可能な供給側Marketを列挙する。
3. 割当ポリシー: 価格優先。`Markets.customerBuyPrice`が高い(=切実に必要としている、または裕福な)需要側Marketから優先的に供給側の`exportable`を割り当てる。これは`marketTradeOpportunities.ts`が既に使っている価格差ロジックの再利用であり、新規の優先度ロジックを発明しない。
4. 各エッジについて、`tradeRouteDuration.ts`から得られる移動日数を使い、指数減衰`spoilageDecay = exp(-travelDays / SPOILAGE_HALF_LIFE)`を適用する。穀物は保存が利くため`SPOILAGE_HALF_LIFE`は長め(例: 90日)に設定し、遠隔地からの大量輸送(江戸の廻米、ローマのアノナ)を再現可能にする。
5. `tradeSecurity.ts`の既存リスク値でさらに割引く(海賊・盗賊の多い航路は実効輸送量が下がる)。
6. 需要側Marketごとに`satisfiedImport = Σ(割当volume × spoilageDecay × (1 - securityRisk))`を`min(importNeed, ...)`で確定し、`foodLedger`に書き込む。
7. `importCapacityBonus = satisfiedImport / GROSS_FOOD_NEED`(`foodProduction.ts`が使っている定数の逆算)で人口換算し、Market内のBurgへ`capacity`比で按分して`effectiveCapacity`に加算する。Marketは基本的にハブBurg1つを中心に広がるため、ボーナスの大部分は自然にハブBurg(=貿易中心都市)に集中する。

供給側の`exportable`は複数の需要側Marketで奪い合いになるため、一つの供給地が無限に多数の大都市を養えるわけではない — 割当は`exportable`の残量制約下で行う。

### 3.4 成長シミュレーションへの接続と崩壊ダイナミクス

`demography-simulator.ts`のBurg成長ループでK値を`effectiveCapacity`に差し替えるだけで、既存のロジスティック成長・飢餓ロジックがそのまま「輸入依存の大都市」を扱えるようになる。

これにより以下が**追加コードなしで自動的に発生する**望ましい副作用がある。

- 戦争・海賊・季節closureで輸送路が寸断されると`satisfiedImport`が急落し、`effectiveCapacity`が翌tickで下がる。人口がすでに`capacity`を大きく超えている場合、`roomForGrowth`が大きく負に振れ、既存の`starvationRate`ロジックが即座に大規模な飢饉として発現する。
- これは「後背地から切り離された巨大都市の兵糧攻め・海上封鎖による飢餓」という歴史的にも説得力のあるイベントを、新規の専用コードなしで実現する。

## 4. 副次効果とバランス設計

### 4.1 兵站・マンパワーへの波及

`src/generators/manpower.ts`の`statePopulationPeople()`等は`burg.population`を徴兵可能人口の母数として直接参照している。`effectiveCapacity`による人口増はそのままBurgの実`population`増につながるため、**輸入依存の大都市は徴兵可能なマンパワープールも同時に拡大する**。これは意図された挙動として明記する — 史実でも江戸・ローマのような都市は動員力の中心でもあった。ただし輸送網が寸断されれば人口ごと崩壊するため、無条件の軍事的優位にはならない。

### 4.2 過剰供給ループの防止

- 供給側`exportable`は`RURAL_MARKETABLE_SHARE(0.7)`という既存の上限に加え、複数需要側での取り合いによって自然に希釈される。
- 割当は価格優先(既存の`customerBuyPrice`ロジック再利用)とするため、際限なく遠方から食料を集める都市は輸送コスト・治安リスクの分だけ実質的に高い「価格」を払っている状態になり、経済シミュレーションと整合する。
- ロジスティック成長モデル自体が急激な人口ジャンプを許さない(births/starvationは`deltaYears`と`roomForGrowth`に比例)ため、`effectiveCapacity`が一気に跳ね上がっても人口は緩やかにしか追随しない。

### 4.3 技術・文化発展への拡張フック(将来実装)

ユーザーの意図として、この「身の丈を超えた人口集中」は将来的に技術開発・文化芸術発展の下地として機能させる予定である。現時点では該当する技術/文化ポイントシステムが存在しないため、本ドキュメントでは**接続インターフェースの設計のみ**を提案し、実装は将来のシステムに委ねる。

```ts
// 将来の技術/文化システムが参照する想定のフック
export function getUrbanConcentrationBonus(burgId: number): {
  importDependencyRatio: number; // satisfiedImportに由来する人口 / population
  populationBeyondBaseCapacity: number; // population - capacity (負なら0)
};
```

「輸入によって養われている人口の割合が高いほど、非農業労働力(職人・学者・芸術家)の比率が高い」という直感を素直にモデル化できる形にしておく。具体的な技術/文化ポイントの生成式は、当該システムの設計時に別途検討する。

## 5. 実装フェーズ案

1. **データモデル**: coreの`burg.demographics`に`effectiveCapacity`を追加(デフォルト`= capacity`)。`MarketFoodLedger`に`satisfiedImport`/`importCapacityBonus`を追加。
2. **食料輸入ネットワーク解決**: `src/extensions/economy/generators/foodImportNetwork.ts`を新規実装。`FoodProductionModule.generateQuarterlyLedger()`の後段で呼び出し、economy拡張有効時のみ動作。既存の`landRouteGraph`/`seaRouteGraph`/`tradeRouteDuration.ts`/`tradeSecurity.ts`/`Markets.customerBuyPrice`を再利用し、新規の距離計算・価格計算は書かない。
3. **成長シミュレーション接続**: `demography-simulator.ts`のBurg成長ループでK値を`effectiveCapacity`に切り替え。economy拡張無効時は自動的に現状動作に一致するため分岐コード不要。
4. **可視化・UI**: Burg詳細ダイアログに「輸入依存度」表示を追加。デバッグ用にMarket間食料フロー(`FoodFlowEdge`)を既存の交易route描画レイヤー(WebGLの`tradeAnimation`相当)へ重ねられるようにする。
5. **将来課題**: `getUrbanConcentrationBonus()`の実消費先として技術/文化発展システムを設計する(本ドキュメントの範囲外)。

## 6. 未解決の論点

- Market間のvolume割当を「価格優先の貪欲法」で行う設計としたが、複数需要側が同時に同じ供給源を奪い合う際の公平性・計算コスト(`markets^2`になりうる)は実装時に`marketTradeOpportunities.ts`の既存の200件上限などの前例を参考にチューニングが必要。
- `SPOILAGE_HALF_LIFE`などのバランス定数は初期値を仮置きし、実プレイでの都市成長曲線を見ながら調整する前提とする。
- Good単位(穀物 vs 魚 vs 肉)で腐敗速度を分けるかは v1 ではスコープ外とし、`"food"`タグ全体を単一の腐敗係数で扱う簡略化を採用する。
