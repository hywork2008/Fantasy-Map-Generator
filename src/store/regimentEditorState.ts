import { create } from "zustand";

export type RegimentMode = "normal" | "adding" | "attacking" | "attaching";

export interface UnitCount {
  name: string;
  type: string;
  count: number;
}

export interface RegimentEditorState {
  isOpen: boolean;
  mode: RegimentMode;
  regimentId: number | null;
  stateId: number | null;
  name: string;
  isNaval: boolean;
  icon: string;
  units: UnitCount[];
}

export const useRegimentEditorState = create<RegimentEditorState>(() => ({
  isOpen: false,
  mode: "normal",
  regimentId: null,
  stateId: null,
  name: "",
  isNaval: false,
  icon: "",
  units: []
}));

export const getRegimentEditorState = useRegimentEditorState.getState;
export const setRegimentEditorState = useRegimentEditorState.setState;
