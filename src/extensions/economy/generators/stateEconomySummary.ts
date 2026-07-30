import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext } from "../economyContext";
import { getMarketStateShares } from "./marketStateShares";
import { getStateArmyFoodConsumptionPerDay } from "./militaryLogistics";

/**
 * State-level economy rollups for docs/temp/profits.md's surplus feature. Called once per
 * production cycle (src/extensions/economy/index.tsx), after Taxes.collectTaxes() settles
 * state.treasury for the cycle.
 */

/**
 * Aggregates the real, already-stocked `market.goods` for every non-staple food-tagged good
 * (decision #2: use the actual goods stock, not the abstract quarterly foodLedger) plus each
 * market's Food Ledger bucketed stock into `state.foodStock`, apportioned across market
 * territories by burg-weighted state share (decision #3).
 *
 * stapleFood (Grain)'s `market.goods[...].stock` is only a synced view of its tradable surplus
 * (`exportable + storageOverflow`, see foodProduction.ts) — summing it here as well as the
 * ledger's bucket total would double-count `exportable`, so non-staple food goods and the
 * Food Ledger are summed from separate, non-overlapping sources instead.
 */
export function refreshStateEconomySummaries(): void {
  const { pack } = getWorldContext();
  const states = pack.states;
  const markets = getMarkets();
  if (!states?.length || !markets.length) return;

  const foodGoodIds = getGoods()
    .filter(good => good.tags.includes("food") && !good.tags.includes("stapleFood"))
    .map(good => good.i);

  const foodStockByState = new Map<number, number>();
  for (const market of markets) {
    if (!market) continue;

    let marketFoodStock = 0;
    for (const goodId of foodGoodIds) marketFoodStock += market.goods[goodId]?.stock || 0;
    if (market.foodLedger) {
      const ledger = market.foodLedger;
      marketFoodStock += ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2 + ledger.storageOverflow;
    }
    if (marketFoodStock <= 0) continue;

    for (const [stateId, share] of getMarketStateShares(market)) {
      foodStockByState.set(stateId, (foodStockByState.get(stateId) || 0) + marketFoodStock * share);
    }
  }

  for (const state of states) {
    if (!state.i || state.removed) continue;
    state.foodStock = rn(foodStockByState.get(state.i) || 0, 2);
  }
}

/** Days the state's current food stock can sustain its `state.military` at the placeholder consumption rate. */
export function getStateFoodStockDays(state: State): number {
  const dailyConsumption = getStateArmyFoodConsumptionPerDay(state);
  if (dailyConsumption <= 0) return Infinity;
  return rn((state.foodStock || 0) / dailyConsumption, 2);
}

/** Single entry point for external consumers (UI, nobility strategic AI) reading a state's war-readiness signals. */
export function getStateSurplus(state: State): { treasury: number; foodStockDays: number } {
  return {
    treasury: state.treasury || 0,
    foodStockDays: getStateFoodStockDays(state)
  };
}
