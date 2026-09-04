# 経済拡張機能 結合度監査 — 疎密が逆転している箇所と修正案

## 状態

**未実装の調査・提案ドキュメント。** 2026-09-04 時点の `master`(`6a483a70`)を対象に
`src/extensions/economy/` 全体(252ジェネレータ / 約84,000行)と、それが読み書きするホスト側
(`src/generators/demography-simulator.ts`, `burgs-generator.ts`, `subsistenceCapacity.ts`,
`timeEngine.ts`, `simulationSystem.ts`)を静的に読み、**「現実世界では強く連動しているのに
コード上は連動していない箇所(疎すぎる結合)」**と**「コード上は密結合だが本来は分離できる/
すべき箇所(密すぎる結合)」**を洗い出したもの。

各項目は独立して着手でき、依存関係は最後の「実装順」節に整理した。
本書は既存の設計ドキュメント(`economy.md`, `trade.md`, `urban-employment-demand.md` など)を
一切変更しない。それらの仕様どおりに実装されているモジュール同士の**接続の欠落**を扱う。

---

## サマリ

### Part 1: 疎すぎる結合(現実では密 ⇔ コードでは疎)

| # | 内容 | 深刻度 | 主な該当箇所 |
| --- | --- | --- | --- |
| L1 | 価格→需要のフィードバックが存在しない(需要は人口×固定係数) | 高 | `markets-generator.ts:2328` |
| L2 | 賃金が完全な死に変数。労働は無償の容量制約 | 高 | `strategicLaborMarkets.ts:201` |
| L3 | 食料ストレス指標が人口動態に接続されていない | 高 | `foodLedgerConsumption.ts:130` |
| L4 | 都市の carrying capacity が農業改良・干ばつ・住宅建設と無関係 | 高 | `burgs-generator.ts:997` |
| L5 | 戦時価格が小売専用で、交易の呼び水にならない | 中 | `markets-generator.ts:2192` |
| L6 | 輸送コストが重量・嵩ではなく商品価格に比例 | 中 | `tradeOpportunityEstimator.ts:100` |
| L7 | 貨幣供給(`MintLedger.circulation`)が物価・取引と無関係 | 中 | `minting.ts:45` |
| L8 | 道路網が交易量に対して外生。公共事業の財政費目も無い | 中 | `routes-generator.ts` / `treasuryAllocation.ts:32` |
| L9 | 徴税強度・征服がノーコスト(不満・逃散・資本破壊が無い) | 中 | `domainFiscalPolicy.ts:20` / `localDefense.ts:44` |

### Part 2: 密すぎる結合(コードでは密 ⇔ 本来は疎にできる)

| # | 内容 | 深刻度 | 主な該当箇所 |
| --- | --- | --- | --- |
| T1 | 巨大な単一 `economy.tick` が約50サブシステムを手書き順序で駆動 | 高 | `index.tsx:2859` |
| T2 | 年次ゲートが35個個別に手書き複製されている | 中 | `economyContext.ts:155-189` |
| T3 | `economyContext.ts` が 410 export / 177 ファイルから import される可変グローバル | 中 | `economyContext.ts` |
| T4 | Nobility が Economy 内部を静的 import しつつ依存を宣言していない | 中 | `nobility/generators/localDefense.ts:2` |
| T5 | マップ再初期化フックが28個のマイグレーションを直列ハードコード | 低 | `index.tsx:3285` |

**先に良い知らせ**: `generators/` 内 252 ファイル・498 本の値 import に**循環依存はゼロ**だった。
静的な依存グラフは DAG として健全に保たれている。問題は静的依存ではなく、
(a) 実行順序という**時間的依存**が散文コメントにしか存在しないこと、
(b) 共有可変コンテキスト越しの**見えない結合**、の2点に集中している。

---

# Part 1: 疎すぎる結合

## L1. 価格 → 需要のフィードバックが存在しない

**現状**

需要は `markets-generator.ts:2328` の `calculateGoodDemand()` で決まる:

```ts
return urbanPopulation * (nonClothingConsumerDemand + industrialDemand) + textilePopulation * clothingFactor;
```

価格項が一切入っていない。一方、価格は `initializeMarketPrices()`(`markets-generator.ts:1135`)で
その需要から導出される:

```ts
const ratio = (demand + LAPLACE_PRICE_SMOOTHING) / (marketGood.stock + LAPLACE_PRICE_SMOOTHING);
marketGood.price = rn(good.value * minmax(ratio, PRICE_FLOOR_FACTOR, PRICE_CEILING_FACTOR), 2);
```

つまり **需要 → 価格 の一方通行**で、逆向きの矢印が無い。結果として:

- 飢饉で穀物価格が上限(`foodLedgerConsumption.ts:18` の `PRICE_CEILING = 2.0`)に張り付いても、
  消費量は `population × dailyNeedPerPerson()` のまま1単位も減らない。
- 奢侈品が下限価格(`PRICE_FLOOR_FACTOR = 0.25`)まで暴落しても、購入量は増えない。
- 商品間の代替(ビール↔ワイン、羊毛↔亜麻)がマーケット需要レベルで起きない。

なお `production-generator.ts:1378` の `fillDemandFromMarket()` だけは例外で、
`costPerCoverage = price / candidate.coverageWeight` でソートして安い方から買う代替行動と、
`burg.treasury` による予算制約を持つ。**この正しいパターンが1箇所にしか存在しない**のが問題。

**もう一つの副作用: 価格に記憶が無い**

`initializeMarketPrices()` は毎月の生産サイクル(`production-generator.ts:314`)で
`good.value` から**再導出**する。サイクル中に `applyMarketPressure()`
(`markets-generator.ts:2231`)が積み上げた取引由来の価格変動は、翌月の再導出で全部消える。
つまり「先月大量に買われたので高値が続く」という価格の慣性・期待形成が原理的に起きない。

**修正案**

1. `calculateGoodDemand()` に価格弾力性項を導入する。`Good` に `priceElasticity`
   (既定 0。食料 -0.2 程度、奢侈品 -1.2 程度)を追加し、
   `demand *= (price / good.value) ** elasticity` を掛ける。
   既定 0 なら現行と数値的に完全一致するので、Good データを埋めるまで挙動不変。
2. 価格導出を「前月価格からの緩和(relaxation)」に変える:
   `price = prevPrice + (targetPrice - prevPrice) * ADJUSTMENT_RATE`(0.3〜0.5程度)。
   `stapleFood` は既に `settleGrainPrice()` が別管理なので対象外。
3. 需要と価格は相互再帰になるため、1サイクル内で不動点反復はせず
   **前月価格で今月需要を決める(1期ラグ)**方式にする。これは `taxes-generator.ts:45` の
   Stewardship ラグと同じ既存パターン。

**検証**

`markets-generator.test.ts` に「弾力性 -1.0 の Good を在庫半減させたとき、
価格上昇と同時に需要が下がって在庫枯渇が緩和される」テストを追加する。
弾力性 0 の Good で既存テストの期待値が1つも変わらないことを回帰確認。

---

## L2. 賃金が完全な死に変数 — 労働は無償の容量制約

**現状**

`LaborMarket.wageByOccupation` は `strategicLaborMarkets.ts:201` で毎サイクル計算・保存される:

```ts
laborMarket.wageByOccupation[occupation] = (good?.value ?? 1) * demandMultiplier;
```

しかし**読み出し側が存在しない**。`grep -rn "wageByOccupation"` のヒットは
型定義・初期化・この書き込みの3箇所だけで、消費者はゼロ。

