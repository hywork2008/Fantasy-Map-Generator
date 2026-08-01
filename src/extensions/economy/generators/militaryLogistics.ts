import type { MilitaryRegiment, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { MOUNTED_FODDER_PER_HEAD } from "./militaryResourcesTypes";

const MONTHS_PER_YEAR = 12;

/**
 * A soldier's own wage, calibrated against this session's civilian subsistence research
 * (docs/temp/2026-07-31.md): food-only subsistence is GROSS_FOOD_NEED(0.43, foodConstants.ts) ×
 * Grain's peacetime baseline value(1, goods-generator.ts) = 0.43 value/year. Cross-source
 * pre-modern household budgets spend roughly 50-70% of income on food, so full subsistence
 * (food + clothing + housing) ≈ food-only / 0.6 (midpoint) ≈ 0.72 value/year. A common soldier's
 * wage is set at a well-documented medieval skilled-laborer-to-unskilled-laborer wage ratio of
 * roughly 2x (English/European pre-modern wage-history records), giving ≈1.43 value/year, i.e.
 * ≈0.12 value/month per head — clearly above bare subsistence, per the original design intent,
 * without being extravagant. Equipment/consumables (weapons, boots, armor) and fortress upkeep
 * are deliberately not folded in yet — see docs/temp/profits.md「やりたいこと」#4.
 */
const BASE_UPKEEP_PER_HEAD = 0.12; // treasury units per head per production cycle (month), raw-score-population scale

/**
 * Cavalry horses need feeding on top of the rider's own wage above. Monetizes
 * MOUNTED_FODDER_PER_HEAD (Fodder Goods-units/head/year, shared with militaryResources.ts's free
 * market stock draw) at Fodder's peacetime baseline value of 1 (goods-generator.ts), the same
 * convention used for the civilian subsistence calculation above. This comes out small relative
 * to the wage — real horse feed was a genuine expense historically, but MOUNTED_FODDER_PER_HEAD
 * itself is still an uncalibrated placeholder (not yet kg-grounded like Grain), so treat this as a
 * placeholder-of-a-placeholder rather than a claim that feed is this cheap. The dominant real cost
 * of cavalry — horses themselves, tack, and armor — isn't modeled yet; see the equipment/fortress
 * upkeep TODO above.
 */
const FODDER_GOOD_VALUE = 1; // Fodder.value peacetime baseline (goods-generator.ts)
const MOUNTED_FODDER_COST_PER_HEAD = (MOUNTED_FODDER_PER_HEAD * FODDER_GOOD_VALUE) / MONTHS_PER_YEAR;
const BASE_FOOD_CONSUMPTION_PER_HEAD_PER_DAY = 0.01; // food-good stock units per head per day, raw-score scale

export function isMountedUnit(unitName: string): boolean {
  const militaryOptions = getWorldContext().options.military || [];
  return militaryOptions.find(unit => unit.name === unitName)?.type === "mounted";
}

// military-generator.ts multiplies recruit counts by populationRate to produce real troop
// headcounts (e.g. thousands), while state.pollTax/market.goods stock stay in the economy
// extension's raw-score population unit (docs/temp/profits.md decision #5). Divide back down
// so upkeep/consumption stay comparable to treasury income and goods stock instead of always
// dwarfing them.
function sumUnitHeads(
  u: Record<string, number> | undefined,
  perUnit: (unitName: string, count: number) => number
): number {
  const populationRate = getWorldContext().populationRate || 1;
  let total = 0;
  for (const [unitName, count] of Object.entries(u || {})) {
    total += perUnit(unitName, count / populationRate);
  }
  return total;
}

function sumRegimentHeads(state: State, perUnit: (unitName: string, count: number) => number): number {
  let total = 0;
  for (const regiment of state.military || []) {
    total += sumUnitHeads(regiment.u, perUnit);
  }
  return total;
}

/** Obligatory per-cycle treasury drain for maintaining `state.military` (see calibration notes above). */
export function getStateMilitaryUpkeep(state: State): number {
  const total = sumRegimentHeads(
    state,
    (unitName, count) => count * (BASE_UPKEEP_PER_HEAD + (isMountedUnit(unitName) ? MOUNTED_FODDER_COST_PER_HEAD : 0))
  );
  return rn(total, 2);
}

/**
 * Same per-head upkeep formula as getStateMilitaryUpkeep(), for a single regiment — used to size
 * a field/fleet commander's personal stipend (docs/plan/state-treasury-department-budget.md §7
 * item 7) off the actual cost of the force they command, without re-deriving the calibration.
 */
export function getRegimentMilitaryUpkeep(regiment: Pick<MilitaryRegiment, "u">): number {
  const total = sumUnitHeads(
    regiment.u,
    (unitName, count) => count * (BASE_UPKEEP_PER_HEAD + (isMountedUnit(unitName) ? MOUNTED_FODDER_COST_PER_HEAD : 0))
  );
  return rn(total, 2);
}

/** Food-good stock consumed per day by `state.military` (rate uncalibrated, see above). */
export function getStateArmyFoodConsumptionPerDay(state: State): number {
  const total = sumRegimentHeads(state, (_unitName, count) => count * BASE_FOOD_CONSUMPTION_PER_HEAD_PER_DAY);
  return rn(total, 2);
}
