import { create } from "zustand";

export interface BurgsOverviewState {
  sortBy: string;
  sortOrder: "asc" | "desc";
  searchText: string;
  filterStateId: number;
  filterCultureId: number;
  addMode: boolean;
  refreshCounter: number;
  initialStateId: number | null;
  initialCultureId: number | null;
  toggleSortBy: (field: string) => void;
  setSearchText: (text: string) => void;
  setFilterStateId: (id: number) => void;
  setFilterCultureId: (id: number) => void;
  setAddMode: (active: boolean) => void;
  open: (stateId?: number | null, cultureId?: number | null) => void;
  refresh: () => void;
}

export const useBurgsOverviewState = create<BurgsOverviewState>(set => ({
  sortBy: "name",
  sortOrder: "asc",
  searchText: "",
  filterStateId: -1,
  filterCultureId: -1,
  addMode: false,
  refreshCounter: 0,
  initialStateId: null,
  initialCultureId: null,
  toggleSortBy: field =>
    set(state => {
      if (state.sortBy === field) return { sortOrder: state.sortOrder === "asc" ? "desc" : "asc" };
      return { sortBy: field, sortOrder: "asc" };
    }),
  setSearchText: text => set({ searchText: text }),
  setFilterStateId: id => set({ filterStateId: id }),
  setFilterCultureId: id => set({ filterCultureId: id }),
  setAddMode: active => set({ addMode: active }),
  open: (stateId = null, cultureId = null) =>
    set({
      initialStateId: stateId,
      initialCultureId: cultureId,
      filterStateId: stateId ?? -1,
      filterCultureId: cultureId ?? -1,
      refreshCounter: 0
    }),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
