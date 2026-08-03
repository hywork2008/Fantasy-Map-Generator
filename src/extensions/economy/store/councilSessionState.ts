import { create } from "zustand";
import type { CouncilLogEntry } from "../generators/councilSession";

export interface CouncilSessionRow {
  stateId: number;
  stateName: string;
  form: string;
  sessionNumber: number;
  support: number;
  debtVoteYes: number;
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