これは孤立した死にフィールドではなく、より広い設計上の空白の症状である。
`production-generator.ts:1005` の `executeManufacture()` を見ると、製造コストは:

```ts
const availableFunds = fundingState?.treasury ?? state.burg.treasury ?? 0;
// ... 原材料の marketCost だけが treasury から引かれる (1096行)
```

**原材料費のみ**。労働は `laborBudget` / `laborPointsPerLot` という
**純粋な数量制約**で、1コインもコストが発生しない。前近代の手工業では労賃が総費用の
過半を占めるのが普通なので、これは経済の骨格が1本抜けている状態。

結果:

- 労働需給が逼迫してもコストプッシュ型のインフレが起きない。
- 労働者が受け取る所得が存在しないので、**家計部門という経済主体そのものが無い**。
- そのため `taxes-generator.ts:166` の人頭税

  ```ts
  const pollTaxRevenue = (state.pollTax || 0) * population * administrationBonus * domainPollMult;
  ```

  は**移転ではなく純粋な貨幣創造**になっている(どの財布からも引かれていない)。
  同様に `foodLedgerConsumption.ts:270` の `settleUrbanRevenue()` に入る都市小売収入も、
  買い手の財布が存在しないので無から生まれている。
- `Character.wealth` を持つのは名前付きキャラクターだけで、匿名人口には資産がない。

**修正案**

段階的に。全面的な家計会計は大きすぎるので、最小の閉じた輪から:

- **Phase 1(小・効果大)**: `executeManufacture()` に労賃費目を追加する。
  `laborUsed × wageRate` を `fundingState.treasury` から引き、
  `BurgMarketLedger` に `householdIncome` として積む。
  `wageRate` は当面 `strategicLaborMarkets` の既存 `wageByOccupation` を使い、
  死に変数を生かす。
- **Phase 2**: `BurgMarketLedger.householdPurse` を導入。Phase 1 の労賃と、
  農村側の `foodProduction.ts:320` の farmgate 支払いをここに集約する。
  人頭税と都市食料小売はこの財布から引く(創造 → 移転に変える)。
- **Phase 3**: 財布が空だと人頭税が取り切れない/食料が買えない、を L3 の食料ストレスに接続する。

Phase 1 だけでも「労働集約的な商品は労働が安い(=人口過剰な)都市でこそ作られる」という、
現状まったく効いていない立地の論理が動き出す。

**検証**

Phase 1 では、労賃導入で `burg.treasury` が単調に赤字化しないことが要点。
`burg-treasury-equilibrium.md` の均衡テストを流用し、労賃導入前後で
`burg.treasury` の長期平均が同オーダーに留まるよう `wageRate` をキャリブレーションする。

---

## L3. 食料ストレス指標が人口動態に接続されていない

**現状**

`foodLedgerConsumption.ts:130` の `updateStressCounters()` は四半期ごとに4つの指標を更新する:

```ts
ledger.ruralFoodStressQuarters   = ...
ledger.urbanFoodStressQuarters   = ...
ledger.ruralSevereDeficitQuarters = ...
ledger.urbanSevereDeficitQuarters = ...
```

このうち**実際に読まれているのは `ruralFoodStressQuarters` の1つだけ**で、
読み出し箇所も `markets-generator.ts:893` の1行(セル食料の非常用備蓄需要のオンオフ)のみ。
残る3つ、特に `urbanSevereDeficitQuarters`(都市の深刻な食料不足が何四半期続いたか)は
書かれるだけで誰も読まない。

一方、実際の餓死は `demography-simulator.ts:229` と `:259` で決まる:

```ts
const roomForGrowth = effectiveCapacity > 0 ? Math.max(-0.5, 1 - currentTotal / effectiveCapacity) : 0;
// ...
const starvationRate = Math.min(0.99, Math.abs(roomForGrowth) * deltaYears * 0.02);
```

つまり餓死は **年次の carrying capacity 超過**だけで決まり、
経済が毎月精算している食料元帳(在庫3世代・FIFO 引き当て・輸入・備蓄)を一切見ていない。

**その結果**: ある都市が穀物在庫をゼロまで枯らし、住民の月次必要量を何年も満たせなくても、
人口が `effectiveCapacity` を下回っている限り死者はゼロで、人口はむしろ増え続ける。
経済側が精密にモデル化した飢饉が、人口側にまったく届いていない。

対照的に、**疫病は正しく接続されている**(`demography-simulator.ts:272`、
`burg.waterSecurity` → `epidemicRate`)。同じ形の配管が食料側にだけ無い。

**修正案**

疫病と同じパターンをそのまま踏襲する。`demography-simulator.ts` の都市ループに、
`roomForGrowth` 由来の飢餓とは**独立した**第2の死亡項を足す:

```ts
// 経済が有効なときのみ非ゼロ。waterSecurity と同じく Burg 上の 0..1 フィールド経由で、
// ホストが Economy を直接 import しないようにする。
const foodSecurity = typeof burg.foodSecurity === "number" ? burg.foodSecurity : 1;
if (foodSecurity < FOOD_SECURE_THRESHOLD) { ... }
```

- `Burg.foodSecurity`(0..1)を新設し、`settleMonthlyFoodConsumption()` の四半期末で
  `urbanShortfallRate` と `urbanSevereDeficitQuarters` から書き込む。
  ホスト側は Economy を知らないまま読める(`waterSecurity` と完全に同じ構図)。
- 死亡率は疫病より緩やかな立ち上がりにし、`urbanSevereDeficitQuarters` が
  2四半期以上連続したときだけ効かせる(単月のブレで都市が消えないように)。
- 併せて **出生率**にも掛ける。飢饉の第一の効果は死亡増より出生減。
- `populationLossTracker` に `famine` バケットは既にある(`demography-simulator.ts:191` の
  `addLoss(faminePts, ...)`)ので、集計 UI 側の追加作業は無い。

**検証**

`docs/plan/megacity-food-import-economy.md` のシナリオを使い、
輸入路を人為的に切った巨大都市が数年かけて縮小することを確認する。
現状は縮小しないので、これは新規の観測可能な挙動になる。

---

## L4. 都市の carrying capacity が農業改良・干ばつ・住宅建設と無関係

**現状**

`burg.demographics.capacity` はマップ生成時に一度だけ決まる
(`burgs-generator.ts:997`, `definePopulation()`):

```ts
let population = pack.cells.s[cellId] / 5;
if (terrainCapacity > 0) population *= localFoodCapacity / terrainCapacity;
if (burg.capital) population *= 1.5;
population *= connectivityRate;
population *= gauss(1, 1, 0.25, 4, 5); // randomize
const capacity = rn(Math.max(population, 0.01), 3);
```

以後 `capacity` を書き換えるコードは存在しない。動くのは `effectiveCapacity` だけで、
その経路は2本しかない:

1. `foodImportNetwork.ts:214` — 輸入によるプラス補正
2. `constructionEmployment.ts:556` — 建設ストックによる**上限クランプ**

そして (2) は:

```ts
const ceiling = base * getConstructionProductivityMultiplier(operation); // 戻り値は [0.5, 1.0]
burg.demographics.effectiveCapacity = Math.min(burg.demographics.effectiveCapacity ?? base, ceiling);
```

乗数の上限が 1.0 なので、**住宅をいくら建てても生成時 `capacity` を1ポイントも超えられない**。
建設産業は都市を縮小させることしかできない。

対照的に**農村セルは正しく接続されている**。`developmentPotential.ts:334` が毎年
`reconcileSubsistenceCapacityFromFood(world.pack.cells, agriculture.ruralFoodCapacity)` を呼び、
農地面積・土壌肥沃度・農具投資・肥料・灌漑・干ばつ(`climateFoodStress`)がすべて
`cells.subsistenceCapacity` に反映される。**都市側にだけ同じ配管が無い。**

