import type { Selection } from "d3";
import * as d3 from "d3";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { getElementById } from "./utils/nodeUtils";

/**
 * Creates all host SVG <g> layers in DOM render order and populates viewContext.
 * Called once during the synchronous SVG setup phase in app startup (before any renderer runs).
 */
export function createViewLayers(): void {
  const mapSvgEl = getElementById<SVGSVGElement>("map");
  if (!mapSvgEl) throw new Error("Map SVG root #map is not found");

  const svg = d3.select<SVGSVGElement, unknown>(mapSvgEl) as Selection<SVGSVGElement, unknown, null, undefined>;
  const defs = svg.select("#deftemp") as Selection<SVGDefsElement, unknown, null, undefined>;
  const viewbox = svg.select("#viewbox") as Selection<SVGGElement, unknown, null, undefined>;
  const scaleBar = svg.select("#scaleBar") as Selection<SVGGElement, unknown, null, undefined>;
  const legend = svg.append("g").attr("id", "legend") as Selection<SVGGElement, unknown, null, undefined>;
  const ocean = viewbox.append("g").attr("id", "ocean") as Selection<SVGGElement, unknown, null, undefined>;
  const oceanLayers = ocean.append("g").attr("id", "oceanLayers") as Selection<SVGGElement, unknown, null, undefined>;
  const oceanPattern = ocean.append("g").attr("id", "oceanPattern") as Selection<SVGGElement, unknown, null, undefined>;
  const landmass = viewbox.append("g").attr("id", "landmass") as Selection<SVGGElement, unknown, null, undefined>;
  const texture = viewbox.append("g").attr("id", "texture") as Selection<SVGGElement, unknown, null, undefined>;
  const terrs = viewbox.append("g").attr("id", "terrs") as Selection<SVGGElement, unknown, null, undefined>;
  const lakes = viewbox.append("g").attr("id", "lakes") as Selection<SVGGElement, unknown, null, undefined>;
  const biomes = viewbox.append("g").attr("id", "biomes") as Selection<SVGGElement, unknown, null, undefined>;
  const cells = viewbox.append("g").attr("id", "cells") as Selection<SVGGElement, unknown, null, undefined>;
  const gridOverlay = viewbox.append("g").attr("id", "gridOverlay") as Selection<SVGGElement, unknown, null, undefined>;
  const coordinates = viewbox.append("g").attr("id", "coordinates") as Selection<SVGGElement, unknown, null, undefined>;
  const compass = viewbox.append("g").attr("id", "compass").style("display", "none") as Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
  const rivers = viewbox.append("g").attr("id", "rivers") as Selection<SVGGElement, unknown, null, undefined>;
  const terrain = viewbox.append("g").attr("id", "terrain") as Selection<SVGGElement, unknown, null, undefined>;
  const relig = viewbox.append("g").attr("id", "relig") as Selection<SVGGElement, unknown, null, undefined>;
  const cults = viewbox.append("g").attr("id", "cults") as Selection<SVGGElement, unknown, null, undefined>;
  const regions = viewbox.append("g").attr("id", "regions") as Selection<SVGGElement, unknown, null, undefined>;
  const statesBody = regions.append("g").attr("id", "statesBody") as Selection<SVGGElement, unknown, null, undefined>;
  const statesHalo = regions.append("g").attr("id", "statesHalo") as Selection<SVGGElement, unknown, null, undefined>;
  const provs = viewbox.append("g").attr("id", "provs") as Selection<SVGGElement, unknown, null, undefined>;
  const zones = viewbox.append("g").attr("id", "zones") as Selection<SVGGElement, unknown, null, undefined>;
  const borders = viewbox.append("g").attr("id", "borders") as Selection<SVGGElement, unknown, null, undefined>;
  const stateBorders = borders.append("g").attr("id", "stateBorders") as Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
  const provinceBorders = borders.append("g").attr("id", "provinceBorders") as Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
  const routes = viewbox.append("g").attr("id", "routes") as Selection<SVGGElement, unknown, null, undefined>;
  const roads = routes.append("g").attr("id", "roads") as Selection<SVGGElement, unknown, null, undefined>;
  const trails = routes.append("g").attr("id", "trails") as Selection<SVGGElement, unknown, null, undefined>;
  const searoutes = routes.append("g").attr("id", "searoutes") as Selection<SVGGElement, unknown, null, undefined>;
  const temperature = viewbox.append("g").attr("id", "temperature") as Selection<SVGGElement, unknown, null, undefined>;
  const coastline = viewbox.append("g").attr("id", "coastline") as Selection<SVGGElement, unknown, null, undefined>;
  const ice = viewbox.append("g").attr("id", "ice") as Selection<SVGGElement, unknown, null, undefined>;
  const prec = viewbox.append("g").attr("id", "prec").style("display", "none") as Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
  const population = viewbox.append("g").attr("id", "population") as Selection<SVGGElement, unknown, null, undefined>;
  const emblems = viewbox.append("g").attr("id", "emblems").style("display", "none") as Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
  const icons = viewbox.append("g").attr("id", "icons") as Selection<SVGGElement, unknown, null, undefined>;
  const labels = viewbox.append("g").attr("id", "labels") as Selection<SVGGElement, unknown, null, undefined>;
  const burgIcons = icons.append("g").attr("id", "burgIcons") as Selection<SVGGElement, unknown, null, undefined>;
  const anchors = icons.append("g").attr("id", "anchors") as Selection<SVGGElement, unknown, null, undefined>;
  const armies = viewbox.append("g").attr("id", "armies") as Selection<SVGGElement, unknown, null, undefined>;
  const markers = viewbox.append("g").attr("id", "markers") as Selection<SVGGElement, unknown, null, undefined>;
  const fogging = viewbox
    .append("g")
    .attr("id", "fogging-cont")
    .attr("mask", "url(#fog)")
    .append("g")
    .attr("id", "fogging")
    .style("display", "none") as Selection<SVGGElement, unknown, null, undefined>;
  const ruler = viewbox.append("g").attr("id", "ruler").style("display", "none") as Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
  const debug = viewbox.append("g").attr("id", "debug") as Selection<SVGGElement, unknown, null, undefined>;

  lakes.append("g").attr("id", "freshwater");
  lakes.append("g").attr("id", "salt");
  lakes.append("g").attr("id", "sinkhole");
  lakes.append("g").attr("id", "frozen");
  lakes.append("g").attr("id", "lava");
  lakes.append("g").attr("id", "dry");

  coastline.append("g").attr("id", "sea_island");
  coastline.append("g").attr("id", "lake_island");

  terrs.append("g").attr("id", "oceanHeights");
  terrs.append("g").attr("id", "landHeights");

  labels.append("g").attr("id", "states");
  labels.append("g").attr("id", "addedLabels");
  const burgLabels = labels.append("g").attr("id", "burgLabels") as Selection<SVGGElement, unknown, null, undefined>;

  population.append("g").attr("id", "rural");
  population.append("g").attr("id", "urban");

  emblems.append("g").attr("id", "burgEmblems").classed("hidden", true);
  emblems.append("g").attr("id", "provinceEmblems").classed("hidden", true);
  emblems.append("g").attr("id", "stateEmblems").classed("hidden", true);

  compass.append("use").attr("xlink:href", "#defs-compass-rose");

  fogging.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
  fogging
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", "#e8f0f6")
    .attr("filter", "url(#splotch)");

  Object.assign(viewContext, {
    svg,
    defs,
    viewbox,
    scaleBar,
    legend,
    ocean,
    oceanLayers,
    oceanPattern,
    landmass,
    texture,
    terrs,
    lakes,
    biomes,
    cells,
    gridOverlay,
    coordinates,
    compass,
    rivers,
    terrain,
    relig,
    cults,
    regions,
    statesBody,
    statesHalo,
    provs,
    zones,
    borders,
    stateBorders,
    provinceBorders,
    routes,
    roads,
    trails,
    searoutes,
    temperature,
    coastline,
    ice,
    prec,
    population,
    emblems,
    icons,
    labels,
    burgLabels,
    burgIcons,
    anchors,
    armies,
    markers,
    fogging,
    ruler,
    debug,
    viewX: 0,
    viewY: 0
  });
}

