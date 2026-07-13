import { create } from "zustand";
import type { DeathWindow } from "../generators/populationLossTracker";

export type PopulationOverviewTab = "living" | "deaths";

export interface PopulationOverviewState {
  activeTab: PopulationOverviewTab;
  deathWindow: DeathWindow;
  sortBy: string;
  sortOrder: "asc" | "desc";
  refreshCounter: number;
  setActiveTab: (tab: PopulationOverviewTab) => void;
  setDeathWindow: (window: DeathWindow) => void;
  toggleSortBy: (sortBy: string) => void;
  refresh: () => void;
}

export const usePopulationOverviewState = create<PopulationOverviewState>(set => ({
  activeTab: "deaths",
  deathWindow: "week",
  sortBy: "total",
  sortOrder: "desc",
  refreshCounter: 0,
  setActiveTab: activeTab => set({ activeTab }),
  setDeathWindow: deathWindow => set({ deathWindow }),
  toggleSortBy: sortBy =>
    set(state => {
      if (state.sortBy === sortBy) {
        return { sortOrder: state.sortOrder === "asc" ? "desc" : "asc" };
      }
      return { sortBy, sortOrder: "desc" };
    }),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
