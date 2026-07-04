import type { AppServices } from "../context/appServices";
import type { FocusFields, PoliticalLayers, RootLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";
import { getScopedGraph, isCellInScope, scopedGetType } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const ProvincesRenderer = {
  id: "provinces",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<PoliticalLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("ProvincesRenderer");
    const { pack } = worldContext;
    const { cells, provinces } = pack;
    const { provs, focusScope } = viewContext;

    const bodyPaths = new Array(provinces.length - 1);
    const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
      getScopedGraph(pack, focusScope),
      scopedGetType(focusScope, cellId => cells.province[cellId]),
      { fill: true, waterGap: true }
    );
    Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
      const provinceColor = provinces[+index].color;
      bodyPaths.push(getGappedFillPaths("province", fill, waterGap, provinceColor, +index));
    });

    const labels = provinces
      .filter(p => p.i && !p.removed && isCellInScope(focusScope, p.center))
      .map(p => {
        const [x, y] = p.pole ?? cells.p[p.center];
        return `<text x="${x}" y="${y}" id="provinceLabel${p.i}">${p.name}</text>`;
      });

    provs.html(`
      <g id='provincesBody'>${bodyPaths.join("")}</g>
      <g id='provinceLabels'>${labels.join("")}</g>
    `);

    provs.select("#provinceLabels").style("display", provs.attr("data-labels") === "1" ? "block" : "none");

    TIME && console.timeEnd("ProvincesRenderer");
  },

  clear(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.provs.html("");
  },

  highlightProvinceOn(viewContext: Readonly<PoliticalLayers>, provinceId: number): void {
    import("d3").then(d3 => {
      const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
      viewContext.provs
        .select(`#province${provinceId}`)
        .raise()
        .transition(animate)
        .attr("stroke-width", 2.5)
        .attr("stroke", "#d0240f");
    });
  },

  highlightProvinceOff(viewContext: Readonly<PoliticalLayers>, provinceId: number): void {
    import("d3").then(_d3 => {
      viewContext.provs.select(`#province${provinceId}`).transition().attr("stroke-width", null).attr("stroke", null);
    });
  },

  clearHighlight(viewContext: Readonly<RootLayers>): void {
    viewContext.debug.selectAll(".highlight").remove();
  },

  clearSelectionHighlight(viewContext: Readonly<RootLayers>): void {
    viewContext.debug.selectAll("path.selected").remove();
  },

  updateProvinceColor(viewContext: Readonly<PoliticalLayers>, provinceId: number, newFill: string): void {
    const body = viewContext.provs.select("#provincesBody");
    body.select(`#province${provinceId}`).attr("fill", newFill);
    body.select(`#province-gap${provinceId}`).attr("stroke", newFill);
  },

  removeProvinceDOM(viewContext: Readonly<PoliticalLayers>, provinceId: number): void {
    const body = viewContext.provs.select("#provincesBody");
    body.select(`#province${provinceId}`).remove();
    body.select(`#province-gap${provinceId}`).remove();
  },

  clearBody(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.provs.select("#provincesBody").remove();
  },

  toggleProvinceLabels(viewContext: Readonly<PoliticalLayers>): void {
    const hidden = viewContext.provs.select("#provinceLabels").style("display") === "none";
    viewContext.provs.select("#provinceLabels").style("display", hidden ? "block" : "none");
    viewContext.provs.attr("data-labels", +hidden);
  },

  updateProvinceLabelText(viewContext: Readonly<PoliticalLayers>, provinceId: number, name: string): void {
    viewContext.provs.select(`#provinceLabel${provinceId}`).text(name);
  },

  setupBorderHighlight(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.provinceBorders.select("path").attr("stroke", "#000").attr("stroke-width", 0.5);
    viewContext.stateBorders.select("path").attr("stroke", "#000").attr("stroke-width", 1.2);
  },

  clearBorderHighlight(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.provinceBorders.select("path").attr("stroke", null).attr("stroke-width", null);
    viewContext.stateBorders.select("path").attr("stroke", null).attr("stroke-width", null);
  },

  setupTempGroup(viewContext: Readonly<PoliticalLayers>): void {
    const body = viewContext.provs.select("g#provincesBody");
    body.append("g").attr("id", "temp").attr("stroke-width", 0.3);
    body.append("g").attr("id", "centers").attr("fill", "none").attr("stroke", "#ff0000").attr("stroke-width", 1);
  },

  cleanupTempGroup(viewContext: Readonly<PoliticalLayers>): void {
    viewContext.provs.select("#temp").remove();
    viewContext.provs.select("#centers").remove();
  },

  selectProvinceHighlight(viewContext: Readonly<RootLayers & PoliticalLayers>, provinceId: number): void {
    viewContext.debug.selectAll("path.selected").remove();
    const path = viewContext.provs.select(`#province${provinceId}`).attr("d");
    if (path) viewContext.debug.append("path").attr("class", "selected").attr("d", path);
  },

  drawTempPolygon(
    viewContext: Readonly<PoliticalLayers>,
    cellId: number,
    points: string,
    provinceId: number,
    fill: string
  ): void {
    viewContext.provs
      .select("#temp")
      .append("polygon")
      .attr("points", points)
      .attr("data-cell", cellId)
      .attr("data-province", provinceId)
      .attr("fill", fill)
      .attr("stroke", "#555");
  },

  updateTempPolygon(viewContext: Readonly<PoliticalLayers>, cellId: number, provinceId: number, fill: string): void {
    viewContext.provs
      .select("#temp")
      .select(`polygon[data-cell='${cellId}']`)
      .attr("data-province", provinceId)
      .attr("fill", fill);
  },

  removeTempPolygon(viewContext: Readonly<PoliticalLayers>, cellId: number): void {
    viewContext.provs.select("#temp").select(`polygon[data-cell='${cellId}']`).remove();
  },

  drawCenterMark(viewContext: Readonly<PoliticalLayers>, cellId: number, points: string): void {
    viewContext.provs.select("#centers").append("polygon").attr("data-center", cellId).attr("points", points);
  }
} satisfies IRenderer;