その結果、AgTech 投資・リン酸/窒素肥料工場・ダム灌漑・`ClimateDisasters` の干ばつは、
どれも都市人口の上限に一切影響しない。

**修正案**

農村と同じ形で都市 capacity を年次リコンサイルする。`DevelopmentPotential.updateAnnualAgriculture()`
の直後(既に tick の `economy:annualAgTech` ブロック内、`index.tsx:2925` 付近)に:

```ts
// 都市の食料由来キャップ: その市場圏の農村余剰 + 輸入 で養える点数
burg.demographics.capacity = clamp(
  seedCapacity * MIN_SHARE,                  // 生成時値を下限側の錨に残す
  hinterlandSurplusPoints + importPoints,
  seedCapacity * MAX_GROWTH_MULTIPLIER       // 例: 3.0
);
```

- 生成時 `capacity` は `seedCapacity` として別名保存し、地形・立地の恒久的優位は錨として残す。
- 建設ストックのクランプ (`constrainEffectiveCapacity`) は**上方向にも効かせる**。
  乗数レンジを `[0.5, 1.0]` から `[0.5, 1.3]` に広げれば、住宅投資が都市成長を可能にする。
  ただし `Math.min` を `clamp` に変える必要がある。
- 干ばつは既に `agriculturalLandUse.ts:1107` で農村収量に効いているので、
  上式の `hinterlandSurplusPoints` 経由で自動的に都市にも波及する。

**注意**: これは `initialPopulationSaturation` オプションと相互作用する。
既存マップの互換性のため、`seedCapacity` が未保存の古いセーブでは現行挙動にフォールバックする。

**検証**

AgTech 投資を最大にした国と最小にした国で、50年後の都市人口に有意差が出ることを確認する。
現状は差がゼロになるはずなので、良い前後比較テストになる。

---

## L5. 戦時価格が小売専用で、交易の呼び水にならない

**現状**

`markets-generator.ts:2136` の `getWarPriceModifier()` は良い実装で、
`warEconomyType` に応じて military ×最大3.75、essential ×最大2.7、luxury ×最小0.1 まで動かす。

ところが適用箇所は `customerBuyPrice()` / `customerSellPrice()`(`:2192`, `:2197`)だけ、
つまり**プレイヤーが店頭で見る価格にしか効かない**。

市場間交易の意思決定(`markets-generator.ts:1683`)は生の中値を使う:

```ts
const transportCost = getTransportCost(route.distance, mapDiagonal) * good.value;
const unitProfit = importerGood.price - (exporterGood.price + transportCost + exporterTaxPerUnit);
```

さらに輸入者判定に使う `reserve`(`:1640`)は
`calculateMarketTradeDemand()`(人口ベース)× `(1 + tradeReserveFactor)` で、戦争項が無い。

**結果**: 包囲された都市で武器価格が3.75倍になっても、
(a) その都市の輸入需要は平時と同じ、(b) 商人の利益計算にも高値が入らない。
戦争特需・武器商人という、前近代交易の最大の駆動力の一つがまったく働かない。

**修正案**

`getWarPriceModifier()` を交易パスにも適用する。ただし小売マージンとは分離する:

1. `globalTrade` の `unitProfit` 計算で `importerGood.price` の代わりに
   `importerGood.price * getWarPriceModifier(importerCenter, good.i)` を使う。
   輸出側にも同じ修正子を掛ける(戦時国から輸出しづらくする)。
2. `calculateMarketTradeDemand()` の予備率に戦争項を足す。
   `military` / `essential` タグの Good だけ `reserve *= (1 + warIntensity * 0.5)`。
3. `tradeSanctions.ts` / `isMarketTradePermitted()` の既存禁輸判定と衝突しないか確認する
   (敵国へ武器を売れるかは別の政治判断なので、価格の話とは分けたまま残す)。

**検証**

`markets-generator.test.ts` に「`warIntensity = 2.0` の市場が、同条件の平時市場より
military タグ Good を多く輸入する」テストを追加。

---

## L6. 輸送コストが重量・嵩ではなく商品価格に比例

**現状**

`tradeOpportunityEstimator.ts:100`:

```ts
export function getTransportCost(distance: number, mapDiagonal: number): number {
  return (distance / mapDiagonal) * DISTANCE_COST_FACTOR; // 無次元、DISTANCE_COST_FACTOR = 0.5
}
```

呼び出し側は全箇所で `getTransportCost(...) * good.value`
(`markets-generator.ts:1683`, `strategicProcurement.ts:440`, `marketTradeOpportunities.ts:148`)。

つまり**1単位あたりの運賃が商品価格に比例**する。同じ距離で穀物(value ≈ 1)を運ぶ費用は、
金(value ≈ 50)を運ぶ費用の 1/50。現実は逆で、運賃は概ね重量×距離に比例するから、
穀物のような嵩物ほど遠距離交易に耐えない。

しかもこのコードベースは正しいデータを既に持っている。
`GoodTradeProfile` に `weight` と `bulk` があり、
`tradeCargo.ts:56` はキャラバンの**積載スロット**計算にそれを使っている。
つまり**物理的容量は嵩ベース、金銭コストは価値ベース**という二重基準になっている。

嵩物が無制限に遠距離を運ばれるのを防いでいるのは、`tradeOpportunityEstimator.ts:158` の
**二値ゲート**である:

```ts
const densityLimit = Math.max(1, VALUE_DENSITY_BASE_MAX_DAYS * getGoodValueDensity(good) * VALUE_DENSITY_MULTIPLIER);
```

「価値密度が低い商品は N 日以上運べない」という崖。連続的なコスト勾配の代わりに崖を置いた形で、
崖の手前ではコストが不当に安く、崖の向こうでは物理的に不可能になる。

**修正案**

運賃を嵩ベースに切り替え、崖を勾配に置き換える:

```ts
// 1単位あたり運賃 = 距離係数 × (重量+嵩) × 単位運賃レート
export function getTransportCost(distance: number, mapDiagonal: number, good: Good): number {
  const trade = good.trade ?? getDefaultGoodTradeProfile(good);
  return (distance / mapDiagonal) * DISTANCE_COST_FACTOR * (trade.weight + trade.bulk) * FREIGHT_RATE;
}
```

- 呼び出し側の `* good.value` を削る。3箇所とも同時に変える必要がある(片方だけだと
  `marketTradeOpportunities` の UI 表示と実際の取引が食い違う)。
- `FREIGHT_RATE` は「現行の平均的な Good で運賃総額が概ね変わらない」ようキャリブレーションし、
  交易量の総量が激変しないようにする。`docs/plan/goods-unit-scale.md` の価格キャリブレーションを
  壊さないことが最優先。
- 移行後、`getGoodMaxTradeDurationDays()` の `densityLimit` は緩めてよい
  (連続コストが同じ仕事をするため)。ただし腐敗由来の上限
  (`PERISHABLE_MAX_TRADE_DAYS`, `FRESH_FOOD_*`)はそのまま残す。物理と経済は別の制約。
- `stapleFood` の `Number.POSITIVE_INFINITY` 特例(同166行)は、
  連続コスト化すれば自然に「遠すぎると赤字」で表現されるので削除できる。

**検証**

同一ルート・同一距離で、`weight+bulk` が大きい Good の取引成立距離が縮み、
`weight+bulk` が小さい高価値 Good が伸びること。
`docs/plan/trade-cargo-capacity-and-diversity.md` の既存シナリオで総交易額が
±20% 以内に収まることを確認する。

