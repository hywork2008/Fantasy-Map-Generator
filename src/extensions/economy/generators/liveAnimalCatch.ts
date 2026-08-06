/**
 * liveAnimal-tagged goods (Cats, Horses, Sheep, Goats, Pig, Chicken, Camels, Elephants,
 * Cattle) represent whole live creatures, not a bulk commodity — a market can't receive
 * "0.2 of a cat" this month. Left as a continuous rate, that 0.2/month just silently
 * accrues into a smooth trickle (1 cat every 5 months, exactly, forever). This module
 * turns that rate into a random integer catch each month instead, using a "leaky
 * bucket" / stochastic-rounding accumulator (a randomized generalization of the
 * Bresenham line algorithm):
 *
 *   accumulator += expectedAmount              // this month's continuous rate banks in
 *   guaranteed   = floor(max(accumulator, 0))  // whole catches owed for certain
 *   remainder    = accumulator - guaranteed     // fractional part — negative while in debt
 *   bonus        = remainder > 0 && random() < remainder ? 1 : 0
 *   caught       = guaranteed + bonus
 *   accumulator -= caught
 *
 * A catch immediately drains the bucket toward (or below) zero, so the odds of another
 * catch next month start low and only climb back up as expectedAmount keeps accruing —
 * "catch one now, then it's quiet for a while" instead of an independent coin flip every
 * month. Over many months the mean catch rate still converges on expectedAmount exactly
 * (the accumulator is a bounded random walk with drift expectedAmount, so by the
 * renewal-reward theorem long-run catches-per-month == expectedAmount), so total annual
 * production is unchanged from the old continuous model — only its distribution across
 * the year changes, the same trade-off the seasonal harvest curve makes for food goods
 * (see SEASONAL_FOOD_PRODUCTION_MULTIPLIER in production-utils.ts).
 *
 * Canonical storage is `simulation.extensions.economy.liveAnimalCatchAccumulators`
 * (sparse "marketId:collectionBurgId:goodId" → accumulator). A module fallback is used
 * only when the economy ExtensionAPI is not initialized (unit tests without a full host).
 */

import { getOrCreateLiveAnimalCatchTable } from "../economyContext";

/** Fallback when `simulationContext` is unavailable (minimal unit tests). */
let _fallback: Record<string, number> = {};

function getTable(): Record<string, number> {
  return getOrCreateLiveAnimalCatchTable() ?? _fallback;
}

export function getLiveAnimalCatchKey(marketId: number, collectionBurgId: number, goodId: number): string {
  return `${marketId}:${collectionBurgId}:${goodId}`;
}

/**
 * Banks `expectedAmount` (this month's continuous production rate) into the accumulator
 * keyed by `key` and returns the whole number of animals actually caught this month,
 * which may be 0. See module doc for the algorithm.
 */
export function rollLiveAnimalCatch(key: string, expectedAmount: number): number {
  if (!(expectedAmount > 0)) return 0;

  const table = getTable();
  let accumulator = (table[key] ?? 0) + expectedAmount;

  const guaranteed = accumulator >= 1 ? Math.floor(accumulator) : 0;
  const remainder = accumulator - guaranteed;
  const bonus = remainder > 0 && Math.random() < remainder ? 1 : 0;
  const caught = guaranteed + bonus;

  accumulator -= caught;
  if (accumulator === 0) delete table[key];
  else table[key] = accumulator;

  return caught;
}

export function clearLiveAnimalCatchAccumulators(): void {
  const table = getOrCreateLiveAnimalCatchTable();
  if (table) {
    for (const key of Object.keys(table)) delete table[key];
  }
  _fallback = {};
}
