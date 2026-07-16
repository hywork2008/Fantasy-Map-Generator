import { create } from "zustand";

export type SortOrder = "asc" | "desc";
export type CharactersTab = "overview" | "stats";

interface CharactersUiState {
  selectedCharacterId: number | null;
  sortBy: string;
  sortOrder: SortOrder;
  searchText: string;
  filterStateId: number | null;
  activeTab: CharactersTab;
  /** Bumped whenever character data mutates in place (e.g. Advance Time aging) so
   * components reading worldContext.pack.characters directly know to re-render. */
  refreshToken: number;
  setSelectedCharacterId: (id: number | null) => void;
  toggleSortBy: (field: string) => void;
  setSearchText: (text: string) => void;
  setFilterStateId: (id: number | null) => void;
  setActiveTab: (tab: CharactersTab) => void;
  bumpRefreshToken: () => void;
}

export const useCharactersUiState = create<CharactersUiState>((set, get) => ({
  selectedCharacterId: null,
  sortBy: "name",
  sortOrder: "asc",
  searchText: "",
  filterStateId: null,
  activeTab: "overview",
  refreshToken: 0,
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
  setActiveTab: tab => set({ activeTab: tab }),
  bumpRefreshToken: () => set(state => ({ refreshToken: state.refreshToken + 1 }))
}));
