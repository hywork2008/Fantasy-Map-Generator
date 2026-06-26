import { create } from "zustand";

export interface ZoneRowData {
  i: number;
  name: string;
  type: string;
  cells: number;
  area: number;
  population: number;
  rural: number;
  urban: number;
  color: string;
  hidden: boolean;
  focused: boolean;
}

export interface ZonesEditorState {
  isOpen: boolean;
  customizationMode: number;
  zones: ZoneRowData[];
  totalZones: number;
  totalCells: number;
  totalArea: number;
  totalPopulation: number;
  isPercentageMode: boolean;
  filterBy: string;
  brushSize: number;
  landOnlyBrush: boolean;
  types: string[];
}

export const useZonesEditorState = create<ZonesEditorState>(() => ({
  isOpen: false,
  customizationMode: 0,
  zones: [],
  totalZones: 0,
  totalCells: 0,
  totalArea: 0,
  totalPopulation: 0,
  isPercentageMode: false,
  filterBy: "all",
  brushSize: 15,
  landOnlyBrush: false,
  types: []
}));

export const getZonesEditorState = useZonesEditorState.getState;
export const setZonesEditorState = useZonesEditorState.setState;
