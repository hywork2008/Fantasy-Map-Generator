import { create } from "zustand";
import type { DomainPollDetail } from "../generators/domainPollDetail";

interface DomainPollDetailState {
  details: DomainPollDetail[];
  selectedStateId: number | null;
}

export const useDomainPollDetailState = create<DomainPollDetailState>(() => ({
  details: [],
  selectedStateId: null
}));

export const getDomainPollDetailState = useDomainPollDetailState.getState;
export const setDomainPollDetailState = useDomainPollDetailState.setState;
