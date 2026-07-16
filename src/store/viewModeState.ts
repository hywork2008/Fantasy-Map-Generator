import { create } from "zustand";

interface ViewModeState {
  /** DOM id of the currently active view-mode button ("viewStandard" | "viewMesh" | "viewGlobe") */
  activeViewMode: string;
  setActiveViewMode: (id: string) => void;
}

export const useViewModeState = create<ViewModeState>(set => ({
  activeViewMode: "viewStandard",
  setActiveViewMode: (id: string) => set({ activeViewMode: id })
}));
