import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { FocusFields, SettlementLayers, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { getGappedFillPaths, getIsolines } from "../utils";
import { getScopedGraph, isCellInScope, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";
import { buildPopulationColorMetrics, heatBucketToColorT } from "./populationColorScale";

export const PopulationRenderer: IRenderer = {
  id: "population",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<SettlementLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    const { pack, urbanization, graphWidth, graphHeight } = worldContext;
    const { population, focusScope } = viewContext;
    const { cells, burgs } = pack;

    const renderingMode = useOptionsState.getState().populationRenderingMode;

    population.selectAll("*").remove();
    population.attr("mask", renderingMode === "contour" ? "url(#land)" : null);

    // Zero-population land stays fully transparent (no gray "unsettled" fill).

    if (renderingMode === "original") {
      population.append("g").attr("id", "rural").attr("stroke", "#0000ff");
      population.append("g").attr("id", "urban").attr("stroke", "#ff0000");

      const rural = Array.from(
        cells.i.filter(i => (cells.pop[i] as number) > 0 && isCellInScope(focusScope, i)),
        i => [...cells.p[i], cells.p[i][1] - (cells.pop[i] as number) / 5] as [number, number, number]
      );

      population
        .select("#rural")
        .selectAll("line")
        .data(rural)
        .enter()
        .append("line")
        .attr("x1", d => d[0])
        .attr("y1", d => d[1])
        .attr("x2", d => d[0])
        .attr("y2", d => d[2]);

      const urban = burgs
        .filter(b => b.i && !b.removed && isCellInScope(focusScope, b.cell))
        .map(b => [b.x, b.y, b.y! - ((b.population ?? 0) / 5) * urbanization] as [number, number, number]);

      population
        .select("#urban")
        .selectAll("line")
        .data(urban)
        .enter()
        .append("line")
        .attr("x1", d => d[0])
        .attr("y1", d => d[1])
        .attr("x2", d => d[0])
        .attr("y2", d => d[2]);
    } else if (renderingMode === "contour") {
      const data: [number, number, number][] = [];

      for (const i of cells.i) {
        if (!isCellInScope(focusScope, i)) continue;
        const pop = cells.pop[i] as number;
        if (pop > 0) {
          data.push([cells.p[i][0], cells.p[i][1], pop ** 0.5]);
        }
      }

      for (const b of burgs) {
        if (b.i && !b.removed && isCellInScope(focusScope, b.cell)) {
          const uPop = (b.population ?? 0) * urbanization;
          if (uPop > 0) {
            data.push([b.x, b.y, uPop ** 0.5]);
          }
        }
      }

      if (data.length === 0) return;

      const contours = d3
        .contourDensity<[number, number, number]>()
        .x(d => d[0])
        .y(d => d[1])
        .weight(d => d[2])
        .size([graphWidth, graphHeight])
        .bandwidth(30)
        .thresholds(10)(data);

      if (contours.length === 0) return;

      const maxValue = d3.max(contours, d => d.value) || 1;
      const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxValue]);
      const geoPath = d3.geoPath();

      population
        .selectAll("path")
        .data(contours)
        .enter()
        .append("path")
        .attr("d", geoPath)
        .attr("fill", d => color(d.value))
        .attr("stroke", "none")
        .attr("opacity", 0.7);
    } else if (renderingMode === "choropleth") {
      const colorScale = useOptionsState.getState().populationColorScale;
      const { getBucket } = buildPopulationColorMetrics({
        cellIds: cells.i,
        pop: cells.pop,
        area: cells.area,
        capacity: cells.capacity,
        height: cells.h,
        burgs,
        populationRate: worldContext.populationRate,
        urbanization,
        colorScale,
        isInScope: i => isCellInScope(focusScope, i)
      });

      let hasHeat = false;
      for (const i of cells.i) {
        if (getBucket(i) > 0) {
          hasHeat = true;
          break;
        }
      }
      // Empty map: leave the layer fully transparent (no gray empty-land fill).
      if (!hasHeat) return;

      // getBucket returns 0 (falsy) for non-heat cells so getIsolines never outlines ocean/empty
      // as a type. Heat bands are 1–10 (truthy). Never pass -1 — it is truthy and paints seas.
      const isolines: Record<string, { fill?: string }> = getIsolines(
        getScopedGraph(pack, focusScope),
        scopedGetType(focusScope, getBucket),
        { fill: true }
      );

      const bodyPaths: string[] = [];
      Object.entries(isolines).forEach(([index, { fill }]) => {
        const bucket = +index;
        if (!(bucket > 0)) return;
        const color = d3.interpolateYlOrRd(heatBucketToColorT(bucket));
        bodyPaths.push(getGappedFillPaths("pop", fill, undefined, color, bucket));
      });

      population.html(bodyPaths.join(""));
      population.selectAll("path").attr("opacity", 0.7);
    }
  },

  clear(viewContext: Readonly<SettlementLayers>): void {
    viewContext.population.selectAll("*").remove();
  }
};

