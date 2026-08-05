import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { getGappedFillPaths, getIsolines } from "../utils";
import { getScopedGraph, isCellInScope, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";
import { dangerBucketToMagmaT, dangerIntensityToMagmaT } from "./dangerColorScale";

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
      // Same Magma window as Cell Heatmap: edges purple-gray, peaks deep red
      // (domain * 1.5 keeps the peak near Magma t = 2/3, never pale yellow).
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
        // Align with Smooth Contours: weak = purple/gray, strong = red (not pale yellow).
        const color = d3.interpolateMagma(dangerBucketToMagmaT(bucket));
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
