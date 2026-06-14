import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type DialogType = "alert" | "confirm" | "rich";

export type DialogConfig = {
  id: string;
  type?: DialogType;
  message?: string;
  content?: string;
  title?: string;
  confirm?: string;
  cancel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  buttons?: Array<{ label: string; onClick: () => void; keepOpen?: boolean }> | Record<string, () => void>;
  onOpen?: (container: HTMLElement) => void;
  onClose?: () => void;
  [key: string]: unknown;
};

export type PromptConfig = {
  message: string;
  default?: string | number;
  step?: number;
  min?: number;
  max?: number;
  onConfirm: (value: string | number) => void;
  onCancel?: () => void;
};

export interface DialogState {
  openDialogs: Set<string>;
  alertConfig: DialogConfig | null;
  promptConfig: PromptConfig | null;
  openDialog: (id: string, config?: unknown) => void;
  closeDialog: (id: string) => void;
  closeAllDialogs: (except?: string) => void;
  setAlertConfig: (config: DialogConfig | null) => void;
  setPromptConfig: (config: PromptConfig | null) => void;
}

export const dialogStore = createStore<DialogState>(set => ({
  openDialogs: new Set(),
  alertConfig: null,
  promptConfig: null,
  openDialog: id =>
    set(state => {
      const newSet = new Set(state.openDialogs);
      newSet.add(id);
      return { openDialogs: newSet };
    }),
  closeDialog: id =>
    set(state => {
      const newSet = new Set(state.openDialogs);
      newSet.delete(id);
      return { openDialogs: newSet };
    }),
  closeAllDialogs: except =>
    set(state => {
      const newSet = new Set<string>();
      if (except && state.openDialogs.has(except)) newSet.add(except);
      return { openDialogs: newSet };
    }),
  setAlertConfig: config => set({ alertConfig: config }),
  setPromptConfig: config => set({ promptConfig: config })
}));

export const useDialogState = <T>(selector: (state: DialogState) => T) => useStore(dialogStore, selector);
