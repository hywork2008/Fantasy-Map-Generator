import { worldContext } from "../context/worldContext";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { use3DOptionsStore } from "../store/options3dStore";
import { useViewModeState } from "../store/viewModeState";
import { closeDialog, isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import { fitContent } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { getElementById } from "../utils/nodeUtils";

function getRequiredElementById<T extends Element>(id: string): T {
  const element = getElementById<T>(id);
  if (!element) throw new Error(`Element #${id} is not found`);
  return element;
}

// ─── View mode / 3D ───────────────────────────────────────────────────────────

export function changeViewMode(event: MouseEvent): void {
  const button = event.target as HTMLElement;
  if (button.tagName !== "BUTTON") return;
  const pressed = useViewModeState.getState().activeViewMode === button.id;
  enterStandardView();

  if (!pressed && button.id !== "viewStandard") {
    useViewModeState.getState().setActiveViewMode(button.id);
    enter3dView(button.id);
  }
}

export function enterStandardView(): void {
  useViewModeState.getState().setActiveViewMode("viewStandard");

  const canvas3d = getElementById<HTMLCanvasElement>("canvas3d");
  if (!canvas3d) return;
  ThreeDRenderer.stop();
  canvas3d.remove();

  const mapEl = getElementById<SVGSVGElement>("map");
  if (mapEl) {
    mapEl.style.visibility = "visible";
    mapEl.style.pointerEvents = "auto";
  }

  if (isDialogOpen("options3d")) closeDialog("options3d");
  if (isDialogOpen("preview3d")) closeDialog("preview3d");
}

async function enter3dView(type: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.id = "canvas3d";
  canvas.dataset.type = type;

  if (type === "heightmap3DView") {
    canvas.width =
      parseFloat(getRequiredElementById<HTMLElement>("preview3d").style.width) || worldContext.graphWidth / 3;
    canvas.height = canvas.width / (worldContext.graphWidth / worldContext.graphHeight);
    canvas.style.display = "block";
  } else {
    canvas.width = view.svgWidth;
    canvas.height = view.svgHeight;
    canvas.style.position = "absolute";
    canvas.style.display = "none";
    canvas.style.pointerEvents = "auto";
  }

  const started = await ThreeDRenderer.create(canvas, type);
  if (!started) return;

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

    // Hide SVG
    const mapEl = getElementById<SVGSVGElement>("map");
    if (mapEl) {
      mapEl.style.visibility = "hidden";
      mapEl.style.pointerEvents = "none";
    }

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
