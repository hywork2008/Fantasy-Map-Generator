import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type LoadMapUrlDialogState = {
  isOpen: boolean;
  onLoad: (url: string) => void;
  open: (opts: { onLoad: (url: string) => void }) => void;
  close: () => void;
};

export const loadMapUrlDialogStore = createStore<LoadMapUrlDialogState>(set => ({
  isOpen: false,
  onLoad: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useLoadMapUrlDialogState = <T>(selector: (s: LoadMapUrlDialogState) => T) =>
  useStore(loadMapUrlDialogStore, selector);
