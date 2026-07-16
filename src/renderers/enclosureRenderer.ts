import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { FocusFields, OverlayLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getPackPolygon, isWater } from "../utils";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

/**
 * Heatmap of pack.cells.enclosure (0 = open ocean, 100 = fully landlocked bay/inland sea).
 * One <polygon> per water cell, colored on a red (exposed) → green (enclosed) scale.
 * SVG-only overlay (see hybridLayerPolicy.ts) — not worth a deck.gl layer for this diagnostic view.
 */
export const EnclosureRenderer: IRenderer = {
  id: "enclosure",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<OverlayLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    const { pack } = worldContext;
    const { enclosure, focusScope } = viewContext;
    const { cells } = pack;
    if (!cells?.i || !enclosure) return;

    enclosure.selectAll("*").remove();
    if (!cells.enclosure) return;

    const color = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 100]);

    enclosure
      .selectAll("polygon")
      .data(cells.i.filter(i => isCellInScope(focusScope, i) && isWater(i, pack)))
      .enter()
      .append("polygon")
      .attr("points", i => getPackPolygon(i, pack).join(" "))
      .attr("fill", i => color(cells.enclosure[i] as number))
      .attr("stroke", i => color(cells.enclosure[i] as number))
      .attr("opacity", 0.75)
      .append("title")
      .text(i => `#${i}: enclosure ${cells.enclosure[i]}`);
  },

  clear(viewContext: Readonly<OverlayLayers>): void {
    viewContext.enclosure.selectAll("*").remove();
  }
};
