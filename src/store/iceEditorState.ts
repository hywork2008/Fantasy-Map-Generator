import { create } from "zustand";

export interface IceEditorState {
  isOpen: boolean;
  type: "Glacier" | "Iceberg";
  selectedId: number | null;
  size: number;
  isAdding: boolean;
}

export const useIceEditorState = create<IceEditorState>(() => ({
  isOpen: false,
  type: "Glacier",
  selectedId: null,
  size: 1,
  isAdding: false
}));

export const getIceEditorState = useIceEditorState.getState;
export const setIceEditorState = useIceEditorState.setState;
