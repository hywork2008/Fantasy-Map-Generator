import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type RegenerateFeatureDialogState = {
  isOpen: boolean;
  featureName: string;
  onConfirm: () => void;
  open: (opts: { featureName: string; onConfirm: () => void }) => void;
  close: () => void;
};

export const regenerateFeatureDialogStore = createStore<RegenerateFeatureDialogState>(set => ({
  isOpen: false,
  featureName: "",
  onConfirm: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useRegenerateFeatureDialogState = <T>(selector: (s: RegenerateFeatureDialogState) => T) =>
  useStore(regenerateFeatureDialogStore, selector);
