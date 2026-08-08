/**
 * Dairy (Milk → Cheese) — docs/plan/fauna-biome-realism.md §3 Phase J/K/N.
 *
 * Phase J (2026-08-07, first cut) made Cheese a directly-computed rural good (like Grapes/Game),
 * consuming local Cattle/Sheep/Goats headcount with no recipe at all — this fully fixed the
 * geographic mismatch the user reported (Cheese-producing regions not matching where the animals
 * actually are), but as a side effect dropped Cheese out of the burg-craft recipe pipeline
 * entirely: no more Salt/Vinegar preservation demand, and no more craft employment/guild
 * participation (production-generator.ts only tracks recipe-bearing "productiveGoods").
 *
 * Phase K (2026-08-07, this revision) restores both by inserting a `Milk` good as the local,
 * short-lived intermediate — mirroring how Grapes feeds Wine, but at one more remove:
 *   - `getMilkOutput()` (this file) computes Milk the exact same way Phase J computed Cheese: from
 *     *this cell's own* dairy-species headcount only, gated by `getHusbandryWorkerFactor()`. It is
 *     wired into production-utils.ts's `getRuralProductionContributions()` as a Grapes-style
 *     special case, so Milk enters the regular market/goods system as a physical Good rather than
 *     staying purely internal.
 *   - Raw Milk is settled within its producing Market during the same monthly cycle and cannot be
 *     loaded onto a caravan. A burg's regional Market still pools rural production from its whole
 *     territory, so Cheese may be made anywhere within the same market region as the herd, not only
 *     in the exact cell. Cheese uses the standard Market-purchase recipe (`{ Milk: 10, Salt: 0.25 }`
 *     and alternatives) so preservation inputs can still travel into dairy regions and cheese-making
 *     burgs receive ordinary craft employment again
 *     (production-generator.ts's `productiveGoods` loop, `craftWorkersByBurg` accounting).
 *   - Guild-domain participation (docs/plan/knowledge-guild-system.md's `CRAFT_DOMAIN_BY_GOOD_NAME`)
 *     is deliberately left unmapped for Cheese, matching that system's own stated policy — "plain
 *     food/luxury draws...deliberately absent and simply get no guild bonus" — no food/dairy domain
 *     exists in `CRAFT_KNOWLEDGE_DOMAINS` today; adding one is a larger, separate change than what
 *     was asked for this session.
 */

import { getOrCreateFaunaStockTable, getSimulationMonth } from "../economyContext";
import { LITERS_PER_MILK_LOT } from "./foodLots";
import { getHusbandryWorkerFactor } from "./husbandry";

/**
 * Annual litres per lactating female. The model uses the breeding cohort as a proxy for the adult
 * herd, then applies a female/lactation share and an eight-month Central-European milk season.
 * Cattle give the most milk, followed by Goats and Sheep.
 */
const ANNUAL_LITERS_PER_LACTATING_FEMALE: Record<string, number> = {
  Cattle: 500,
  Goats: 150,
  Sheep: 75
};

/** Breeding cohorts include both sexes and not every adult is in lactation simultaneously. */
const LACTATING_SHARE_OF_BREEDING_COHORT = 0.375;

/** `cellId:speciesKey`-keyed lookup, mirroring husbandry.ts's `getDogsHeadcount` precedent. */
function getLocalBreedingHeadcount(cellId: number, speciesKey: string): number {
  const table = getOrCreateFaunaStockTable();
  if (!table) return 0;
  const cohorts = table[`${cellId}:${speciesKey}`];
  if (!cohorts) return 0;
  return cohorts.breeding;
}

function lactationMonths(): number {
  // Central-European baseline: spring to autumn. A detailed temperature/hemisphere calendar can
  // replace this seam later without changing the physical lot contract.
  const month = getSimulationMonth();
  return month >= 3 && month <= 10 ? 8 : 0;
}

/**
 * Milk's monthly output (pre-modifier) at `cellId`, driven entirely by that same cell's own
 * dairy-species headcount — never another cell's stock. Read-only: milking doesn't cull the herd,
 * so there is no separate preview/draw split (AGENTS.md §1's Renderer-purity rule is satisfied
 * for free).
 */
export function getMilkOutput(cellId: number): number {
  const activeMonths = lactationMonths();
  if (!activeMonths) return 0;
  let rawYield = 0;
  for (const [species, annualLiters] of Object.entries(ANNUAL_LITERS_PER_LACTATING_FEMALE)) {
    rawYield +=
      (getLocalBreedingHeadcount(cellId, species) * LACTATING_SHARE_OF_BREEDING_COHORT * annualLiters) /
      activeMonths /
      LITERS_PER_MILK_LOT;
  }
  if (rawYield <= 0) return 0;
  return rawYield * getHusbandryWorkerFactor(cellId);
}
