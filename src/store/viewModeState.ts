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

/**
 * True while a 3D view (viewMesh/viewGlobe) owns the screen and the map SVG is hidden behind
 * canvas3d. Does NOT cover "heightmap3DView" (the small preview dialog), which keeps the main
 * SVG map fully visible and interactive alongside it.
 */
export function is3DViewActive(): boolean {
  const mode = useViewModeState.getState().activeViewMode;
  return mode === "viewMesh" || mode === "viewGlobe";
}
