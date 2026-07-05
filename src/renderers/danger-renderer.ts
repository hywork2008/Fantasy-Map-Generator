import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { getGappedFillPaths, getIsolines } from "../utils";
import { getScopedGraph, isCellInScope, scopedGetType } from "./core/focusScope";
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

    const renderingMode = useOptionsState.getState().dangerRenderingMode;

    danger.selectAll("*").remove();
    danger.attr("mask", renderingMode === "contour" ? "url(#land)" : null);

    if (!cells.danger) return;

    if (renderingMode === "contour" || renderingMode === "original" /* fallback */) {
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
    } else if (renderingMode === "choropleth") {
      let maxDanger = 0;

      for (const i of cells.i) {
        if (!isCellInScope(focusScope, i)) continue;
        const d = cells.danger[i] as number;
        if (d > maxDanger) maxDanger = d;
      }

      if (maxDanger === 0) return;

      const getDangerBucket = (cellId: number): number => {
        const d = cells.danger[cellId] as number;
        if (d <= 0) return -1;

        const ratio = d / maxDanger;
        return Math.min(9, Math.floor(ratio * 10));
      };

      const isolines: Record<string, { fill?: string }> = getIsolines(
        getScopedGraph(pack, focusScope),
        scopedGetType(focusScope, getDangerBucket),
        { fill: true }
      );

      const bodyPaths: string[] = [];
      Object.entries(isolines).forEach(([index, { fill }]) => {
        const bucket = +index;
        if (bucket < 0) return;
        const color = d3.interpolateMagma((bucket + 1) / 10);
        bodyPaths.push(getGappedFillPaths("danger", fill, undefined, color, bucket));
      });

      danger.html(bodyPaths.join(""));
      danger.selectAll("path").attr("opacity", 0.6);
    }
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.danger.selectAll("*").remove();
  }
};
