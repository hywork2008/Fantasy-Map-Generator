import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import type { DepartmentBaselineAllocation } from "./treasuryAllocation";

/**
 * Multi-ledger PR-6 / state-treasury-department-budget §4.4 — War Footing policy lever.
 *
 * Form-independent core: boost marshalcy. Form-specific secondary floors protect one other
 * department so crusading theocracies and merchant republics do not empty their Camera / council
 * purse when mobilizing.
 */

/** Absolute marshalcy share floor while war footing is on (before renorm). */
export const WAR_FOOTING_MARSHALCY_FLOOR = 0.5;

/** How much of the household share is siphoned toward marshalcy under war footing. */
export const WAR_FOOTING_HOUSEHOLD_CUT = 0.4;

/** Cap on militaryMobilizationBoost written when Budget/Need > 1 under war footing. */
export const MOBILIZATION_BOOST_CAP = 0.25;

/** Convert (fundingRatio − 1) into a troop-target uplift fraction (case β). */
export const MOBILIZATION_BOOST_PER_OVERFUND = 0.5;

/** Secondary department share floor by form while war footing is on. */
export const WAR_FOOTING_SECONDARY_FLOOR: Partial<
  Record<string, { key: keyof DepartmentBaselineAllocation; floor: number }>
> = {
  Theocracy: { key: "ecclesiastica", floor: 0.2 },
  Republic: { key: "chancery", floor: 0.18 },
  Union: { key: "chancery", floor: 0.25 }
};

export function isWarFootingActive(state: Pick<State, "warFooting">): boolean {
  return Boolean(state.warFooting);
}

/**
 * Reweight baseline department shares for war footing. Always raises marshalcy toward
 * WAR_FOOTING_MARSHALCY_FLOOR, cuts household, protects an optional form secondary, then
 * renormalizes so shares sum to 1.
 */
export function applyWarFootingToBaseline(
  baseline: DepartmentBaselineAllocation,
  state: Pick<State, "form" | "warFooting">
): DepartmentBaselineAllocation {
  if (!isWarFootingActive(state)) return { ...baseline };

  const next: DepartmentBaselineAllocation = { ...baseline };

  // Siphon household toward marshalcy first.
  const householdCut = rn(next.household * WAR_FOOTING_HOUSEHOLD_CUT, 4);
  next.household = rn(Math.max(0, next.household - householdCut), 4);
  next.marshalcy = rn(next.marshalcy + householdCut, 4);

  if (next.marshalcy < WAR_FOOTING_MARSHALCY_FLOOR) {
    const need = rn(WAR_FOOTING_MARSHALCY_FLOOR - next.marshalcy, 4);
    // Draw pro-rata from non-protected, non-marshalcy, non-household pools.
    const secondary = WAR_FOOTING_SECONDARY_FLOOR[state.form || ""];
    const donors: (keyof DepartmentBaselineAllocation)[] = [
      "chancery",
      "stewardship",
      "spymastery",
      "ecclesiastica"
    ].filter(key => key !== secondary?.key) as (keyof DepartmentBaselineAllocation)[];

    let donorSum = 0;
    for (const key of donors) donorSum += next[key];
    if (donorSum > 0) {
      const take = Math.min(need, donorSum);
      for (const key of donors) {
        const share = next[key] / donorSum;
        next[key] = rn(Math.max(0, next[key] - take * share), 4);
      }
      next.marshalcy = rn(next.marshalcy + take, 4);
    }
  }

  // Enforce secondary floor by borrowing from non-marshalcy, non-secondary donors (not household).
  const secondary = WAR_FOOTING_SECONDARY_FLOOR[state.form || ""];
  if (secondary && next[secondary.key] < secondary.floor) {
    const need = rn(secondary.floor - next[secondary.key], 4);
    const donors: (keyof DepartmentBaselineAllocation)[] = (
      ["chancery", "stewardship", "spymastery", "ecclesiastica"] as const
    ).filter(key => key !== secondary.key);
    let donorSum = 0;
    for (const key of donors) donorSum += next[key];
    if (donorSum > 0) {
      const take = Math.min(need, donorSum);
      for (const key of donors) {
        const share = next[key] / donorSum;
        next[key] = rn(Math.max(0, next[key] - take * share), 4);
      }
      next[secondary.key] = rn(next[secondary.key] + take, 4);
    }
  }

  // Renormalize to sum 1 (absorb float drift into marshalcy).
  const keys: (keyof DepartmentBaselineAllocation)[] = [
    "marshalcy",
    "household",
    "chancery",
    "stewardship",
    "spymastery",
    "ecclesiastica"
  ];
  let sum = 0;
  for (const key of keys) sum += next[key];
  if (sum > 0 && Math.abs(sum - 1) > 0.0001) {
    for (const key of keys) next[key] = rn(next[key] / sum, 4);
    // Fix residual on marshalcy.
    let again = 0;
    for (const key of keys) again += next[key];
    next.marshalcy = rn(next.marshalcy + (1 - again), 4);
  }

  return next;
}

/**
 * Case β: when war footing is on and marshalcy Budget exceeds Need, write a temporary
 * troop-target uplift onto the state for manpower.effectiveTroopTarget to read.
 */
export function updateMilitaryMobilizationBoost(state: State, fundingRatio: number): number {
  if (!isWarFootingActive(state) || !(fundingRatio > 1)) {
    state.militaryMobilizationBoost = 0;
    return 0;
  }
  const boost = rn(Math.min(MOBILIZATION_BOOST_CAP, (fundingRatio - 1) * MOBILIZATION_BOOST_PER_OVERFUND), 3);
  state.militaryMobilizationBoost = boost;
  return boost;
}

/** Toggle war footing on a state (policy lever). Returns the new value. */
export function setWarFooting(state: State, enabled: boolean): boolean {
  state.warFooting = Boolean(enabled);
  if (!state.warFooting) {
    state.militaryMobilizationBoost = 0;
  }
  return state.warFooting;
}
