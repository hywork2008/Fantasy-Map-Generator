import { create } from "zustand";

export interface HoverNotesState {
  isVisible: boolean;
  name: string;
  legend: string;
}

export const useHoverNotesState = create<HoverNotesState>(() => ({
  isVisible: false,
  name: "",
  legend: ""
}));

export const getHoverNotesState = useHoverNotesState.getState;
export const setHoverNotesState = useHoverNotesState.setState;
