import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type BurgsRenamingDialogState = {
  isOpen: boolean;
  onDownload: () => void;
  onUpload: () => void;
  open: (opts: { onDownload: () => void; onUpload: () => void }) => void;
  close: () => void;
};

export const burgsRenamingDialogStore = createStore<BurgsRenamingDialogState>(set => ({
  isOpen: false,
  onDownload: () => {},
  onUpload: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useBurgsRenamingDialogState = <T>(selector: (s: BurgsRenamingDialogState) => T) =>
  useStore(burgsRenamingDialogStore, selector);
