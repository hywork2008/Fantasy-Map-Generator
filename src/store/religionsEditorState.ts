import { create } from "zustand";

export interface ReligionRowData {
  i: number;
  name: string;
  color: string;
  area: number;
  population: number;
  type: string;
  form: string;
  deity: string;
  expansion: string;
  expansionism: number;
  cells: number;
  rural: number;
  urban: number;
  lock?: boolean;
  isExtinct: boolean;
}

interface ReligionsEditorState {
  isOpen: boolean;
  sortBy: string;
  sortDirection: number; // 1 for asc, -1 for desc
  isPercentageMode: boolean;
  extinctVisible: boolean;
  customization: number;
  brushSize: number;
  protectExisting: boolean;
  autoChange: boolean;
  religions: ReligionRowData[];

  // totals
  totalOrganized: number;
  totalHeresies: number;
  totalCults: number;
  totalFolk: number;
  totalArea: number;
  totalPopulation: number;
}

export const useReligionsEditorState = create<ReligionsEditorState>(() => ({
  isOpen: false,
  sortBy: "name",
  sortDirection: 1,
  isPercentageMode: false,
  extinctVisible: false,
  customization: 0,
  brushSize: 15,
  protectExisting: false,
  autoChange: false,
  religions: [],

  totalOrganized: 0,
  totalHeresies: 0,
  totalCults: 0,
  totalFolk: 0,
  totalArea: 0,
  totalPopulation: 0
}));

export const getReligionsEditorState = useReligionsEditorState.getState;
export const setReligionsEditorState = useReligionsEditorState.setState;
