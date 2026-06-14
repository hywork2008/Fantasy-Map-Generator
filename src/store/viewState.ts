import { createStore } from "zustand/vanilla";

// The UI View State
export interface ViewState {
  // Add UI view states here as they are migrated from global/DOM states
  isMenuOpen: boolean;
  setMenuOpen: (isOpen: boolean) => void;

  activeMenu: string;
  setActiveMenu: (menuId: string | null) => void;

  // Track if a specific tool or customization mode is active
  activeTool: string | null;
  setActiveTool: (toolId: string | null) => void;

  // Track heightmap customization mode
  isCustomizationMode: boolean;
  setCustomizationMode: (mode: boolean) => void;

  // Example for modal/dialog visibility
  openDialogs: string[];
  openDialog: (dialogId: string) => void;
  closeDialog: (dialogId: string) => void;
}

export const viewStateStore = createStore<ViewState>(set => ({
  isMenuOpen: false,
  setMenuOpen: isOpen => set({ isMenuOpen: isOpen }),

  activeMenu: "layersTab",
  setActiveMenu: menuId => set({ activeMenu: menuId || "layersTab" }),

  activeTool: null,
  setActiveTool: toolId => set({ activeTool: toolId }),

  isCustomizationMode: false,
  setCustomizationMode: mode => set({ isCustomizationMode: mode }),

  openDialogs: [],
  openDialog: dialogId =>
    set(state => ({
      openDialogs: state.openDialogs.includes(dialogId) ? state.openDialogs : [...state.openDialogs, dialogId]
    })),
  closeDialog: dialogId =>
    set(state => ({
      openDialogs: state.openDialogs.filter(id => id !== dialogId)
    }))
}));

// Utility to get the current state directly
export const getViewState = () => viewStateStore.getState();

// React hook to use the store in components
import { useStore } from "zustand";

export function useViewState(): ViewState;
export function useViewState<T>(selector: (state: ViewState) => T): T;
export function useViewState<T>(selector?: (state: ViewState) => T) {
  return useStore(viewStateStore, selector!);
}