---

## L7. 貨幣供給が物価・取引と無関係

**現状**

`minting.ts` は `MintLedger.circulation`(流通貨幣量)を丁寧に追跡する。
毎月 0.5% 減耗し(`minting.ts:13` の `CIRCULATION_MONTHLY_RETENTION = 0.995`)、
金・銀・銅インゴットの市場在庫を消費して補充し、需要は12ヶ月分を目標とする。

しかし `circulation` を読むコードは `minting.ts` 自身の内部以外に存在しない。
モジュールの外に出る値は `lastSeigniorage`(`:77`、造幣手数料 2% → `state.treasury`)だけ。

つまり:

- 貨幣不足でも物価は下がらない(デフレが起きない)。
- 貨幣過剰でも物価は上がらない(インフレが起きない)。
- `circulation` が枯渇しても取引は普通に成立する。
- `docs/plan/mineral-resource-circulation-fixes.md` が指摘した「鉱山枯渇 → 貨幣供給の長期減衰」
  という懸念は、そもそも下流に効果が無いので実害が発生しない状態。

**修正案**

最小の接続で十分に大きな効果が出る。物価水準に1本だけ矢印を引く:

```ts
// markets-generator.ts の initializeMarketPrices() の最後、applyLocalTradePriceBias と同じ位置
// state の貨幣充足率 (circulation / currencyDemand / TARGET_MONTHS) から
// 0.85 〜 1.15 程度の緩やかな物価水準乗数を掛ける
```

- 乗数レンジは狭く保つ(±15%)。貨幣数量説をまともに実装すると
  既存の価格キャリブレーションを全部壊すため、あくまで「貴金属が枯れた国では
  名目物価がじわりと下がる」程度の演出に留める。
- 併せて `MerchantTradeCapital` / `marketProcurementBudget` に流通量の下限制約を掛けると、
  「貨幣不足の国では商人が大口取引を組めない」という前近代らしい制約が入る。
  こちらは物価より副作用が小さいので、先にこちらから入れてもよい。

**判断が必要な点**: これは意図的に疎のままにする選択肢もある。
貨幣数量説を入れるとバランス調整コストが跳ね上がるので、
「`circulation` は観測用の指標として割り切る」なら、少なくとも
`minting.ts` の doc コメントにその旨を明記し、死に変数ではなく**意図的な観測値**だと
分かるようにすべき。現状は意図が読み取れない。

---

## L8. 道路網が交易量に対して外生。公共事業の財政費目が無い

**現状**

`pack.routes` はマップ生成時に `routes-generator.ts` が一度作るだけ。
実行時に追加されるのは蒸気機関時代の鉄道(`steamIndustry.ts` の `settleRailways`)のみで、
**交易量が街道を舗装することも、交易の途絶が街道を廃れさせることも無い**。

ルートは初期の都市容量に効いており(`burgs-generator.ts:991`,
`Routes.getConnectivityRate(cellId)`)、移動日数にも効く
(`tradeRouteDuration.ts` の `calculateRouteDurationDays`)。つまり**下流には強く効くが、
上流からのフィードバックが無い**。

関連して、`treasuryAllocation.ts:32` の国家予算の費目は
`marshalcy / household / chancery / stewardship / spymastery / ecclesiastica` の6つで、
**公共事業(道路・港湾・穀物倉)の費目が存在しない**。前近代国家の
最も基本的な投資であり、税基盤に直接返ってくる支出がモデル化されていない。

さらに `spymastery` は**予算を配分され `departmentServiceLevel` も追跡されるのに、
下流の効果がゼロ**。他の4部門は全部つながっている:

| 部門 | 効果 | 該当箇所 |
|---|---|---|
| marshalcy | 軍事維持費支払い | `treasuryAllocation.ts` `payMilitaryUpkeep` |
| chancery | `state.diplomaticReliability` | `chanceryDiplomacy.ts:43` |
| stewardship | 徴税効率 / 行政費率 | `taxes-generator.ts:155` |
| ecclesiastica | `state.religiousUnrest` | `ecclesiasticaUnrest.ts:44` |
| **spymastery** | **なし** | — |

**修正案**

2段階に分ける。

- **段階1(小)**: `spymastery` に既存の下流をつなぐ。`tradeSecurity.ts:80` の
  `getBanditRiskPerDay()` に諜報部門のサービスレベルを掛けるのが最も自然
  (国内の盗賊把握は諜報の仕事)。もしくは `overseasRelations` の情報優位。
- **段階2(中)**: `publicWorks` 部門を追加し、`DEFAULT_TAX_BY_FORM` と同様に政体別配分を持たせる。
  この予算が:
  - `pack.routes` の trails → roads 昇格(交易量閾値 + 予算の両方を要求)
  - 港湾の `Burg.port` 容量
  - `foodProduction.ts` の備蓄容量(`BURG_TARGET_RESERVE_DAYS`)
  に効くようにする。既存の `Dams` / `Levees` は市場財源で建つ独立系統なので、
  そちらとは分けたまま残す。

段階2 は `routes-generator.ts` のデータ構造に実行時変更を入れる話になるため、
`steamIndustry.ts` の `settleRailways` が既に確立した「実行時に `pack.routes` へ
グループを追加する」パターンをそのまま流用するのが安全。

---

## L9. 徴税強度・征服がノーコスト

### L9-a. 領主の徴収レートが無料のレバー

`domainFiscalPolicy.ts:20-36` の領主レバーは:

- `domainLevyRate` を 0.5〜1.5 で動かすと、国家の人頭税収が 0.9〜1.1 倍になる
  (`DOMAIN_POLL_MULT_MIN/MAX`)
- `extract` 政策は領主の金庫から国庫へ 10%、領主個人へ 2% を送る

**この重い徴収に地元側のコストが一切無い。** `burg.treasury` は減らないし、
不満も蓄積せず、人口流出も起きない。合理的なプレイヤー/AI は
常に `levyRate = 1.5` + `extract` を選ぶのが最適解になってしまう。

### L9-b. 不満が食料・税・物価から発生しない

`unrest` を全文検索すると、発生源は2つしかない:

1. `coupAftermath.ts` — 債務クーデター後の粘着的な内乱
2. `ecclesiasticaUnrest.ts` — 教会部門の予算不足

**飢饉、重税、物価高騰から不満が生まれる経路が存在しない。**
L3 の食料ストレス指標が孤立していることと同根の問題。

### L9-c. 征服が知識だけを破壊し、物的資本を素通りさせる

`localDefense.ts:44` の `captureBurg()` は所有権を移し、
`applyConquestDisruption(burg.i)` を呼ぶ。その中身(`conquestDisruption.ts:20`)は:

```ts
applyConquestDisruptionToGuilds(burgId);
applyConquestDisruptionToAcademies(burgId);
applyGreatLibraryConquestDisruption(burgId);
```

**ギルド技術・アカデミー技術・大図書館の3つ、つまり無形資産だけ。**
`burg.treasury`、市場在庫(`market.goods[].stock`)、ギルド金庫(`guildTreasury`)、
建設ストック(`buildingStock`)、食料備蓄(`burg.foodReserve`)、造幣流通量は
**すべて無傷で征服者の手に渡る**。都市略奪という、前近代戦争の主要な経済的帰結が無い。

**修正案(3つまとめて)**

1. `domainLevyRate > 1.0` の分だけ `burg.treasury` を追加で削る、
   かつ `burg` 単位の `discontent`(0..100)を蓄積させる。
