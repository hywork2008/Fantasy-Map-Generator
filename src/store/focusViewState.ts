import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface FocusViewState {
  isActive: boolean;
  kind: "state" | "province" | null;
  id: number;
  label: string;

  // Actions
  setFocus: (kind: "state" | "province", id: number, label: string) => void;
  clearFocus: () => void;
}

export const focusViewStore = createStore<FocusViewState>(set => ({
  isActive: false,
  kind: null,
  id: -1,
  label: "",

  setFocus: (kind, id, label) => set({ isActive: true, kind, id, label }),
  clearFocus: () => set({ isActive: false, kind: null, id: -1, label: "" })
}));

export const getFocusViewState = () => focusViewStore.getState();

export function useFocusViewState(): FocusViewState;
export function useFocusViewState<T>(selector: (state: FocusViewState) => T): T;
export function useFocusViewState<T>(selector?: (state: FocusViewState) => T) {
  return useStore(focusViewStore, selector!);
}
