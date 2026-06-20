import { create } from "zustand";

export type ReliefEditorMode = "individual" | "bulkAdd" | "bulkRemove";
export type ReliefIconSet = "simple" | "colored" | "gray";

export interface ReliefEditorState {
  isOpen: boolean;
  mode: ReliefEditorMode;
  iconSet: ReliefIconSet;
  size: number;
  radius: number;
  spacing: number;
  selectedIconType: string | null; // null = "any" (only valid in bulkRemove mode)
}

export const useReliefEditorState = create<ReliefEditorState>(() => ({
  isOpen: false,
  mode: "individual",
  iconSet: "simple",
  size: 5,
  radius: 15,
  spacing: 5,
  selectedIconType: null
}));

export const getReliefEditorState = useReliefEditorState.getState;
export const setReliefEditorState = useReliefEditorState.setState;
