import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import type { ForeignLoan } from "./foreignDebt";
import { FOREIGN_DEBT_BASE_INTEREST, refreshForeignDebtTotalIfPresent } from "./foreignDebt";

/**
 * Multi-ledger PR-14 — foreign-debt default ↔ diplomacy deterioration (and mild recovery).
 *
 * Missed foreign-interest coupons accrue a streak per loan. After the threshold the loan is
 * flagged in default and bilateral diplomacy with that creditor steps down the friendliness
 * ladder. Clearing full interest for a cycle reduces the streak; full principal clearance can
 * nudge relations back up one step.
 */

/** Consecutive underpaid foreign coupons before a loan is "in default" with that creditor. */
export const FOREIGN_DEBT_DEFAULT_STREAK = 2;

/** Extra interest premium while a foreign loan is in default. */
export const FOREIGN_DEBT_DEFAULT_RATE_PENALTY = 0.4;

const DIPLOMACY_DOWNGRADE: Record<string, string> = {
  Ally: "Friendly",
  Friendly: "Neutral",
  Neutral: "Suspicion",
  Suspicion: "Rival",
  Rival: "Enemy",
  Vassal: "Suspicion",
  Suzerain: "Rival"
};

const DIPLOMACY_UPGRADE: Record<string, string> = {
  Enemy: "Rival",
  Rival: "Suspicion",
  Suspicion: "Neutral",
  Neutral: "Friendly",
  Friendly: "Ally"
};

export interface ForeignDebtDiplomacyResult {
  interestPaid: number;
  principalRepaid: number;
  stillOwed: number;
  enteredDefaultWith: number[];
  diplomacyWorsened: { creditorStateId: number; from: string; to: string }[];
  diplomacyImproved: { creditorStateId: number; from: string; to: string }[];
}

function readRelation(from: State, toId: number): string {
  const raw = from.diplomacy?.[toId];
  return typeof raw === "string" ? raw : "Neutral";
}

function writeBilateralRelation(a: State, b: State, rel: string): void {
  if (!a.i || !b.i) return;
  a.diplomacy = Array.isArray(a.diplomacy) ? [...a.diplomacy] : [];
  b.diplomacy = Array.isArray(b.diplomacy) ? [...b.diplomacy] : [];
  // Ensure sparse arrays can hold the index.
  while (a.diplomacy.length <= b.i) a.diplomacy.push("Unknown");
  while (b.diplomacy.length <= a.i) b.diplomacy.push("Unknown");
  a.diplomacy[b.i] = rel;
  // Mirror common pairs.
  if (
    rel === "Enemy" ||
    rel === "Ally" ||
    rel === "Friendly" ||
    rel === "Neutral" ||
    rel === "Suspicion" ||
    rel === "Rival"
  ) {
    b.diplomacy[a.i] = rel;
  } else if (rel === "Vassal") {
    b.diplomacy[a.i] = "Suzerain";
  } else if (rel === "Suzerain") {
    b.diplomacy[a.i] = "Vassal";
  }
}

function worsenRelation(borrower: State, creditor: State): { from: string; to: string } | null {
  const from = readRelation(borrower, creditor.i!);
  const to = DIPLOMACY_DOWNGRADE[from];
  if (!to || to === from) return null;
  writeBilateralRelation(borrower, creditor, to);
  return { from, to };
}

function improveRelation(borrower: State, creditor: State): { from: string; to: string } | null {
  const from = readRelation(borrower, creditor.i!);
  // Do not auto-heal Enemy (that would end wars too cheaply).
  if (from === "Enemy") return null;
  const to = DIPLOMACY_UPGRADE[from];
  if (!to || to === from) return null;
  writeBilateralRelation(borrower, creditor, to);
  return { from, to };
}

/**
 * Service foreign loans with default tracking + diplomacy side effects (PR-14).
 * Replaces the plain interest path used in PR-13 for richer consequences.
 */
