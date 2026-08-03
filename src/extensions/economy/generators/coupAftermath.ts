import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { appendCouncilLog } from "./councilSession";
import { ensurePretenderFromLastCoup } from "./legitimacyWar";

/**
 * Multi-ledger PR-14 — post-coup legitimacy and thin civil-unrest tick.
 *
 * After a successful debt coup, legitimacy starts low and civil unrest is sticky.
 * Legitimacy recovers slowly when the polity is not in default; if it stays low while
 * military discontent rises again, a civil-unrest event fires (discontent + support hit).
 */

/** Starting legitimacy after a successful debt coup (0–100). */
export const COUP_LEGITIMACY_INITIAL = 32;

/** Legitimacy recovery per tax cycle when not in default. */
export const COUP_LEGITIMACY_RECOVERY = 4;

/** Legitimacy floor before civil-unrest pressure can fire. */
export const CIVIL_UNREST_LEGITIMACY_FLOOR = 40;

/** militaryDiscontent at/above this with low legitimacy → civil unrest tick. */
export const CIVIL_UNREST_DISCONTENT_FLOOR = 55;

/** Extra discontent per civil-unrest tick. */
export const CIVIL_UNREST_DISCONTENT_GAIN = 6;

/** Extra council support penalty while civil unrest is active. */
export const CIVIL_UNREST_SUPPORT_PENALTY = 8;

export interface CoupAftermathApplyResult {
  legitimacy: number;
  civilUnrest: boolean;
}

export interface CivilUnrestTickResult {
  active: boolean;
  legitimacy: number;
  unrestFired: boolean;
  discontent: number;
}

/**
 * Apply immediate post-coup legitimacy / unrest flags after a successful debt coup.
 */
export function applyCoupAftermath(state: State, summary?: string): CoupAftermathApplyResult {
  state.coupLegitimacy = COUP_LEGITIMACY_INITIAL;
  state.civilUnrest = true;
  state.civilUnrestCycles = 0;
  state.debtCoupSupportPenalty = Math.max(state.debtCoupSupportPenalty || 0, 18);
  // Soft war-footing: new regime often keeps marshalcy elevated for a cycle.
  if (!state.warFooting) {
    state.warFooting = true;
    state.warFootingPlayerLocked = false;
  }
  // PR-15: deposed ruler becomes pretender for legitimacy-war resolution.
  ensurePretenderFromLastCoup(state);
  appendCouncilLog(
    state,
    "coup",
    summary
      ? `${summary} Legitimacy ${COUP_LEGITIMACY_INITIAL}; civil unrest begins.`
      : `Coup aftermath: legitimacy ${COUP_LEGITIMACY_INITIAL}; civil unrest begins.`
  );
  dispatchCoupCivilUnrestEvent(state, "start");
  return { legitimacy: COUP_LEGITIMACY_INITIAL, civilUnrest: true };
}

/**
 * Each tax cycle: recover legitimacy, or deepen civil unrest when legitimacy stays low.
 */
export function tickCoupLegitimacyAndUnrest(state: State): CivilUnrestTickResult {
  const result: CivilUnrestTickResult = {
    active: Boolean(state.civilUnrest),
    legitimacy: state.coupLegitimacy ?? 100,
    unrestFired: false,
    discontent: state.militaryDiscontent || 0
  };

  // No coup history → nothing to tick.
  if (state.coupLegitimacy === undefined && !state.civilUnrest) {
    return result;
  }

  let legitimacy = state.coupLegitimacy ?? 100;

  // Recovery when not in domestic/foreign default.
  if (!state.debtInDefault && !state.foreignDebtInDefault) {
    legitimacy = rn(Math.min(100, legitimacy + COUP_LEGITIMACY_RECOVERY), 1);
  } else {
    // Default during unrest: legitimacy bleeds.
    legitimacy = rn(Math.max(0, legitimacy - 2), 1);
  }
  state.coupLegitimacy = legitimacy;
  result.legitimacy = legitimacy;

  if (!state.civilUnrest) {
    // Clear residual once legitimacy is healthy.
    if (legitimacy >= 70) {
      state.coupLegitimacy = legitimacy;
    }
    return result;
  }

  state.civilUnrestCycles = (state.civilUnrestCycles || 0) + 1;
  const discontent = state.militaryDiscontent || 0;

  if (legitimacy < CIVIL_UNREST_LEGITIMACY_FLOOR && discontent >= CIVIL_UNREST_DISCONTENT_FLOOR) {
    result.unrestFired = true;
    state.militaryDiscontent = rn(Math.min(200, discontent + CIVIL_UNREST_DISCONTENT_GAIN), 2);
    state.debtCoupSupportPenalty = Math.max(state.debtCoupSupportPenalty || 0, CIVIL_UNREST_SUPPORT_PENALTY);
    result.discontent = state.militaryDiscontent;
    appendCouncilLog(
      state,
      "note",
      `Civil unrest deepens (legitimacy ${legitimacy}, discontent ${result.discontent}).`
    );
    dispatchCoupCivilUnrestEvent(state, "tick");
  }

  // Unrest ends when legitimacy recovers past a soft threshold.
  if (legitimacy >= 65 && discontent < CIVIL_UNREST_DISCONTENT_FLOOR) {
    state.civilUnrest = false;
    result.active = false;
    appendCouncilLog(state, "note", `Civil unrest subsides (legitimacy ${legitimacy}).`);
    dispatchCoupCivilUnrestEvent(state, "clear");
  }

  return result;
}

function dispatchCoupCivilUnrestEvent(state: State, phase: "start" | "tick" | "clear"): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("fmg:coup-civil-unrest", {
      detail: {
        stateId: state.i,
        phase,
        legitimacy: state.coupLegitimacy ?? 0,
        civilUnrest: Boolean(state.civilUnrest),
        militaryDiscontent: state.militaryDiscontent || 0
      }
    })
  );
}
