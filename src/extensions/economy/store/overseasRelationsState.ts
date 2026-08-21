import { create } from "zustand";

import type { OverseasRealmStatusRow, SendExpeditionFailureReason } from "../generators/overseasRelations";

export interface OverseasRelationsStateOption {
  stateId: number;
  name: string;
}

interface OverseasRelationsUiState {
  stateOptions: OverseasRelationsStateOption[];
  selectedStateId: number | null;
  rows: OverseasRealmStatusRow[];
  activeExpeditionCount: number;
  lastActionMessage: SendExpeditionFailureReason | "sent" | null;
}

export const useOverseasRelationsState = create<OverseasRelationsUiState>(() => ({
  stateOptions: [],
  selectedStateId: null,
  rows: [],
  activeExpeditionCount: 0,
  lastActionMessage: null
}));

export const getOverseasRelationsState = useOverseasRelationsState.getState;
export const setOverseasRelationsState = useOverseasRelationsState.setState;
