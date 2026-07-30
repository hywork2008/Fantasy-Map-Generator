import { rn } from "../../hostUtils";

/**
 * Craft/manufacturing employment (weavers, tailors, smiths, and other Burg-anchored artisans
 * working recipe-based Goods such as Cloth/Garments — docs/plan/urban-employment-demand.md §3.7,
 * Phase 6). Unlike mining/smelting/quarrying (§3.2), there is no separate "required workers"
 * formula derived from a fixed physical capacity: `production-generator.ts`'s generic worker
 * loop (`runWorkerLoop`) already decides, every production cycle, how many of a Burg's
 * population points go into manufacturing recipe-based Goods to cover local demand plus
 * tradeable surplus. This module only smooths that raw per-cycle observation into a stable
 * per-Burg figure, the same role `Market.caravanArrivalVolume` (§3.3) plays for trade demand
 * before it is treated as a real employment signal.
 *
 * Like trade, craft employment is attributed read-only into `basicEmploymentDemand`
 * (`basicEmployment.ts`) rather than competing in the annual slot-reconciliation loop: the labor
 * pool it draws from (`burg.population`, the Production loop's own capacity unit) is not gated
 * by that loop's `remainingAdults` bookkeeping, so re-subtracting it there would double-count
 * against a pool the Production loop never actually drew down.
 */
export interface CraftEmploymentRecord {
  burgId: number;
  workers: number;
}

/** Exponential-smoothing weight applied each production cycle (~5-cycle time constant). */
const CYCLE_SMOOTHING = 0.2;
/** Below this, a decaying record is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_WORKERS = 0.01;

/**
 * Blends this cycle's observed manufacturing worker usage into the Burg's tracked figure.
 * Returns 0 once the smoothed value decays below the tracking floor, so callers can drop the
 * record instead of persisting an ever-shrinking near-zero entry.
 */
export function smoothCraftWorkers(previousWorkers: number, observedWorkersThisCycle: number): number {
  const observed = Math.max(0, observedWorkersThisCycle);
  const next = previousWorkers + (observed - previousWorkers) * CYCLE_SMOOTHING;
  return next < MIN_TRACKED_WORKERS ? 0 : rn(next, 3);
}