/**
 * Appends the size-dependent background rects to landmass, oceanPattern, and oceanLayers.
 * Must be called after worldContext.graphWidth / graphHeight are set.
 */
export function populateSizeRects(): void {
  const { graphWidth, graphHeight } = worldContext;
  viewContext.landmass.append("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
  viewContext.oceanPattern
    .append("rect")
    .attr("fill", "url(#oceanic)")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
  viewContext.oceanLayers
    .append("rect")
    .attr("id", "oceanBase")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", graphWidth)
    .attr("height", graphHeight);
}

/**
 * Re-selects all host SVG layers from the DOM after a saved map SVG is loaded,
 * then updates viewContext in-place so all existing references stay valid.
 */
export function reinitializeMapLayers(): void {
  const svg = d3.select<SVGSVGElement, unknown>("#map") as unknown as Selection<
    SVGSVGElement,
    unknown,
    null,
    undefined
  >;
  const defs = svg.select("#deftemp") as Selection<SVGDefsElement, unknown, null, undefined>;
  const viewbox = svg.select("#viewbox") as Selection<SVGGElement, unknown, null, undefined>;
  const scaleBar = svg.select("#scaleBar") as Selection<SVGGElement, unknown, null, undefined>;
  const legend = svg.select("#legend") as Selection<SVGGElement, unknown, null, undefined>;
  const ocean = viewbox.select("#ocean") as Selection<SVGGElement, unknown, null, undefined>;
  const oceanLayers = ocean.select("#oceanLayers") as Selection<SVGGElement, unknown, null, undefined>;
  const oceanPattern = ocean.select("#oceanPattern") as Selection<SVGGElement, unknown, null, undefined>;
  const lakes = viewbox.select("#lakes") as Selection<SVGGElement, unknown, null, undefined>;
  const landmass = viewbox.select("#landmass") as Selection<SVGGElement, unknown, null, undefined>;
  const texture = viewbox.select("#texture") as Selection<SVGGElement, unknown, null, undefined>;
  const terrs = viewbox.select("#terrs") as Selection<SVGGElement, unknown, null, undefined>;
  const biomes = viewbox.select("#biomes") as Selection<SVGGElement, unknown, null, undefined>;
  const ice = viewbox.select("#ice") as Selection<SVGGElement, unknown, null, undefined>;
  const cells = viewbox.select("#cells") as Selection<SVGGElement, unknown, null, undefined>;
  const gridOverlay = viewbox.select("#gridOverlay") as Selection<SVGGElement, unknown, null, undefined>;
  const coordinates = viewbox.select("#coordinates") as Selection<SVGGElement, unknown, null, undefined>;
  const compass = viewbox.select("#compass") as Selection<SVGGElement, unknown, null, undefined>;
  const rivers = viewbox.select("#rivers") as Selection<SVGGElement, unknown, null, undefined>;
  const terrain = viewbox.select("#terrain") as Selection<SVGGElement, unknown, null, undefined>;
  const relig = viewbox.select("#relig") as Selection<SVGGElement, unknown, null, undefined>;
  const cults = viewbox.select("#cults") as Selection<SVGGElement, unknown, null, undefined>;
  const regions = viewbox.select("#regions") as Selection<SVGGElement, unknown, null, undefined>;
  const statesBody = regions.select("#statesBody") as Selection<SVGGElement, unknown, null, undefined>;
  const statesHalo = regions.select("#statesHalo") as Selection<SVGGElement, unknown, null, undefined>;
  const provs = viewbox.select("#provs") as Selection<SVGGElement, unknown, null, undefined>;
  const zones = viewbox.select("#zones") as Selection<SVGGElement, unknown, null, undefined>;
  const borders = viewbox.select("#borders") as Selection<SVGGElement, unknown, null, undefined>;
  const stateBorders = borders.select("#stateBorders") as Selection<SVGGElement, unknown, null, undefined>;
  const provinceBorders = borders.select("#provinceBorders") as Selection<SVGGElement, unknown, null, undefined>;
  const routes = viewbox.select("#routes") as Selection<SVGGElement, unknown, null, undefined>;
  const roads = routes.select("#roads") as Selection<SVGGElement, unknown, null, undefined>;
  const trails = routes.select("#trails") as Selection<SVGGElement, unknown, null, undefined>;
  const searoutes = routes.select("#searoutes") as Selection<SVGGElement, unknown, null, undefined>;
  const temperature = viewbox.select("#temperature") as Selection<SVGGElement, unknown, null, undefined>;
  const coastline = viewbox.select("#coastline") as Selection<SVGGElement, unknown, null, undefined>;
  const prec = viewbox.select("#prec") as Selection<SVGGElement, unknown, null, undefined>;
  const population = viewbox.select("#population") as Selection<SVGGElement, unknown, null, undefined>;
  const emblems = viewbox.select("#emblems") as Selection<SVGGElement, unknown, null, undefined>;
  const labels = viewbox.select("#labels") as Selection<SVGGElement, unknown, null, undefined>;
  const icons = viewbox.select("#icons") as Selection<SVGGElement, unknown, null, undefined>;
  const burgIcons = icons.select("#burgIcons") as Selection<SVGGElement, unknown, null, undefined>;
  const anchors = icons.select("#anchors") as Selection<SVGGElement, unknown, null, undefined>;
  const armies = viewbox.select("#armies") as Selection<SVGGElement, unknown, null, undefined>;
  const markers = viewbox.select("#markers") as Selection<SVGGElement, unknown, null, undefined>;

  // Pre-1.125.x saves used #markets; rename in-place so subsequent saves use the new id.
  // The economy extension's reinit hook will re-acquire #marketsLayer after this rename.
  if (!viewbox.select("#marketsLayer").size()) {
    viewbox.select<SVGGElement>("#markets").attr("id", "marketsLayer");
  }

  const ruler = viewbox.select("#ruler") as Selection<SVGGElement, unknown, null, undefined>;
  const fogging = viewbox.select("#fogging") as Selection<SVGGElement, unknown, null, undefined>;
  const debug = viewbox.select("#debug") as Selection<SVGGElement, unknown, null, undefined>;
  const burgLabels = labels.select("#burgLabels") as Selection<SVGGElement, unknown, null, undefined>;

  Object.assign(viewContext, {
    svg,
    defs,
    viewbox,
    scaleBar,
    legend,
    ocean,
    oceanLayers,
    oceanPattern,
    landmass,
    texture,
    terrs,
    lakes,
    biomes,
    cells,
    gridOverlay,
    coordinates,
    compass,
    rivers,
    terrain,
    relig,
    cults,
    regions,
    statesBody,
    statesHalo,
    provs,
    zones,
    borders,
    stateBorders,
    provinceBorders,
    routes,
    roads,
    trails,
    searoutes,
    temperature,
    coastline,
    ice,
    prec,
    population,
    emblems,
    icons,
    labels,
    burgLabels,
    burgIcons,
    anchors,
    armies,
    markers,
    fogging,
    ruler,
    debug
  });

  document.dispatchEvent(new CustomEvent("fmg:map-layers-reinitialized"));
}
