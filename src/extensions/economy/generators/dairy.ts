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
 *     special case, so Milk enters the regular market/goods system as a real, tradeable-in-principle
 *     Good rather than staying purely internal.
 *   - `Milk` is tagged `freshFood` (goods-generator.ts) so tradeOpportunityEstimator.ts's existing
 *     day-cap logic (1-2 days in warm/hot climates — no refrigeration) makes long-haul caravan
 *     trade uneconomical/impermissible in practice, without inventing a new "never tradeable" flag.
 *     This does NOT achieve exact-cell locality the way Phase J's direct computation did — a
 *     burg's regional Market pools rural production from its whole territory, so Cheese can still be
 *     made anywhere within the *same market region* as the herd, not only the exact cell — but that
 *     is the deliberate trade-off the user asked for: Cheese goes back through the standard
 *     Market-purchase recipe (`{ Milk: 3, Salt: 0.25 }` / `{ Milk: 3, Vinegar: 0.25 }`,
 *     goods-generator.ts) precisely so Salt/Vinegar producers elsewhere have a real reason to ship
 *     into the dairy region, and so Cheese-making burgs get ordinary craft employment again
 *     (production-generator.ts's `productiveGoods` loop, `craftWorkersByBurg` accounting).
 *   - Guild-domain participation (docs/plan/knowledge-guild-system.md's `CRAFT_DOMAIN_BY_GOOD_NAME`)
 *     is deliberately left unmapped for Cheese, matching that system's own stated policy — "plain
 *     food/luxury draws...deliberately absent and simply get no guild bonus" — no food/dairy domain
 *     exists in `CRAFT_KNOWLEDGE_DOMAINS` today; adding one is a larger, separate change than what
 *     was asked for this session.
 */

import { getOrCreateFaunaStockTable } from "../economyContext";
import { getHusbandryWorkerFactor } from "./husbandry";

/**
 * Milk yield per head per month, by dairy species — order-of-magnitude placeholder (§9.3 policy:
 * relative ordering matters more than exact values). Cattle give the most milk per head, then
 * Goats, then Sheep, roughly matching real dairy yield ordering.
 *
 * Cut ~15x from Phase K's original rates (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase N)
 * — those were tuned only to keep Cheese's total output "roughly the same order of magnitude" as
 * Phase J's direct-computation figures, without checking against how much Milk a pasture-sized herd
 * would actually produce. Per-hectare, the old rates (density × yield) landed at 0.075-0.15
 * Milk/ha/month across all three species — internally consistent, but multiplied by the thousands
 * of hectares a large cell's pasture ceiling can hold, real-map testing showed Milk stock reaching
 * >1,000,000 map-wide within 5 years while total Cheese produced (even after Phase M's preservation-
 * priority fix) stayed in the low hundreds — under 0.03% of supply ever got used. Even with Phase N's
 * new Rennet/Ash coagulant recipes below giving Cheese-making more independent raw-material paths,
 * demand-side additions alone can't meaningfully dent a stockpile growing that fast — the supply rate
 * itself was the primary problem. This cut is a first empirical pass (verified via Playwright to
 * bring multi-year Milk accumulation down to a tractable, still-growing-but-plausible range), not a
 * mathematically derived figure — recalibrate further if it still runs away or now starves Cheese.
 */
const MILK_YIELD_PER_HEAD_PER_MONTH: Record<string, number> = {
  Cattle: 0.01,
  Goats: 0.004,
  Sheep: 0.003
};

/** `cellId:speciesKey`-keyed lookup, mirroring husbandry.ts's `getDogsHeadcount` precedent. */
function getLocalHeadcount(cellId: number, speciesKey: string): number {
  const table = getOrCreateFaunaStockTable();
  if (!table) return 0;
  const cohorts = table[`${cellId}:${speciesKey}`];
  if (!cohorts) return 0;
  return cohorts.young + cohorts.breeding + cohorts.old;
}

/**
 * Milk's monthly output (pre-modifier) at `cellId`, driven entirely by that same cell's own
 * dairy-species headcount — never another cell's stock. Read-only: milking doesn't cull the herd,
 * so there is no separate preview/draw split (AGENTS.md §1's Renderer-purity rule is satisfied
 * for free).
 */
export function getMilkOutput(cellId: number): number {
  let rawYield = 0;
  for (const [species, yieldPerHead] of Object.entries(MILK_YIELD_PER_HEAD_PER_MONTH)) {
    rawYield += getLocalHeadcount(cellId, species) * yieldPerHead;
  }
  if (rawYield <= 0) return 0;
  return rawYield * getHusbandryWorkerFactor(cellId);
}
