import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface BurgCulture {
  id: number;
  name: string;
}

export interface BurgData {
  id: number;
  emblemId: string;
  provinceAndState: string;
  name: string;
  group: string;
  type: string;
  culture: number;
  population: number; // calculated display population
  children: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
  temperature: string;
  temperatureLikeIn: string;
  elevation: string;
  previewUrl: string | null;
  production: string;
  wealth: string;
  treasury: string;
  foodImportDependency: string;
  basicEmploymentDemand: string;
  serviceEmploymentDemand: string;
  dwellings: string;
  housingGap: string;
  underConstruction: string;
  constructionWorkers: string;
  pregnant: string;
  expectedBirths: string;
  settlementValue: string;
  employmentComposition: string;
  laborResidual: string;
  marketUnemployment: string;
  employmentFocus: string;
  constructionJobs: string;

  // Features
  capital: boolean;
  port: boolean;
  citadel: boolean;
  walls: boolean;
  plaza: boolean;
  temple: boolean;
  shanty: boolean;

  lock: boolean;
}

export interface BurgEditorState {
  burgData: BurgData | null;
  groups: string[];
  cultures: BurgCulture[];
  isStyleSectionOpen: boolean;
  isRelocateMode: boolean;

  // Actions
  setBurgData: (data: BurgData | null) => void;
  updateBurgData: (data: Partial<BurgData>) => void;
  setGroups: (groups: string[]) => void;
  setCultures: (cultures: BurgCulture[]) => void;
  setIsStyleSectionOpen: (isOpen: boolean) => void;
  setIsRelocateMode: (isRelocate: boolean) => void;
}

export const burgEditorStore = createStore<BurgEditorState>(set => ({
  burgData: null,
  groups: [],
  cultures: [],
  isStyleSectionOpen: false,
  isRelocateMode: false,

  setBurgData: data => set({ burgData: data }),
  updateBurgData: partial =>
    set(state => ({
      burgData: state.burgData ? { ...state.burgData, ...partial } : null
    })),
  setGroups: groups => set({ groups }),
  setCultures: cultures => set({ cultures }),
  setIsStyleSectionOpen: isOpen => set({ isStyleSectionOpen: isOpen }),
  setIsRelocateMode: isRelocate => set({ isRelocateMode: isRelocate })
}));

export const getBurgEditorState = () => burgEditorStore.getState();

export function useBurgEditorState(): BurgEditorState;
export function useBurgEditorState<T>(selector: (state: BurgEditorState) => T): T;
export function useBurgEditorState<T>(selector?: (state: BurgEditorState) => T) {
  return useStore(burgEditorStore, selector!);
}
