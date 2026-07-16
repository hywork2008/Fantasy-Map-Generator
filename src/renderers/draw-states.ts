import { color } from "d3";
import type { AppServices } from "../context/appServices";
import type { FocusFields, PoliticalLayers, RootLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import { getScopedGraph, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const StatesRenderer = {
  id: "states",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<RootLayers & PoliticalLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawStates");
    const { pack } = worldContext;
    const { cells, states } = pack;
    const { focusScope } = viewContext;

    const maxLength = states.length - 1;
    const bodyPaths = new Array(maxLength);
    const clipPaths = new Array(maxLength);
    const haloPaths = new Array(maxLength);

    const renderHalo = useOptionsState.getState().shapeRendering === "geometricPrecision";
    const isolines: Record<string, { fill?: string; waterGap?: string; halo?: string }> = getIsolines(
      getScopedGraph(pack, focusScope),
      scopedGetType(focusScope, cellId => cells.state[cellId]),
      { fill: true, waterGap: true, halo: renderHalo }
    );

    Object.entries(isolines).forEach(([index, { fill, waterGap, halo }]) => {
      const stateColor = states[+index].color ?? "#999";
      bodyPaths.push(getGappedFillPaths("state", fill, waterGap, stateColor, +index));

      if (renderHalo) {
        const haloColor = color(stateColor)?.darker().hex() ?? "#666666";
        clipPaths.push(`<clipPath id="state-clip${index}"><use href="#state${index}"/></clipPath>`);
        haloPaths.push(
          `<path id="state-border${index}" d="${halo}" clip-path="url(#state-clip${index})" stroke="${haloColor}"/>`
        );
      }
    });

    viewContext.statesBody.html(bodyPaths.join(""));
    viewContext.defs.select<SVGGElement>("#statePaths").html(renderHalo ? clipPaths.join("") : "");
    viewContext.statesHalo.html(renderHalo ? haloPaths.join("") : "");

    TIME && console.timeEnd("drawStates");
  },

  clear(viewContext: Readonly<RootLayers & PoliticalLayers>): void {
    viewContext.statesBody.html("");
    viewContext.defs.select<SVGGElement>("#statePaths").html("");
    viewContext.statesHalo.html("");
  },

  updateStateColor(viewContext: Readonly<PoliticalLayers>, stateId: number, newFill: string, halo: string): void {
    viewContext.statesBody.select(`#state${stateId}`).attr("fill", newFill);
    viewContext.statesBody.select(`#state-gap${stateId}`).attr("stroke", newFill);
    viewContext.statesHalo.select(`#state-border${stateId}`).attr("stroke", halo);
  },

  removeStateDOM(viewContext: Readonly<PoliticalLayers>, stateId: number): void {
    viewContext.statesBody.select(`#state${stateId}`).remove();
    viewContext.statesBody.select(`#state-gap${stateId}`).remove();
    viewContext.statesHalo.select(`#state-border${stateId}`).remove();
  },

  setupTempGroup(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.statesBody.append("g").attr("id", "temp");
    viewContext.statesHalo.node()!.style.display = "none";
  },

  cleanupTempGroup(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.statesBody.select("#temp").remove();
    viewContext.statesHalo.node()!.style.display = "block";
  },

  drawTempPolygon(viewContext: Readonly<PoliticalLayers>, cellId: number, d: string, color: string): void {
    viewContext.statesBody
      .select("#temp")
      .append("polygon")
      .attr("data-cell", cellId)
      .attr("points", d)
      .attr("fill", color)
      .attr("stroke", "none");
  },

  removeTempPolygon(viewContext: Readonly<PoliticalLayers>, cellId: number): void {
    viewContext.statesBody.select("#temp").select(`polygon[data-cell='${cellId}']`).remove();
  },

  highlightState(viewContext: Readonly<RootLayers & PoliticalLayers>, stateId: number): void {
    if (!stateId) return;
    const statePath = viewContext.regions.select(`#state${stateId}`).node() as SVGElement | null;
    if (!statePath) return;
    const d = statePath.getAttribute("d");
    if (!d) return;

    const path = viewContext.debug
      .append("path")
      .attr("class", "highlight")
      .attr("d", d)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 1)
      .attr("opacity", 1)
      .attr("filter", "url(#blur1)");

    import("d3").then(d3 => {
      const totalLength = (path.node() as SVGPathElement).getTotalLength();
      const duration = (totalLength + 5000) / 2;
      const interpolate = d3.interpolateString(`0, ${totalLength}`, `${totalLength}, ${totalLength}`);
      path
        .transition()
        .duration(duration)
        .attrTween("stroke-dasharray", () => interpolate);
    });
  },

  clearHighlight(viewContext: Readonly<RootLayers>): void {
    import("d3").then(d3 => {
      viewContext.debug.selectAll<SVGElement, unknown>(".highlight").each(function () {
        d3.select(this).transition().duration(1000).attr("opacity", 0).remove();
      });
    });
  }
} satisfies IRenderer;
