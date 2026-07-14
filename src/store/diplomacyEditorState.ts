import { create } from "zustand";

export type ConflictStatus = "autonomous" | "player" | "suspended" | "none";

export interface DiplomacyRowData {
  i: number;
  name: string;
  fullName: string;
  color: string;
  relation: string;
  conflictStatus: ConflictStatus;
  inText: string;
  totalForces: number;
}

export interface DiplomacyRelationDialogData {
  isOpen: boolean;
  subjectId: number;
  objectId: number;
  currentRelation: string;
}

export interface DiplomacyMatrixData {
  i: number;
  name: string;
  fullName: string | undefined;
  diplomacy: string[];
}

export interface DiplomacyEditorState {
  isOpen: boolean;
  selectedStateId: number;
  states: DiplomacyRowData[];
  matrix: DiplomacyMatrixData[];
  sortBy: string;
  sortDirection: number;
  relationDialog: DiplomacyRelationDialogData;
}

export const useDiplomacyEditorState = create<DiplomacyEditorState>(() => ({
  isOpen: false,
  selectedStateId: 0,
  states: [],
  matrix: [],
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
