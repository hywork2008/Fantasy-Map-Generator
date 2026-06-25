import { create } from "zustand";
import type { Burg, Province, State } from "../types/models";

export interface OptionItem {
  i: number;
  name: string;
}

export interface BurgOptionItem extends OptionItem {
  isCapital: boolean;
  isDisabled?: boolean;
}

export interface EmblemEditorState {
  isOpen: boolean;
  targetId: string;
  targetType: "state" | "province" | "burg";
  targetElement: Burg | Province | State | null;

  armigerName: string;
  shape: string;
  size: number;
  isCustom: boolean;

  states: OptionItem[];
  provinces: OptionItem[];
  burgs: BurgOptionItem[];

  selectedState: number;
  selectedProvince: number;
  selectedBurg: number;

  uploadMode: boolean;
  downloadMode: boolean;
  downloadSize: number;
}

export const useEmblemEditorState = create<EmblemEditorState>(() => ({
  isOpen: false,
  targetId: "",
  targetType: "state",
  targetElement: null,

  armigerName: "",
  shape: "",
  size: 1,
  isCustom: false,

  states: [],
  provinces: [],
  burgs: [],

  selectedState: 0,
  selectedProvince: 0,
  selectedBurg: 0,

  uploadMode: false,
  downloadMode: false,
  downloadSize: 500
}));

export const getEmblemEditorState = useEmblemEditorState.getState;
export const setEmblemEditorState = useEmblemEditorState.setState;
