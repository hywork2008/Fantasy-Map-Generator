import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { canCouncilApproveDebtIssue } from "./councilAssembly";
import { PUBLIC_DEBT_CAP, WAR_DEBT_ISSUE_AMOUNT } from "./fiscalEvents";

/**
 * Multi-ledger PR-8 — ruler-facing public debt issue / repay hooks (UI + calibration).
 */

export const PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT = WAR_DEBT_ISSUE_AMOUNT;
export const PUBLIC_DEBT_PLAYER_REPAY_AMOUNT = 15;

export interface PublicDebtActionResult {
  ok: boolean;
  amount: number;
  error?: string;
  publicDebt?: number;
  treasury?: number;
}

/**
 * Issue thin public debt into L2 if council support allows and principal is under cap.
 * Available to Republic/Monarchy/Union (polities that historically floated credit).
 */
export function issuePublicDebt(state: State, amount = PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT): PublicDebtActionResult {
  if (!state.i) return { ok: false, amount: 0, error: "Invalid state" };
  const form = state.form || "Monarchy";
  if (form === "Anarchy" || form === "Theocracy") {
    return { ok: false, amount: 0, error: `${form} does not float ordinary public debt from this HUD` };
  }
  if (!canCouncilApproveDebtIssue(state)) {
    return {
      ok: false,
      amount: 0,
      error: `Assembly support too low to authorize new debt (need ≥ ${45})`
    };
  }
  const room = rn(PUBLIC_DEBT_CAP - (state.publicDebt || 0), 2);
  if (!(room > 0)) return { ok: false, amount: 0, error: "Public debt is at the cap" };

  const issued = rn(Math.min(amount, room, PUBLIC_DEBT_PLAYER_ISSUE_AMOUNT), 2);
  if (!(issued > 0)) return { ok: false, amount: 0, error: "Nothing to issue" };

  state.publicDebt = rn((state.publicDebt || 0) + issued, 2);
  state.treasury = rn((state.treasury || 0) + issued, 2);
  return { ok: true, amount: issued, publicDebt: state.publicDebt, treasury: state.treasury };
}

/**
 * Repay public debt principal from L2 public treasury.
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
  return { ok: true, amount: paid, publicDebt: state.publicDebt, treasury: state.treasury };
}