2. `Burg.discontent` を新設し、加算源を3つ持たせる:
   食料ストレス(L3 の `foodSecurity`)、実効税率、`warIntensity`。
   減算源は `burg.treasury` の余裕と `departmentServiceLevel.ecclesiastica`。
   下流は当面 (a) 労働生産性の小さな減衰、(b) `urbanLaborIntake` の流出増加、の2つで十分。
   既存の `coupAftermath` / `religiousUnrest` はそのまま並存させ、統合はしない。
3. `applyConquestDisruption()` に物的破壊を追加する:
   `burg.treasury` と市場在庫の一定割合(占領軍の規律 =
   `commanderPowerMultiplier` の指揮官 Martial で緩和)を没収/破壊する。
   没収分は征服者の `state.treasury` に入れると、戦争の経済的動機が初めて成立する。

3 は `docs/plan/economy-war.md` の既存記述と整合を取る必要がある(未確認)。

---

# Part 2: 密すぎる結合

## T1. 巨大な単一 `economy.tick` が約50サブシステムを手書き順序で駆動

**現状**

ホストは既に**宣言的な DAG スケジューラを持っている**。
`simulationSystem.ts:63` の `SimulationSystem`:

```ts
export interface SimulationSystem {
  readonly id: string;
  readonly phase: SimulationPhase;      // clock / environment / population / economy / politics / military / finalize
  readonly reads: readonly DataTopic[];
  readonly writes: readonly DataTopic[];
  readonly after?: readonly string[];
  readonly before?: readonly string[];
  readonly cadence: SimulationCadence;  // { every: n }
  run(context, writer): void;
}
```

`after` / `before` によるトポロジカルソート、トピック単位の書き込み検証、
カデンス、フェーズ、システムごとに分離された RNG ストリームまで揃っている。

**にもかかわらず Economy が登録するシステムは2つだけ**
(`index.tsx:2859` の `economy.tick` と `:3229` の `economy.marketTerritories`)。
`economy.tick` の中に約50のサブシステムが直列にハードコードされ、
`settleAnnual()` 呼び出しだけで31個ある。

順序制約はコード上の位置と**散文コメント**でしか表現されていない:

- 「Must run before `updateAnnualAgriculture()` so this year's Tools investment feeds this year's ...」
- 「Must run after `reconcileAnnualBasicEmploymentWorkers()`, not before: it reads this year's freshly-reconciled `SmelterOperation.workers` ...」
- 「runs right after ... so farm investment keeps priority over mine/smelter claims」

`index.tsx` 内に「must run before/after」系のコメントが24箇所。
これらは**機械可読でないので、検証も不可能**。新しいサブシステムを追加する開発者(または AI)は、
約370行のブロックを読んで正しい1行を見つけなければならず、間違えても何も警告されない。

さらに `measureTickStep("economy:annualUrbanKnowledge", ...)`(`index.tsx:3027`)という
1つのプロファイルラベルの下に、
化学プラント11種・発電所・電信・ダム・堤防・鉄道・上下水道・ギルド・アカデミー・
大図書館・国家機密・軍事教練が全部入っている(約130行、25呼び出し)。
「urbanKnowledge」というラベルは実態を表しておらず、
プロファイラでコストを部門別に切り分けられない。

**修正案**

順序制約を散文から `after` / `before` 宣言へ移す。全部を一度に分割する必要はない:

- **段階1(低リスク)**: 現状の `measureTickStep` ブロック10個を、そのまま10個の
  `registerSimulationSystem` に切り出す。`after` で現在の実行順を明示的に固定する。
  この時点で挙動は完全に同一だが、順序が機械可読になり、プロファイルも10分割される。
  `economy:annualUrbanKnowledge` は少なくとも
  `economy.annualPlants` / `economy.annualInfrastructure` / `economy.annualKnowledge` の
  3つに割るべき。
- **段階2**: 各システムに正しい `reads` / `writes` トピックを宣言する。
  現状の `economy.tick` は6トピックを read、7トピックを write と申告しており、
  実質「全部読んで全部書く」に等しく、検証の意味をなしていない。
- **段階3**: 年次システムを `cadence` で表現する(→ T2 と合流)。

**注意**: `simulationSystem.ts:106` の unregister には
「依存されているシステムは削除できない」制約がある。
Economy の `cleanup()` は全システムを解除するので、**解除順序が登録順の逆になる**ように
配列で管理する必要がある。ここは実装時の落とし穴。

---

## T2. 年次ゲートが35個個別に手書き複製されている

**現状**

`economyContext.ts:155-189` に、同じ形のフィールドが35個並んでいる:

```ts
let _agTechLastSettledYearFallback: number | null = null;
let _industrialTechLastSettledYearFallback: number | null = null;
let _guildKnowledgeLastSettledYearFallback: number | null = null;
// ... 全35個
```

各々に `getXxxLastSettledYear()` / `setXxxLastSettledYear()` のペアがあり、
中身は全部同一(スライスがあればスライス、無ければモジュールローカル変数)。
`LastSettledYear` の grep ヒットは `economyContext.ts` 内だけで **282行**。

各 `settleAnnual()` の冒頭は全部同じ形:

```ts
const year = getSimulationYear();
if (getXxxLastSettledYear() === year) return;
setXxxLastSettledYear(year);
```

これは `SimulationCadence` が表現するために作られた関心事そのもの
(`simulationSystem.ts:22`)を、35回手で再実装している状態。

**修正案**

```ts
// economyContext.ts に1組だけ
export function getAnnualGateYear(key: string): number | null;
export function setAnnualGateYear(key: string, year: number): void;

// 呼び出し側は
export function settleAnnualOnce(key: string, run: () => void): boolean {
  const year = getSimulationYear();
  if (getAnnualGateYear(key) === year) return false;
  setAnnualGateYear(key, year);
  run();
  return true;
}
```

- スライスの永続化は `Record<string, number>` 1本にする。
  **セーブ互換性のため、旧35フィールドから新 Record へのマイグレーションが必要**
  (`io/auto-update.ts` に1パス追加)。
- T1 の段階3 まで進めば、`settleAnnualOnce` すら不要になり
  `cadence: { every: 365 }` 相当の宣言に置き換わる。ただし
  `SimulationCadence` は「tick 数」ベースで暦年ベースではないので、
  暦年カデンスをスケジューラ側に足すか、`settleAnnualOnce` を残すかの判断がいる。
  後者が安全。

---

## T3. `economyContext.ts` が可変グローバルのハブになっている

**現状**

- 410 個の `export`
- 177 ファイルがこれを import(拡張機能内のほぼ全ファイル)
- 2,452 行

各ジェネレータは `getMarkets()` / `getGoods()` / `getBurgMarketLedgers()` /
`getMineOperations()` … を通じて**他のどのモジュールの状態でも読み書きできる**。
モジュール境界が存在しない。

**公平を期すと、これは意図的な設計判断**である。ファイル冒頭にこう書いてある:

> This avoids direct host imports in sub-modules, which would create separate
> module instances when the extension is loaded via a blob URL.

blob URL 経由でのロード時にモジュールインスタンスが分裂する問題への対処であり、
理由は正当。**問題は「ホストアクセスの集約」という当初の目的を超えて、
拡張機能内部の全状態のグローバルストアになってしまったこと。**

その証拠に、静的な import グラフ自体は健全である
(`generators/` 252ファイル・498エッジ・**循環ゼロ**)。
実際の結合は全部このコンテキスト越しに、依存グラフに現れない形で起きている。

**修正案**

大規模な分割は費用対効果が悪い。実利のある最小の手当てを:

