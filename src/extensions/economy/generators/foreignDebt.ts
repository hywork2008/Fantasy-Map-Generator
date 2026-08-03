import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { peekCreditPoolBalance } from "./creditPool";

/**
 * Multi-ledger PR-13 — thin international / foreign debt (外債).
 *
 * When the domestic credit pool cannot fund war needs, Ally/Friendly states with surplus
 * L2 (or credit pool) may lend. Interest returns to the creditor's public treasury.
 * Kept separate from domestic `publicDebt` so counterparties stay visible.
 */

export interface ForeignLoan {
  creditorStateId: number;
  creditorName: string;
  principal: number;
  /** Monthly interest rate fraction. */
  interestRate: number;
}

export const FOREIGN_DEBT_CAP = 150;
export const FOREIGN_DEBT_ISSUE_AMOUNT = 20;
export const FOREIGN_DEBT_BASE_INTEREST = 0.025;
/** Creditor must have at least this much lendable cash (L2 + pool soft capacity). */
export const FOREIGN_CREDITOR_MIN_SURPLUS = 15;
/** Share of creditor L2 drained when lending (does not touch their domestic publicDebt). */
export const FOREIGN_LEND_FROM_TREASURY_SHARE = 0.2;

const FRIENDLY_RELATIONS = new Set(["Ally", "Friendly", "Suzerain", "Vassal"]);

export interface ForeignDebtActionResult {
  ok: boolean;
  amount: number;
  error?: string;
  creditorStateId?: number;
  creditorName?: string;
}

export function sumForeignDebtPrincipal(state: Pick<State, "foreignLoans" | "foreignDebt">): number {
  if (state.foreignLoans?.length) {
    return rn(
      state.foreignLoans.reduce((s, l) => s + (l.principal || 0), 0),
      2
    );
  }
  return rn(state.foreignDebt || 0, 2);
}

function refreshForeignDebtTotal(state: State): number {
  const total = sumForeignDebtPrincipal(state);
  state.foreignDebt = total;
  return total;
}

/**
 * Find a friendly creditor with surplus treasury who is not at war with the borrower.
 */
