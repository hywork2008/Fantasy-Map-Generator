import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type DiplomacyHistoryDialogState = {
  isOpen: boolean;
  chronicle: string[][];
  onSave: (data: string) => void;
  onClear: () => void;
  onChange: (groupIdx: number, entryIdx: number, value: string) => void;
  open: (opts: {
    chronicle: string[][];
    onSave: (data: string) => void;
    onClear: () => void;
    onChange: (groupIdx: number, entryIdx: number, value: string) => void;
  }) => void;
  close: () => void;
};

export const diplomacyHistoryDialogStore = createStore<DiplomacyHistoryDialogState>(set => ({
  isOpen: false,
  chronicle: [],
  onSave: () => {},
  onClear: () => {},
  onChange: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useDiplomacyHistoryDialogState = <T>(selector: (s: DiplomacyHistoryDialogState) => T) =>
  useStore(diplomacyHistoryDialogStore, selector);
