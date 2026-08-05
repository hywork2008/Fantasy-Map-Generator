import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { getPackPolygon } from "../utils";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";
import { dangerIntensityToMagmaT, dangerValueToMagmaT } from "./dangerColorScale";

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

    const renderingMode = useOptionsState.getState().dangerRenderingMode;

    danger.selectAll("*").remove();
    danger.attr("mask", renderingMode === "contour" ? "url(#land)" : null);

    if (!cells.danger) return;

    if (renderingMode === "contour") {
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
      // Magma window: edges purple-gray, peaks deep red (not pale yellow).
      const color = d3.scaleSequential(t => d3.interpolateMagma(dangerIntensityToMagmaT(t))).domain([0, maxValue]);
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
    } else if (renderingMode === "choropleth") {
      // True per-cell heatmap: one polygon per cell, fill from that cell's danger only.
      // Do NOT use getIsolines here — region merges drop type-0 (falsy), skip interior-only
      // starts, and can leave geometric holes so high-danger cells look empty/transparent.
      const ids: number[] = [];
      for (const i of cells.i) {
        if (!isCellInScope(focusScope, i)) continue;
        if ((cells.danger[i] as number) > 0) ids.push(i);
      }
      if (ids.length === 0) return;

      danger
        .selectAll("polygon")
        .data(ids)
        .enter()
        .append("polygon")
        .attr("points", i => getPackPolygon(i, pack).join(" "))
        .attr("fill", i => d3.interpolateMagma(dangerValueToMagmaT(cells.danger[i] as number)))
        .attr("stroke", "none")
        .attr("opacity", 0.6);
    }
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.danger.selectAll("*").remove();
  }
};
