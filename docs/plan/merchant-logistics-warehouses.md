# Merchant Logistics — Warehouses, Accumulation, Bulk Transport

| 項目 | 内容 |
| :-- | :-- |
| Status | Phases A–F + food co-load implemented |
| 前提 | [market-goods-flow-budget.md](market-goods-flow-budget.md), [drop-poor-trade.md](drop-poor-trade.md), [trade-cargo-capacity-and-diversity.md](trade-cargo-capacity-and-diversity.md), [merchant-transport-asset-ledger.md](merchant-transport-asset-ledger.md) |

## Problem

Many caravans sail at ~1% hold utilization. Causes:

1. No loading / accumulation buffer (drop-poor-trade step 2 unimplemented)
2. Immediate monthly depart after `runGlobalTrade`
3. Deal size = residual surplus, not cargo fill
4. Discrete vehicle classes vs continuous micro cargo
5. No merchant export warehouse or trade working capital
6. Unshipped deals cleared by `setDeals([])` after stock deduct
7. No annual P/S/D flow budget for general goods

## Two layers

| Layer | Question |
| :--- | :--- |
| A Flow budget | How much should each market produce / demand / export per year? |
| B Logistics | Warehouse, capital, load, sail that budget as bulk cargo |

## Phases

- **A** Flow budget measure + API + light demand/production reconcile — pure API done (`marketFlowBudget.ts`)
- **B** `loading` state, same-route merge, min utilization / max wait, re-size at depart — done
- **C** Export staging warehouse — done (`exportStaging.ts`; `runGlobalTrade` books lots; caravans load from lots; survives deal wipes)
- **D** Soft trade working capital — done (`merchantTradeCapital.ts`; lock on book; unlock/profit on arrive; write-off on loss; inherited warehouse seed at first production)
- **E** Schedule, org ownership, short-sea wait, Market Overview logistics panel — done (`tradeSailSchedule.ts`)
- **F** Player tuning + diagnostics — done (`tradeLogisticsSettings.ts`; Trade Animation logistics sliders; Active Caravans show loading + sail reason; `departReason` on caravans)

## Defaults

| Parameter | Default |
| :--- | ---: |
| targetUtilization | 0.55 |
| minSailUtilization | 0.20 |
| maxWaitDays land | 14 |
| maxWaitDays sea/river | 10 |
| maxWaitDays short sea (≤120 km water-only) | 2 |
| Sail calendar days of month | 1, 10, 20 |

## Phase E departure rules

1. **Full enough** (≥ target utilization): depart any day.
2. **Min fill** on a **scheduled sail day** (1 / 10 / 20): depart.
3. **Min fill** after **max wait**: depart even off-calendar (overdue).
4. **Max wait** without min fill: cancel and return cargo + unlock capital.
5. Caravans get `merchantOrganizationId` from the dispatcher market's home company.

## Invariants

- Retail stock deducted once into staging; never double-deduct on load
- Loading/staging survive production cycle deal wipes
- Strategic procurement may keep short-wait / immediate path
- Food Ledger staple co-load: free hold capacity on market→market commercial caravans is filled from exporter `exportable` (`foodCoLoad.ts`); arrival credits importer Age0 after spoilage; cancel returns cargo; quarterly abstract `resolveFoodImportNetwork` still covers residual capacity bonus
