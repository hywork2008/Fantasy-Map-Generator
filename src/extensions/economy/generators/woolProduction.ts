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
 * (`recipes: [{ Wool: 1 }, { Hemp: 1 }, { Cotton: 1 }]`, goods-generator.ts) is
 * unchanged — it still recipe-consumes Wool off the market the same way it always has.
 */

import { getOrCreateFaunaStockTable } from "../economyContext";
import { getHusbandryWorkerFactor } from "./husbandry";
import { getLivestockFeedCoverage } from "./livestockFeedState";
import { SHEEP_ANNUAL_WOOL_KG, WOOL_KG_PER_MARKET_LOT } from "./woolProductionPolicy";

export { FLEECES_PER_WOOL_MARKET_LOT } from "./woolProductionPolicy";

/** Annual local greasy-wool potential before labor/feed modifiers; never seeds or changes stock. */
export function getAnnualWoolPotentialKg(cellId: number): number {
  const cohorts = getOrCreateFaunaStockTable()?.[`${cellId}:Sheep`];
  if (!cohorts) return 0;
  return (
    Math.max(0, cohorts.young) * SHEEP_ANNUAL_WOOL_KG.young +
    Math.max(0, cohorts.breeding) * SHEEP_ANNUAL_WOOL_KG.breeding +
    Math.max(0, cohorts.old) * SHEEP_ANNUAL_WOOL_KG.old
  );
}

/**
 * Monthly smoothed output in fixed-mass market lots. Age classes determine annual raw mass;
 * labor and recent feeding limit recoverable output. No shearing-date or birth-month stock exists.
 * This read-only forecast neither culls animals nor moves market/private inventory.
 */
export function getWoolOutput(cellId: number): number {
  const annualKg = getAnnualWoolPotentialKg(cellId);
  if (annualKg <= 0) return 0;
  return (annualKg * getHusbandryWorkerFactor(cellId) * getLivestockFeedCoverage(cellId)) / 12 / WOOL_KG_PER_MARKET_LOT;
}
