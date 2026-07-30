import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";

/**
 * Placeholder upkeep/consumption rates for docs/temp/profits.md's state-surplus feature.
 * Deliberately left uncalibrated per the user's own instruction: get the treasury/food-stock
 * pipeline running first, then tune these against real map army sizes and compositions.
 * TODO calibrate — see docs/temp/profits.md「やりたいこと」#4.
 */
const BASE_UPKEEP_PER_HEAD = 0.05; // treasury units per head per production cycle, raw-score-population scale
const MOUNTED_UPKEEP_MULTIPLIER = 2; // cavalry costs more (horse upkeep)
const BASE_FOOD_CONSUMPTION_PER_HEAD_PER_DAY = 0.01; // food-good stock units per head per day, raw-score scale

export function isMountedUnit(unitName: string): boolean {
  const militaryOptions = getWorldContext().options.military || [];
  return militaryOptions.find(unit => unit.name === unitName)?.type === "mounted";
}

function sumRegimentHeads(state: State, perUnit: (unitName: string, count: number) => number): number {
  // military-generator.ts multiplies recruit counts by populationRate to produce real troop
  // headcounts (e.g. thousands), while state.pollTax/market.goods stock stay in the economy
  // extension's raw-score population unit (docs/temp/profits.md decision #5). Divide back down
  // so upkeep/consumption stay comparable to treasury income and goods stock instead of always
  // dwarfing them.
  const populationRate = getWorldContext().populationRate || 1;
  let total = 0;
  for (const regiment of state.military || []) {
    for (const [unitName, count] of Object.entries(regiment.u || {})) {
      total += perUnit(unitName, count / populationRate);
    }
  }
  return total;
}

/** Obligatory per-cycle treasury drain for maintaining `state.military` (rate uncalibrated, see above). */
export function getStateMilitaryUpkeep(state: State): number {
  const total = sumRegimentHeads(
    state,
    (unitName, count) => count * BASE_UPKEEP_PER_HEAD * (isMountedUnit(unitName) ? MOUNTED_UPKEEP_MULTIPLIER : 1)
  );
  return rn(total, 2);
}

/** Food-good stock consumed per day by `state.military` (rate uncalibrated, see above). */
export function getStateArmyFoodConsumptionPerDay(state: State): number {
  const total = sumRegimentHeads(state, (_unitName, count) => count * BASE_FOOD_CONSUMPTION_PER_HEAD_PER_DAY);
  return rn(total, 2);
}
