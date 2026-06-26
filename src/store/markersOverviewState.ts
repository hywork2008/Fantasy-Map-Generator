import { create } from "zustand";

export interface MarkersOverviewState {
  searchText: string;
  addedMarkerType: string;
  addedMarkerIcon: string;
  typeMenuOpen: boolean;
  refreshCounter: number;
  setSearchText: (text: string) => void;
  setAddedMarkerType: (type: string, icon: string) => void;
  setTypeMenuOpen: (open: boolean) => void;
  refresh: () => void;
}

export const useMarkersOverviewState = create<MarkersOverviewState>(set => ({
  searchText: "",
  addedMarkerType: "empty",
  addedMarkerIcon: "❓",
  typeMenuOpen: false,
  refreshCounter: 0,
  setSearchText: text => set({ searchText: text }),
  setAddedMarkerType: (type, icon) => set({ addedMarkerType: type, addedMarkerIcon: icon, typeMenuOpen: false }),
  setTypeMenuOpen: open => set({ typeMenuOpen: open }),
  refresh: () => set(state => ({ refreshCounter: state.refreshCounter + 1 }))
}));
