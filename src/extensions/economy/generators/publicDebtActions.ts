import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { isCouncilLineApproved } from "./councilBudget";
import { getCreditPoolBalance, lendFromCreditPool, payCreditorsWithSyndicate } from "./creditPool";
import { canIssueDebtWhileNotInDefault } from "./debtDefault";
import { PUBLIC_DEBT_CAP, WAR_DEBT_ISSUE_AMOUNT } from "./fiscalEvents";
import { splitCreditorPayout } from "./moneylenders";

/**
 * Multi-ledger PR-8/PR-9 — ruler-facing public debt issue / repay hooks.
 * Issues draw from the anonymous credit pool; repayments return cash to the pool.
 */

export const PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT = WAR_DEBT_ISSUE_AMOUNT;
export const PUBLIC_DEBT_PLAYER_REPAY_AMOUNT = 15;

export interface PublicDebtActionResult {
  ok: boolean;
  amount: number;
  error?: string;
  publicDebt?: number;
  treasury?: number;
  creditPool?: number;
}

/**
 * Issue public debt into L2 funded by the credit pool (moneylenders), if council allows.
 * Available to Republic/Monarchy/Union (polities that historically floated credit).
 */
export function issuePublicDebt(state: State, amount = PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT): PublicDebtActionResult {
  if (!state.i) return { ok: false, amount: 0, error: "Invalid state" };
  const form = state.form || "Monarchy";
  if (form === "Anarchy" || form === "Theocracy") {
    return { ok: false, amount: 0, error: `${form} does not float ordinary public debt from this HUD` };
  }
  if (!isCouncilLineApproved(state, "debtIssue")) {
    return {
      ok: false,
      amount: 0,
      error: "Assembly has not approved the debt-issue budget line"
    };
  }
  if (!canIssueDebtWhileNotInDefault(state)) {
    return { ok: false, amount: 0, error: "In default — creditors refuse new loans until interest is current" };
  }
  const room = rn(PUBLIC_DEBT_CAP - (state.publicDebt || 0), 2);
  if (!(room > 0)) return { ok: false, amount: 0, error: "Public debt is at the cap" };

  const want = rn(Math.min(amount, room, PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT), 2);
  if (!(want > 0)) return { ok: false, amount: 0, error: "Nothing to issue" };

  const poolAvail = getCreditPoolBalance(state);
  if (!(poolAvail > 0)) {
    return { ok: false, amount: 0, error: "Credit pool is empty — moneylenders will not lend" };
  }

  const { lent } = lendFromCreditPool(state, want);
  if (!(lent > 0)) {
    return { ok: false, amount: 0, error: "Credit pool could not fund this issue" };
  }

  state.publicDebt = rn((state.publicDebt || 0) + lent, 2);
  state.treasury = rn((state.treasury || 0) + lent, 2);
  return {
    ok: true,
    amount: lent,
    publicDebt: state.publicDebt,
    treasury: state.treasury,
    creditPool: state.creditPoolBalance
  };
}

/**
 * Repay public debt principal from L2 into the credit pool.
 */
export function repayPublicDebt(state: State, amount = PUBLIC_DEBT_PLAYER_REPAY_AMOUNT): PublicDebtActionResult {
  if (!state.i) return { ok: false, amount: 0, error: "Invalid state" };
  const debt = state.publicDebt || 0;
  if (!(debt > 0)) return { ok: false, amount: 0, error: "No public debt to repay" };
  const cash = state.treasury || 0;
  if (!(cash > 0)) return { ok: false, amount: 0, error: "Public treasury is empty" };

  const paid = rn(Math.min(amount, debt, cash, PUBLIC_DEBT_PLAYER_REPAY_AMOUNT), 2);
  if (!(paid > 0)) return { ok: false, amount: 0, error: "Nothing to repay" };

  state.publicDebt = rn(debt - paid, 2);
  state.treasury = rn(cash - paid, 2);
  payCreditorsWithSyndicate(state, paid, splitCreditorPayout);
  return {
    ok: true,
    amount: paid,
    publicDebt: state.publicDebt,
    treasury: state.treasury,
    creditPool: state.creditPoolBalance
  };
}
