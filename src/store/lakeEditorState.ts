import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface LakeData {
  id: number;
  name: string;
  group: string;
  area: number; // in square units
  shoreLength: number; // in distance units
  elevation: number;
  averageDepth: number;
  maxDepth: number;
  flux: number;
  evaporation: number;
  inlets: string[];
  outlet: string | null;
}

export interface LakeEditorState {
  lakeData: LakeData | null;
  groups: string[];
  isNewGroupInputOpen: boolean;

  // Actions
  setLakeData: (data: LakeData | null) => void;
  updateLakeData: (data: Partial<LakeData>) => void;
  setGroups: (groups: string[]) => void;
  setIsNewGroupInputOpen: (isOpen: boolean) => void;
}

export const lakeEditorStore = createStore<LakeEditorState>(set => ({
  lakeData: null,
  groups: [],
  isNewGroupInputOpen: false,

  setLakeData: data => set({ lakeData: data }),
  updateLakeData: partial =>
    set(state => ({
      lakeData: state.lakeData ? { ...state.lakeData, ...partial } : null
    })),
  setGroups: groups => set({ groups }),
  setIsNewGroupInputOpen: isOpen => set({ isNewGroupInputOpen: isOpen })
}));

export const getLakeEditorState = () => lakeEditorStore.getState();

export function useLakeEditorState(): LakeEditorState;
export function useLakeEditorState<T>(selector: (state: LakeEditorState) => T): T;
export function useLakeEditorState<T>(selector?: (state: LakeEditorState) => T) {
  return useStore(lakeEditorStore, selector!);
}
