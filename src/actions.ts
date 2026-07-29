import * as d3 from "d3";
import type { RenderMode } from "./context/viewContext";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import type { BurgGroup } from "./types/models";

export function resetZoom(d = 1000) {
  const { svg, zoom } = viewContext;
  svg.transition().duration(d).call(zoom.transform, d3.zoomIdentity);
}

export function zoomTo(x: number, y: number, z = 8, d = 2000) {
  const { svg, zoom, svgWidth, svgHeight } = viewContext;
  const transform = d3.zoomIdentity.translate(x * -z + svgWidth / 2, y * -z + svgHeight / 2).scale(z);
  svg.transition().duration(d).call(zoom.transform, transform);
}

export function zoomIntoBurg(burgId: number): void {
  const burg = worldContext.pack.burgs[burgId];
  if (!burg?.i) return;

  let requiredScale = 8;
  if (burg.group) {
    const burgGroups = worldContext.options.burgs?.groups || [];
    const group = (burgGroups as BurgGroup[]).find((g: BurgGroup) => g.name === burg.group);
    if (group) {
      if (typeof group.minZoom === "number" && Number.isFinite(group.minZoom)) {
        requiredScale = group.minZoom;
      } else {
        const maxBurgOrder = Math.max(...(burgGroups as BurgGroup[]).map((g: BurgGroup) => g.order), 1);
        const invertedOrder = maxBurgOrder - group.order + 1;
        requiredScale = invertedOrder === 1 ? 1.5 : invertedOrder * 2 - 1.5;
      }
    }
  }

  const currentScale = viewContext.scale;
  const scale = Math.max(currentScale >= 8 ? currentScale : 8, requiredScale);

  zoomTo(burg.x, burg.y, scale, 2000);
}

export function getWorldState() {
  const { pack, grid, seed, options, nameBases, biomesData, notes } = worldContext;
  return { pack, grid, seed, options, nameBases, biomesData, notes };
}

export function setRenderMode(mode: RenderMode): void {
  viewContext.renderMode = mode;
  localStorage.setItem("fmg-render-mode", mode);
  document.dispatchEvent(new CustomEvent("fmg:render-mode-changed", { detail: mode }));
}
