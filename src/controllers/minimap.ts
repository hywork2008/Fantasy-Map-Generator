import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
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

  const inverseScale = viewContext.scale ? 1 / viewContext.scale : 1;
  const left = Math.max(0, -viewContext.viewX * inverseScale);
  const top = Math.max(0, -viewContext.viewY * inverseScale);
  const right = Math.min(worldContext.graphWidth, left + viewContext.svgWidth * inverseScale);
  const bottom = Math.min(worldContext.graphHeight, top + viewContext.svgHeight * inverseScale);

  setMinimapState({
    viewBox: `0 0 ${worldContext.graphWidth} ${worldContext.graphHeight}`,
    transform: `translate(${rn(-viewContext.viewX * inverseScale, 3)} ${rn(-viewContext.viewY * inverseScale, 3)}) scale(${rn(inverseScale, 6)})`,
    viewportX: String(rn(left, 3)),
    viewportY: String(rn(top, 3)),
    viewportWidth: String(rn(Math.max(0, right - left), 3)),
    viewportHeight: String(rn(Math.max(0, bottom - top), 3))
  });
}
