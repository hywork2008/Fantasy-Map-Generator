# 農村技術投資システム設計 (Rural AgTech Investment)

## 状態

**2026-07-31 実装済み(Phase 1)**: §3 の全て(`Market.agTechStock`、`AgTechInvestment.settleAnnual()`、`Markets.consumeForMarketInvestment()`、`calculateAgriculturalLandProfile()`への`agTechStockByCell`引数、Cattle/Horsesへの`draft`タグ)を実装した。`economy.tick`から`DevelopmentPotential.updateAnnualAgriculture()`の直前に`AgTechInvestment.settleAnnual()`を呼ぶ。ユニットテスト(`agTechInvestment.test.ts`、`agriculturalLandUse.test.ts`)・`tsc --noEmit`・`npm run build`・`npm run lint`・`npm run madge`をすべて確認済み(既存の27件の循環依存は本変更前から存在するもので、新規ファイルはいずれにも含まれない)。Phase 2(§6、State単位の`stateAgriculturalProductivity`)は未着手。

## 1. 目的と非目的

### 目的

- `Tools`(鉄鉱石→精錬→インゴット→農具という既存のサプライチェーンの終点)を、都市の消費財としてだけでなく**農業生産性への入力**として接続する。
- [population-food-supply.md](../simulation/population-food-supply.md) §3.1 が予約したまま未実装の `cellAgriculturalModifier` を、実際に動く仕組みとして実装する。
- 既存の農村→都市労働力移動パイプライン([ruralLaborRelease.ts](../../src/extensions/economy/generators/ruralLaborRelease.ts))と食料台帳パイプライン([foodProduction.ts](../../src/extensions/economy/generators/foodProduction.ts))を**変更せずに**、「農村の技術発展 → 同じ土地をより少ない人手で耕せる → 余剰食料と余剰労働力の双方が増える → 都市が食料と人手の両方を受け取る」という因果を成立させる。
- `Cattle` / `Horses` に、食料原料以外の役割(役畜としての効率押し上げ)を与える。
- Iron Ore・Coal などの鉱物資源チェーンに、`Tools` を通じた継続的な需要を作る(現状 `Tools` は一度売れたら終わりの消費財)。

### 非目的(このPhaseでは扱わない)

- `stateAgriculturalProductivity`(State単位の技術・統治係数、population-food-supply.md §3.1)の実装。本書は Market 単位の `cellAgriculturalModifier` 相当のみを扱う。
- `MineOperation.technology` / `SmelterOperation.technology`([mineOperations.ts](../../src/extensions/economy/generators/mineOperations.ts)、[smelterOperations.ts](../../src/extensions/economy/generators/smelterOperations.ts))を同じ投資ストックで駆動すること。同一パターンの自然な拡張として §6 に記すに留め、実装しない。
- Cattle/Horses の頭数を実際に消費・繁殖させる専用の家畜資本ストック。v1 はバイオームタグによる「役畜が存在する土地か」の判定のみとする。
- 木製犂・鉄製犂のような農具の中間ティア化。`Tools` は単一の Good のまま。

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

- **Phase 1(本書・このセッションで実装)**: §3 の全て。`Tools` 購入 → `agTechStock` → `yieldPerArea`/労働力への反映、Cattle/Horses の役畜可用性判定。
- **Phase 2(将来)**: `MineOperation.technology`/`SmelterOperation.technology` を同じ投資ストックの仕組みで駆動する(§6)。`stateAgriculturalProductivity`(State単位)の実装。UIでの農業技術水準の可視化(`production-overview.ts` 等)。

## 5. テスト計画

- `agTechInvestment.test.ts`(新規): 予算内で `Tools` を購入し `agTechStock` が上昇すること、`marketTreasury.balance` が不足する年は購入量が絞られること、供給が止まった年は `agTechStock` が緩やかに減衰すること、`Tools` 市場在庫がゼロなら購入量もゼロになること。
- `agriculturalLandUse.test.ts`(既存に追加): 同一セルで `agTechStockByCell` ありなしを比較し、`yieldPerArea` が上昇し `farmLaborRequired` が低下すること。`grassland`/`nomadic` タグの有無で効果が変わること(役畜ボーナス)。第2引数省略時は既存挙動と完全一致すること(後方互換の回帰確認)。

## 6. 鉱業側への同型拡張(参考、Phase 2 スコープ)

`MineOperation.technology`/`SmelterOperation.technology` は現状 `prospect()` の静的ボーナスでしか動かない。Phase 1 と同じ `consumeForAgTechInvestment` 相当の仕組みを鉱山・製錬所にも適用し、`Tools` の継続納入で `technology` を緩やかに引き上げる設計にできる。鉱山・製錬所は既に `technology` フィールドを持っているため(§2表)、Phase 1 で作る「Tools投資→EWMAストック」の実装をそのまま再利用できる見込みが高い。本書のスコープには含めない。
