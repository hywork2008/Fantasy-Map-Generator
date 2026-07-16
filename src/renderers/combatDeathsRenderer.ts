import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, ViewState } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { type DeathWindow, deathWindowDays, getCombatDeathsByCell } from "../generators/populationLossTracker";
import { useOptionsState } from "../store/optionsState";
import { usePopulationOverviewState } from "../store/populationOverviewState";
import { getGappedFillPaths, getIsolines } from "../utils";
import { getScopedGraph, isCellInScope, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

function activeDeathWindow(): DeathWindow {
  return usePopulationOverviewState.getState().deathWindow;
}

/**
 * Heatmap of recent combat deaths by battlefield cell.
 * Reads rolling tallies from populationLossTracker (same day/week/month window as
 * Population Overview Deaths). Kept as an SVG overlay (not WebGL-managed) so it
 * remains visible in hybrid mode without a deck.gl path.
 */
export const CombatDeathsRenderer: IRenderer = {
  id: "combatDeaths",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & ViewState & FocusFields>,
    _appServices: AppServices
  ): void {
    const { pack, graphWidth, graphHeight } = worldContext;
    const { combatDeaths, focusScope } = viewContext;
    const { cells } = pack;
    if (!cells?.i || !combatDeaths) return;

    const window = activeDeathWindow();
    const byCell = getCombatDeathsByCell(window);
    const renderingMode = useOptionsState.getState().combatDeathsRenderingMode;

    combatDeaths.selectAll("*").remove();
    combatDeaths.attr("mask", renderingMode === "contour" ? "url(#land)" : null);
    combatDeaths.attr("data-death-window", window);
    combatDeaths.attr("data-window-days", String(deathWindowDays(window)));

    if (byCell.size === 0) return;

    if (renderingMode === "contour") {
      const data: [number, number, number][] = [];

      for (const [cellId, people] of byCell) {
        if (!isCellInScope(focusScope, cellId)) continue;
        if (people <= 0 || cellId >= cells.i.length) continue;
        const p = cells.p[cellId];
        if (!p) continue;
        // sqrt weight so mega-battles don't dominate the density kernel entirely
        data.push([p[0], p[1], Math.sqrt(people)]);
      }

      if (data.length === 0) return;

      const contours = d3
        .contourDensity<[number, number, number]>()
        .x(d => d[0])
        .y(d => d[1])
        .weight(d => d[2])
        .size([graphWidth, graphHeight])
        .bandwidth(36)
        .thresholds(10)(data);

      if (contours.length === 0) return;

      const maxValue = d3.max(contours, d => d.value) || 1;
      const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxValue]);
      const geoPath = d3.geoPath();

      combatDeaths
        .selectAll("path")
        .data(contours)
        .enter()
        .append("path")
        .attr("d", geoPath)
        .attr("fill", (d: { value: number }) => color(d.value))
        .attr("stroke", "none")
        .attr("opacity", 0.7);
    } else {
      // choropleth — bucket by log scale so small skirmishes remain visible next to sieges
      let maxDeaths = 0;
      for (const [cellId, people] of byCell) {
        if (!isCellInScope(focusScope, cellId)) continue;
        if (people > maxDeaths) maxDeaths = people;
      }
      if (maxDeaths <= 0) return;

      const getBucket = (cellId: number): number => {
        const people = byCell.get(cellId) ?? 0;
        if (people <= 0) return -1;
        if (maxDeaths <= 1) return 0;
        const ratio = Math.log(people + 1) / Math.log(maxDeaths + 1);
        return Math.min(9, Math.floor(ratio * 10));
      };

      const isolines: Record<string, { fill?: string }> = getIsolines(
        getScopedGraph(pack, focusScope),
        scopedGetType(focusScope, getBucket),
        { fill: true }
      );

      const bodyPaths: string[] = [];
      Object.entries(isolines).forEach(([index, { fill }]) => {
        const bucket = +index;
        if (bucket < 0) return;
        const color = d3.interpolateYlOrRd((bucket + 1) / 10);
        bodyPaths.push(getGappedFillPaths("combatDeaths", fill, undefined, color, bucket));
      });

      combatDeaths.html(bodyPaths.join(""));
      combatDeaths.selectAll("path").attr("opacity", 0.7);
    }
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.combatDeaths.selectAll("*").remove();
  }
};
