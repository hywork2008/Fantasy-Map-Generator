/**
 * Viticulture Output Allocation — docs/plan/biome-goods-producer-ecosystem.md §9.4 (Phase 5).
 *
 * Wine and Raisins both draw on the same harvested Grapes stock and the same Burg craft labour
 * pool, and production-generator.ts's makeProductionDecision() is winner-take-all per decision
 * block with zero cross-cycle memory (BurgProductionState is rebuilt fresh every cycle) — so
 * without this module, which of the two "wins" a given cycle is decided purely by that cycle's
 * live Market price/demand snapshot and can flip cycle to cycle with no dampening.
 *
 * This module tracks a persisted, slowly-drifting "preference share" per (burg, good) for Wine and
 * Raisins, exposed as a small multiplier that production-generator.ts blends into
 * demandEffect.multiplier next to the existing strategicDemandMultiplier (makeProductionDecision).
 * The share drifts toward each cycle's instantaneous demand signal at a rate inversely proportional
 * to `good.trade.durability` (§9.4) — Wine (durability 5) drifts slower than Raisins (durability
 * 4), so a durable, storable good's realized production share resists rapid reallocation while a
 * more perishable one adapts faster. Fresh (unconverted) Grapes need no explicit smoothing of their
 * own: whatever Grapes stock Wine/Raisins don't consume this cycle is definitionally what stays
 * sellable as fresh Grapes, so its "reallocation speed" is already instantaneous by construction
 * (§5.3's "生鮮Grapesは即応" is automatic, not something to build).
 */

import { getGoods, getOrCreateViticultureAllocationShares } from "../economyContext";
import type { Good } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";

const VITICULTURE_CONVERSION_GOOD_NAMES = ["Wine", "Raisins"] as const;

/** Per-cycle drift ceiling for the fastest-adjusting tracked good (durability 1) — a share can
 * move at most this fraction of the gap to its instantaneous target in one production cycle. */
const BASE_REALLOCATION_RATE = 0.5;
/** Bias multiplier range around the neutral 1.0 (a smoothedShare of 0.5 -> multiplier 1.0). */
const BIAS_STRENGTH = 0.6;

function getShareKey(burgId: number, goodName: string): string {
  return `${burgId}:${goodName}`;
}

/**
 * This cycle's raw, unsmoothed preference for `good` relative to the other tracked good(s): live
 * Market sell price x current stock scarcity (low stock = high momentary demand pull). Deliberately
 * a lightweight proxy independent of production-generator.ts's own heavier planGoodAction()
 * scoring — this module only needs a directional signal to smooth toward, not an exact profit
 * projection.
 */
function getInstantaneousDemandWeight(market: Market, good: Good): number {
  const quote = Markets.quoteMarket(market, good.i);
  const price = quote.sellPrice || good.value;
  const scarcity = 1 / (1 + Math.max(0, quote.stock || 0));
  return Math.max(0.01, price * scarcity);
}

/**
 * Advances every tracked good's smoothed share one cycle for `burgId`. Call once per Burg per
 * production cycle (production-generator.ts's produceForBurg, alongside smoothCraftWorkers) — NOT
 * from inside the per-worker-step decision loop, so the share only moves once per cycle regardless
 * of how many decision blocks that cycle contains. The bias read back inside that same cycle's
 * makeProductionDecision() therefore reflects the *previous* cycle's market snapshot — an
 * intentional one-cycle lag, matching smoothCraftWorkers'/craftDomainWorkersByKey's own timing.
 */
export function advanceViticultureAllocationShares(burgId: number, market: Market): void {
  const table = getOrCreateViticultureAllocationShares();
  if (!table) return;

  const goodsByName = new Map(getGoods().map(good => [good.name, good]));
  const weights: { good: Good; weight: number }[] = [];
  for (const name of VITICULTURE_CONVERSION_GOOD_NAMES) {
    const good = goodsByName.get(name);
    if (!good) continue;
    weights.push({ good, weight: getInstantaneousDemandWeight(market, good) });
  }
  if (!weights.length) return;

  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return;

  for (const { good, weight } of weights) {
    const targetShare = weight / totalWeight;
    const durability = Math.max(1, good.trade?.durability ?? 1);
    const rate = Math.min(1, BASE_REALLOCATION_RATE / durability);
    const key = getShareKey(burgId, good.name);
    const currentShare = table[key] ?? targetShare; // first sighting starts at the instantaneous target, no artificial ramp-up
    table[key] = currentShare + (targetShare - currentShare) * rate;
  }
}

/**
 * 0..2-ish multiplier blended into demandEffect.multiplier for Wine/Raisins in
 * production-generator.ts's makeProductionDecision(), mirroring how getStrategicDemandMultiplier is
 * already blended in. 1 (no-op) for every other good, and whenever no smoothed share has been
 * recorded yet for this (burg, good) pair.
 */
export function getViticultureAllocationMultiplier(good: Pick<Good, "name">, burgId: number): number {
  if (!(VITICULTURE_CONVERSION_GOOD_NAMES as readonly string[]).includes(good.name)) return 1;
  const table = getOrCreateViticultureAllocationShares();
  const share = table?.[getShareKey(burgId, good.name)];
  if (share === undefined) return 1;
  return 1 + (share - 0.5) * 2 * BIAS_STRENGTH;
}

/** Clears all tracked shares — called by the economy extension's "clear"/cleanup paths. */
export function clearViticultureAllocationShares(): void {
  const table = getOrCreateViticultureAllocationShares();
  if (table) for (const key of Object.keys(table)) delete table[key];
}
