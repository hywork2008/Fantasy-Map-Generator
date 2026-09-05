import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { getCouncilSupport } from "./councilAssembly";
import { type CouncilBudgetLine, refreshCouncilFactionSnapshot, simulateCouncilVote } from "./councilVotes";

/**
 * Multi-ledger PR-11/PR-12 — thin council budget-line approvals + faction votes.
 *
 * Each tax cycle, support thresholds decide a floor, then PR-12 faction votes can veto
 * (except wartime war-footing, which remains a military necessity).
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
  /**
   * PR-17f — department-budget-cut lines (docs/plan/department-budget-spending-effects.md §4).
   * Gates a player's departmentBudgetMultiplier < 1 for that department; a boost (> 1) never
   * needs approval. See treasuryAllocation.ts's applyDepartmentBudgetOverride().
   */
  cutChancery: boolean;
  cutStewardship: boolean;
  cutSpymastery: boolean;
  cutEcclesiastica: boolean;
  cutPublicWorks: boolean;
  support: number;
}

export const COUNCIL_LINE_THRESHOLDS = {
  debtIssue: 45,
  warFootingPeacetime: 40,
  extraordinaryTax: 55,
  militaryExpansion: 50,
  // PR-17f — support floor before a department-budget cut is even put to a faction vote.
  // Spymastery is lowest (§ the "most palatable cut" note in councilVotes.ts), Ecclesiastica
  // highest (touches legitimacy, especially for Theocracy).
  cutChancery: 30,
  cutStewardship: 30,
  cutSpymastery: 25,
  cutEcclesiastica: 40,
  // Public Works sits between the two: less politically charged than the Church's budget, but
  // the merchant bloc that funds the assembly notices a paving programme being cancelled.
  cutPublicWorks: 35
} as const;

function lineClearsSupport(line: CouncilBudgetLine, support: number, atWar: boolean): boolean {
  switch (line) {
    case "debtIssue":
      return support >= COUNCIL_LINE_THRESHOLDS.debtIssue;
    case "warFooting":
      return atWar || support >= COUNCIL_LINE_THRESHOLDS.warFootingPeacetime;
    case "extraordinaryTax":
      return atWar && support >= COUNCIL_LINE_THRESHOLDS.extraordinaryTax;
    case "militaryExpansion":
      return support >= COUNCIL_LINE_THRESHOLDS.militaryExpansion;
    case "cutChancery":
      return support >= COUNCIL_LINE_THRESHOLDS.cutChancery;
    case "cutStewardship":
      return support >= COUNCIL_LINE_THRESHOLDS.cutStewardship;
    case "cutSpymastery":
      return support >= COUNCIL_LINE_THRESHOLDS.cutSpymastery;
    case "cutEcclesiastica":
      return support >= COUNCIL_LINE_THRESHOLDS.cutEcclesiastica;
    case "cutPublicWorks":
      return support >= COUNCIL_LINE_THRESHOLDS.cutPublicWorks;
    default:
      return false;
  }
}

/**
 * Compute which budget lines the assembly currently approves.
 * Support thresholds are the floor; faction votes (PR-12) can still veto peacetime lines.
 * Wartime war footing always passes when at war (military necessity).
 */
export function getCouncilBudgetApprovals(state: State): CouncilBudgetApprovals {
  const support = state.councilSupport !== undefined ? state.councilSupport : getCouncilSupport(state).support;
  const atWar = stateHasEnemy(state);

  const voteDebt = simulateCouncilVote(state, "debtIssue");
  const voteWar = simulateCouncilVote(state, "warFooting");
  const voteTax = simulateCouncilVote(state, "extraordinaryTax");
  const voteMil = simulateCouncilVote(state, "militaryExpansion");
  const voteCutChancery = simulateCouncilVote(state, "cutChancery");
  const voteCutStewardship = simulateCouncilVote(state, "cutStewardship");
  const voteCutSpymastery = simulateCouncilVote(state, "cutSpymastery");
  const voteCutEcclesiastica = simulateCouncilVote(state, "cutEcclesiastica");
  const voteCutPublicWorks = simulateCouncilVote(state, "cutPublicWorks");

  return {
    support,
    debtIssue: lineClearsSupport("debtIssue", support, atWar) && voteDebt.passed,
    // At war, war footing is a military necessity the assembly rarely blocks.
    warFooting: atWar || (lineClearsSupport("warFooting", support, atWar) && voteWar.passed),
    extraordinaryTax: lineClearsSupport("extraordinaryTax", support, atWar) && voteTax.passed,
    militaryExpansion: lineClearsSupport("militaryExpansion", support, atWar) && voteMil.passed,
    cutChancery: lineClearsSupport("cutChancery", support, atWar) && voteCutChancery.passed,
    cutStewardship: lineClearsSupport("cutStewardship", support, atWar) && voteCutStewardship.passed,
    cutSpymastery: lineClearsSupport("cutSpymastery", support, atWar) && voteCutSpymastery.passed,
    cutEcclesiastica: lineClearsSupport("cutEcclesiastica", support, atWar) && voteCutEcclesiastica.passed,
    cutPublicWorks: lineClearsSupport("cutPublicWorks", support, atWar) && voteCutPublicWorks.passed
  };
}

/**
 * Persist approvals onto the state for UI and cross-module gates.
 * Also refreshes PR-12 faction share snapshot.
 */
export function refreshCouncilBudgetApprovals(state: State): CouncilBudgetApprovals {
  refreshCouncilFactionSnapshot(state);
  const approvals = getCouncilBudgetApprovals(state);
  state.councilApprovals = {
    debtIssue: approvals.debtIssue,
    warFooting: approvals.warFooting,
    extraordinaryTax: approvals.extraordinaryTax,
    militaryExpansion: approvals.militaryExpansion,
    cutChancery: approvals.cutChancery,
    cutStewardship: approvals.cutStewardship,
    cutSpymastery: approvals.cutSpymastery,
    cutEcclesiastica: approvals.cutEcclesiastica,
    cutPublicWorks: approvals.cutPublicWorks
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
