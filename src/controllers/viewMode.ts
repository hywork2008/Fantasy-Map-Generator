import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { DeckGlRenderer } from "../renderers/webgl/deckRenderer";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { use3DOptionsStore } from "../store/options3dStore";
import {
  is3DViewActive,
  lockMapForFullscreen3d,
  unlockMapFromFullscreen3d,
  useViewModeState
} from "../store/viewModeState";
import { closeDialog, isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import { fitContent } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { getElementById } from "../utils/nodeUtils";
import { editBurg } from "./burg-editor";

/** Invalidates in-flight enter3dView work when the user switches modes mid-init. */
let enter3dGeneration = 0;

function getRequiredElementById<T extends Element>(id: string): T {
  const element = getElementById<T>(id);
  if (!element) throw new Error(`Element #${id} is not found`);
  return element;
}

function getLiveMapElement(): SVGSVGElement | null {
  const mapEl = document.getElementById("map");
  if (!(mapEl instanceof SVGSVGElement)) return null;
  // Offscreen export clones use the same id while detached work runs; never treat them as live.
  if (mapEl.hasAttribute("data-fmg-offscreen-export")) return null;
  return mapEl;
}

document.addEventListener("fmg:3d-burg-select", event => {
  if (!(event instanceof CustomEvent)) return;
  const detail: unknown = event.detail;
  if (!detail || typeof detail !== "object" || !("burgId" in detail)) return;
  const burgId = detail.burgId;
  const canvas = getElementById<HTMLCanvasElement>("canvas3d");
  if (typeof burgId !== "number" || !Number.isInteger(burgId) || burgId <= 0 || canvas?.dataset.type !== "viewMesh")
    return;
  editBurg(burgId);
});

document.addEventListener("fmg:viewmesh-satellite-terrain-mode-changed", event => {
  if (!(event instanceof CustomEvent) || typeof event.detail !== "boolean") return;
  const canvas = getElementById<HTMLCanvasElement>("canvas3d");
  if (canvas?.dataset.type !== "viewMesh") return;

  if (event.detail) DeckGlRenderer.suspend(viewContext);
  else DeckGlRenderer.resume(worldContext, viewContext, appServices);
});

// ─── View mode / 3D ───────────────────────────────────────────────────────────

export function changeViewMode(event: MouseEvent): void {
  const button = event.target as HTMLElement;
  if (button.tagName !== "BUTTON") return;
  const pressed = useViewModeState.getState().activeViewMode === button.id;
  enterStandardView();

  if (!pressed && button.id !== "viewStandard") {
    useViewModeState.getState().setActiveViewMode(button.id);
    void enter3dView(button.id);
  }
}

export function enterStandardView(): void {
  // Cancel any in-flight enter3dView (WebGPU init / mesh texture) before it can re-hide the map.
  enter3dGeneration++;
  useViewModeState.getState().setActiveViewMode("viewStandard");

  const canvas3d = getElementById<HTMLCanvasElement>("canvas3d");
  if (canvas3d) {
    ThreeDRenderer.stop();
    DeckGlRenderer.resume(worldContext, viewContext, appServices);
    canvas3d.remove();
  } else if (ThreeDRenderer.options.isOn) {
    // create() finished enough to mark isOn but canvas was not mounted yet (aborted mid-await).
    ThreeDRenderer.stop();
    DeckGlRenderer.resume(worldContext, viewContext, appServices);
  }

  // Always restore 2D ownership — even when canvas3d was never inserted (race with create()).
  unlockMapFromFullscreen3d(getLiveMapElement() ?? getElementById<SVGSVGElement>("map"), viewContext.webglCanvas);

  if (isDialogOpen("options3d")) closeDialog("options3d");
  if (isDialogOpen("preview3d")) closeDialog("preview3d");
}

async function enter3dView(type: string): Promise<void> {
  const generation = ++enter3dGeneration;
  const canvas = document.createElement("canvas");
  canvas.id = "canvas3d";
  canvas.dataset.type = type;

  const isFullscreen3d = type === "viewMesh" || type === "viewGlobe";
  // Hold the live map node before any await. Hybrid full-map texture capture swaps a temporary
  // clone into document under id=map; hide/show must never target that clone.
  const liveMapEl = isFullscreen3d ? getLiveMapElement() : null;

  if (type === "heightmap3DView") {
    canvas.width =
      parseFloat(getRequiredElementById<HTMLElement>("preview3d").style.width) || worldContext.graphWidth / 3;
    canvas.height = canvas.width / (worldContext.graphWidth / worldContext.graphHeight);
    canvas.style.display = "block";
  } else {
    canvas.width = view.svgWidth;
    canvas.height = view.svgHeight;
    canvas.style.position = "absolute";
    // Above #map (z-index: 2) and #webglMapCanvas (z-index: 1) so MapControls receive events even
    // if a race briefly leaves the SVG interactive.
    canvas.style.zIndex = "3";
    canvas.style.display = "none";
    canvas.style.pointerEvents = "auto";
  }

  // Lock the 2D stack before await create(). WebGPURenderer.init() and the queued mesh texture
  // path (withOffscreenSvgExport) both yield; locking first keeps hybrid SVG pick/hit-testing off
  // for the entire init window.
  if (isFullscreen3d) {
    lockMapForFullscreen3d(liveMapEl, viewContext.webglCanvas);
  }

  const isSatelliteTerrain =
    type === "viewMesh" &&
    ThreeDRenderer.options.satellite &&
    !ThreeDRenderer.options.wireframe &&
    !ThreeDRenderer.options.sceneOnly;
  if (isSatelliteTerrain) DeckGlRenderer.suspend(viewContext);

  const started = await ThreeDRenderer.create(canvas, type);

  // User left 3D (or started another enter) while WebGPU init / create was in flight.
  if (generation !== enter3dGeneration || useViewModeState.getState().activeViewMode !== type) {
    if (started) {
      ThreeDRenderer.stop();
      DeckGlRenderer.resume(worldContext, viewContext, appServices);
    } else if (isSatelliteTerrain) {
      DeckGlRenderer.resume(worldContext, viewContext, appServices);
    }
    if (!is3DViewActive()) {
      unlockMapFromFullscreen3d(liveMapEl ?? getLiveMapElement(), viewContext.webglCanvas);
    }
    return;
  }

  if (!started && isSatelliteTerrain) DeckGlRenderer.resume(worldContext, viewContext, appServices);
  if (!started) {
    if (isFullscreen3d) unlockMapFromFullscreen3d(liveMapEl ?? getLiveMapElement(), viewContext.webglCanvas);
    return;
  }

  canvas.style.display = "block";
  canvas.onmouseenter = () => {
    const help = "Drag to pan • Scroll to zoom • Right-click drag to rotate • <b>O</b> to toggle options";
    +(canvas.dataset.hovered ?? 0) > 2 ? tip("") : tip(help);
    canvas.dataset.hovered = String((+(canvas.dataset.hovered ?? 0) | 0) + 1);
  };

  if (type === "heightmap3DView") {
    getRequiredElementById<HTMLElement>("preview3d").appendChild(canvas);
    openDialog("preview3d", {
      title: "3D Preview",

      position: { my: "left bottom", at: "left+10 bottom-20", of: "svg" },
      resizeStop: resize3d,
      onClose: enterStandardView
    });
  } else {
    const optionsContainer = getElementById<HTMLElement>("optionsContainer");
    if (optionsContainer) optionsContainer.parentNode?.insertBefore(canvas, optionsContainer);

    // Re-apply on the live node held before create. getElementById("map") mid-export would hit the
    // offscreen clone; reassertFullscreen3dMapOwnership also runs after export reinserts live root.
    lockMapForFullscreen3d(liveMapEl ?? getLiveMapElement(), viewContext.webglCanvas);

    if (typeof EditorBus.unselect === "function") EditorBus.unselect();
  }

  toggle3dOptions();
}

function resize3d(): void {
  const canvas = getElementById<HTMLCanvasElement>("canvas3d");
  if (!canvas) return;
  const preview3d = getRequiredElementById<HTMLElement>("preview3d");
  canvas.width = parseFloat(preview3d.style.width);
  canvas.height = parseFloat(preview3d.style.height) - 2;
  ThreeDRenderer.redraw();
}

export function toggle3dOptions(): void {
  if (isDialogOpen("options3d")) {
    closeDialog("options3d");
    return;
  }
  openDialog("options3d", {
    title: "3D mode settings",

    width: fitContent(),
    position: { my: "right top", at: "right-30 top+10", of: "svg", collision: "fit" }
  });

  setTimeout(() => {
    // Sync to Zustand store
    use3DOptionsStore.getState().syncFromThreeDRenderer(ThreeDRenderer.options);
  }, 100);
}
