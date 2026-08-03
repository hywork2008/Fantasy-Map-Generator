import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { getCouncilSupport } from "./councilAssembly";

/**
 * Multi-ledger PR-11 — thin council budget-line approvals (not full faction voting).
 *
 * Each tax cycle, support thresholds decide which expenditure lines the assembly will
 * rubber-stamp. Gates voluntary debt, peacetime war footing, and extraordinary tax boosts.
 */

export interface CouncilBudgetApprovals {
  /** Voluntary public-debt issue (HUD / auto war debt still needs credit pool). */
  debtIssue: boolean;
  /** Peacetime war-footing enable (wartime always allowed). */
  warFooting: boolean;
  /** Wartime income subsidy / extraordinary levy path (revenue mix wartime boost). */
  extraordinaryTax: boolean;
  /** Future hook: large military expansion spends. */
  militaryExpansion: boolean;
  support: number;
}

export const COUNCIL_LINE_THRESHOLDS = {
  debtIssue: 45,
  warFootingPeacetime: 40,
  extraordinaryTax: 55,
  militaryExpansion: 50
} as const;

/**
 * Compute which budget lines the assembly currently approves.
 */
export function getCouncilBudgetApprovals(state: State): CouncilBudgetApprovals {
  const support = state.councilSupport !== undefined ? state.councilSupport : getCouncilSupport(state).support;
  const atWar = stateHasEnemy(state);

  return {
    support,
    debtIssue: support >= COUNCIL_LINE_THRESHOLDS.debtIssue,
    // At war, war footing is a military necessity the assembly rarely blocks.
    warFooting: atWar || support >= COUNCIL_LINE_THRESHOLDS.warFootingPeacetime,
    extraordinaryTax: atWar && support >= COUNCIL_LINE_THRESHOLDS.extraordinaryTax,
    militaryExpansion: support >= COUNCIL_LINE_THRESHOLDS.militaryExpansion
  };
}

/**
 * Persist approvals onto the state for UI and cross-module gates.
 */
export function refreshCouncilBudgetApprovals(state: State): CouncilBudgetApprovals {
  const approvals = getCouncilBudgetApprovals(state);
  state.councilApprovals = {
    debtIssue: approvals.debtIssue,
    warFooting: approvals.warFooting,
    extraordinaryTax: approvals.extraordinaryTax,
    militaryExpansion: approvals.militaryExpansion
  };
  return approvals;
}

export function isCouncilLineApproved(
  state: Pick<State, "councilApprovals" | "councilSupport" | "form" | "i" | "diplomacy">,
  line: keyof NonNullable<State["councilApprovals"]>
): boolean {
  if (state.councilApprovals && state.councilApprovals[line] !== undefined) {
    return Boolean(state.councilApprovals[line]);
  }
  // Fallback recompute if snapshot missing.
  return getCouncilBudgetApprovals(state as State)[line];
}
