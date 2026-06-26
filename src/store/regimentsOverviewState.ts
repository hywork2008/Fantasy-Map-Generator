import { create } from "zustand";

export interface RegimentsOverviewState {
  sortBy: string;
  sortOrder: "asc" | "desc";
  percentageMode: boolean;
  filterStateId: number;
  addMode: boolean;
  refreshCounter: number;
  toggleSortBy: (sortBy: string) => void;
  togglePercentageMode: () => void;
  setFilterStateId: (id: number) => void;
  setAddMode: (active: boolean) => void;
  refresh: () => void;
}

export const useRegimentsOverviewState = create<RegimentsOverviewState>(set => ({
  sortBy: "total",
  sortOrder: "desc",
  percentageMode: false,
  filterStateId: -1,
  addMode: false,
  refreshCounter: 0,
  toggleSortBy: sortBy =>
    set(state => {
      if (state.sortBy === sortBy) return { sortOrder: state.sortOrder === "asc" ? "desc" : "asc" };
      return { sortBy, sortOrder: "desc" };
    }),
  togglePercentageMode: () => set(state => ({ percentageMode: !state.percentageMode })),
  setFilterStateId: id => set({ filterStateId: id }),
  setAddMode: active => set({ addMode: active }),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
