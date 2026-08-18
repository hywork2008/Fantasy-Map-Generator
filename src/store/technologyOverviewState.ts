import { create } from "zustand";

export interface TechnologyOverviewState {
  refreshCounter: number;
  refresh: () => void;
}

export const useTechnologyOverviewState = create<TechnologyOverviewState>(set => ({
  refreshCounter: 0,
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
