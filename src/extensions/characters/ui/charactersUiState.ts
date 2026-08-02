import { create } from "zustand";

export type SortOrder = "asc" | "desc";
export type CharactersTab = "overview" | "stats";

interface CharactersUiState {
  selectedCharacterId: number | null;
  /**
   * Character Details browsing history (character ids).
   * Cleared when the details dialog closes.
   */
  detailsHistory: number[];
  /** Index into `detailsHistory` for the currently shown character. */
  detailsHistoryIndex: number;
  sortBy: string;
  sortOrder: SortOrder;
  searchText: string;
  filterStateId: number | null;
  activeTab: CharactersTab;
  /** Bumped whenever character data mutates in place (e.g. Advance Time aging). */
  refreshToken: number;
  setSelectedCharacterId: (id: number | null) => void;
  /** Open details on `id`, replacing history with a single entry (list / external open). */
  openCharacterDetails: (id: number) => void;
  /** Navigate within an open details session (e.g. solidarity name click). */
  pushCharacterDetails: (id: number) => void;
  goBackCharacterDetails: () => void;
  goForwardCharacterDetails: () => void;
  clearCharacterDetailsHistory: () => void;
  toggleSortBy: (field: string) => void;
  setSearchText: (text: string) => void;
  setFilterStateId: (id: number | null) => void;
  setActiveTab: (tab: CharactersTab) => void;
  bumpRefreshToken: () => void;
}

export const useCharactersUiState = create<CharactersUiState>((set, get) => ({
  selectedCharacterId: null,
  detailsHistory: [],
  detailsHistoryIndex: -1,
  sortBy: "name",
  sortOrder: "asc",
  searchText: "",
  filterStateId: null,
  activeTab: "overview",
  refreshToken: 0,
  setSelectedCharacterId: id => set({ selectedCharacterId: id }),
  openCharacterDetails: id =>
    set({
      selectedCharacterId: id,
      detailsHistory: [id],
      detailsHistoryIndex: 0
    }),
  pushCharacterDetails: id => {
    const { detailsHistory, detailsHistoryIndex, selectedCharacterId } = get();
    if (id === selectedCharacterId) return;
    const base = detailsHistoryIndex >= 0 ? detailsHistory.slice(0, detailsHistoryIndex + 1) : detailsHistory.slice();
    // Avoid consecutive duplicates
    if (base[base.length - 1] === id) {
      set({ selectedCharacterId: id, detailsHistory: base, detailsHistoryIndex: base.length - 1 });
      return;
    }
    base.push(id);
    set({
      selectedCharacterId: id,
      detailsHistory: base,
      detailsHistoryIndex: base.length - 1
    });
  },
  goBackCharacterDetails: () => {
    const { detailsHistory, detailsHistoryIndex } = get();
    if (detailsHistoryIndex <= 0) return;
    const nextIndex = detailsHistoryIndex - 1;
    set({
      detailsHistoryIndex: nextIndex,
      selectedCharacterId: detailsHistory[nextIndex] ?? null
    });
  },
  goForwardCharacterDetails: () => {
    const { detailsHistory, detailsHistoryIndex } = get();
    if (detailsHistoryIndex < 0 || detailsHistoryIndex >= detailsHistory.length - 1) return;
    const nextIndex = detailsHistoryIndex + 1;
    set({
      detailsHistoryIndex: nextIndex,
      selectedCharacterId: detailsHistory[nextIndex] ?? null
    });
  },
  clearCharacterDetailsHistory: () =>
    set({
      detailsHistory: [],
      detailsHistoryIndex: -1,
      selectedCharacterId: null
    }),
  toggleSortBy: field => {
    const { sortBy, sortOrder } = get();
    if (sortBy === field) {
      set({ sortOrder: sortOrder === "asc" ? "desc" : "asc" });
    } else {
      set({ sortBy: field, sortOrder: "desc" });
    }
  },
  setSearchText: text => set({ searchText: text }),
  setFilterStateId: id => set({ filterStateId: id }),
  setActiveTab: tab => set({ activeTab: tab }),
  bumpRefreshToken: () => set(state => ({ refreshToken: state.refreshToken + 1 }))
}));
