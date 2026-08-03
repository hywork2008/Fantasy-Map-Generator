import { create } from "zustand";
import type { CouncilLogEntry } from "../generators/councilSession";

export interface CouncilFactionVoteRow {
  faction: string;
  share: number;
  lean: number;
  contribution: number;
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
  log: CouncilLogEntry[];
}

interface CouncilSessionState {
  rows: CouncilSessionRow[];
  selectedStateId: number | null;
}

export const useCouncilSessionState = create<CouncilSessionState>(() => ({
  rows: [],
  selectedStateId: null
}));

export const getCouncilSessionState = useCouncilSessionState.getState;
export const setCouncilSessionState = useCouncilSessionState.setState;
