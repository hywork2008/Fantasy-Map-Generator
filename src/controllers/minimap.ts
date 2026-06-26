import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { rn } from "../utils";

export function openMinimapDialog(): void {
  closeDialogs("#minimap, .stable");
  openDialog("minimap");
  updateMinimap();
}

export function updateMinimap(): void {
  const minimap = document.getElementById("minimapSurface") as SVGSVGElement | null;
  const viewport = document.getElementById("minimapViewport") as SVGRectElement | null;
  const mapUse = document.getElementById("minimapMapUse") as SVGUseElement | null;
  if (!minimap || !viewport || !mapUse) return;

  minimap.setAttribute("viewBox", `0 0 ${worldContext.graphWidth} ${worldContext.graphHeight}`);

  const inverseScale = viewContext.scale ? 1 / viewContext.scale : 1;
  mapUse.setAttribute(
    "transform",
    `translate(${rn(-viewContext.viewX * inverseScale, 3)} ${rn(-viewContext.viewY * inverseScale, 3)}) scale(${rn(inverseScale, 6)})`
  );

  const left = Math.max(0, -viewContext.viewX * inverseScale);
  const top = Math.max(0, -viewContext.viewY * inverseScale);
  const right = Math.min(worldContext.graphWidth, left + viewContext.svgWidth * inverseScale);
  const bottom = Math.min(worldContext.graphHeight, top + viewContext.svgHeight * inverseScale);

  viewport.setAttribute("x", String(rn(left, 3)));
  viewport.setAttribute("y", String(rn(top, 3)));
  viewport.setAttribute("width", String(rn(Math.max(0, right - left), 3)));
  viewport.setAttribute("height", String(rn(Math.max(0, bottom - top), 3)));
}
