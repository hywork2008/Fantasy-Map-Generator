import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";

/**
 * Multi-ledger PR-11 — thin public-debt default tracking.
 *
 * Missed interest (unable to pay the full coupon) accrues a streak. After the threshold,
 * the state is flagged `debtInDefault`: new borrowing freezes until the streak clears,
 * military discontent ticks up, and `fmg:public-debt-default` fires once per entry.
 */

/** Consecutive tax cycles of unpaid/underpaid interest before default. */
export const DEBT_DEFAULT_STREAK_THRESHOLD = 2;

/** Military discontent added each cycle while in default. */
export const DEBT_DEFAULT_DISCONTENT_PER_CYCLE = 4;

/** Extra relative interest premium while in default (lenders charge more). */
export const DEBT_DEFAULT_RATE_PENALTY = 0.35;

export interface DebtServiceUpdate {
  /** True if this cycle's interest was fully paid. */
  interestFullyPaid: boolean;
  /** Interest due this cycle before cash limits. */
  interestDue: number;
  /** Interest actually paid. */
  interestPaid: number;
  enteredDefault: boolean;
  clearedDefault: boolean;
  inDefault: boolean;
  missedStreak: number;
}

/**
 * Update missed-interest streak and default flag after a debt-service attempt.
 */
export function updateDebtDefaultStatus(state: State, interestDue: number, interestPaid: number): DebtServiceUpdate {
  const due = Math.max(0, interestDue);
  const paid = Math.max(0, interestPaid);
  // Full payment if nothing was due, or paid covers due within a copper of rounding.
  const interestFullyPaid = !(due > 0) || paid + 0.005 >= due;

  const wasDefault = Boolean(state.debtInDefault);
  let streak = state.debtMissedInterestCycles || 0;

  if (due > 0 && !interestFullyPaid) {
    streak += 1;
  } else if (interestFullyPaid) {
    streak = 0;
  }

  state.debtMissedInterestCycles = streak;

  let enteredDefault = false;
  let clearedDefault = false;

  if (streak >= DEBT_DEFAULT_STREAK_THRESHOLD) {
    if (!wasDefault) {
      state.debtInDefault = true;
      enteredDefault = true;
      dispatchDebtDefaultEvent(state, "enter");
    }
  } else if (wasDefault && streak === 0) {
    state.debtInDefault = false;
    clearedDefault = true;
    dispatchDebtDefaultEvent(state, "clear");
  }

  if (state.debtInDefault) {
    state.militaryDiscontent = rn(
      Math.min(200, (state.militaryDiscontent || 0) + DEBT_DEFAULT_DISCONTENT_PER_CYCLE),
      2
    );
  }

  return {
    interestFullyPaid,
    interestDue: due,
    interestPaid: paid,
    enteredDefault,
    clearedDefault,
    inDefault: Boolean(state.debtInDefault),
    missedStreak: streak
  };
}

/** New voluntary/auto debt issues are blocked while in default. */
export function canIssueDebtWhileNotInDefault(state: Pick<State, "debtInDefault">): boolean {
  return !state.debtInDefault;
}

function dispatchDebtDefaultEvent(state: State, phase: "enter" | "clear"): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent("fmg:public-debt-default", {
      detail: {
        stateId: state.i,
        phase,
        publicDebt: state.publicDebt || 0,
        missedCycles: state.debtMissedInterestCycles || 0
      }
    })
  );
}