1. **`economyContext.ts` を分割する(内部のみ、公開 API は不変)**。
   ドメイン別ファイル(`context/markets.ts`, `context/food.ts`, `context/knowledge.ts`, …)に分け、
   `economyContext.ts` は再 export のみの薄いバレルにする。
   blob URL 問題は「バレルが単一モジュールであること」で維持される。
   import 側の変更は不要なので、**リスクほぼゼロで 2,452 行が分解できる**。
2. **書き込み系と読み出し系を型で分ける**。多くのジェネレータは読むだけなので、
   `setXxx` を別モジュールに分離すれば、誰が何を書き換え得るかが grep 可能になる。
3. 新規サブシステムでは、コンテキスト経由ではなく引数で状態を渡す方針を
   `docs/plan/extension-dependencies.md` の設計ガイドラインに追記する。

---

## T4. Nobility が Economy 内部を静的 import しつつ依存を宣言していない

**現状**

`docs/plan/extension-dependencies.md` §3 のガイドラインは明快である:

> **コアの直接変更禁止**: … 通信は常に `ExtensionAPI` か、カスタムイベント等の
> 疎結合な手段を用いてください。
> **マニフェストへの明記**: 別の拡張機能の API やデータモデルをどうしても利用する
> 必要がある場合は、必ず自身の `ExtensionConfig` … の `dependencies` に対象の ID と
> 必須要否を定義してください。

**Shipbuilding はこれを完璧に守っている。** `shipbuilding/index.ts:310` で
`dependencies: [{ id: "economy", required: false }]` を宣言し、
Economy との通信は全部 CustomEvent 経由(`index.tsx:2713` 以降の
`fmg:shipbuilding-materials-requested` など8種)。静的 import はゼロ。

**Nobility は守っていない。** `nobility/index.tsx:119` の宣言は
`dependencies: [{ id: CHARACTERS_EXTENSION_ID, required: true }]` だけなのに、
Economy の内部モジュールを6箇所で静的 import している:

| import 元 | 対象 |
| --- | --- |
| `nobility/index.tsx:9` | `economy/generators/characterStipends` の `seedMissingCharacterWealth` |
| `nobility/generators/localDefense.ts:2` | `economy/generators/conquestDisruption` |
| `nobility/generators/localDefense.ts:3` | `economy/generators/martialDisciplineKnowledge` |
| `nobility/generators/localDefense.ts:4` | `economy/generators/martialIndividualMastery` |
| `nobility/controllers/playerCharacterTravel.ts:4` | `economy/generators/trade-animation` |
| `nobility/controllers/playerCharacterTravel.ts:5` | `economy/generators/tradeRouteDuration` |

`applyConquestDisruption()` と `getMartialDisciplineMultiplier()` は
`isEconomyContextReady()` で自衛しているので実行時クラッシュはしない。
しかし:

- 依存が宣言されていないので、`extensionState.ts:264` の**有効化ブロックが働かない**。
  ユーザーは Economy を無効化したまま Nobility を有効にでき、征服時の技術破壊が黙って消える。
- 静的 import なので、Economy を無効にしてもコードはバンドルに含まれ続ける。
- **`playerCharacterTravel.ts` にはガードが無く、これは実在するクラッシュ経路**。
  `estimateTravelBetweenBurgs()`(`:61`)が `TradeAnimation.findRoutePath()` を呼び、
  その先の `findRoutePathWithAllowedEdges()`(`trade-animation.ts:142`)が
  `getWorldContext()` → `getApi()`(`economyContext.ts:268`)に到達する。
  `getApi()` は `_api` が null のとき **throw する**:

  ```ts
  if (!_api) throw new Error("[economy] Extension context not initialized — call init(api) first");
  ```

  `_api` は Economy の `cleanup()`(`index.tsx:3687` の `clearEconomyContext()`)で null に戻る。
  つまり **Economy を無効にしたまま Nobility のプレイヤー移動を使うと例外**になる。
  `playerCharacterTravel.ts` 側にも `isEconomyContextReady()` チェックは無い。
  T4-1 の依存宣言を入れれば「Economy 無しでも Nobility を有効化できる」状態は残るため、
  宣言だけでは塞がらない。**このガード追加は宣言と同時に必要。**

**修正案**

Shipbuilding のパターンに寄せる。優先順:

1. **即座に**: `nobility/index.tsx:119` に
   `{ id: "economy", required: false }` を追加する。1行。
   これだけで UI の依存表示(オレンジ警告)が正しくなり、
   ユーザーが「Nobility は Economy があるとより機能する」ことを知れる。
2. `localDefense.ts` の3つの import を CustomEvent 化する。
   `applyConquestDisruption` は片方向通知なので `dispatchEvent` で済む。
   `getMartialDisciplineMultiplier` / `getCommanderMartialSkillMultiplier` は
   戻り値が必要なので、Shipbuilding が使っている
   「mutable な CustomEvent detail に `result` を書き戻す」パターン
   (`index.tsx:2717` 参照)を流用する。
3. `playerCharacterTravel.ts` は UI 経路なので優先度低。

**注意**: CustomEvent 化はホットパス(戦闘解決)に入るので、
毎戦闘のイベントディスパッチコストを計測してから進める。
コストが問題なら、`ExtensionAPI` に型付きの provider 登録
(`demography-simulator.ts` の `getBirthFloorProvider()` と同じパターン)を足す方が良い。
そのパターンは既にホスト側に前例がある。

---

## T5. マップ再初期化フックが28個のマイグレーションを直列ハードコード

**現状**

`index.tsx:3285` の `registerMapReinitHook` の中に、
`migrateLegacyOreIngotGoods()` から `migrateLiveAnimalTags()` まで28個の呼び出しが並び、
その結果を28項の `||` で OR して再 sync するかを決めている。

マップを読み込むたびに全28個が走る。個々は冪等・安価だが、
新しいマイグレーションを足すたびに3箇所(宣言・呼び出し・OR 式)を編集する必要があり、
1つ書き忘れても型エラーにならない。

**修正案**

マイグレーションレジストリに置き換える:

```ts
const GOOD_MIGRATIONS: readonly (() => boolean)[] = [
  migrateLegacyOreIngotGoods,
  migrateLiveCatsGood,
  // ...
];
const migrated = GOOD_MIGRATIONS.reduce((any, run) => run() || any, false);
if (migrated) { Goods.sync(); Markets.initializeMarketPrices(); }
```

`reduce` の短絡を避けるため `run() || any` の順序が重要(全部走らせる必要がある)。
将来的にはマイグレーションにバージョン番号を持たせ、
セーブデータのバージョン以降のものだけ走らせるのが本筋だが、
まずは配列化だけで十分に価値がある。

---

# 実装順の提案

依存関係とリスクを踏まえた順序。

### 第1波 — 低リスク・即効 ✅ 実装済み(2026-09-04)

1. **T4-1** ✅ Nobility に `{ id: "economy", required: false }` を宣言 + クラッシュ経路にガード
2. **T5** ✅ マイグレーションの配列化
3. **L8 段階1** ✅ `spymastery` を `tradeSecurity` の盗賊リスクに接続
4. **T3-1** ✅ `economyContext.ts` をドメイン別に内部分割(公開 API 不変)

実装時に判明した、本書の記述と異なっていた点:

