# 農村技術投資システム設計 (Rural AgTech Investment)

## 状態

**2026-07-31 実装済み(Phase 1)**: §3 の全て(`Market.agTechStock`、`AgTechInvestment.settleAnnual()`、`Markets.consumeForMarketInvestment()`、`calculateAgriculturalLandProfile()`への`agTechStockByCell`引数、Cattle/Horsesへの`draft`タグ)を実装した。`economy.tick`から`DevelopmentPotential.updateAnnualAgriculture()`の直前に`AgTechInvestment.settleAnnual()`を呼ぶ。ユニットテスト(`agTechInvestment.test.ts`、`agriculturalLandUse.test.ts`)・`tsc --noEmit`・`npm run build`・`npm run lint`・`npm run madge`をすべて確認済み(既存の27件の循環依存は本変更前から存在するもので、新規ファイルはいずれにも含まれない)。

**2026-07-31 実装済み(Phase 2)**: §6・§7 の全て(`stateAgriculturalProductivity`(economy slice所有のFloat32Array、State型は変更せず)、`MineOperation`/`SmelterOperation`の`toolsInvestmentStock`、新規`industrialTechInvestment.ts`、`calculateAgriculturalLandProfile()`の第3引数、`MarketOverviewDialog`のAg Tech表示)を実装した。`economy.tick`で`AgTechInvestment.settleAnnual()`→`IndustrialTechInvestment.settleAnnual()`→`DevelopmentPotential.updateAnnualAgriculture()`の順に呼ぶ。新規ユニットテスト(`industrialTechInvestment.test.ts`、`agTechInvestment.test.ts`/`agriculturalLandUse.test.ts`への追加)を含む economy拡張の全249テスト・`tsc --noEmit`・`npm run build`・`npm run lint`・`npm run madge`(既存27件の循環依存から増減なし)を確認済み。

## 1. 目的と非目的

### 目的

- `Tools`(鉄鉱石→精錬→インゴット→農具という既存のサプライチェーンの終点)を、都市の消費財としてだけでなく**農業生産性への入力**として接続する。
- [population-food-supply.md](../simulation/population-food-supply.md) §3.1 が予約したまま未実装の `cellAgriculturalModifier` を、実際に動く仕組みとして実装する。
- 既存の農村→都市労働力移動パイプライン([ruralLaborRelease.ts](../../src/extensions/economy/generators/ruralLaborRelease.ts))と食料台帳パイプライン([foodProduction.ts](../../src/extensions/economy/generators/foodProduction.ts))を**変更せずに**、「農村の技術発展 → 同じ土地をより少ない人手で耕せる → 余剰食料と余剰労働力の双方が増える → 都市が食料と人手の両方を受け取る」という因果を成立させる。
- `Cattle` / `Horses` に、食料原料以外の役割(役畜としての効率押し上げ)を与える。
- Iron Ore・Coal などの鉱物資源チェーンに、`Tools` を通じた継続的な需要を作る(現状 `Tools` は一度売れたら終わりの消費財)。

### 非目的

- Cattle/Horses の頭数を実際に消費・繁殖させる専用の家畜資本ストック。バイオームタグによる「役畜が存在する土地か」の判定のみとする(Phase 1・Phase 2共通)。
- 木製犂・鉄製犂のような農具の中間ティア化。`Tools` は単一の Good のまま(Phase 1・Phase 2共通)。
- State の治安・戦禍要因(population-food-supply.md §3.1 の「治安」)を新設すること。これは既存の `foodStressProductionMultiplier(stateId)`([production-utils.ts](../../src/extensions/economy/generators/production-utils.ts))が既に担っており、本書は「技術・灌漑投資」側のみを扱う(§6.1)。
- State の統治制度(「統治制度」要因)を新設すること。行政人員充足率(`administrationEmployment.ts`)など既存シグナルの再利用は将来課題とし、本書の `stateAgriculturalProductivity` は Tools 投資のみをモデル化する。

