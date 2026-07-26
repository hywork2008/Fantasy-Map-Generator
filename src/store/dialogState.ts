import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type DialogType = "alert" | "confirm" | "rich";

export type DialogBeforeOpenHandler = () => void;

const beforeOpenHandlers = new Map<string, Set<DialogBeforeOpenHandler>>();

/**
 * Register synchronous work that must finish before a hidden dialog is made visible.
 *
 * Dialog content commonly derives rows from mutable world data, so calling its store's
 * `refresh()` after opening can briefly render stale values. Handlers run only for a
 * hidden-to-visible transition; reconfiguring an already open dialog does not refresh it.
 */
export function registerDialogBeforeOpen(id: string, handler: DialogBeforeOpenHandler): () => void {
  const handlers = beforeOpenHandlers.get(id) ?? new Set<DialogBeforeOpenHandler>();
  handlers.add(handler);
  beforeOpenHandlers.set(id, handlers);

  return () => {
    handlers.delete(handler);
    if (!handlers.size) beforeOpenHandlers.delete(id);
  };
}

function runDialogBeforeOpenHandlers(id: string): void {
  for (const handler of beforeOpenHandlers.get(id) ?? []) handler();
}

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
  /** Runs after the dialog's primary close callback, even if that callback is replaced later. */
  onAfterClose?: () => void;
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

export const dialogStore = createStore<DialogState>((set, get) => ({
  openDialogs: new Set(),
  dialogConfigs: {},
  alertConfig: null,
  promptConfig: null,
  openDialog: (id, config) => {
    if (!get().openDialogs.has(id)) runDialogBeforeOpenHandlers(id);

    set(state => {
      const newSet = new Set(state.openDialogs);
      newSet.add(id);
      const newConfigs = { ...state.dialogConfigs };
      if (config) {
        // Dialog content can update its own onClose callback after an opener has supplied
        // a lifecycle hook. Preserve that hook while letting the latest primary callback win.
        newConfigs[id] = {
          ...config,
          onAfterClose: config.onAfterClose ?? state.dialogConfigs[id]?.onAfterClose
        };
      }
      return {
        openDialogs: newSet,
        dialogConfigs: newConfigs
      };
    });
  },
  closeDialog: id => {
    let callback: (() => void) | undefined;
    let afterClose: (() => void) | undefined;
    set(state => {
      const newSet = new Set(state.openDialogs);
      if (newSet.has(id)) {
        newSet.delete(id);
        const config = state.dialogConfigs[id];
        if (config) {
          if (typeof config.onClose === "function") callback = config.onClose;
          else if (typeof config.close === "function") callback = config.close;
          if (typeof config.onAfterClose === "function") afterClose = config.onAfterClose;
        }
      }
      const newConfigs = { ...state.dialogConfigs };
      delete newConfigs[id];
      return { openDialogs: newSet, dialogConfigs: newConfigs };
    });
    callback?.();
    afterClose?.();
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
            if (typeof config.onAfterClose === "function") callbacks.push(config.onAfterClose);
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
