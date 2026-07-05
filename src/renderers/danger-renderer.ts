import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const DangerRenderer: IRenderer = {
  id: "danger",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & ViewState & FocusFields>,
    _appServices: AppServices
  ): void {
    const { pack, graphWidth, graphHeight } = worldContext;
    const { danger, focusScope } = viewContext;
    const { cells } = pack;

    danger.selectAll("*").remove();
    danger.attr("mask", "url(#land)");

    if (!cells.danger) return;

    const data: [number, number, number][] = [];

    for (const i of cells.i) {
      if (!isCellInScope(focusScope, i)) continue;
      const d = cells.danger[i] as number;
      if (d > 0) {
        data.push([cells.p[i][0], cells.p[i][1], d]);
      }
    }

    if (data.length === 0) return;

    const contours = d3
      .contourDensity<[number, number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .weight(d => d[2])
      .size([graphWidth, graphHeight])
      .bandwidth(40) // Smoothness
      .thresholds(10)(data);

    if (contours.length === 0) return;

    const maxValue = d3.max(contours, d => d.value) || 1;
    // Dark fantasy danger colors: interpolator from dark purple to deep red
    const color = d3.scaleSequential(d3.interpolateMagma).domain([0, maxValue * 1.5]);
    const geoPath = d3.geoPath();

    danger
      .selectAll("path")
      .data(contours)
      .enter()
      .append("path")
      .attr("d", geoPath)
      .attr("fill", (d: { value: number }) => color(d.value))
      .attr("stroke", "none")
      .attr("opacity", 0.6);
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.danger.selectAll("*").remove();
  }
};
