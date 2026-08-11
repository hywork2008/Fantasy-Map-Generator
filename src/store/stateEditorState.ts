import { create } from "zustand";

export type StateEditorTab = "overview" | "provinces" | "burgs" | string;

export interface StateEditorState {
  stateId: number;
  activeTab: StateEditorTab;
}

export const useStateEditorState = create<StateEditorState>(() => ({
  stateId: -1,
  activeTab: "overview"
}));

export const getStateEditorState = useStateEditorState.getState;
export const setStateEditorState = useStateEditorState.setState;
