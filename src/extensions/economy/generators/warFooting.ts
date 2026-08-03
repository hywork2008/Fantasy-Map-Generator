import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import type { DepartmentBaselineAllocation } from "./treasuryAllocation";

/**
 * Multi-ledger PR-6/PR-7 / state-treasury-department-budget §4.4 — War Footing policy lever.
 *
 * Form-independent core: boost marshalcy. Form-specific secondary floors protect one other
 * department so crusading theocracies and merchant republics do not empty their Camera / council
 * purse when mobilizing.
 *
 * PR-7 adds AI diplomacy sync (unless player-locked) and a per-cycle political/court cost.
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

/**
 * Player-facing toggle: sets warFooting and locks AI from overriding until demobilization unlocks.
 * If the player sets the value equal to the AI-default for current diplomacy, clear the lock.
 */
export function setWarFootingByPlayer(state: State, enabled: boolean): boolean {
  const next = setWarFooting(state, enabled);
  const aiDefault = stateHasEnemy(state);
  state.warFootingPlayerLocked = next !== aiDefault;
  return next;
}

/**
 * AI / system sync: align warFooting with Enemy diplomacy unless the player has locked a
 * deliberate override. When peace returns, always demobilize and clear the player lock so the
 * next war can re-arm without a stuck peacetime war economy.
 */
export function syncWarFootingFromDiplomacy(state: State): { changed: boolean; warFooting: boolean } {
  const atWar = stateHasEnemy(state);
  if (!atWar) {
    const wasOn = isWarFootingActive(state);
    if (wasOn) setWarFooting(state, false);
    state.warFootingPlayerLocked = false;
    return { changed: wasOn, warFooting: false };
  }

  if (state.warFootingPlayerLocked) {
    return { changed: false, warFooting: isWarFootingActive(state) };
  }

  if (!isWarFootingActive(state)) {
    setWarFooting(state, true);
    return { changed: true, warFooting: true };
  }
  return { changed: false, warFooting: true };
}

/** Share of L1 household purse drained each cycle while war footing is active (court war burden). */
export const WAR_FOOTING_HOUSEHOLD_COST_RATE = 0.05;
/** Minimum L1 drain per cycle when war footing is on and the purse is non-empty. */
export const WAR_FOOTING_HOUSEHOLD_COST_FLOOR = 0.25;
/** Extra militaryDiscontent per cycle when war footing is kept on in peacetime (player lock). */
export const WAR_FOOTING_PEACETIME_DISCONTENT = 2;

export interface WarFootingCostResult {
  householdCost: number;
  peacetimeDiscontent: number;
}

/**
 * Political cost of war footing for this tax cycle: drains L1 household purse.
 * Peacetime war footing (player override while no Enemy) also accrues militaryDiscontent.
 */
export function applyWarFootingPoliticalCost(state: State): WarFootingCostResult {
  if (!isWarFootingActive(state)) {
    return { householdCost: 0, peacetimeDiscontent: 0 };
  }

  const purse = state.householdPurse || 0;
  let householdCost = 0;
  if (purse > 0) {
    householdCost = rn(
      Math.min(purse, Math.max(WAR_FOOTING_HOUSEHOLD_COST_FLOOR, purse * WAR_FOOTING_HOUSEHOLD_COST_RATE)),
      2
    );
    state.householdPurse = rn(purse - householdCost, 2);
  }

  let peacetimeDiscontent = 0;
  if (!stateHasEnemy(state)) {
    peacetimeDiscontent = WAR_FOOTING_PEACETIME_DISCONTENT;
    state.militaryDiscontent = rn(Math.min(200, (state.militaryDiscontent || 0) + peacetimeDiscontent), 2);
  }

  return { householdCost, peacetimeDiscontent };
}
