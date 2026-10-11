import { create } from "zustand";
import type { BurgFeature } from "../utils/burgFeatures";
import { dialogStore } from "./dialogState";

export interface BurgsOverviewState {
  sortBy: string;
  sortOrder: "asc" | "desc";
  searchText: string;
  filterStateId: number;
  filterCultureId: number;
  filterProvinceId: number;
  filterGroup: string;
  filterFeature: BurgFeature | "";
  addMode: boolean;
  refreshCounter: number;
  initialStateId: number | null;
  initialCultureId: number | null;
  toggleSortBy: (field: string) => void;
  setSearchText: (text: string) => void;
  setFilterStateId: (id: number) => void;
  setFilterCultureId: (id: number) => void;
  setFilterProvinceId: (id: number) => void;
  setFilterGroup: (group: string) => void;
  setFilterFeature: (feature: BurgFeature | "") => void;
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
  filterProvinceId: -1,
  filterGroup: "",
  filterFeature: "",
  addMode: false,
  refreshCounter: 0,
  initialStateId: null,
  initialCultureId: null,
  toggleSortBy: field =>
    set(state => {
      if (state.sortBy === field) return { sortOrder: state.sortOrder === "asc" ? "desc" : "asc" };
      return { sortBy: field, sortOrder: "desc" };
    }),
  setSearchText: text => set({ searchText: text }),
  setFilterStateId: id => set({ filterStateId: id }),
  setFilterCultureId: id => set({ filterCultureId: id }),
  setFilterProvinceId: id => set({ filterProvinceId: id }),
  setFilterGroup: group => set({ filterGroup: group }),
  setFilterFeature: feature => set({ filterFeature: feature }),
  setAddMode: active => set({ addMode: active }),
  open: (stateId = null, cultureId = null) =>
    set({
      initialStateId: stateId,
      initialCultureId: cultureId,
      filterStateId: stateId ?? -1,
      filterCultureId: cultureId ?? -1,
      filterProvinceId: -1,
      filterGroup: "",
      filterFeature: "",
      refreshCounter: 0
    }),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));

document.addEventListener("fmg:refresh-editors", () => {
  if (dialogStore.getState().openDialogs.has("burgsOverview")) {
    useBurgsOverviewState.getState().refresh();
  }
});
