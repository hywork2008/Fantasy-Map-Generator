import { create } from "zustand";

export type LabelEditorSection = "group" | "text" | "size" | "offset" | "letterSpacing" | null;

export interface LabelsEditorState {
  isOpen: boolean;
  activeSection: LabelEditorSection;

  // Group Section
  group: string;
  groupOptions: string[];
  isBasicGroup: boolean; // true for "states" or "burgLabels"
  isNewGroup: boolean;
  newGroupName: string;

  // Text Section
  text: string;

  // Size Section
  size: number;

  // Offset Section
  startOffset: number;

  // Letter Spacing Section
  letterSpacing: number;
}

export const useLabelsEditorState = create<LabelsEditorState>(() => ({
  isOpen: false,
  activeSection: null,

  group: "",
  groupOptions: [],
  isBasicGroup: false,
  isNewGroup: false,
  newGroupName: "",

  text: "",
  size: 100,
  startOffset: 0,
  letterSpacing: 0
}));

export const getLabelsEditorState = useLabelsEditorState.getState;
export const setLabelsEditorState = useLabelsEditorState.setState;
