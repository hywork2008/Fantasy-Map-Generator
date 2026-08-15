import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getSimulationMonth, getSimulationYear } from "../economyContext";

/**
 * Multi-ledger PR-13 — thin council session log (ring buffer on the state).
 *
 * Each tax cycle can open a "session" and append vote/veto/debt/coup notes for UI.
 * Not a full parliamentary sim — just a readable assembly chronicle.
 */

export type CouncilLogKind =
  | "session"
  | "vote"
  | "veto"
  | "tax_farm"
  | "debt_issue"
  | "debt_service"
  | "default"
  | "coup_risk"
  | "coup"
  | "foreign_debt"
  | "diplomacy"
  | "bond_market"
  | "note";

export interface CouncilLogEntry {
  id: number;
  kind: CouncilLogKind;
  summary: string;
  year: number;
  month: number;
  support?: number;
  yesShare?: number;
  amount?: number;
  /** PR-14 optional faction breakdown string for vote lines. */
  factionDetail?: string;
  /** i18n key under extensions.councilSession.logs.* */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
}

/** Max retained log lines per state. */
export const COUNCIL_LOG_MAX = 48;

export interface CouncilSessionRecordInput {
  councilFailed?: boolean;
  councilSupport?: number;
  debtVoteYes?: number;
  /** PR-14 human-readable faction vote line (e.g. "court 60% · merchants 35%…"). */
  debtVoteFactionSummary?: string;
  taxFarmLeak?: number;
  debtIssued?: number;
  debtRepaid?: number;
  debtInterestPaid?: number;
  enteredDefault?: boolean;
  clearedDefault?: boolean;
  foreignDebtIssued?: number;
  foreignDebtInterest?: number;
  foreignDebtDefaulted?: boolean;
  diplomacyWorsened?: number;
  bondMarketIssued?: number;
  coupRisk?: boolean;
  coupSucceeded?: boolean;
  coupSummary?: string;
  civilUnrestTick?: boolean;
  legitimacy?: number;
}

function nextLogId(state: State): number {
  const log = state.councilSessionLog;
  if (!log?.length) return 1;
  return (log[log.length - 1]?.id ?? 0) + 1;
}

/**
 * Append one chronicle line (trims oldest when over cap).
 */
export function appendCouncilLog(
  state: State,
  kind: CouncilLogKind,
  summary: string,
  extra?: Partial<
    Pick<CouncilLogEntry, "support" | "yesShare" | "amount" | "factionDetail" | "messageKey" | "messageParams">
  >
): CouncilLogEntry {
  const entry: CouncilLogEntry = {
    id: nextLogId(state),
    kind,
    summary,
    year: getSimulationYear() || 0,
    month: getSimulationMonth() || 0,
    ...extra
  };
  const log = state.councilSessionLog ? [...state.councilSessionLog] : [];
  log.push(entry);
  while (log.length > COUNCIL_LOG_MAX) log.shift();
  state.councilSessionLog = log;
  state.councilSessionNumber = (state.councilSessionNumber || 0) + (kind === "session" ? 1 : 0);
  return entry;
}

/**
 * Record one tax-cycle assembly session from fiscal event outcomes.
 */
