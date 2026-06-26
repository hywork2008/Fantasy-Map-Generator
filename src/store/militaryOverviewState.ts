import { create } from "zustand";

export interface MilitaryOverviewState {
  sortBy: string;
  sortOrder: "asc" | "desc";
  percentageMode: boolean;
  refreshCounter: number;
  setSortBy: (sortBy: string) => void;
  toggleSortBy: (sortBy: string) => void;
  togglePercentageMode: () => void;
  refresh: () => void;
}

export const useMilitaryOverviewState = create<MilitaryOverviewState>(set => ({
  sortBy: "total",
  sortOrder: "desc",
  percentageMode: false,
  refreshCounter: 0,
  setSortBy: sortBy => set({ sortBy }),
  toggleSortBy: sortBy =>
    set(state => {
      if (state.sortBy === sortBy) {
        return { sortOrder: state.sortOrder === "asc" ? "desc" : "asc" };
      }
      return { sortBy, sortOrder: "desc" };
    }),
  togglePercentageMode: () => set(state => ({ percentageMode: !state.percentageMode })),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