- **T4-1 は「1行」では済まなかった。** クラッシュ経路が想定の1本ではなく2本あった。
  `playerCharacterTravel.ts:61` に加えて、Nobility の `regenerateNobilityData()` →
  `seedMissingCharacterWealth()`(`characterStipends.ts:9` が economyContext の
  `getWorldContext` を import)も Economy 無効時に throw する。前者は呼び出し側で
  `isTravelRoutingAvailable()` ガード、後者は `applyConquestDisruption` と同じく
  economy 側で `isEconomyContextReady()` ガードとした。
  ガード無しでテストが `[economy] Extension context not initialized` で落ちることを確認済み。
  併せて `spymasterySvcTip` の i18n 文言が実態と食い違っていたので更新した。
- **T5 の重複は1箇所ではなく2箇所だった。** 同一の21件・47行のマイグレーション列が
  `_worldLoadedHandler`(アーカイブ読込)と `registerMapReinitHook`(マップ再初期化)の
  両方に丸ごとコピーされていた。レジストリ化で index.tsx が88行減り、
  2つのリストが将来ずれる余地も消えた。
- **T3-1 は公開 API 完全一致を機械的に検証した。** 2,452行 → 47行のバレル + `context/` 配下
  10モジュール(最大 `annualGates.ts` 681行)。ドメイン間の相互 import はゼロで、
  全モジュールが `economyApi.ts` のみに依存するスター型。分割前の 410 export のうち
  実行時に存在する 408 名がすべてバレルから引き続き export されること、内部ヘルパ
  (`getSliceArray` 等)が漏れていないこと、追加された名前が無いことを一時テストで確認した。
  `clearEconomyContext()` はフォールバック変数を名前で列挙する代わりに登録レジストリを
  回す形に変えたので、その配線を `economyContext.test.ts` に恒久テストとして追加した。
  `annualGates.ts` が最大ファイルになったのは意図的で、これがそのまま第2波 T2 の作業対象になる。

### 第2波 — 構造の整備(後続の前提になる)

5. **T1 段階1** ✅ 実装済み(2026-09-04)。`economy.tick` を12システムの `after` チェーンに分割
6. **T2**: ✅ 実装済み(2026-09-04) 年次ゲートを `settleAnnualOnce(key, fn)` に統合(セーブ移行1パス)
7. **T1 段階2**: ✅ 実装済み(2026-09-05) 各システムの `reads` / `writes` を正しく宣言

T1 段階1 の実装時に判明した点:

- **分割数は10ではなく12。** `economy:annualUrbanKnowledge`(130行・25呼び出し)を
  本書の指示どおり3つ以上に割った結果、`annualUrbanLabor` / `annualPlants` /
  `annualInfrastructure` / `annualKnowledge` / `annualBurgGroups` の5つになった。
  実行順は `src/extensions/economy/tickSystemIds.ts` に一覧として宣言し、
  `registerEconomyTickSystem` が登録位置とその一覧を突き合わせて検証する
  ——「呼び出しが並んでいる順」ではなく「宣言された順」が正になる。
- **「挙動は完全に同一」は正しくなかった。** 本書の §T1 段階1 はそう書いていたが、
  ホストの RNG は `deriveSystemStreamSeed(masterSeed, {systemId, tick, year, month, day})`
  (`src/runtime/simulationRng.ts:164`)でシステム **ID ごとに独立ストリーム**を導出する。
  1システムを12に割れば ID が変わるので、同じマップシードでも乱数列が変わる。
  ロジック・実行順・トピックは完全に保存されるが、既存セーブの以後の乱数結果は再現しない。
  ID をまたいでストリームを固定する仕組みはホスト側に無く、あれば per-system 分離という
  設計意図自体を壊すので、そのまま受け入れた。**第3波以降のバランス検証は、この分割の
  後に取り直した基準値と比較すること。**
- **本書が警告した unregister の順序制約は実在した。** チェーンは線形なので
  先頭から解除すると `cannot be removed` で throw する。`cleanup()` を逆順ループに変え、
  その2性質(チェーン順に解決される・shipbuilding.tick より前に走る／逆順解除が必要)を
  `tickSystemOrder.test.ts` でホストレジストリに対して直接検証している。
- **移植の忠実性を機械照合した。** 分割前の `run()` 本体と分割後12システムの本体から
  コメント・スキャフォールドを除いた実行文を突き合わせ、139文がすべて対応することを確認した。
  差分は `let` → `const` 化と、旧 `if (burgGroupsChanged || settledAdults > 0 || urbanWaterChanged)`
  の 1 箇所が各フラグを持つ3システムの個別 `if` に分かれた分のみ(トピックは重複除去されるので
  結果は同一)。
- **ブラウザでの実地確認はできていない。** この環境ではマップ生成が cells 生成後に
  停止するが、**clean master でも同一に再現する**ため本変更とは無関係。
  実機確認は別途必要。

### 第3波 — 経済モデルの穴を埋める(**ここが本命**)

8. **L3** ✅ 実装済み(2026-09-05)。`Burg.foodSecurity` を新設し、飢饉を人口動態に接続(疫病と同じ構図)
9. **L4** ✅ 実装済み(2026-09-05)。都市 capacity の年次リコンサイル + 建設ストックの上方クランプ
10. **L2 Phase 1** ✅ 実装済み(2026-09-05)。製造に労賃費目を追加し、`wageByOccupation` を生かす
11. **L1** ✅ 実装済み(2026-09-05)。価格弾力性 + 価格の緩和更新
12. **L5** ✅ 実装済み(2026-09-05)。戦時修正子を交易パスにも適用

L3 → L4 → L1 の順が重要。L3 で「食料不足が痛い」状態を作ってから L4 で
「農業改良が都市を成長させる」を入れ、最後に L1 で価格が調整弁として働くようにすると、
各段階でバランスを確認しながら進められる。逆順だと壊れた挙動が相殺し合って原因が特定できない。

L4 の実装時に判明した点:

- **生産ボーナスと住宅キャップは別乗数。** 本書は `getConstructionProductivityMultiplier` のレンジを
  `[0.5, 1.0]` → `[0.5, 1.3]` に広げると書いていたが、同関数は `production-generator.ts` の
  都市ローカルボーナス(旧 `shanty` ペナルティ)にも使われ、1.0 は「ペナルティなし」であって
  生産ボーナスではない。レンジを上げると満室都市の産出が突然 30% 増える。住宅キャップは
  `getConstructionCapacityMultiplier`(`[0.5, 1.3]`)に分け、生産側は現行のままにした。
- **輸入は capacity と effectiveCapacity の両方に残る。** 後背地余剰だけを `capacity` に書くと、
  輸入依存の大都市は `seedCapacity * 0.5` まで落ち、住宅天井 `1.3 × 0.5 seed` が輸入ボーナスを
  潰す。四半期の `importCapacityBonus` を年次の食料項に足し、`applyImportCapacity` の四半期加算は
  触っていない。安定輸入の二重計上があっても住宅バンドが 1.3× でクリップする。
- **旧セーブは 1 年遅れて乗り換える。** `seedCapacity` が無い burg は今年の `capacity` を錨として
  記録するだけで書き換えない。翌年から AgTech / 干ばつが都市上限に届く。
- **検証はユニット。** `urbanFoodCapacity.test.ts` が後背地の豊かな市場と貧しい市場で都市
  `capacity` に差が付くこと、空の後背地+輸入でメガシティが床まで落ちないことを確認する。
  本書の「AgTech 最大/最小で 50 年後に有意差」は実マップの観測であり、別途の実機確認。

L2 Phase 1 の実装時に判明した点:

- **`wageByOccupation` は戦略 5 職しか無い。** Sails/Ropes/Tar/Wood 以外のクラフトは
  その市場の `forestry` 賃金(未熟練の床)を使う。労働市場が無い(テスト・未リコンサイル)ときは
  賃率 0 で、既存の `treasury: 0` 製造テストは壊れない。
