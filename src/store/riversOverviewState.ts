import { create } from "zustand";

export interface RiversOverviewState {
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  refreshCounter: number;
  setSearch: (search: string) => void;
  setSortBy: (sortBy: string) => void;
  toggleSortBy: (sortBy: string) => void;
  refresh: () => void;
}

export const useRiversOverviewState = create<RiversOverviewState>(set => ({
  search: "",
  sortBy: "discharge",
  sortOrder: "desc",
  refreshCounter: 0,
  setSearch: search => set({ search }),
  setSortBy: sortBy => set({ sortBy }),
  toggleSortBy: sortBy =>
    set(state => {
      if (state.sortBy === sortBy) {
        return { sortOrder: state.sortOrder === "asc" ? "desc" : "asc" };
      }
      return { sortBy, sortOrder: "desc" };
    }),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
