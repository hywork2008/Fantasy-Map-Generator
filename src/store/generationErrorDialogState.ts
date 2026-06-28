import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type GenerationErrorDialogState = {
  isOpen: boolean;
  errorText: string;
  onCleanup: () => void;
  onRegenerate: () => void;
  open: (opts: { errorText: string; onCleanup: () => void; onRegenerate: () => void }) => void;
  close: () => void;
};

export const generationErrorDialogStore = createStore<GenerationErrorDialogState>(set => ({
  isOpen: false,
  errorText: "",
  onCleanup: () => {},
  onRegenerate: () => {},
  open: opts => set({ isOpen: true, ...opts }),
  close: () => set({ isOpen: false })
}));

export const useGenerationErrorDialogState = <T>(selector: (s: GenerationErrorDialogState) => T) =>
  useStore(generationErrorDialogStore, selector);
