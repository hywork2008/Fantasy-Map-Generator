import { worldContext } from "../context/worldContext";
import { viewLayerService as view } from "../services/viewLayerService";
import { dialogStore } from "../store/dialogState";
import { setMinimapState } from "../store/minimapState";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { rn } from "../utils";

export function openMinimapDialog(): void {
  closeDialogs("#minimap, .stable");
  openDialog("minimap");
  updateMinimap();
}

export function updateMinimap(): void {
  const isOpen = dialogStore.getState().openDialogs.has("minimap");
  if (!isOpen) return;

  const inverseScale = view.scale ? 1 / view.scale : 1;
  const left = Math.max(0, -view.viewX * inverseScale);
  const top = Math.max(0, -view.viewY * inverseScale);
  const right = Math.min(worldContext.graphWidth, left + view.svgWidth * inverseScale);
  const bottom = Math.min(worldContext.graphHeight, top + view.svgHeight * inverseScale);

  setMinimapState({
    viewBox: `0 0 ${worldContext.graphWidth} ${worldContext.graphHeight}`,
    transform: `translate(${rn(-view.viewX * inverseScale, 3)} ${rn(-view.viewY * inverseScale, 3)}) scale(${rn(inverseScale, 6)})`,
    viewportX: String(rn(left, 3)),
    viewportY: String(rn(top, 3)),
    viewportWidth: String(rn(Math.max(0, right - left), 3)),
    viewportHeight: String(rn(Math.max(0, bottom - top), 3))
  });
}
