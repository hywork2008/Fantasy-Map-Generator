import { create } from "zustand";

export type SortOrder = "asc" | "desc";
export type CharactersTab = "overview" | "stats";

interface NobilityUiState {
  selectedCharacterId: number | null;
  sortBy: string;
  sortOrder: SortOrder;
  searchText: string;
  filterStateId: number | null;
  activeTab: CharactersTab;
  setSelectedCharacterId: (id: number | null) => void;
  toggleSortBy: (field: string) => void;
  setSearchText: (text: string) => void;
  setFilterStateId: (id: number | null) => void;
  setActiveTab: (tab: CharactersTab) => void;
}

export const useNobilityUiState = create<NobilityUiState>((set, get) => ({
  selectedCharacterId: null,
  sortBy: "name",
  sortOrder: "asc",
  searchText: "",
  filterStateId: null,
  activeTab: "overview",
  setSelectedCharacterId: id => set({ selectedCharacterId: id }),
  toggleSortBy: field => {
    const { sortBy, sortOrder } = get();
    if (sortBy === field) {
      set({ sortOrder: sortOrder === "asc" ? "desc" : "asc" });
    } else {
      set({ sortBy: field, sortOrder: "asc" });
    }
  },
  setSearchText: text => set({ searchText: text }),
  setFilterStateId: id => set({ filterStateId: id }),
  setActiveTab: tab => set({ activeTab: tab })
}));