- **労賃も原料と同じ現金キャップに入れる。** 引き算だけだと治療が再びマイナス無限になるので、
  `affordableYield` を `ingredientCostPerUnit + laborPerLot * wageRate` にした。同じ財布なら
  賃金が高い市場ほどロットが減る——本書が求めた「労働集約品は労働が安い都市で作られる」。
- **`burg.product` は原料費だけを引いたまま。** 付加価値から労賃を落とすと商人収入のフォールバック
  (`getBurgGrossRevenue`)まで動く。Phase 2 の家計財布まで意味を変えない。
- **検証はユニット。** 治療の 50 年均衡は実マップ観測。キャリブレーション onboard では
  `laborPointsPerLot` が小さいので、既存の `good.value * demandMultiplier` 賃率でも月次労賃は
  原料費より一桁小さい。スケール定数はまだ置いていない。

L1 の実装時に判明した点:

- **カタログ 200 行は触っていない。** `priceElasticity` 未設定は 0 ではなく、タグから補う
  (`luxury` / `demandCoverage.luxury` → -1.2、`food` → -0.2)。明示 0 は非弾性のまま。
  既存テストの Wheat は初回 `price === value` なので弾力性は効かず、期待値は変わらない。
- **価格の記憶は緩和 0.4。** `initializeMarketPrices` は `good.value` からの再導出をやめ、
  前サイクル価格からターゲットへ 40% だけ進む。`stapleFood` は従来どおり `settleGrainPrice`
  専用で対象外。需要は同じサイクルの新価格ではなく前サイクル価格で決める(1期ラグ)。
- **検証はユニット。** 弾力性 -1 の Good を在庫半減させると価格が上がり需要が下がること、
  弾力性 0 では需要が価格に反応しないこと、空在庫でも天井へスナップしないことを確認する。

L5 の実装時に判明した点:

- **決済価格は中値のまま。** 戦時修正子は「この取引をするか」の評価(unitProfit / 予備)にだけ掛け、
  Deal の landed cost は生の中値。小売の `customerBuyPrice` が同じ修正子をもう一度掛けるので、
  卸価格まで戦時化すると二重になる。
- **禁輸はそのまま。** `isMarketTradePermitted` は商人組織の行程日数キャップであり、
  `tradeSanctions` は対外債務デフォルトの関税。どちらも「敵国へ武器を売るか」ではないので
  価格パスとは分けたまま。
- **予備の戦争項は `warEconomyType` military/essential** (タグ `military` も可)。luxury は
  価格が下がるだけで備蓄予備は増やさない。
- **`getWarPriceModifier` の `!goodId` は id 0 を弾いていた。** テストカタログは `i: 0` を使うので、
  `goodId === undefined` に直した。本番カタログは 1-origin なので実害は出ていなかった。

L3 の実装時に判明した点:

- **ホストは四半期カウンタを読まない。** 本書の疑似コードは `foodSecurity < FOOD_SECURE_THRESHOLD`
  の一本だが、死亡を2四半期ゲートするには持続期間を `foodSecurity` 自体へ焼き込む必要があった
  (`urbanSevereDeficitQuarters` は Food Ledger 上にしか無く、ホストが Economy を import しない
  という制約を守るため)。Economy は四半期末に
  `computeUrbanFoodSecurity(urbanShortfallRate, urbanSevereDeficitQuarters)` を全 market burg へ書く。
  0–1 四半期は `foodSecurity >= 0.85`(出生減のみ)、2四半期目から 0.85 未満(死亡も)。
  ホスト側は疫病と同じく Burg 上の 0..1 フィールドだけを読む。
- **出生減は死亡より先に効く。** `foodSecurity < 1` で `replacementAwareBirths` の結果に乗数を掛け、
  0.85 未満になって初めて `famine` バケットへ死亡を足す。置換出生フロアも飢饉時は削る
  (食べられていない都市が自然減を埋め直すのはおかしい)。
- **死亡率は疫病より緩い。** 疫病は `waterSecurity 0` で年率 ~12%(2乗ランプ)。飢饉は
  `foodSecurity 0` で年率 ~8%(同じく2乗)。単月の在庫ブレで都市が消えない、という本書の要件に合わせた。
- **検証はユニットで、フルマップの輸入切断シナリオではない。** `demography-famine.test.ts` が
  `foodSecurity = 0` の大都市が5年で縮小し、同条件の `foodSecurity = 1` は成長することを確認する。
  `foodLedgerConsumption.test.ts` が空在庫1四半期では死亡バンド以上、2四半期でバンド割れ、
  充足四半期で 1 に戻ることを確認する。`megacity-food-import-economy.md` の実マップ輸入切断は
  別途の実機確認。

### 第4波 — 大きな設計判断を伴うもの

13. **L6**: 輸送コストの嵩ベース化(`goods-unit-scale.md` の再キャリブレーションを伴う)
14. **L9**: `Burg.discontent` + 征服時の物的破壊
15. **L8 段階2**: `publicWorks` 予算部門と街道の実行時昇格
16. **L2 Phase 2/3**: 家計財布の導入(人頭税を創造から移転へ)
17. **L7**: 貨幣供給の物価接続(**着手しない判断も妥当**。その場合は
    `minting.ts` に「`circulation` は意図的に観測専用」と明記する)

---

# 意図的に疎のままでよいと判断したもの

調査中に見つかったが、**修正すべきでない**と判断した箇所。記録として残す。

- **静的 import グラフに循環が無いこと**は、この規模のコードベースとして
  例外的に良好。この規律は維持すべきで、上記の修正案はどれも新しい循環を作らない。
- **Shipbuilding ↔ Economy の CustomEvent 境界**は正しく疎結合で、
  `docs/plan/extension-dependencies.md` の理想形そのもの。触らない。
- **`Dams` / `Levees` が市場財源で建つ**ことは、国家予算(L8 段階2)とは別系統でよい。
  現実の堤防も領主・都市・国家が並行して建てた。統合しない。
- **鮮度・腐敗による交易日数上限**(`PERISHABLE_MAX_TRADE_DAYS`,
  `FRESH_FOOD_*`)は物理制約であり、L6 で連続コスト化しても残すべき。
  価値密度ゲート(`densityLimit`)だけが経済制約の代用品なので、それだけを外す。
- **`coupAftermath` の内乱と `ecclesiasticaUnrest` の宗教不満**は、
  L9-b の `Burg.discontent` とは粒度(state 単位 vs burg 単位)も原因も異なる。
  統合せず並存させる。

---

## 付録: 調査に使った確認コマンド

```bash
# 循環依存の検出(値 import のみ、type import 除外)— 結果 0 件
node scripts/... # 本書執筆時はスクラッチで実施

# economyContext のハブ度
grep -c "^export " src/extensions/economy/economyContext.ts            # 410
grep -rl "from \"../economyContext\"" src/extensions/economy | wc -l   # 177

# tick 内の手書き順序
sed -n 2859,3225p src/extensions/economy/index.tsx | grep -c "settleAnnual()"   # 31
grep -c "[Mm]ust run \(before\|after\)" src/extensions/economy/index.tsx        # 10

# 年次ゲートの複製
grep -c "LastSettledYear" src/extensions/economy/economyContext.ts     # 282

# 死に変数の確認
grep -rn "wageByOccupation" src | grep -v "\.test\."                   # 書き込みのみ
grep -rn "urbanSevereDeficitQuarters" src | grep -v "\.test\."         # 書き込みのみ
grep -rn "circulation" src/extensions/economy | grep -v minting.ts     # 外部読み出しなし
```
