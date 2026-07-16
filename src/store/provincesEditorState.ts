import { create } from "zustand";

export interface MergeProvinceData {
  i: number;
  name: string;
  fullName: string;
  color: string;
}

export interface ProvinceNameEditorData {
  provinceId: number;
  shortName: string;
  formName: string;
  fullName: string;
  isCustomFormMode: boolean;
  customFormInput: string;
  cultureName: string;
  regenTick: number;
}

export interface ProvinceRowData {
  i: number;
  name: string;
  formName: string;
  fullName: string;
  color: string;
  capitalId: number;
  capitalName: string;
  stateId: number;
  stateName: string;
  area: number;
  population: number;
  rural: number;
  urban: number;
  burgs: number[];
  burgsData: { id: number; name: string }[];
  burgCount: number;
  isSeparable: boolean;
  isFocused: boolean;
  isLocked: boolean;
}

export interface StateOption {
  i: number;
  name: string;
}

export interface ProvincesEditorState {
  isOpen: boolean;
  filterState: number; // -1 for all
  isPercentageMode: boolean;
  sortBy: string;
  sortDirection: number; // 1 or -1
  customization: number; // 0 normal, 11 manually assign, 12 add
  brushSize: number;

  provinces: ProvinceRowData[];
  stateOptions: StateOption[];

  totalProvinces: number;
  totalBurgs: number;
  totalArea: number;
  totalPopulation: number;

  mergeDialog: MergeProvinceData[] | null;
  nameEditor: ProvinceNameEditorData | null;
}

export const useProvincesEditorState = create<ProvincesEditorState>(() => ({
  isOpen: false,
  filterState: -1,
  isPercentageMode: false,
  sortBy: "name",
  sortDirection: 1,
  customization: 0,
  brushSize: 8,

  provinces: [],
  stateOptions: [],

  totalProvinces: 0,
  totalBurgs: 0,
  totalArea: 0,
  totalPopulation: 0,

  mergeDialog: null,
  nameEditor: null
}));

export const getProvincesEditorState = useProvincesEditorState.getState;
export const setProvincesEditorState = useProvincesEditorState.setState;
