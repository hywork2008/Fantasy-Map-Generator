import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getSimulationMonth, getSimulationYear } from "../economyContext";

/**
 * Multi-ledger PR-15 — thin council session replay snapshots for faction-vote graphs.
 *
 * Each tax cycle we freeze a compact snapshot (support + per-faction lean/share + line yes%).
 * UI can scrub sessions without re-simulating the world.
 */

export interface FactionVoteSnapshot {
  faction: string;
  share: number;
  lean: number;
  contribution: number;
}

export interface CouncilSessionSnapshot {
  sessionNumber: number;
  year: number;
  month: number;
  support: number;
  debtVoteYes: number;
  lineVotes: {
    debtIssue: number;
    warFooting: number;
    extraordinaryTax: number;
    militaryExpansion: number;
  };
  factions: FactionVoteSnapshot[];
  councilFailed: boolean;
  notes: string;
}

/** Max retained session snapshots per state. */
export const COUNCIL_SESSION_SNAPSHOT_MAX = 24;

/**
 * Capture one session snapshot from the state's latest vote fields.
 */
export function captureCouncilSessionSnapshot(
  state: State,
  opts?: { councilFailed?: boolean; notes?: string }
): CouncilSessionSnapshot | null {
  const sessionNumber = state.councilSessionNumber || 0;
  if (!(sessionNumber > 0)) return null;

  const factions: FactionVoteSnapshot[] = (state.councilLastVoteFactionDetail || []).map(d => ({
    faction: d.faction,
    share: rn(d.share, 3),
    lean: rn(d.lean, 3),
    contribution: rn(d.contribution, 4)
  }));

  const lineVotes = state.councilLastLineVotes || {
    debtIssue: state.councilLastDebtVoteYes || 0,
    warFooting: 0,
    extraordinaryTax: 0,
    militaryExpansion: 0
  };

  const snap: CouncilSessionSnapshot = {
    sessionNumber,
    year: getSimulationYear() || 0,
    month: getSimulationMonth() || 0,
    support: rn(state.councilSupport ?? 0, 1),
    debtVoteYes: rn(state.councilLastDebtVoteYes ?? 0, 3),
    lineVotes: {
      debtIssue: rn(lineVotes.debtIssue, 3),
      warFooting: rn(lineVotes.warFooting, 3),
      extraordinaryTax: rn(lineVotes.extraordinaryTax, 3),
      militaryExpansion: rn(lineVotes.militaryExpansion, 3)
    },
    factions,
    councilFailed: Boolean(opts?.councilFailed ?? state.councilLastFailed),
    notes: opts?.notes || ""
  };

  const list = state.councilSessionSnapshots ? [...state.councilSessionSnapshots] : [];
  // Replace if same session number already stored this cycle.
  const idx = list.findIndex(s => s.sessionNumber === sessionNumber);
  if (idx >= 0) list[idx] = snap;
  else list.push(snap);
  while (list.length > COUNCIL_SESSION_SNAPSHOT_MAX) list.shift();
  state.councilSessionSnapshots = list;
  return snap;
}

export function getCouncilSessionSnapshots(state: Pick<State, "councilSessionSnapshots">): CouncilSessionSnapshot[] {
  return state.councilSessionSnapshots ? [...state.councilSessionSnapshots] : [];
}

export function getCouncilSessionSnapshot(
  state: Pick<State, "councilSessionSnapshots">,
  sessionNumber: number
): CouncilSessionSnapshot | null {
  return state.councilSessionSnapshots?.find(s => s.sessionNumber === sessionNumber) ?? null;
}
