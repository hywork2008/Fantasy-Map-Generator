import { create } from "zustand";
import type { CharacterOverviewRoleFilter } from "../utils/characterLabels";

export type SortOrder = "asc" | "desc";
export type CharactersTab = "overview" | "stats";
/** Requested tab inside Character Details (consumed once when the dialog opens). */
export type CharacterDetailsTabRequest =
  | "skills"
  | "craftSkills"
  | "personality"
  | "loadout"
  | "inventory"
  | "backstory"
  | "relationships";

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
  /**
   * Semantic title/role class filter (King/Emperor/Khan all share `"ruler"`).
   * `null` means all classes.
   */
  filterRoleClass: CharacterOverviewRoleFilter | null;
  activeTab: CharactersTab;
  /**
   * One-shot request to open Character Details on a specific inner tab (e.g. loadout from PC Prepare).
   * Consumed by CharacterDetailsDialog; null when none pending.
   */
  pendingDetailsTab: CharacterDetailsTabRequest | null;
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
  setFilterRoleClass: (roleClass: CharacterOverviewRoleFilter | null) => void;
  setActiveTab: (tab: CharactersTab) => void;
  requestDetailsTab: (tab: CharacterDetailsTabRequest | null) => void;
  consumePendingDetailsTab: () => CharacterDetailsTabRequest | null;
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
  filterRoleClass: null,
  activeTab: "overview",
  pendingDetailsTab: null,
  refreshToken: 0,
  setSelectedCharacterId: id => set({ selectedCharacterId: id }),
  openCharacterDetails: id =>
    set({
      selectedCharacterId: id,
      detailsHistory: [id],
      detailsHistoryIndex: 0
    }),
  requestDetailsTab: tab => set({ pendingDetailsTab: tab }),
  consumePendingDetailsTab: () => {
    const tab = get().pendingDetailsTab;
    if (tab) set({ pendingDetailsTab: null });
    return tab;
  },
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
  setFilterRoleClass: roleClass => set({ filterRoleClass: roleClass }),
  setActiveTab: tab => set({ activeTab: tab }),
  bumpRefreshToken: () => set(state => ({ refreshToken: state.refreshToken + 1 }))
}));