export function recordCouncilSession(state: State, input: CouncilSessionRecordInput): void {
  const sessionNo = (state.councilSessionNumber || 0) + 1;
  const support = input.councilSupport ?? state.councilSupport ?? 0;
  appendCouncilLog(state, "session", `Session #${sessionNo} opens (support ${rn(support, 0)}/100).`, {
    support,
    messageKey: "session",
    messageParams: { n: sessionNo, support: rn(support, 0) }
  });
  // Keep session counter in sync (appendCouncilLog already increments on "session").
  state.councilSessionNumber = sessionNo;

  if (input.debtVoteYes !== undefined) {
    appendCouncilLog(
      state,
      "vote",
      `Debt-issue motion: ${rn(input.debtVoteYes * 100, 0)}% yes` +
        (input.debtVoteYes >= 0.5 ? " — carried." : " — defeated.") +
        (input.debtVoteFactionSummary ? ` [${input.debtVoteFactionSummary}]` : ""),
      {
        support,
        yesShare: input.debtVoteYes,
        factionDetail: input.debtVoteFactionSummary,
        messageKey: input.debtVoteYes >= 0.5 ? "voteCarried" : "voteDefeated",
        messageParams: { pct: rn(input.debtVoteYes * 100, 0) }
      }
    );
  }

  if (input.councilFailed) {
    appendCouncilLog(state, "veto", "Wartime assembly vetoed part of ordinary revenue.", {
      support,
      messageKey: "veto"
    });
  }

  if ((input.taxFarmLeak || 0) > 0) {
    appendCouncilLog(state, "tax_farm", `Tax-farm leak ${rn(input.taxFarmLeak || 0, 2)} SP.`, {
      amount: input.taxFarmLeak,
      messageKey: "taxFarm",
      messageParams: { amount: rn(input.taxFarmLeak || 0, 2) }
    });
  }

  if ((input.debtInterestPaid || 0) > 0 || (input.debtRepaid || 0) > 0) {
    appendCouncilLog(
      state,
      "debt_service",
      `Debt service: interest ${rn(input.debtInterestPaid || 0, 2)} SP` +
        ((input.debtRepaid || 0) > 0 ? `, repay ${rn(input.debtRepaid || 0, 2)} SP` : "") +
        ".",
      {
        amount: rn((input.debtInterestPaid || 0) + (input.debtRepaid || 0), 2),
        messageKey: (input.debtRepaid || 0) > 0 ? "debtServiceRepay" : "debtService",
        messageParams: {
          interest: rn(input.debtInterestPaid || 0, 2),
          repay: rn(input.debtRepaid || 0, 2)
        }
      }
    );
  }

  if ((input.debtIssued || 0) > 0) {
    appendCouncilLog(state, "debt_issue", `Domestic war debt issued ${rn(input.debtIssued || 0, 2)} SP.`, {
      amount: input.debtIssued,
      messageKey: "debtIssue",
      messageParams: { amount: rn(input.debtIssued || 0, 2) }
    });
  }

  if ((input.foreignDebtIssued || 0) > 0) {
    appendCouncilLog(state, "foreign_debt", `Foreign loan drawn ${rn(input.foreignDebtIssued || 0, 2)} SP.`, {
      amount: input.foreignDebtIssued,
      messageKey: "foreignLoan",
      messageParams: { amount: rn(input.foreignDebtIssued || 0, 2) }
    });
  }

  if ((input.bondMarketIssued || 0) > 0) {
    appendCouncilLog(
      state,
      "bond_market",
      `Bond-market issue ${rn(input.bondMarketIssued || 0, 2)} SP (third-party underwriter).`,
      {
        amount: input.bondMarketIssued,
        messageKey: "bondMarket",
        messageParams: { amount: rn(input.bondMarketIssued || 0, 2) }
      }
    );
  }

  if ((input.foreignDebtInterest || 0) > 0) {
    appendCouncilLog(state, "foreign_debt", `Foreign debt interest paid ${rn(input.foreignDebtInterest || 0, 2)} SP.`, {
      amount: input.foreignDebtInterest,
      messageKey: "foreignInterest",
      messageParams: { amount: rn(input.foreignDebtInterest || 0, 2) }
    });
  }

  if (input.foreignDebtDefaulted) {
    appendCouncilLog(state, "default", "Foreign loan(s) entered DEFAULT — creditor diplomacy chilled.", {
      messageKey: "foreignDefault"
    });
  }

  if ((input.diplomacyWorsened || 0) > 0) {
    appendCouncilLog(state, "diplomacy", `Diplomacy worsened with ${input.diplomacyWorsened} foreign creditor(s).`, {
      messageKey: "diplomacy",
      messageParams: { count: input.diplomacyWorsened ?? 0 }
    });
  }

  if (input.enteredDefault) {
    appendCouncilLog(state, "default", "Public debt entered DEFAULT — new borrowing frozen.", {
      messageKey: "defaultEntered"
    });
  } else if (input.clearedDefault) {
    appendCouncilLog(state, "default", "Public debt default cleared — interest current.", {
      messageKey: "defaultCleared"
    });
  }

  // Coup success is logged by applyCoupAftermath; only note risk here if no success.
  if (!input.coupSucceeded && input.coupRisk) {
    appendCouncilLog(state, "coup_risk", "Debt coup risk elevated (military restiveness).", {
      messageKey: "coupRisk"
    });
  }

  if (input.civilUnrestTick) {
    appendCouncilLog(state, "note", `Civil unrest pressure (legitimacy ${rn(input.legitimacy ?? 0, 0)}).`, {
      messageKey: "unrestPressure",
      messageParams: { legitimacy: rn(input.legitimacy ?? 0, 0) }
    });
  }
}

export function getCouncilSessionLog(state: Pick<State, "councilSessionLog">): CouncilLogEntry[] {
  if (!state.councilSessionLog?.length) return [];
  return state.councilSessionLog.map(entry => ({
    id: entry.id,
    kind: entry.kind as CouncilLogKind,
    summary: entry.summary,
    year: entry.year,
    month: entry.month,
    support: entry.support,
    yesShare: entry.yesShare,
    amount: entry.amount,
    factionDetail: (entry as { factionDetail?: string }).factionDetail,
    messageKey: (entry as { messageKey?: string }).messageKey,
    messageParams: (entry as { messageParams?: Record<string, string | number> }).messageParams
  }));
}

/** Format PR-14 faction detail rows for session log / UI. */
export function formatFactionVoteSummary(
  details: { faction: string; lean: number; share: number }[] | undefined
): string | undefined {
  if (!details?.length) return undefined;
  return details.map(d => `${d.faction} ${(d.lean * 100).toFixed(0)}%×${(d.share * 100).toFixed(0)}`).join(" · ");
}
