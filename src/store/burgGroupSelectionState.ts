import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { SelectionItem } from "../ui/dialogs/SelectionDialog";

export type BurgGroupSelectionDialog =
  | {
      kind: "items";
      title: string;
      byLabel: string;
      items: SelectionItem[];
      initial: number[] | undefined;
      onApply: (selected: number[] | undefined) => void;
    }
  | {
      kind: "features";
      initial: Record<string, boolean>;
      onApply: (values: Record<string, boolean>) => void;
    }
  | null;

interface BurgGroupSelectionState {
  dialog: BurgGroupSelectionDialog;
  open: (d: Exclude<BurgGroupSelectionDialog, null>) => void;
  close: () => void;
}

export const burgGroupSelectionStore = createStore<BurgGroupSelectionState>(set => ({
  dialog: null,
  open: d => set({ dialog: d }),
  close: () => set({ dialog: null })
}));

export const useBurgGroupSelectionState = <T>(selector: (s: BurgGroupSelectionState) => T) =>
  useStore(burgGroupSelectionStore, selector);
