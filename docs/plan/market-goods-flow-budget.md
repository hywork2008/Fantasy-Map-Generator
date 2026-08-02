# Market Goods Flow Budget — 年次需給と適正物流量

| 項目 | 内容 |
| :-- | :-- |
| Status | In progress — Phase A0/A3 API first |
| 対象 | Economy extension 一般 Goods（stapleFood / Food Ledger は別系統） |
| 関連 | [merchant-logistics-warehouses.md](merchant-logistics-warehouses.md), trade cargo, drop-poor-trade |
| 調査日 | 2026-08-02 |

## 1. 目的

物流（倉庫・集荷・出航）を史実寄りにしても、**各地の年次生産・需要・在庫目標が未定義**だと「適正輸送量」が決まらない。  
本ドキュメントは、一般 Goods について **12 生産サイクル ≒ 1 年** のフロー予算を定義し、交易・倉庫・艦隊サイズの入力にする。

## 2. 現状ギャップ

| 項目 | 現状 | あるべき姿 |
| :--- | :--- | :--- |
| 需要 | サイクルごと `population × DEMAND_TARGET_FACTORS` | 年次需要 = 12 × サイクル需要（明示） |
| 在庫 | 瞬間的な `stock` | months-of-cover 目標在庫 |
| 交易量 | `stock − demand×1.2` の残差 | export/import budget |
| 艦隊 | burg 数ヒューリスティック | 年次 export cargo slots から導出 |
| 食料 | `GROSS_FOOD_NEED` 年次 | 一般 Goods は同じ「形」を模倣 |

## 3. 定数

```ts
export const CYCLES_PER_YEAR = 12; // production ~ every 30 sim days

// Default retail cover (months of cycle demand held as stock)
export const DEFAULT_MONTHS_OF_COVER = {
  localBulk: 2.5,   // wood, stone, grain-like non-ledger bulk
  tradeStaple: 2.0, // salt, cloth, tools
  luxury: 1.0,
  military: 1.5
} as const;
```

`TRADE_RESERVE_FACTOR = 0.2`（輸出後も `demand×1.2` を残す）は local reserve として budget に残す。

## 4. 予算式

市場 m・商品 g について（1 サイクル）:

```text
cycleDemand     = population(m) * (consumerFactor[g] + industrialFactor[g])
annualDemand    = cycleDemand * CYCLES_PER_YEAR
cycleProduction = rural + burg production credited this cycle (snapshot)
annualProduction = cycleProduction * CYCLES_PER_YEAR   // or EWMA of last 12

targetStock     = monthsOfCover(g) * cycleDemand
localReserve    = cycleDemand * (1 + TRADE_RESERVE_FACTOR)   // same shape as runGlobalTrade

// After accounting for current stock and this cycle's production inflow:
availableAfterReserve = stock + cycleProduction - localReserve
// Prefer holding targetStock before exporting:
exportBudget = max(0, stock + cycleProduction - max(targetStock, localReserve))
importBudget = max(0, max(targetStock, cycleDemand) - stock - cycleProduction)

exportCargoSlots = exportBudget * cargoSlotsPerUnit(g)
```

注意: `cycleProduction` が未計測のサイクルでは 0 とし、stock のみで export/import を見積もる（ソフト予算）。

## 5. 物流への接続

```text
annualExportSlots(m) = Σ_g exportBudget_g * slots_g * CYCLES_PER_YEAR   // if exportBudget is per-cycle
tripsPerYear ≈ annualExportSlots / (capacitySlots * targetUtilization)
requiredFleet ≈ tripsPerYear * meanRoundTripDays / 365
stagingSlots ≈ meanMonthlyExportSlots * (maxWaitDays / 30)
```

## 6. 実装モジュール

- `src/extensions/economy/generators/marketFlowBudget.ts` — 純粋関数
- Diagnostics / tests で A0 計測
- 交易へのソフト適用は倉庫フェーズと同時

## 7. 非目標

- Food Ledger の置き換え
- 実世界トン数
- 全品目の厳密な歴史的消費バスケット（カテゴリ比の軽い調整に留める）

## 8. 完了条件

- [x] 純粋 budget API と unit tests (`marketFlowBudget.ts`)
- [x] 積載率診断ヘルパ (`summarizeCaravanUtilization`)
- [x] 交易が exportBudget をソフト上限として利用（自然余剰パスのみ；投機取引は従来の available クランプ）
- [x] Export staging 倉庫が retail から book（Phase C）
- [ ] 固定 seed 12 サイクル計測レポート（ゲーム内 / 分析スクリプト）
- [ ] 艦隊 seed が年次 slots を参照（任意）
