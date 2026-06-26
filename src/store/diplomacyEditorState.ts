import { create } from "zustand";

export interface DiplomacyRowData {
  i: number;
  name: string;
  fullName: string;
  color: string;
  relation: string;
  inText: string;
}

export interface DiplomacyRelationDialogData {
  isOpen: boolean;
  subjectId: number;
  objectId: number;
  currentRelation: string;
}

export interface DiplomacyEditorState {
  isOpen: boolean;
  selectedStateId: number;
  states: DiplomacyRowData[];
  sortBy: string;
  sortDirection: number;
  relationDialog: DiplomacyRelationDialogData;
}

export const useDiplomacyEditorState = create<DiplomacyEditorState>(() => ({
  isOpen: false,
  selectedStateId: 0,
  states: [],
  sortBy: "name",
  sortDirection: 1,
  relationDialog: {
    isOpen: false,
    subjectId: 0,
    objectId: 0,
    currentRelation: ""
  }
}));

export const getDiplomacyEditorState = useDiplomacyEditorState.getState;
export const setDiplomacyEditorState = useDiplomacyEditorState.setState;
