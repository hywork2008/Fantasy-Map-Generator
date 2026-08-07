/**
 * Wool (shearing byproduct, not slaughter) — mirrors dairy.ts's Milk pattern; see that module's
 * doc-comment for the general "renewable rural byproduct, restored to a recipe good one step
 * downstream" shape (Milk → Cheese there, Wool → Cloth here).
 *
 * Found 2026-08-08 (real-map report: Wool stock/sales stuck at 0 for a full year despite ample
 * Sheep stock): Wool used to be `recipes: [{ Sheep: 1 }]` (goods-generator.ts) — a slaughter-style
 * conversion consuming a whole live Sheep per unit, the same model Leather correctly uses for
 * Cattle/Game/Horses/Camels. Real wool comes from shearing, which doesn't cull the animal, and
 * (worse) that recipe put "buy Sheep to make Wool" in direct competition with Sheep's own
 * `demandCoverage.food`-driven retail sale inside the SAME per-burg production-decision slot every
 * cycle — food's larger DEMAND_TARGET_FACTORS weight meant Wool essentially never won that
 * comparison. Computing Wool directly from the live Sheep headcount (like Milk from Cattle/Sheep/
 * Goats) removes the competition: Wool is now a byproduct of the standing herd, produced every
 * month regardless of whether any Sheep are also sold as food that month. Cloth
 * (`recipes: [{ Wool: 1 }, { Hemp: 1 }, { Silk: 0.25 }, { Cotton: 1 }]`, goods-generator.ts) is
 * unchanged — it still recipe-consumes Wool off the market the same way it always has.
 */

import { getOrCreateFaunaStockTable } from "../economyContext";
import { getHusbandryWorkerFactor } from "./husbandry";

/**
 * Fleece yield per head per month — order-of-magnitude placeholder (§9.3 policy: relative
 * ordering/scale matters more than the exact value here). A sheep is realistically sheared once a
 * year for one fleece; spread over 12 months as a smoothed trickle the same way Milk is, ~1
 * fleece/head/year ≈ 0.08/month.
 */
const WOOL_YIELD_PER_HEAD_PER_MONTH: Record<string, number> = {
  Sheep: 0.08
};

/** `cellId:speciesKey`-keyed lookup, duplicated from dairy.ts's `getLocalHeadcount` (itself
 * mirroring husbandry.ts's `getDogsHeadcount`) rather than imported, to avoid a cross-module
 * dependency for a two-line helper — same precedent those modules document. */
function getLocalHeadcount(cellId: number, speciesKey: string): number {
  const table = getOrCreateFaunaStockTable();
  if (!table) return 0;
  const cohorts = table[`${cellId}:${speciesKey}`];
  if (!cohorts) return 0;
  return cohorts.young + cohorts.breeding + cohorts.old;
}

/**
 * Wool's monthly output (pre-modifier) at `cellId`, driven entirely by that same cell's own Sheep
 * headcount — never another cell's or a pooled market's stock. Read-only: shearing doesn't cull
 * the herd, so there is no separate preview/draw split (AGENTS.md §1's Renderer-purity rule is
 * satisfied for free, same as getMilkOutput()).
 */
export function getWoolOutput(cellId: number): number {
  let rawYield = 0;
  for (const [species, yieldPerHead] of Object.entries(WOOL_YIELD_PER_HEAD_PER_MONTH)) {
    rawYield += getLocalHeadcount(cellId, species) * yieldPerHead;
  }
  if (rawYield <= 0) return 0;
  return rawYield * getHusbandryWorkerFactor(cellId);
}
