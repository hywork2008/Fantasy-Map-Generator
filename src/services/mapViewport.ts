import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { drawCalendar, fitScaleBar } from "../renderers/index";
import { useOptionsState } from "../store/optionsState";
import { viewLayerService as view } from "./viewLayerService";

/** Resizes the graph-sized background rects and masks to worldContext.graphWidth / graphHeight. */
export function resizeGraphRects(): void {
  const { graphWidth, graphHeight } = worldContext;

  if (!viewContext?.renderMap || !viewContext.viewbox) return;

  view.landmass.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  view.oceanPattern.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  view.oceanLayers.select("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  viewContext
    .fogging!.selectAll("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
  view.defs.select("mask#fog > rect").attr("width", graphWidth).attr("height", graphHeight);
  view.defs.select("mask#water > rect").attr("width", graphWidth).attr("height", graphHeight);
}

export function fitMapToScreen(): void {
  if (!viewContext?.renderMap || !viewContext.viewbox) return;
  const svgWidth = window.innerWidth;
  const svgHeight = window.innerHeight;
  Object.assign(viewContext, { svgWidth, svgHeight });

  view.svg.attr("width", String(svgWidth)).attr("height", String(svgHeight));

  const { graphWidth, graphHeight } = worldContext;
  const { zoomExtentMin: zoomMin, zoomExtentMax: zoomMax } = useOptionsState.getState();

  view.zoom
    .translateExtent([
      [0, 0],
      [graphWidth, graphHeight]
    ])
    .scaleExtent([zoomMin, zoomMax]);

  fitScaleBar(worldContext, viewContext, appServices, view.scaleBar, svgWidth, svgHeight);
  drawCalendar(worldContext, viewContext);
  document.dispatchEvent(new CustomEvent("fmg:fit-legend-box"));
}

document.addEventListener("fmg:fit-map-to-screen", fitMapToScreen);
