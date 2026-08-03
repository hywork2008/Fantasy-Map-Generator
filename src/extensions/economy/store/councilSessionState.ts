import { create } from "zustand";
import type { CouncilLogEntry } from "../generators/councilSession";

export interface CouncilFactionVoteRow {
  faction: string;
  share: number;
  lean: number;
  contribution: number;
}

export interface CouncilSessionReplaySnap {
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
  factions: CouncilFactionVoteRow[];
  councilFailed: boolean;
  notes: string;
}

export interface CouncilSessionRow {
  stateId: number;
  stateName: string;
  form: string;
  sessionNumber: number;
  support: number;
  debtVoteYes: number;
  /** PR-14 per-faction detail for last debt-issue vote. */
  factionVotes: CouncilFactionVoteRow[];
  lineVotes: {
    debtIssue: number;
    warFooting: number;
    extraordinaryTax: number;
    militaryExpansion: number;
  } | null;
  coupLegitimacy: number | null;
  civilUnrest: boolean;
  foreignDebtInDefault: boolean;
  /** PR-15 */
  creditRating: string | null;
  tradeSanctionMult: number;
  legitimacyWarActive: boolean;
  pretenderName: string | null;
  /** PR-15 session replay history (oldest → newest). */
  snapshots: CouncilSessionReplaySnap[];
  log: CouncilLogEntry[];
}

interface CouncilSessionState {
  rows: CouncilSessionRow[];
  selectedStateId: number | null;
  /** PR-15: which historical session to graph (null = latest live). */
  replaySessionNumber: number | null;
}

export const useCouncilSessionState = create<CouncilSessionState>(() => ({
  rows: [],
  selectedStateId: null,
  replaySessionNumber: null
}));

export const getCouncilSessionState = useCouncilSessionState.getState;
export const setCouncilSessionState = useCouncilSessionState.setState;