export function findForeignCreditor(borrower: State): State | null {
  if (!borrower.i) return null;
  try {
    const { pack } = getWorldContext();
    const dip = borrower.diplomacy || [];
    let best: State | null = null;
    let bestScore = 0;

    for (let otherId = 1; otherId < dip.length; otherId++) {
      const relRaw = dip[otherId];
      const rel = typeof relRaw === "string" ? relRaw : null;
      if (!rel || !FRIENDLY_RELATIONS.has(rel)) continue;
      if (rel === "Enemy") continue;
      const other = pack.states?.[otherId];
      if (!other?.i || other.removed) continue;
      // Do not borrow from someone at war with us (asymmetric dip possible).
      if (other.diplomacy?.[borrower.i] === "Enemy") continue;
      if (other.debtInDefault) continue;

      const treasury = other.treasury || 0;
      const pool = peekCreditPoolBalance(other);
      const surplus = treasury + pool * 0.25;
      if (surplus < FOREIGN_CREDITOR_MIN_SURPLUS) continue;
      // Prefer Ally, then higher surplus.
      const relBonus = rel === "Ally" ? 20 : rel === "Friendly" ? 10 : 5;
      const score = surplus + relBonus;
      if (score > bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Issue a foreign loan into L2 from a friendly state's treasury (thin 外債).
 */
export function issueForeignDebt(state: State, amount = FOREIGN_DEBT_ISSUE_AMOUNT): ForeignDebtActionResult {
  if (!state.i) return { ok: false, amount: 0, error: "Invalid state" };
  const form = state.form || "Monarchy";
  if (form === "Anarchy") {
    return { ok: false, amount: 0, error: "Anarchy cannot float foreign debt" };
  }
  if (state.debtInDefault) {
    return { ok: false, amount: 0, error: "In default — foreign creditors refuse" };
  }

  const outstanding = sumForeignDebtPrincipal(state);
  const room = rn(FOREIGN_DEBT_CAP - outstanding, 2);
  if (!(room > 0)) return { ok: false, amount: 0, error: "Foreign debt is at the cap" };

  const creditor = findForeignCreditor(state);
  if (!creditor?.i) {
    return { ok: false, amount: 0, error: "No friendly creditor with surplus funds" };
  }

  const creditorCash = creditor.treasury || 0;
  const maxFromCreditor = rn(creditorCash * FOREIGN_LEND_FROM_TREASURY_SHARE, 2);
  const want = rn(Math.min(amount, room, FOREIGN_DEBT_ISSUE_AMOUNT, maxFromCreditor, creditorCash), 2);
  if (!(want > 0)) {
    return { ok: false, amount: 0, error: "Creditor cannot fund this loan" };
  }

  creditor.treasury = rn(creditorCash - want, 2);
  state.treasury = rn((state.treasury || 0) + want, 2);

  const rate = rn(
    FOREIGN_DEBT_BASE_INTEREST * (state.form === "Republic" ? 0.95 : state.form === "Theocracy" ? 1.1 : 1),
    4
  );
  const loans = state.foreignLoans ? [...state.foreignLoans] : [];
  const existing = loans.find(l => l.creditorStateId === creditor.i);
  if (existing) {
    existing.principal = rn(existing.principal + want, 2);
    existing.interestRate = rate;
    existing.creditorName = creditor.name || existing.creditorName;
  } else {
    loans.push({
      creditorStateId: creditor.i,
      creditorName: creditor.name || `State ${creditor.i}`,
      principal: want,
      interestRate: rate
    });
  }
  state.foreignLoans = loans;
  refreshForeignDebtTotal(state);
  state.lastForeignDebtIssued = want;

  return {
    ok: true,
    amount: want,
    creditorStateId: creditor.i,
    creditorName: creditor.name || `State ${creditor.i}`
  };
}

export interface ForeignDebtServiceResult {
  interestPaid: number;
  principalRepaid: number;
  stillOwed: number;
}

/**
 * Service foreign loans: pay interest to creditors' L2; small auto principal when cash-rich.
 */
export function serviceForeignDebt(state: State): ForeignDebtServiceResult {
  const loans = state.foreignLoans;
  if (!loans?.length) {
    state.foreignDebt = 0;
    state.lastForeignDebtInterest = 0;
    return { interestPaid: 0, principalRepaid: 0, stillOwed: 0 };
  }

  let interestPaid = 0;
  let principalRepaid = 0;
  try {
    const { pack } = getWorldContext();
    const remaining: ForeignLoan[] = [];

    for (const loan of loans) {
      if (!(loan.principal > 0)) continue;
      const interestDue = rn(loan.principal * (loan.interestRate || FOREIGN_DEBT_BASE_INTEREST), 2);
      const cash = state.treasury || 0;
      const paidInterest = rn(Math.min(interestDue, cash), 2);
      if (paidInterest > 0) {
        state.treasury = rn(cash - paidInterest, 2);
        interestPaid = rn(interestPaid + paidInterest, 2);
        const creditor = pack.states?.[loan.creditorStateId];
        if (creditor?.i) {
          creditor.treasury = rn((creditor.treasury || 0) + paidInterest, 2);
        }
      }
      // Capitalize unpaid interest onto principal (thin).
      const unpaid = rn(interestDue - paidInterest, 2);
      let principal = rn(loan.principal + unpaid, 2);

      // Auto-repay a little when L2 has surplus buffer.
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
        remaining.push({
          ...loan,
          principal
        });
      }
    }

    state.foreignLoans = remaining;
  } catch {
    // unit tests without full pack
  }

  const stillOwed = refreshForeignDebtTotal(state);
  state.lastForeignDebtInterest = interestPaid;
  state.lastForeignDebtRepaid = principalRepaid;
  return { interestPaid, principalRepaid, stillOwed };
}

export function canIssueForeignDebt(state: State): boolean {
  if (!state.i || state.debtInDefault) return false;
  if ((state.form || "") === "Anarchy") return false;
  if (sumForeignDebtPrincipal(state) >= FOREIGN_DEBT_CAP) return false;
  return findForeignCreditor(state) !== null;
}
