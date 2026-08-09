import { create } from "zustand";

export interface ParentRiverOption {
  value: string;
  label: string;
}

export interface RiverEditorState {
  // River properties for the UI
  name: string;
  type: string;
  parent: string;
  parentOptions: ParentRiverOption[];
  basin: string;
  discharge: string;
  lengthUI: string;
  widthUI: string;
  sourceWidth: number;
  widthFactor: number;
  sourceElevation: number;
  sourceWaterTemperature: number;

  // Actions to update the store
  setRiverData: (data: Partial<Omit<RiverEditorState, "setRiverData">>) => void;
}

export const useRiverEditorState = create<RiverEditorState>(set => ({
  name: "",
  type: "",
  parent: "",
  parentOptions: [],
  basin: "",
  discharge: "",
  lengthUI: "",
  widthUI: "",
  sourceWidth: 0,
  widthFactor: 1,
  sourceElevation: 0,
  sourceWaterTemperature: 0,

  setRiverData: data => set(state => ({ ...state, ...data }))
}));

export const getRiverEditorState = () => useRiverEditorState.getState();
