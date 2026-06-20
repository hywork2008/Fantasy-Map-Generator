import { create } from "zustand";

export type RulerMode = "none" | "opisometer" | "routeOpisometer" | "planimeter";

export interface UnitsEditorState {
  isOpen: boolean;
  rulerMode: RulerMode;
}

export const useUnitsEditorState = create<UnitsEditorState>(() => ({
  isOpen: false,
  rulerMode: "none"
}));

export const getUnitsEditorState = useUnitsEditorState.getState;
export const setUnitsEditorState = useUnitsEditorState.setState;
