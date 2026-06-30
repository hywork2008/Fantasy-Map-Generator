import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type LoadErrorDialogState = {
  isOpen: boolean;
  errorText: string;
  mapVersion: string;
  onClearCache: () => void;
  onSelectFile: () => void;
  onNewMap: () => void;
  open: (opts: {
    errorText: string;
    mapVersion: string;
    onClearCache: () => void;
    onSelectFile: () => void;
    onNewMap: () => void;
  }) => void;
  close: () => void;
};

export const loadErrorDialogStore = createStore<LoadErrorDialogState>(set => ({
  isOpen: false,
  errorText: "",
  mapVersion: "",
  onClearCache: () => {},
  onSelectFile: () => {},
  onNewMap: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useLoadErrorDialogState = <T>(selector: (s: LoadErrorDialogState) => T) =>
  useStore(loadErrorDialogStore, selector);
