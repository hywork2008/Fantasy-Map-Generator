import { color } from "d3";
import type { AppServices } from "../context/appServices";
import type { FocusFields, SettlementLayers, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { FrontierFort } from "../types/models";
import { rn } from "../utils";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";
import { getPin } from "./draw-markers";

export function drawFrontierFort(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<SettlementLayers & ViewState>,
  appServices: AppServices,
  fort: FrontierFort,
  rescale = 1
): string {
  const { scale } = viewContext;
  const { pack } = worldContext;
  const { i, icon, x, y, threatWeight, pin } = fort;
  const id = `frontierFort${i}`;
  const size = (fort.size ?? 22) + Math.min(threatWeight, 2) * 6;
  const zoomSize = rescale ? Math.max(rn(size / 5 + 24 / scale, 2), 1) : size;
  const viewX = rn(x - zoomSize / 2, 1);
  const viewY = rn(y - zoomSize, 1);

  const stateColor = pack.states[fort.state]?.color;
  const fill = stateColor && stateColor[0] === "#" ? stateColor : "#999";
  const stroke = color(fill)?.darker().formatHex() ?? "#000";

  return `
    <svg id="${id}" viewbox="0 0 30 30" width="${zoomSize}" height="${zoomSize}" x="${viewX}" y="${viewY}" data-state="${fort.state}">
      <g>${getPin(worldContext, viewContext, appServices, pin, fill, stroke)}</g>
      <text x="50%" y="55%" font-size="12px" text-anchor="middle">${icon}</text>
    </svg>`;
}

export const FrontierFortsRenderer: IRenderer = {
  id: "frontierForts",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<SettlementLayers & ViewState & FocusFields>,
    appServices: AppServices
  ): void {
    TIME && console.time("FrontierFortsRenderer");
    const { pack } = worldContext;
    const { frontierForts, focusScope } = viewContext;

    const rescale = +frontierForts.attr("rescale");
    const data = pack.frontierForts.filter(f => !f.hidden && isCellInScope(focusScope, f.cell));
    const html = data.map(fort => drawFrontierFort(worldContext, viewContext, appServices, fort, rescale));
    frontierForts.html(html.join(""));

    TIME && console.timeEnd("FrontierFortsRenderer");
  },

  clear(viewContext: Readonly<SettlementLayers>): void {
    viewContext.frontierForts.selectAll("*").remove();
  }
};
