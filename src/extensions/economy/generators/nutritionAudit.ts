/**
 * Nutrition audit — docs/plan/food-nutrition-audit.md.
 *
 * Cross-checks the economy extension's food-production numbers against real-world nutritional
 * science (calories, protein), asked for 2026-08-07 after several sessions of calibrating Grain/
 * Cheese/Milk supply without ever validating them against "does a real person's annual diet actually
 * come out of this."
 *
 * Two tiers, because the two halves of the food economy have very different unit rigor (see the
 * plan doc's §2 for the full trace):
 *
 * - **Tier 1 (Grain/staple, rigorous)**: `agriculturalLandUse.ts`'s `STAPLE_NEED_KG_PER_PERSON_YEAR`
 *   (200) is a literal real-world kilogram figure, and `foodProduction.ts`/`foodLedgerConsumption.ts`
 *   (verified this session, see the plan doc) consistently scale rural/urban population to real
 *   people throughout. That means Grain's contribution can be checked against real grain nutrition
 *   science with real confidence — no invented conversion needed.
 * - **Tier 2 (Cheese/Milk, a new design decision, not a discovery)**: `dairy.ts`'s
 *   `MILK_YIELD_PER_HEAD_PER_MONTH` was tuned purely to keep the Milk market stock from overflowing
 *   (Phase N), with no real-liters-per-cow grounding, and no Good in the catalog has an established
 *   real mass/volume per unit ("wain"/"jug"/etc. are flavor labels only). `MILK_LITERS_PER_UNIT` below
 *   is therefore a **new, first-cut convention introduced by this module** (§9.3 policy: order-of-
 *   magnitude placeholder, calibration TBD), not a value read out of existing game data. Once that one
 *   choice is made, though, `CHEESE_KG_PER_UNIT` is NOT a second independent guess — it's derived from
 *   `MILK_LITERS_PER_UNIT` through Cheese's own recipe ratio (`{ Milk: 3, ... }`,
 *   goods-generator.ts) and the real milk→cheese conversion rate, so the two stay mass-balance
 *   consistent with each other (a first cut had them picked independently — 4 L/jug and a flat 40kg/
 *   wain — which silently implied 12 L of milk yields 40kg of cheese, ~33x too much; found
 *   2026-08-07 when the user checked the two numbers against the recipe by hand).
 */

import { STAPLE_NEED_KG_PER_PERSON_YEAR } from "./agriculturalLandUse";
import {
  KILOGRAMS_PER_CHEESE_LOT,
  LITERS_PER_MILK_LOT,
  MILK_LITERS_PER_CHEESE_KILOGRAM,
  MILK_LOTS_PER_CHEESE_LOT
} from "./foodLots";

// ---- Real-world nutrition reference values ----

/**
 * Blended daily caloric need across a whole population (children, elders, and working adults,
 * not just an active adult male) — 2,100 kcal/day is the same figure widely used as the minimum
 * humanitarian daily ration threshold (WFP/SPHERE), which is itself derived by blending age/sex/
 * activity distributions the way a whole map population would.
 */
export const DAILY_CALORIC_NEED_KCAL = 2100;
/** WHO reference ~0.83g protein/kg bodyweight/day, at a ~60kg population-average bodyweight. */
export const DAILY_PROTEIN_NEED_G = 50;
const DAYS_PER_YEAR = 365.2425;

// ---- Tier 1: Grain/staple real nutrition (per kg) ----

/** Whole-grain wheat, a reasonable staple-cereal reference. */
export const GRAIN_KCAL_PER_KG = 3400;
export const GRAIN_PROTEIN_G_PER_KG = 120;

// ---- Tier 2: Cheese/Milk real nutrition, and the new unit-mass convention (see module doc-comment) ----

export const MILK_KCAL_PER_LITER = 640;
export const MILK_PROTEIN_G_PER_LITER = 33;
export const CHEESE_KCAL_PER_KG = 4000;
export const CHEESE_PROTEIN_G_PER_KG = 250;
/** Real dairying: roughly 10 L of milk reduces to 1 kg of hard cheese. */
export const MILK_LITERS_PER_CHEESE_KG = MILK_LITERS_PER_CHEESE_KILOGRAM;

/**
 * New convention (this module, not pre-existing game data): how many real liters one Milk Good
 * "unit" ("jug") represents. Picked as a plausible everyday-jug quantity — there was nothing to
 * derive it from (see module doc-comment).
 */
export const MILK_LITERS_PER_UNIT = LITERS_PER_MILK_LOT;

/**
 * Milk units consumed per Cheese unit in Cheese's own recipe (goods-generator.ts: all four of its
 * recipe variants read `{ Milk: 3, ... }`) — duplicated here as a named constant, not re-derived
 * from GOODS_DATA, to avoid this calibration-only module depending on the live catalog.
 */
export const CHEESE_RECIPE_MILK_UNITS = MILK_LOTS_PER_CHEESE_LOT;

/**
 * `CHEESE_KG_PER_UNIT` must NOT be picked independently of `MILK_LITERS_PER_UNIT` — Cheese's own
 * recipe fixes the ratio (3 Milk units in, 1 Cheese unit out), so the real mass on both sides of
 * that recipe has to obey the same `MILK_LITERS_PER_CHEESE_KG` conversion or the recipe is
 * internally inconsistent (found 2026-08-07: an earlier hardcoded 40kg was ~33x too heavy for what
 * 3 Milk units at 4 L each — 12 L, ~1.2kg of cheese — actually reduces to). Derived, not a second
 * independent guess.
 */
