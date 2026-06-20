import { create } from "zustand";

export interface StateRowData {
  i: number;
  name: string;
  color: string;
  form: string;
  formName: string;
  capital: number;
  capitalName: string;
  culture: number;
  cultureName: string;
  burgs: number;
  area: number;
  population: number;
  type: string;
  expansionism: number;
  cells: number;
  rural: number;
  urban: number;
  campaigns?: { name: string; start: number; end: number }[];
  isLocked: boolean;
}

export interface StatesEditorState {
  isOpen: boolean;

  // View mode
  isPercentageMode: boolean;
  sortBy: string;
  sortDirection: number;

  // Customization modes
  // 0: default, 1: manual assignment (brush), 2: add state mode, 3: merge state mode
  customizationMode: number;

  // Sub-menus
  isRegenerationMenuOpen: boolean;

  // Settings
  autoChange: boolean;
  adjustLabels: boolean;
  growthRate: number;

  // Manual Assignment
  brushSize: number;
  protectExisting: boolean;

  // Stats
  totalStates: number;
  totalCells: number;
  totalBurgs: number;
  totalArea: number;
  totalPopulation: number;

  // List data
  states: StateRowData[];
}

export const useStatesEditorState = create<StatesEditorState>(() => ({
  isOpen: false,

  isPercentageMode: false,
  sortBy: "area",
  sortDirection: -1,

  customizationMode: 0,

  isRegenerationMenuOpen: false,

  autoChange: false,
  adjustLabels: false,
  growthRate: 1,

  brushSize: 15,
  protectExisting: false,

  totalStates: 0,
  totalCells: 0,
  totalBurgs: 0,
  totalArea: 0,
  totalPopulation: 0,

  states: []
}));

export const getStatesEditorState = useStatesEditorState.getState;

export const setStatesEditorState = (
  state: Partial<StatesEditorState> | ((state: StatesEditorState) => Partial<StatesEditorState>)
) => {
  useStatesEditorState.setState(state);
};