## 2. 現状監査(コード参照)

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| `Tools` | `Iron Ingot`/`Bronze` + `Coal` から生産される既存 Good。だが `demandCoverage: { utilities: 1 }` のみで、都市の一般需要充足ループにしか使われない。農業には無関係。 | [goods-generator.ts:961-974](../../src/extensions/economy/generators/goods-generator.ts#L961-L974) |
| `Cattle` | `tags: ["food"]` のみ。役畜としての側面はゼロ。 | [goods-generator.ts:296-309](../../src/extensions/economy/generators/goods-generator.ts#L296-L309) |
| 収量式 | `BASE_NET_YIELD_KG_PER_SOWN_HECTARE`・`LABOUR_DAYS_PER_HECTARE` は完全な定数。技術投入を受け付ける係数がない。 | [agriculturalLandUse.ts:7-8](../../src/extensions/economy/generators/agriculturalLandUse.ts#L7-L8) |
| ドキュメント上の予約 | `actualFoodProduced = foodPotential × stateAgriculturalProductivity × cellAgriculturalModifier × ...`、両係数とも「v1は1.0固定、後続の技術システムが更新する」と明記。実コードには両係数とも存在しない。 | [population-food-supply.md:53-63](../simulation/population-food-supply.md#L53) |
| 鉱山側の同型の穴 | `MineOperation.technology`/`SmelterOperation.technology` は存在するが、`prospect()` が深部鉱床発見時に静的に `1.1` へ上げるだけで、`Tools` の実供給・消費とは無関係。 | [mineOperations.ts:80-89](../../src/extensions/economy/generators/mineOperations.ts#L80-L89) |
| 都市への労働力解放 | `migratableAdults`/`ruralReleasePressure` を都市キューへ渡す仕組みは実装済みだが、入力の `farmLaborRequired` が定数由来のため技術発展を反映できない。 | [ruralLaborRelease.ts](../../src/extensions/economy/generators/ruralLaborRelease.ts) |

## 3. 設計

### 3.1 概念モデル

```
Iron Ore → (Smelter) → Iron Ingot → (Production worker loop) → Tools ─┐
                                                                       ├─▶ AgTechInvestment.settleAnnual()
Cattle / Horses (biome-tagged draft availability) ─────────────────────┘         │
                                                                                  ▼
                                                                    Market.agTechStock (0..1, EWMA)
                                                                                  │
                                                                                  ▼
                                             calculateAgriculturalLandProfile()（cellAgriculturalModifier 相当）
                                                                                  │
                                                    ┌─────────────────────────────┴─────────────────────────────┐
                                                    ▼                                                            ▼
                                          yieldPerArea ↑ (foodPotential ↑ → exportable ↑)      laborDaysPerHectare ↓ (farmLaborRequired ↓ → migratableAdults / ruralReleasePressure ↑)
                                                    │                                                            │
                                                    ▼                                                            ▼
                                         foodProduction.ts の四半期台帳（変更なし）              ruralLaborRelease.ts の都市労働力解放（変更なし）
```

新しい層は `AgTechInvestment` と `Market.agTechStock` だけであり、それより下流(食料台帳・都市労働力受け入れ)は一切変更しない。既存の2本のパイプラインへ新しい入力を1つ足すだけの設計にする。

### 3.2 データ契約

```ts
// src/extensions/economy/generators/marketTypes.ts — Market interface に追加
interface Market {
  // ...既存フィールド
  /**
   * 0..1 の飽和ストック。市場圏の農地における鉄製農具(Tools)の普及度合いを表す
   * 年次投資カバレッジの指数移動平均(EWMA)。継続投資がなければ緩やかに 0 へ戻る。
   * 未設定(初期状態・economy初回有効化直後)は 0 として扱う。
   */
  agTechStock?: number;
}
```

```ts
// src/extensions/economy/generators/agTechInvestment.ts — 新規
export const TARGET_TOOLS_PER_HECTARE = 0.02; // "calibration TBD" — 完全機械化相当の年間投資目標(set/ha)
export const AGTECH_BUDGET_SHARE_OF_TREASURY = 0.15; // marketTreasury.balance のうちこの投資に回せる上限比率
export const AGTECH_ADOPTION_RATE = 0.15; // EWMA平滑化係数。約7年で投資カバレッジに追従
export const AGTECH_YIELD_BONUS_MAX = 0.4; // agTechStock=1・役畜ありで yieldPerArea が最大 +40%
export const AGTECH_LABOR_SAVINGS_MAX = 0.35; // 同条件で laborDaysPerHectare が最大 -35%
export const AGTECH_NO_DRAFT_EFFECT_SHARE = 0.6; // 役畜がいない場合、上記ボーナスの何割まで届くか
export const DRAFT_CAPABLE_BIOME_TAGS = ["grassland", "nomadic"] as const; // Cattle/Horses の biomeOutputByTag と同じキー
```

### 3.3 年次投資決済(`AgTechInvestment.settleAnnual()`)

`DevelopmentPotential.updateAnnualAgriculture()` の直前に、同じ「年が変わった時だけ実行」ゲートで呼ぶ(自前の `agTechLastSettledYear` を economy slice に持ち、二重実行を防ぐ)。

各 Market について:

```
requestedUnits   = market圏セルのcultivatedArea合計(ha) × TARGET_TOOLS_PER_HECTARE   // cultivatedAreaは既にhectare単位(populationRateで割らない)
requestedCost    = requestedUnits × Toolsの現在価格
affordableCost   = min(requestedCost, marketTreasury.balance × AGTECH_BUDGET_SHARE_OF_TREASURY)
purchasedUnits   = min(affordableCost / 価格, market.goods[Tools].stock)   // 市場在庫を超えて買えない
marketTreasury.balance -= purchasedUnits × 価格
market.goods[Tools].stock -= purchasedUnits

coverageThisYear = requestedUnits > 0 ? min(1, purchasedUnits / requestedUnits) : 0
market.agTechStock = (market.agTechStock ?? 0) × (1 − AGTECH_ADOPTION_RATE) + coverageThisYear × AGTECH_ADOPTION_RATE
```

- 財源は `market.marketTreasury.balance`(現行、農村からの穀物買い付けにも使われている同じ口座)を再利用する。新しい口座は作らない。
- `Markets` モジュールに `consumeForMarketInvestment(marketId, goodId, requestedUnits, budget)` を追加し、`consumeForSmelting`/`consumeForMilitary`/`settleSecurityUpkeep` と同じ「在庫と予算の両方で頭打ちにする」パターンに揃える(既存メソッド群と同じファイルに実装する)。他の`consumeForX`と異なり実際に代金を払う取引なので、購入コストを返り値で返し、呼び出し側(`AgTechInvestment`)が`marketTreasury.balance`を減算する(`settleSecurityUpkeep`が呼び出し側でState treasuryを減算するのと同じ分担)。
- `coverageThisYear` が 0(Tools が買えなかった年)でも EWMA なので `agTechStock` は緩やかに減衰するだけで、既存投資の効果が一瞬で消えることはない ─ 農具は壊れるまで使い続けられる、という直感に合う。

### 3.4 収量・労働力への反映(`agriculturalLandUse.ts`)

`calculateAgriculturalLandProfile(world, agTechStockByCell?)` に第2引数を追加する(省略時は全セル0 = 現行動作と完全互換)。呼び出し元の `developmentPotential.ts` が `market.agTechStock` を `marketCellColumn` 経由でセル単位に展開して渡す ─ `agriculturalLandUse.ts` 自体は Market の概念を知らないままにする(既存の「人口・Marketから独立した環境計算」という設計を保つ)。

セルごとに、既存の `tags = world.biomesData.tags?.[biomeCode]` 参照(既に `calculateCultivableAreaHectares` にある)を再利用して役畜可用性を判定する:

```
hasDraftAnimal = tags.some(t => DRAFT_CAPABLE_BIOME_TAGS.includes(t))
effectiveAgTech = agTechStockByCell[cellId] × (hasDraftAnimal ? 1 : AGTECH_NO_DRAFT_EFFECT_SHARE)

yieldKgPerHa = BASE_NET_YIELD_KG_PER_SOWN_HECTARE × relativeYield[cellId] × (1 + AGTECH_YIELD_BONUS_MAX × effectiveAgTech)
effectiveLaborDaysPerHectare = LABOUR_DAYS_PER_HECTARE × (1 − AGTECH_LABOR_SAVINGS_MAX × effectiveAgTech)
```

`effectiveLaborDaysPerHectare` は `farmLaborRequired` の計算(既存の `requiredAdults = (currentArea × LABOUR_DAYS_PER_HECTARE) / WORKABLE_DAYS_PER_ADULT` の分子)にのみ使う。`yieldKgPerHa` は既存通り `foodPotential`・`cultivatedArea` の計算全体に伝播する。

鉄製農具だけでは満額(`AGTECH_YIELD_BONUS_MAX`/`AGTECH_LABOR_SAVINGS_MAX`)の6割までしか届かず、`grassland`/`nomadic` バイオームで牛馬が実際に生産されている土地(=重量有輪犂を牽ける土地)だけがフル効果に達する。これが「Cattle を役畜として装備させる」の実装にあたる部分で、新しい家畜在庫を持たずに済む。

### 3.5 呼び出し順序(`src/extensions/economy/index.tsx` の `economy.tick`)

```ts
if (yearChanged) AgTechInvestment.settleAnnual();     // 追加: Toolsを購入しagTechStockを更新
const agricultureRefreshed = DevelopmentPotential.updateAnnualAgriculture(); // 既存: agTechStockを読んでyield/laborへ反映
if (agricultureRefreshed && ruralUrbanMigration === "megacity") {
  releaseRuralLaborSurplus(getWorldContext());          // 既存、無変更
}
```

`AgTechInvestment.settleAnnual()` は必ず `updateAnnualAgriculture()` より前に実行し、その年の投資が同じ年の収量・労働力計算に反映されるようにする。

## 4. Phase 分割

- **Phase 1(実装済み)**: §3 の全て。`Tools` 購入 → `agTechStock` → `yieldPerArea`/労働力への反映、Cattle/Horses の役畜可用性判定。
- **Phase 2(本書のこの改訂で実装)**: §6(State単位 `stateAgriculturalProductivity`、鉱山・製錬所 `technology` の同型拡張)、§7(UI可視化)。

## 5. テスト計画(Phase 1)

- `agTechInvestment.test.ts`(新規): 予算内で `Tools` を購入し `agTechStock` が上昇すること、`marketTreasury.balance` が不足する年は購入量が絞られること、供給が止まった年は `agTechStock` が緩やかに減衰すること、`Tools` 市場在庫がゼロなら購入量もゼロになること。
- `agriculturalLandUse.test.ts`(既存に追加): 同一セルで `agTechStockByCell` ありなしを比較し、`yieldPerArea` が上昇し `farmLaborRequired` が低下すること。`grassland`/`nomadic` タグの有無で効果が変わること(役畜ボーナス)。第2引数省略時は既存挙動と完全一致すること(後方互換の回帰確認)。

## 6. Phase 2: State単位・鉱業側への拡張

### 6.1 `stateAgriculturalProductivity`(State単位)

Market単位の `agTechStock`(農家レベルの犂・鉄製農具)とは別の層として、State単位の「技術・灌漑投資」(population-food-supply.md §3.1)を追加する。統治制度・治安の要因は既存シグナル(§1非目的参照)に譲り、本書はToolsを介した公共インフラ投資(街道・灌漑水路・穀倉)だけをモデル化する。

Market単位の投資と財源を分けるため、`state.treasury`(既存、[taxes-generator.ts](../../src/extensions/economy/generators/taxes-generator.ts)や[smelterOperations.ts](../../src/extensions/economy/generators/smelterOperations.ts)の`settleSecurityUpkeep`で既に使われている)から支払う。Market の Tools **在庫**は共有するが、**資金**は競合しない(Marketの農家投資はmarketTreasury、Stateのインフラ投資はstate.treasuryと別会計)。

```
# AgTechInvestment.settleAnnual() 内、Market単位の投資決済に続けて実行(同じ年次ゲートを共有)
stateCultivatedHectares(stateId) = Σ cells.state[cellId]==stateId の cultivatedArea(ha)  // cells.stateは既存カラム
                                    ※ セルが属するmarketごとに内訳を保持し、そのmarketのTools在庫から購入する

各 (state, market) 組について:
  requestedUnits = そのmarket圏内でstateに属するcultivatedArea(ha) × STATE_TARGET_TOOLS_PER_HECTARE
  budget         = state.treasury × STATE_BUDGET_SHARE_OF_TREASURY を該当市場群へcultivatedArea比で按分
  { units, cost } = Markets.consumeForMarketInvestment(marketId, ToolsId, requestedUnits, budget)
  state.treasury -= cost   // Marketではなくstate側の口座を減らす

coverageThisYear(stateId) = requestedUnitsTotal > 0 ? min(1, purchasedUnitsTotal / requestedUnitsTotal) : 0
stateAgriculturalProductivity[stateId] = 既存値 × (1 − STATE_ADOPTION_RATE) + coverageThisYear × STATE_ADOPTION_RATE
```

定数(§3.2に追加、同じ `agTechInvestment.ts`):

```ts
export const STATE_TARGET_TOOLS_PER_HECTARE = 0.008; // Market単位(0.02)より小さい — 農具ではなく街道・灌漑等のインフラ相当
export const STATE_BUDGET_SHARE_OF_TREASURY = 0.1;
export const STATE_ADOPTION_RATE = 0.1; // Market単位(0.15)より遅い制度的投資
export const STATE_YIELD_BONUS_MAX = 0.15; // stateAgriculturalProductivity=1で yieldPerArea が追加で最大 +15%
```

保存先は `Market.agTechStock` と異なり `State` は host 型([types/models.ts](../../src/types/models.ts))なので、新フィールドを追加すると `StateSimulationState`/`SIMULATION_STATE_FIELDS`([context/simulationContext.ts](../../src/context/simulationContext.ts)、[runtime/simulationStateState.ts](../../src/runtime/simulationStateState.ts))という host 側のライブバインディング機構まで変更が波及する。これを避けるため、`stateAgriculturalProductivity` は economy extension 自身が所有する `Float32Array`(state.i でインデックス、セル列と同じ `getSliceFloat32Column` パターン)として `economyContext.ts` に持つ ─ `Market.agTechStock` が Market(economy所有型)のフィールドで完結するのと異なり、State は host 型なので、この一点だけ「拡張所有の配列」という別の格納方式を取る。

`calculateAgriculturalLandProfile(world, agTechStockByCell?, stateProductivityByCell?)` に第3引数を追加し、`developmentPotential.ts` が `cells.state[cellId]` 経由でセルへ展開して渡す(第2引数の `marketCellColumn` 展開と同じ形)。反映式(§3.4の`yieldKgPerHa`行を置き換え):

```
yieldKgPerHa = BASE_NET_YIELD_KG_PER_SOWN_HECTARE × relativeYield[cellId]
             × (1 + AGTECH_YIELD_BONUS_MAX × effectiveAgTech)
             × (1 + STATE_YIELD_BONUS_MAX × stateProductivityByCell[cellId])
```

State側は役畜判定・労働力軽減を持たない(灌漑・街道は収量には効くが、個々の農家の労働日数を直接削らないという単純化)。

### 6.2 `MineOperation.technology` / `SmelterOperation.technology`

鉱山・製錬所それぞれに `toolsInvestmentStock?: number`(0..1 EWMA)を追加する(`mineralResources.ts`の`MineOperation`、`smelterOperations.ts`の`SmelterOperation`。どちらも economy 所有型なので host 変更は不要)。既存の `technology`(`prospect()`由来の静的値)は変更せず、`extractionFactor`/`processingFactor` の計算に独立した乗数として掛ける:

```
# mineOperations.ts produceMonth()
extractionFactor = workerFactor × technology × (1 + MINE_TECH_BONUS_MAX × toolsInvestmentStock) × drainage × fuelAccess × accessibility

# smelterOperations.ts produceMonth()
processingFactor = waterPower × fuelAccess × technology × (1 + SMELTER_TECH_BONUS_MAX × toolsInvestmentStock) × workerFactor
```

新規モジュール `industrialTechInvestment.ts`(`basicEmployment.ts`が鉱山・製錬所・行政の年次雇用調整を1つの関数にまとめているのと同じ「複数operation種別を横断する年次調整」の型に揃える)が、鉱山・製錬所それぞれについて Market単位のAgTechと同じ購入パターンを実行する。「規模」の代理変数として、既存の `getMineRequiredWorkers(deposit)`/`getSmelterRequiredWorkers(smelter)`(基本雇用調整で既に使われている校正済みの規模指標)をそのまま再利用し、鉱量・年産量を新たに導出しない:

```
requestedUnits = getMineRequiredWorkers(deposit) × MINE_TARGET_TOOLS_PER_WORKER        // 鉱山
requestedUnits = getSmelterRequiredWorkers(smelter) × SMELTER_TARGET_TOOLS_PER_WORKER  // 製錬所
budget         = market.marketTreasury.balance × (MINE|SMELTER)_BUDGET_SHARE_OF_TREASURY
{ units, cost } = Markets.consumeForMarketInvestment(operation.marketId, ToolsId, requestedUnits, budget)
marketTreasury.balance -= cost
toolsInvestmentStock = 既存値 × (1 − ADOPTION_RATE) + coverage × ADOPTION_RATE
```

財源は operation が所属する Market の `marketTreasury.balance` ─ Phase 1 の農家投資(AgTech)と同じ財布を取り合うが、年次tick内で「AgTech → 鉱山 → 製錬所」の順に実行するため、同じMarketの残高を先着順で使う(食料生産への投資を優先する既定の優先順位)。

```ts
export const MINE_TARGET_TOOLS_PER_WORKER = 0.05; // calibration TBD
export const MINE_BUDGET_SHARE_OF_TREASURY = 0.1;
export const MINE_ADOPTION_RATE = 0.12;
export const MINE_TECH_BONUS_MAX = 0.3;

export const SMELTER_TARGET_TOOLS_PER_WORKER = 0.05;
export const SMELTER_BUDGET_SHARE_OF_TREASURY = 0.1;
export const SMELTER_ADOPTION_RATE = 0.12;
export const SMELTER_TECH_BONUS_MAX = 0.3;
```

`operation.active === false`(deposit枯渇・供給停止)の年は、AgTechのMarket圏内cultivatedArea=0の場合と同様、購入せず既存ストックを`(1 − ADOPTION_RATE)`で減衰させるだけに留める。

### 6.3 呼び出し順序の更新

```ts
if (yearChanged) {
  AgTechInvestment.settleAnnual();          // Market農家投資 → State公共投資(同一関数内、§6.1)
  IndustrialTechInvestment.settleAnnual();  // 鉱山 → 製錬所(新規、§6.2)
}
const agricultureRefreshed = DevelopmentPotential.updateAnnualAgriculture(); // 既存、agTechStockByCell + stateProductivityByCellを読む
```

`IndustrialTechInvestment.settleAnnual()` は `MineOperations.produceMonth()`/`SmelterOperations.produceMonth()`(月次)より前であれば実行順は問わないが、年次ブロックの中で `AgTechInvestment.settleAnnual()` の直後に置き、Marketごとの`marketTreasury.balance`減算順序(農家優先)を保証する。

## 7. Phase 2: UI可視化

`MarketOverviewDialog`(市場ダイアログ、既に `cellsCount`/`burgsCount`/`totalStock` のサマリー行を持つ)に `Ag Tech: NN%`(`market.agTechStock`)を追加する。`marketOverviewState.ts`に`agTechStock: number`フィールドを追加し、`market-overview.ts`の`refreshMarketOverview()`で`rn((market.agTechStock ?? 0) * 100, 0)`をセットし、`MarketOverviewDialog.tsx`の既存サマリー行(`totalLine`)に4番目の項目として描画する。`stateAgriculturalProductivity`と鉱山・製錬所の`toolsInvestmentStock`はPhase 2のこの改訂では専用UIを追加しない(将来、State Economy SummaryやMine/Smelter一覧に追加できる余地として残す)。
