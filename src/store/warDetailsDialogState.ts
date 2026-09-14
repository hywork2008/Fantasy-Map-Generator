import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { WarDetails } from "../types/models";

type WarDetailsDialogState = {
  isOpen: boolean;
  warDetails: WarDetails | null;
  open: (warDetails: WarDetails) => void;
  close: () => void;
};

export const warDetailsDialogStore = createStore<WarDetailsDialogState>(set => ({
  isOpen: false,
  warDetails: null,
  open: warDetails => set({ isOpen: true, warDetails }),
  close: () => set({ isOpen: false, warDetails: null })
}));

export const useWarDetailsDialogState = <T>(selector: (s: WarDetailsDialogState) => T) =>
  useStore(warDetailsDialogStore, selector);
