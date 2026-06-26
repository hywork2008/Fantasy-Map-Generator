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

export type BaseDialogConfig = {
  close?: () => void;
  onClose?: () => void;
  [key: string]: unknown;
};

export interface DialogState {
  openDialogs: Set<string>;
  dialogConfigs: Record<string, BaseDialogConfig>;
  alertConfig: DialogConfig | null;
  promptConfig: PromptConfig | null;
  openDialog: (id: string, config?: BaseDialogConfig) => void;
  closeDialog: (id: string) => void;
  closeAllDialogs: (except?: string) => void;
  setAlertConfig: (config: DialogConfig | null) => void;
  setPromptConfig: (config: PromptConfig | null) => void;
}

export const dialogStore = createStore<DialogState>(set => ({
  openDialogs: new Set(),
  dialogConfigs: {},
  alertConfig: null,
  promptConfig: null,
  openDialog: (id, config) =>
    set(state => {
      const newSet = new Set(state.openDialogs);
      newSet.add(id);
      const newConfigs = { ...state.dialogConfigs };
      if (config) newConfigs[id] = config;
      return {
        openDialogs: newSet,
        dialogConfigs: newConfigs
      };
    }),
  closeDialog: id => {
    let callback: (() => void) | undefined;
    set(state => {
      const newSet = new Set(state.openDialogs);
      if (newSet.has(id)) {
        newSet.delete(id);
        const config = state.dialogConfigs[id];
        if (config) {
          if (typeof config.onClose === "function") callback = config.onClose;
          else if (typeof config.close === "function") callback = config.close;
        }
      }
      const newConfigs = { ...state.dialogConfigs };
      delete newConfigs[id];
      return { openDialogs: newSet, dialogConfigs: newConfigs };
    });
    callback?.();
  },
  closeAllDialogs: except => {
    const callbacks: Array<() => void> = [];
    set(state => {
      const newSet = new Set<string>();
      const newConfigs = { ...state.dialogConfigs };

      for (const id of state.openDialogs) {
        if (id === except) {
          newSet.add(id);
        } else {
          const config = state.dialogConfigs[id];
          if (config) {
            if (typeof config.onClose === "function") callbacks.push(config.onClose);
            else if (typeof config.close === "function") callbacks.push(config.close);
          }
          delete newConfigs[id];
        }
      }
      return { openDialogs: newSet, dialogConfigs: newConfigs };
    });
    for (const cb of callbacks) cb();
  },
  setAlertConfig: config => set({ alertConfig: config }),
  setPromptConfig: config => set({ promptConfig: config })
}));

export const useDialogState = <T>(selector: (state: DialogState) => T) => useStore(dialogStore, selector);