export function animatePopulationTurnOn(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  onEnd: () => void
): void {
  const { population } = viewContext;
  const renderingMode = useOptionsState.getState().populationRenderingMode;

  population.interrupt();
  population.selectAll("*").interrupt();

  if (renderingMode === "original") {
    const priorRuralY2 = new Map<string, number>();
    const priorUrbanY2 = new Map<string, number>();
    population
      .select("#rural")
      .selectAll<SVGLineElement, unknown>("line")
      .each(function () {
        priorRuralY2.set(
          `${this.getAttribute("x1")}_${this.getAttribute("y1")}`,
          parseFloat(this.getAttribute("y2") ?? "0")
        );
      });
    population
      .select("#urban")
      .selectAll<SVGLineElement, unknown>("line")
      .each(function () {
        priorUrbanY2.set(
          `${this.getAttribute("x1")}_${this.getAttribute("y1")}`,
          parseFloat(this.getAttribute("y2") ?? "0")
        );
      });

    PopulationRenderer.render(worldContext, viewContext, appServices);

    import("d3").then(d3 => {
      population
        .select("#rural")
        .selectAll<SVGLineElement, unknown>("line")
        .each(function () {
          const finalY2 = parseFloat(this.getAttribute("y2") ?? "0");
          const startY2 =
            priorRuralY2.get(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`) ??
            parseFloat(this.getAttribute("y1") ?? "0");
          d3.select(this).attr("y2", startY2).transition().duration(2000).ease(d3.easeSinIn).attr("y2", finalY2);
        });
      population
        .select("#urban")
        .selectAll<SVGLineElement, unknown>("line")
        .each(function () {
          const finalY2 = parseFloat(this.getAttribute("y2") ?? "0");
          const startY2 =
            priorUrbanY2.get(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`) ??
            parseFloat(this.getAttribute("y1") ?? "0");
          d3.select(this)
            .attr("y2", startY2)
            .transition()
            .delay(500)
            .duration(2000)
            .ease(d3.easeSinIn)
            .attr("y2", finalY2);
        });

      population.transition().delay(2500).on("end.pop-state", onEnd);
    });
  } else {
    // contour or choropleth modes
    PopulationRenderer.render(worldContext, viewContext, appServices);

    population.selectAll("path").attr("opacity", 0).transition().duration(1500).ease(d3.easeSinIn).attr("opacity", 0.7);

    population.transition().delay(1600).on("end.pop-state", onEnd);
  }
}

export function animatePopulationTurnOff(viewContext: Readonly<SettlementLayers>, onEnd: () => void): void {
  const { population } = viewContext;
  population.interrupt();
  population.selectAll("*").interrupt();

  const isD3dataPaths = population.selectAll("path").size() > 0;
  const isD3dataLines = population.select("line").size() > 0;

  if (!isD3dataPaths && !isD3dataLines) {
    population.selectAll("*").remove();
    onEnd();
    return;
  }

  if (isD3dataLines) {
    import("d3").then(d3 => {
      const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
      population
        .select("#rural")
        .selectAll<SVGLineElement, [number, number, number]>("line")
        .transition(hide)
        .attr("y2", d => d[1])
        .remove();
      population
        .select("#urban")
        .selectAll<SVGLineElement, [number, number, number]>("line")
        .transition(hide)
        .delay(1000)
        .attr("y2", d => d[1])
        .remove();
      population.transition().delay(2000).on("end.pop-state", onEnd);
    });
  } else {
    import("d3").then(d3 => {
      population.selectAll("path").transition().duration(1000).ease(d3.easeSinIn).attr("opacity", 0).remove();

      population
        .transition()
        .delay(1100)
        .on("end.pop-state", () => {
          population.selectAll("*").remove();
          onEnd();
        });
    });
  }
}