export function serviceForeignDebtWithDiplomacy(state: State): ForeignDebtDiplomacyResult {
  const empty: ForeignDebtDiplomacyResult = {
    interestPaid: 0,
    principalRepaid: 0,
    stillOwed: 0,
    enteredDefaultWith: [],
    diplomacyWorsened: [],
    diplomacyImproved: []
  };

  const loans = state.foreignLoans;
  if (!loans?.length) {
    state.foreignDebt = 0;
    state.lastForeignDebtInterest = 0;
    state.foreignDebtInDefault = false;
    return empty;
  }

  let interestPaid = 0;
  let principalRepaid = 0;
  const enteredDefaultWith: number[] = [];
  const diplomacyWorsened: ForeignDebtDiplomacyResult["diplomacyWorsened"] = [];
  const diplomacyImproved: ForeignDebtDiplomacyResult["diplomacyImproved"] = [];
  let anyLoanInDefault = false;

  try {
    const { pack } = getWorldContext();
    const remaining: ForeignLoan[] = [];

    for (const loan of loans) {
      if (!(loan.principal > 0)) continue;
      const baseRate = loan.interestRate || FOREIGN_DEBT_BASE_INTEREST;
      const rate = loan.inDefault ? baseRate * (1 + FOREIGN_DEBT_DEFAULT_RATE_PENALTY) : baseRate;
      const interestDue = rn(loan.principal * rate, 2);
      const cash = state.treasury || 0;
      const paidInterest = rn(Math.min(interestDue, cash), 2);
      const fullyPaid = !(interestDue > 0) || paidInterest + 0.005 >= interestDue;

      if (paidInterest > 0) {
        state.treasury = rn(cash - paidInterest, 2);
        interestPaid = rn(interestPaid + paidInterest, 2);
        const creditor = pack.states?.[loan.creditorStateId];
        if (creditor?.i) {
          creditor.treasury = rn((creditor.treasury || 0) + paidInterest, 2);
        }
      }

      const unpaid = rn(interestDue - paidInterest, 2);
      let principal = rn(loan.principal + unpaid, 2);
      let missed = loan.missedInterestCycles || 0;
      let inDefault = Boolean(loan.inDefault);

      if (interestDue > 0 && !fullyPaid) {
        missed += 1;
      } else if (fullyPaid) {
        missed = 0;
        if (inDefault) {
          inDefault = false;
        }
      }

      if (missed >= FOREIGN_DEBT_DEFAULT_STREAK && !loan.inDefault) {
        inDefault = true;
        enteredDefaultWith.push(loan.creditorStateId);
        const creditor = pack.states?.[loan.creditorStateId];
        if (creditor?.i) {
          const change = worsenRelation(state, creditor);
          if (change) {
            diplomacyWorsened.push({
              creditorStateId: creditor.i,
              from: change.from,
              to: change.to
            });
          }
        }
      } else if (inDefault && !fullyPaid) {
        // Ongoing default: occasional further diplomatic chill (every other miss).
        if (missed > 0 && missed % 2 === 0) {
          const creditor = pack.states?.[loan.creditorStateId];
          if (creditor?.i) {
            const change = worsenRelation(state, creditor);
            if (change) {
              diplomacyWorsened.push({
                creditorStateId: creditor.i,
                from: change.from,
                to: change.to
              });
            }
          }
        }
      }

      // Auto-repay principal when cash-rich (same thin rule as PR-13).
      const surplus = state.treasury || 0;
      if (surplus > 20 && principal > 0) {
        const repay = rn(Math.min(surplus - 20, principal, 10), 2);
        if (repay > 0) {
          state.treasury = rn(surplus - repay, 2);
          principal = rn(principal - repay, 2);
          principalRepaid = rn(principalRepaid + repay, 2);
          const creditor = pack.states?.[loan.creditorStateId];
          if (creditor?.i) {
            creditor.treasury = rn((creditor.treasury || 0) + repay, 2);
          }
        }
      }

      if (principal > 0.005) {
        if (inDefault) anyLoanInDefault = true;
        remaining.push({
          ...loan,
          principal,
          missedInterestCycles: missed,
          inDefault
        });
      } else {
        // Loan fully repaid — mild diplomatic thaw.
        const creditor = pack.states?.[loan.creditorStateId];
        if (creditor?.i) {
          const change = improveRelation(state, creditor);
          if (change) {
            diplomacyImproved.push({
              creditorStateId: creditor.i,
              from: change.from,
              to: change.to
            });
          }
        }
      }
    }

    state.foreignLoans = remaining;
  } catch {
    // unit tests without full pack
  }

  const stillOwed = refreshForeignDebtTotalIfPresent(state);
  state.lastForeignDebtInterest = interestPaid;
  state.lastForeignDebtRepaid = principalRepaid;
  state.foreignDebtInDefault = anyLoanInDefault;
  state.lastForeignDiplomacyWorsened = diplomacyWorsened.length;
  state.lastForeignDiplomacyImproved = diplomacyImproved.length;

  return {
    interestPaid,
    principalRepaid,
    stillOwed,
    enteredDefaultWith,
    diplomacyWorsened,
    diplomacyImproved
  };
}

/** Domestic public-debt default also chills foreign creditors (PR-14 bidirectional link). */
export function applyDomesticDefaultForeignDiplomacyHit(state: State): number {
  if (!state.debtInDefault || !state.foreignLoans?.length) return 0;
  let hits = 0;
  try {
    const { pack } = getWorldContext();
    for (const loan of state.foreignLoans) {
      const creditor = pack.states?.[loan.creditorStateId];
      if (!creditor?.i) continue;
      const change = worsenRelation(state, creditor);
      if (change) hits += 1;
    }
  } catch {
    // ignore
  }
  return hits;
}
