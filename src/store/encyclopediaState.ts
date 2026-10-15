import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { DEFAULT_ENCYCLOPEDIA_ENTRY_ID } from "../encyclopedia/registry";

type EncyclopediaState = {
  selectedId: string;
  /** Previously viewed entries, most recent last (for the Back button). */
  history: string[];
  query: string;
  /** Navigates to an entry, remembering the current one for Back. Re-selecting the current entry is a no-op. */
  select: (id: string) => void;
  back: () => void;
  setQuery: (query: string) => void;
};

const MAX_HISTORY = 50;

export const encyclopediaStore = createStore<EncyclopediaState>((set, get) => ({
  selectedId: DEFAULT_ENCYCLOPEDIA_ENTRY_ID,
  history: [],
  query: "",
  select: id => {
    const { selectedId, history } = get();
    if (id === selectedId) return;
    set({ selectedId: id, history: [...history, selectedId].slice(-MAX_HISTORY) });
  },
  back: () => {
    const { history } = get();
    if (!history.length) return;
    set({ selectedId: history[history.length - 1], history: history.slice(0, -1) });
  },
  setQuery: query => set({ query })
}));

export const useEncyclopediaState = <T>(selector: (s: EncyclopediaState) => T) => useStore(encyclopediaStore, selector);
