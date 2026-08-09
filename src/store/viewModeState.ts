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

/**
 * Hides the live 2D map stack so fullscreen 3D (canvas3d) owns hit-testing and display.
 * Call with the live `#map` element reference — never rely on getElementById while an offscreen
 * export may have temporarily registered a clone under the same id.
 */
export function lockMapForFullscreen3d(
  mapEl: SVGSVGElement | null | undefined,
  webglCanvas: HTMLCanvasElement | null | undefined
): void {
  if (mapEl) {
    mapEl.style.visibility = "hidden";
    mapEl.style.pointerEvents = "none";
  }
  if (webglCanvas) {
    // Keep the deck instance alive while 3D owns a second WebGL/WebGPU context. This avoids a
    // costly rebuild when returning to Standard view and prevents its canvas showing behind canvas3d.
    webglCanvas.style.visibility = "hidden";
    webglCanvas.style.pointerEvents = "none";
  }
}

/** Restores the live 2D map stack after leaving fullscreen 3D. */
export function unlockMapFromFullscreen3d(
  mapEl: SVGSVGElement | null | undefined,
  webglCanvas: HTMLCanvasElement | null | undefined
): void {
  if (mapEl) {
    mapEl.style.visibility = "visible";
    mapEl.style.pointerEvents = "auto";
  }
  if (webglCanvas) {
    webglCanvas.style.visibility = "";
    webglCanvas.style.pointerEvents = "";
  }
}

/**
 * Re-applies fullscreen-3D ownership to the live `#map` if a 3D view is still active.
 * Used after withOffscreenSvgExport reinserts the live root (export temporarily replaces #map
 * with a clone, so hide styles applied mid-export would stick to the discarded clone).
 */
export function reassertFullscreen3dMapOwnership(
  webglCanvas: HTMLCanvasElement | null | undefined = document.getElementById(
    "webglMapCanvas"
  ) as HTMLCanvasElement | null
): void {
  if (!is3DViewActive()) return;
  const mapEl = document.getElementById("map");
  if (!(mapEl instanceof SVGSVGElement)) return;
  // Skip offscreen export clones still briefly present under id=map.
  if (mapEl.hasAttribute("data-fmg-offscreen-export")) return;
  lockMapForFullscreen3d(mapEl, webglCanvas);
}
