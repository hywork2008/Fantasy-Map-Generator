# Merchant Logistics — Warehouses, Accumulation, Bulk Transport

| 項目 | 内容 |
| :-- | :-- |
| Status | Approved plan; Phase A in progress |
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
- **D** Soft trade working capital
- **E/F** Schedule, org ownership, UI diagnostics

## Defaults

| Parameter | Default |
| :--- | ---: |
| targetUtilization | 0.55 |
| minSailUtilization | 0.20 |
| maxWaitDays land | 14 |
| maxWaitDays sea/river | 10 |

## Invariants

- Retail stock deducted once into staging; never double-deduct on load
- Loading/staging survive production cycle deal wipes
- Strategic procurement may keep short-wait / immediate path
- Food Ledger remains separate until optional co-load