export const CHEESE_KG_PER_UNIT = KILOGRAMS_PER_CHEESE_LOT;

export interface AnnualNutritionNeed {
  readonly kcal: number;
  readonly proteinKg: number;
}

/** A real (post-populationRate) population's total annual caloric and protein need. */
export function getAnnualNutritionNeed(realPopulation: number): AnnualNutritionNeed {
  const population = Math.max(0, realPopulation);
  return {
    kcal: population * DAILY_CALORIC_NEED_KCAL * DAYS_PER_YEAR,
    proteinKg: (population * DAILY_PROTEIN_NEED_G * DAYS_PER_YEAR) / 1000
  };
}

/**
 * Tier 1: what the existing `STAPLE_NEED_KG_PER_PERSON_YEAR` (200kg/person/year) baseline actually
 * delivers in real nutrition terms, and what fraction of `getAnnualNutritionNeed()` for one person
 * that represents. Population-invariant (a ratio), so it's computed once per person rather than
 * re-derived per map.
 */
export interface StapleCoverage {
  readonly kcalPerPerson: number;
  readonly proteinKgPerPerson: number;
  readonly kcalCoverageRatio: number;
  readonly proteinCoverageRatio: number;
}

export function getStapleCoverage(): StapleCoverage {
  const kcalPerPerson = STAPLE_NEED_KG_PER_PERSON_YEAR * GRAIN_KCAL_PER_KG;
  const proteinKgPerPerson = (STAPLE_NEED_KG_PER_PERSON_YEAR * GRAIN_PROTEIN_G_PER_KG) / 1000;
  const onePersonNeed = getAnnualNutritionNeed(1);
  return {
    kcalPerPerson,
    proteinKgPerPerson,
    kcalCoverageRatio: kcalPerPerson / onePersonNeed.kcal,
    proteinCoverageRatio: proteinKgPerPerson / onePersonNeed.proteinKg
  };
}

/**
 * Tier 2: real nutrition represented by a quantity of Milk (in Milk Good units), converted to its
 * cheese-equivalent mass first (real dairying ratio) — matching how this session's Milk surplus is
 * actually expected to be consumed (via Cheese-making), not drunk fresh. `milkUnits` should be a
 * real total (e.g. summed market stock or a period's total output), already in Milk Good units.
 */
export interface DairyNutritionPotential {
  readonly milkLiters: number;
  readonly cheeseEquivalentKg: number;
  readonly kcal: number;
  readonly proteinKg: number;
}

export function getDairyNutritionPotential(milkUnits: number): DairyNutritionPotential {
  const milkLiters = Math.max(0, milkUnits) * MILK_LITERS_PER_UNIT;
  const cheeseEquivalentKg = milkLiters / MILK_LITERS_PER_CHEESE_KG;
  return {
    milkLiters,
    cheeseEquivalentKg,
    kcal: cheeseEquivalentKg * CHEESE_KCAL_PER_KG,
    proteinKg: (cheeseEquivalentKg * CHEESE_PROTEIN_G_PER_KG) / 1000
  };
}

/** Real nutrition represented by a quantity of Cheese (in Cheese Good units) already manufactured. */
export function getCheeseNutrition(cheeseUnits: number): { kcal: number; proteinKg: number } {
  const kg = Math.max(0, cheeseUnits) * CHEESE_KG_PER_UNIT;
  return { kcal: kg * CHEESE_KCAL_PER_KG, proteinKg: (kg * CHEESE_PROTEIN_G_PER_KG) / 1000 };
}

export interface NutritionAuditReport {
  readonly realPopulation: number;
  readonly need: AnnualNutritionNeed;
  readonly staple: StapleCoverage;
  /** The population-scaled remainder after Grain's per-person coverage, i.e. what Tier 2 must fill. */
  readonly remainingAfterGrain: AnnualNutritionNeed;
  readonly dairyPotential: DairyNutritionPotential;
  readonly cheeseAlreadyMade: { kcal: number; proteinKg: number };
}

/**
 * Full report combining Tier 1 (Grain, assumed at its own 100%-of-target baseline — a best-case
 * figure, not a claim that the food ledger is actually hitting it every tick) with Tier 2 (Milk's
 * cheese-making potential and Cheese already on hand), scaled to `realPopulation`.
 */
export function auditNutrition(
  realPopulation: number,
  totalMilkUnits: number,
  totalCheeseUnits: number
): NutritionAuditReport {
  const need = getAnnualNutritionNeed(realPopulation);
  const staple = getStapleCoverage();
  const grainKcal = staple.kcalPerPerson * realPopulation;
  const grainProteinKg = staple.proteinKgPerPerson * realPopulation;
  const remainingAfterGrain: AnnualNutritionNeed = {
    kcal: Math.max(0, need.kcal - grainKcal),
    proteinKg: Math.max(0, need.proteinKg - grainProteinKg)
  };
  return {
    realPopulation,
    need,
    staple,
    remainingAfterGrain,
    dairyPotential: getDairyNutritionPotential(totalMilkUnits),
    cheeseAlreadyMade: getCheeseNutrition(totalCheeseUnits)
  };
}
