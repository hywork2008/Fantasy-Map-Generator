import { create } from "zustand";

export interface NameBaseOption {
  i: number;
  name: string;
}

export interface CultureRowData {
  i: number;
  name: string;
  color: string;
  type: string;
  /** pack.races id for this culture's dominant folk. */
  race: number;
  base: number;
  cells: number;
  expansionism: number;
  area: number;
  population: number;
  rural: number;
  urban: number;
  shield: string;
  lock?: boolean;
}

export interface RaceOption {
  i: number;
  name: string;
}

interface CulturesEditorState {
  isOpen: boolean;
  sortBy: string;
  sortDirection: number; // 1 asc, -1 desc
  isPercentageMode: boolean;
  customization: number; // 0=normal, 4=manual brush, 9=add
  brushSize: number;
  autoChange: boolean;
  selectShape: boolean;
  selectedCultureId: number; // active selection in brush mode

  cultures: CultureRowData[];
  nameBases: NameBaseOption[];
  races: RaceOption[];

  totalCells: number;
  totalArea: number;
  totalPopulation: number;
}

export const useCulturesEditorState = create<CulturesEditorState>(() => ({
  isOpen: false,
  sortBy: "name",
  sortDirection: 1,
  isPercentageMode: false,
  customization: 0,
  brushSize: 15,
  autoChange: false,
  selectShape: false,

  selectedCultureId: 0,

  cultures: [],
  nameBases: [],
  races: [],

  totalCells: 0,
  totalArea: 0,
  totalPopulation: 0
}));

export const getCulturesEditorState = useCulturesEditorState.getState;
export const setCulturesEditorState = useCulturesEditorState.setState;
