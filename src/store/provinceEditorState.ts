import { create } from "zustand";

export type ProvinceEditorTab = "overview" | "burgs";

export interface ProvinceEditorState {
  provinceId: number;
  activeTab: ProvinceEditorTab;
}

export const useProvinceEditorState = create<ProvinceEditorState>(() => ({
  provinceId: -1,
  activeTab: "overview"
}));

export const getProvinceEditorState = useProvinceEditorState.getState;
export const setProvinceEditorState = useProvinceEditorState.setState;
