import { create } from "zustand";

export interface MarkersEditorState {
  isOpen: boolean;
  selectedId: number | null;

  type: string;
  icon: string;
  iconSize: number;
  iconShiftX: number;
  iconShiftY: number;
  size: number;
  pin: string;
  fill: string;
  stroke: string;
  isLocked: boolean;
  isAdding: boolean;
}

export const useMarkersEditorState = create<MarkersEditorState>(() => ({
  isOpen: false,
  selectedId: null,

  type: "",
  icon: "👑",
  iconSize: 12,
  iconShiftX: 50,
  iconShiftY: 50,
  size: 30,
  pin: "bubble",
  fill: "#ffffff",
  stroke: "#000000",
  isLocked: false,
  isAdding: false
}));

export const getMarkersEditorState = useMarkersEditorState.getState;
export const setMarkersEditorState = useMarkersEditorState.setState;
