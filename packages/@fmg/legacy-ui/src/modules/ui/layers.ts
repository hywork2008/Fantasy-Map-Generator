// UI module stub to control map layers
"use strict";

import { drawRiversRenderer } from "@fmg/rivers/renderer";
import { drawStatesRenderer } from "@fmg/states/renderer";
import { drawProvincesRenderer } from "@fmg/states/provinces-renderer";
import { drawBurgIconsRenderer } from "@fmg/burgs/renderer";
import * as d3 from "d3";
import { bordersRenderer } from "#renderers/draw-borders";
import { emblemsRenderer } from "#renderers/draw-emblems";
import { featuresRenderer } from "#renderers/draw-features";
import { heightmapRenderer } from "#renderers/draw-heightmap";
import { iceRenderer } from "#renderers/draw-ice";
import { markersRenderer } from "#renderers/draw-markers";
import { militaryRenderer } from "#renderers/draw-military";
import { reliefIconsRenderer } from "#renderers/draw-relief-icons";
import { temperatureRenderer } from "#renderers/draw-temperature";
import { calculateFriendlyGridSize, editStyle } from "./style";
import {
  drawCoordinatesRenderer,
  drawBiomesRenderer,
  drawCulturesRenderer,
  drawLabelsRenderer,
  drawReligionsRenderer,
  drawGridRenderer,
  drawPopulationRenderer,
  drawPrecipitationRenderer,
  drawTextureRenderer,
  drawRouteRenderer,
  drawRoutesRenderer,
  drawZonesRenderer
} from "./layer-renderers";
import { tip } from "./general";
import { getFmg } from "../runtime/get-fmg";

/// <reference path="../../types/ui-legacy-globals.d.ts" />

declare const getPackPolygon: (...args: any[]) => any;

let presets = {}; // global object
let threeDLayerUpdateTimer: number | null = null;
let threeDLayerTrailingUpdateTimer: number | null = null;
restoreCustomPresets(); // run on-load

function requestThreeDLayerRefresh() {
  if (!document.getElementById("canvas3d")) return;

  function updateThreeDIfAvailable() {
    try {
      const f = getFmg();
      if (f && typeof f.update3d === "function") return f.update3d();
      const w = (window as any).ThreeD;
      if (w && typeof w.update === "function") return w.update();
      // dynamic import as a last resort (avoids static circular import)
      import("./3d")
        .then(m => m?.ThreeD?.update && m.ThreeD.update())
        .catch(() => {});
    } catch (err) {
      // ignore
    }
  }

  if (threeDLayerUpdateTimer !== null) window.clearTimeout(threeDLayerUpdateTimer);
  threeDLayerUpdateTimer = window.setTimeout(() => {
    threeDLayerUpdateTimer = null;
    if (document.getElementById("canvas3d")) updateThreeDIfAvailable();
  }, 220);

  // Some layers are toggled with fade / transition animations, so run one more
  // update after animations likely settled to keep 3D views in sync.
  if (threeDLayerTrailingUpdateTimer !== null) window.clearTimeout(threeDLayerTrailingUpdateTimer);
  threeDLayerTrailingUpdateTimer = window.setTimeout(() => {
    threeDLayerTrailingUpdateTimer = null;
    if (document.getElementById("canvas3d")) updateThreeDIfAvailable();
  }, 1100);
}

function getDefaultPresets() {
  return {
    political: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleIce",
      "toggleLabels",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    cultural: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleCultures",
      "toggleLabels",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    religions: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLabels",
      "toggleLakes",
      "toggleReligions",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    provinces: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLakes",
      "toggleProvinces",
      "toggleRivers",
      "toggleScaleBar",
      "toggleVignette"
    ],
    biomes: ["toggleBiomes", "toggleIce", "toggleLakes", "toggleRivers", "toggleScaleBar", "toggleVignette"],
    heightmap: ["toggleHeight", "toggleLakes", "toggleRivers", "toggleVignette"],
    physical: ["toggleCoordinates", "toggleHeight", "toggleIce", "toggleLakes", "toggleRivers", "toggleScaleBar", "toggleVignette"],
    poi: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleHeight",
      "toggleIce",
      "toggleLakes",
      "toggleMarkers",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    military: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLabels",
      "toggleLakes",
      "toggleMilitary",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    emblems: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleIce",
      "toggleEmblems",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    landmass: ["toggleScaleBar"]
  };
}

function restoreCustomPresets() {
  presets = getDefaultPresets();
  const storedPresets = JSON.parse(localStorage.getItem("presets"));
  if (!storedPresets) return;

  for (const preset in storedPresets) {
    if (presets[preset]) continue;
    layersPreset.add(new Option(preset, preset));
  }

  presets = storedPresets;
}

// run on map generation
export function applyLayersPreset() {
  const preset = localStorage.getItem("preset") || ensureEl("layersPreset").value;
  setLayersPreset(preset);

  const layers = presets[preset]; // layers to be turned on
  document.querySelectorAll("#mapLayers > li").forEach(el => {
    const shouldBeOn = layers.includes(el.id);
    if (shouldBeOn) el.classList.remove("buttonoff");
    else el.classList.add("buttonoff");
  });
}

function setLayersPreset(preset) {
  ensureEl("layersPreset").value = preset;
  localStorage.setItem("preset", preset);

  const isDefault = getDefaultPresets()[preset];
  ensureEl("removePresetButton").style.display = isDefault ? "none" : "inline-block";
  ensureEl("savePresetButton").style.display = "none";
}

// toggle layers on manual preset change
export function handleLayersPresetChange(preset) {
  setLayersPreset(preset);

  const layers = presets[preset]; // layers to be turned on
  document.querySelectorAll<HTMLElement>("#mapLayers > li").forEach(el => {
    const isOn = layerIsOn(el.id);
    const shouldBeOn = layers.includes(el.id);
    if (shouldBeOn && !isOn) el.click();
    if (isOn && !shouldBeOn) el.click();
  });

  requestThreeDLayerRefresh();
}

export function savePreset() {
  (window as any).prompt("Please provide a preset name", {default: ""}, (preset: string) => {
    presets[preset] = Array.from((ensureEl("mapLayers") as HTMLElement).querySelectorAll<HTMLElement>("li:not(.buttonoff)"))
      .map(node => node.id)
      .sort();
    layersPreset.add(new Option(preset, preset, false, true));
    localStorage.setItem("presets", JSON.stringify(presets));
    localStorage.setItem("preset", preset);
    removePresetButton.style.display = "inline-block";
    savePresetButton.style.display = "none";
  });
}

export function removePreset() {
  const preset = layersPreset.value;
  delete presets[preset];
  const index = Array.from(layersPreset.options as HTMLOptionsCollection).findIndex(
    (o: HTMLOptionElement) => o.value === preset
  );
  layersPreset.options.remove(index);
  layersPreset.value = "custom";
  removePresetButton.style.display = "none";
  savePresetButton.style.display = "inline-block";

  localStorage.setItem("presets", JSON.stringify(presets));
  localStorage.removeItem("preset");
}

export function getCurrentPreset() {
  const layers = Array.from(document.querySelectorAll("#mapLayers > li:not(.buttonoff)"))
    .map(node => node.id)
    .sort();

  for (const preset in presets) {
    if (JSON.stringify(presets[preset].sort()) === JSON.stringify(layers)) {
      layersPreset.value = preset;
      const isDefault = getDefaultPresets()[preset];
      removePresetButton.style.display = isDefault ? "none" : "inline-block";
      savePresetButton.style.display = "none";
      return;
    }
  }

  layersPreset.value = "custom";
  removePresetButton.style.display = "none";
  savePresetButton.style.display = "inline-block";
}

// run on each map generation
export function drawLayers() {
  featuresRenderer();
  if (layerIsOn("toggleTexture")) drawTexture();
  if (layerIsOn("toggleHeight")) heightmapRenderer();
  if (layerIsOn("toggleBiomes")) drawBiomes();
  if (layerIsOn("toggleCells")) drawCells();
  if (layerIsOn("toggleGrid")) drawGrid();
  if (layerIsOn("toggleCoordinates")) drawCoordinates();
  if (layerIsOn("toggleCompass")) compass.style("display", "block");
  if (layerIsOn("toggleRivers")) drawRivers();
  if (layerIsOn("toggleRelief")) reliefIconsRenderer();
  if (layerIsOn("toggleReligions")) drawReligions();
  if (layerIsOn("toggleCultures")) drawCultures();
  if (layerIsOn("toggleStates")) drawStates();
  if (layerIsOn("toggleProvinces")) drawProvinces();
  if (layerIsOn("toggleZones")) drawZones();
  if (layerIsOn("toggleBorders")) bordersRenderer();
  if (layerIsOn("toggleRoutes")) drawRoutes();
  if (layerIsOn("toggleTemperature")) temperatureRenderer();
  if (layerIsOn("togglePopulation")) drawPopulation();
  if (layerIsOn("toggleIce")) iceRenderer();
  if (layerIsOn("togglePrecipitation")) drawPrecipitation();
  if (layerIsOn("toggleEmblems")) emblemsRenderer();
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) drawBurgIconsRenderer();
  if (layerIsOn("toggleMilitary")) militaryRenderer();
  if (layerIsOn("toggleMarkers")) markersRenderer();
  if (layerIsOn("toggleRulers")) rulers.draw();
  // scale bar
  // vignette
}

export function toggleHeight(event?) {
  if (customization === 1) return tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");

  const children = terrs.selectAll("#oceanHeights > *, #landHeights > *");
  if (!children.size()) {
    turnButtonOn("toggleHeight");
    heightmapRenderer();
    if (event && isCtrlClick(event)) editStyle("terrs");
  } else {
    if (event && isCtrlClick(event)) return editStyle("terrs");
    turnButtonOff("toggleHeight");
    children.remove();
  }
}

export function toggleTemperature(event?) {
  if (!temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    temperatureRenderer();
    if (event && isCtrlClick(event)) editStyle("temperature");
  } else {
    if (event && isCtrlClick(event)) return editStyle("temperature");
    turnButtonOff("toggleTemperature");
    temperature.selectAll("*").remove();
  }
}

export function toggleBiomes(event?) {
  if (!biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    drawBiomes();
    if (event && isCtrlClick(event)) editStyle("biomes");
  } else {
    if (event && isCtrlClick(event)) return editStyle("biomes");
    biomes.selectAll("path").remove();
    turnButtonOff("toggleBiomes");
  }
}

export function drawBiomes() {
  drawBiomesRenderer();
}

export function togglePrecipitation(event?) {
  if (!prec.selectAll("circle").size()) {
    turnButtonOn("togglePrecipitation");
    drawPrecipitation();
    if (event && isCtrlClick(event)) editStyle("prec");
  } else {
    if (event && isCtrlClick(event)) return editStyle("prec");
    turnButtonOff("togglePrecipitation");
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    prec.selectAll("text").attr("opacity", 1).transition(hide).attr("opacity", 0);
    prec.selectAll("circle").transition(hide).attr("r", 0).remove();
    prec.transition().delay(1000).style("display", "none");
  }
}

function drawPrecipitation() {
  drawPrecipitationRenderer();
}

export function togglePopulation(event?) {
  if (!population.selectAll("line").size()) {
    turnButtonOn("togglePopulation");
    drawPopulation();
    if (event && isCtrlClick(event)) editStyle("population");
  } else {
    if (event && isCtrlClick(event)) return editStyle("population");
    turnButtonOff("togglePopulation");

    const isD3data = population.select("line").datum();
    if (!isD3data) {
      // just remove
      population.selectAll("line").remove();
    } else {
      // remove with animation
      const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
      population
        .select("#rural")
        .selectAll("line")
        .transition(hide)
        .attr("y2", d => d[1])
        .remove();
      population
        .select("#urban")
        .selectAll("line")
        .transition(hide)
        .delay(1000)
        .attr("y2", d => d[1])
        .remove();
    }
  }
}

export function drawPopulation() {
  drawPopulationRenderer();
}

export function toggleCells(event?) {
  if (!cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    drawCells();
    if (event && isCtrlClick(event)) editStyle("cells");
  } else {
    if (event && isCtrlClick(event)) return editStyle("cells");
    cells.selectAll("path").remove();
    turnButtonOff("toggleCells");
  }
}

function drawCells() {
  const cells = customization === 1 ? grid.cells.i : pack.cells.i;
  const polygon = customization === 1 ? getGridPolygon : getPackPolygon;
  const paths = Array.from(cells).map(i => "M" + polygon(i));
  ensureEl("cells").innerHTML = `<path d="${paths.join("")}" />`;
}

export function toggleIce(event?) {
  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    $("#ice").fadeIn();
    if (!ice.selectAll("*").size()) iceRenderer();
    if (event && isCtrlClick(event)) editStyle("ice");
  } else {
    if (event && isCtrlClick(event)) return editStyle("ice");
    $("#ice").fadeOut();
    turnButtonOff("toggleIce");
  }
}

export function toggleCultures(event?) {
  const cultures = pack.cultures.filter(c => c.i && !c.removed);
  const empty = !cults.selectAll("path").size();
  if (empty && cultures.length) {
    turnButtonOn("toggleCultures");
    drawCultures();
    if (event && isCtrlClick(event)) editStyle("cults");
  } else {
    if (event && isCtrlClick(event)) return editStyle("cults");
    cults.selectAll("path").remove();
    turnButtonOff("toggleCultures");
  }
}

export function drawCultures() {
  drawCulturesRenderer();
}

export function toggleReligions(event?) {
  const religions = pack.religions.filter(r => r.i && !r.removed);
  if (!relig.selectAll("path").size() && religions.length) {
    turnButtonOn("toggleReligions");
    drawReligions();
    if (event && isCtrlClick(event)) editStyle("relig");
  } else {
    if (event && isCtrlClick(event)) return editStyle("relig");
    relig.selectAll("path").remove();
    turnButtonOff("toggleReligions");
  }
}

export function drawReligions() {
  drawReligionsRenderer();
}

export function toggleStates(event?) {
  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    drawStates();
    if (event && isCtrlClick(event)) editStyle("regions");
  } else {
    if (event && isCtrlClick(event)) return editStyle("regions");
    regions.selectAll("path").remove();
    turnButtonOff("toggleStates");
  }
}

export function drawStates() {
  drawStatesRenderer();
}

export function toggleBorders(event?) {
  if (!layerIsOn("toggleBorders")) {
    turnButtonOn("toggleBorders");
    bordersRenderer();
    if (event && isCtrlClick(event)) editStyle("borders");
  } else {
    if (event && isCtrlClick(event)) return editStyle("borders");
    turnButtonOff("toggleBorders");
    borders.selectAll("path").remove();
  }
}

export function toggleProvinces(event?) {
  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    drawProvinces();
    if (event && isCtrlClick(event)) editStyle("provs");
  } else {
    if (event && isCtrlClick(event)) return editStyle("provs");
    provs.selectAll("*").remove();
    turnButtonOff("toggleProvinces");
  }
}

export function drawProvinces() {
  drawProvincesRenderer();
}

export function toggleGrid(event?) {
  if (!gridOverlay.selectAll("*").size()) {
    turnButtonOn("toggleGrid");
    drawGrid();
    calculateFriendlyGridSize();
    if (event && isCtrlClick(event)) editStyle("gridOverlay");
  } else {
    if (event && isCtrlClick(event)) return editStyle("gridOverlay");
    turnButtonOff("toggleGrid");
    gridOverlay.selectAll("*").remove();
  }
}

export function drawGrid() {
  drawGridRenderer();
}

export function toggleCoordinates(event?) {
  if (!coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    drawCoordinates();
    if (event && isCtrlClick(event)) editStyle("coordinates");
  } else {
    if (event && isCtrlClick(event)) return editStyle("coordinates");
    turnButtonOff("toggleCoordinates");
    coordinates.selectAll("*").remove();
  }
}

function drawCoordinates() {
  drawCoordinatesRenderer();
}

export function toggleCompass(event?) {
  if (!layerIsOn("toggleCompass")) {
    turnButtonOn("toggleCompass");
    $("#compass").fadeIn();
    if (event && isCtrlClick(event)) editStyle("compass");
  } else {
    if (event && isCtrlClick(event)) return editStyle("compass");
    $("#compass").fadeOut();
    turnButtonOff("toggleCompass");
  }
}

export function toggleRelief(event?) {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!d3.select("#terrain").selectAll("*").size()) reliefIconsRenderer();
    $("#terrain").fadeIn();
    if (event && isCtrlClick(event)) editStyle("terrain");
  } else {
    if (event && isCtrlClick(event)) return editStyle("terrain");
    $("#terrain").fadeOut();
    turnButtonOff("toggleRelief");
  }
}

export function toggleLakes(event?) {
  if (!layerIsOn("toggleLakes")) {
    turnButtonOn("toggleLakes");
    $("#lakes").fadeIn();
    if (event && isCtrlClick(event)) editStyle("lakes");
  } else {
    if (event && isCtrlClick(event)) return editStyle("lakes");
    $("#lakes").fadeOut();
    turnButtonOff("toggleLakes");
  }
}

export function toggleTexture(event?) {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    drawTexture();
    if (event && isCtrlClick(event)) editStyle("texture");
  } else {
    if (event && isCtrlClick(event)) return editStyle("texture");
    turnButtonOff("toggleTexture");
    texture.select("image").remove();
  }
}

export function drawTexture() {
  drawTextureRenderer();
}

export function toggleRivers(event?) {
  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    drawRivers();
    if (event && isCtrlClick(event)) editStyle("rivers");
  } else {
    if (event && isCtrlClick(event)) return editStyle("rivers");
    rivers.selectAll("*").remove();
    turnButtonOff("toggleRivers");
  }
}

export function drawRivers() {
  drawRiversRenderer();
}

export function toggleRoutes(event?) {
  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    drawRoutes();
    if (event && isCtrlClick(event)) editStyle("routes");
  } else {
    if (event && isCtrlClick(event)) return editStyle("routes");
    routes.selectAll("path").remove();
    turnButtonOff("toggleRoutes");
  }
}

export function drawRoutes() {
  drawRoutesRenderer();
}

export function drawRoute(route) {
  drawRouteRenderer(route);
}

export function toggleMilitary(event?) {
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    militaryRenderer();
    if (event && isCtrlClick(event)) editStyle("armies");
  } else {
    if (event && isCtrlClick(event)) return editStyle("armies");
    d3.select("#armies").selectAll("g").remove();
    turnButtonOff("toggleMilitary");
  }
}

export function toggleMarkers(event?) {
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    markersRenderer();
    if (event && isCtrlClick(event)) editStyle("markers");
  } else {
    if (event && isCtrlClick(event)) return editStyle("markers");
    markers.html("");
    turnButtonOff("toggleMarkers");
  }
}

export function toggleLabels(event?) {
  if (!layerIsOn("toggleLabels")) {
    turnButtonOn("toggleLabels");
    $("#labels").fadeIn();
    // don't redraw labels as they are not stored in data yet
    if (labels.selectAll("text").size() === 0) drawLabels();
    if (event && isCtrlClick(event)) editStyle("labels");
  } else {
    if (event && isCtrlClick(event)) return editStyle("labels");
    turnButtonOff("toggleLabels");
    $("#labels").fadeOut();
  }
}

function drawLabels() {
  drawLabelsRenderer();
}

export function toggleBurgIcons(event?) {
  if (!layerIsOn("toggleBurgIcons")) {
    turnButtonOn("toggleBurgIcons");
    drawBurgIconsRenderer();
    if (event && isCtrlClick(event)) editStyle("burgIcons");
  } else {
    if (event && isCtrlClick(event)) return editStyle("burgIcons");
    turnButtonOff("toggleBurgIcons");
    icons.selectAll("circle, use").remove();
  }
}

export function toggleRulers(event?) {
  if (!layerIsOn("toggleRulers")) {
    turnButtonOn("toggleRulers");
    if (event && isCtrlClick(event)) editStyle("ruler");
    rulers.draw();
    ruler.style("display", null);
  } else {
    if (event && isCtrlClick(event)) return editStyle("ruler");
    turnButtonOff("toggleRulers");
    ruler.selectAll("*").remove();
    ruler.style("display", "none");
  }
}

export function toggleScaleBar(event?) {
  if (!layerIsOn("toggleScaleBar")) {
    turnButtonOn("toggleScaleBar");
    $("#scaleBar").fadeIn();
    if (event && isCtrlClick(event)) editStyle("scaleBar");
  } else {
    if (event && isCtrlClick(event)) return editStyle("scaleBar");
    $("#scaleBar").fadeOut();
    turnButtonOff("toggleScaleBar");
  }
}

export function toggleZones(event?) {
  if (!layerIsOn("toggleZones")) {
    turnButtonOn("toggleZones");
    drawZones();
    if (event && isCtrlClick(event)) editStyle("zones");
  } else {
    if (event && isCtrlClick(event)) return editStyle("zones");
    turnButtonOff("toggleZones");
    d3.select("#zones").selectAll("*").remove();
  }
}

export function drawZones() {
  drawZonesRenderer();
}

export function toggleEmblems(event?) {
  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!emblems.selectAll("use").size()) emblemsRenderer();
    $("#emblems").fadeIn();
    getFmg()?.invokeActiveZooming?.();
    if (event && isCtrlClick(event)) editStyle("emblems");
  } else {
    if (event && isCtrlClick(event)) return editStyle("emblems");
    $("#emblems").fadeOut();
    turnButtonOff("toggleEmblems");
  }
}

export function toggleVignette(event?) {
  if (!layerIsOn("toggleVignette")) {
    turnButtonOn("toggleVignette");
    $("#vignette").fadeIn();
    if (event && isCtrlClick(event)) editStyle("vignette");
  } else {
    if (event && isCtrlClick(event)) return editStyle("vignette");
    $("#vignette").fadeOut();
    turnButtonOff("toggleVignette");
  }
}

export function layerIsOn(el) {
  return ensureEl(el).classList.contains("buttonoff") ? false : true;
}

export function turnButtonOff(el) {
  ensureEl(el).classList.add("buttonoff");
  getCurrentPreset();
  requestThreeDLayerRefresh();
  // If 3D canvas is not present (standard view), ensure SVG layers are redrawn immediately
  if (!document.getElementById("canvas3d")) {
    // schedule to next tick so DOM updates (classes/display) are applied
    window.setTimeout(() => {
      try {
        drawLayers();
      } catch (err) {
        // silent: drawLayers may not be available in some runtimes
      }
    }, 0);
  }
}

export function turnButtonOn(el) {
  ensureEl(el).classList.remove("buttonoff");
  getCurrentPreset();
  requestThreeDLayerRefresh();
  // If 3D canvas is not present (standard view), ensure SVG layers are redrawn immediately
  if (!document.getElementById("canvas3d")) {
    window.setTimeout(() => {
      try {
        drawLayers();
      } catch (err) {
        // ignore
      }
    }, 0);
  }
}

// move layers on mapLayers dragging (jquery sortable)
$("#mapLayers").sortable({items: "li:not(.solid)", containment: "parent", cancel: ".solid", update: moveLayer});
function moveLayer(event, ui) {
  const el = getLayer(ui.item.attr("id"));
  if (!el) return;
  const prev = getLayer(ui.item.prev().attr("id"));
  const next = getLayer(ui.item.next().attr("id"));
  if (prev) el.insertAfter(prev);
  else if (next) el.insertBefore(next);

  requestThreeDLayerRefresh();
  if (!document.getElementById("canvas3d")) {
    window.setTimeout(() => {
      try {
        drawLayers();
      } catch (err) {}
    }, 0);
  }
}

// define connection between option layer buttons and actual svg groups to move the element
function getLayer(id) {
  if (id === "toggleLakes") return $("#lakes");
  if (id === "toggleHeight") return $("#terrs");
  if (id === "toggleBiomes") return $("#biomes");
  if (id === "toggleCells") return $("#cells");
  if (id === "toggleGrid") return $("#gridOverlay");
  if (id === "toggleCoordinates") return $("#coordinates");
  if (id === "toggleCompass") return $("#compass");
  if (id === "toggleRivers") return $("#rivers");
  if (id === "toggleRelief") return $("#terrain");
  if (id === "toggleReligions") return $("#relig");
  if (id === "toggleCultures") return $("#cults");
  if (id === "toggleStates") return $("#regions");
  if (id === "toggleProvinces") return $("#provs");
  if (id === "toggleBorders") return $("#borders");
  if (id === "toggleRoutes") return $("#routes");
  if (id === "toggleTemperature") return $("#temperature");
  if (id === "togglePrecipitation") return $("#prec");
  if (id === "togglePopulation") return $("#population");
  if (id === "toggleIce") return $("#ice");
  if (id === "toggleTexture") return $("#texture");
  if (id === "toggleEmblems") return $("#emblems");
  if (id === "toggleLabels") return $("#labels");
  if (id === "toggleBurgIcons") return $("#icons");
  if (id === "toggleMarkers") return $("#markers");
  if (id === "toggleRulers") return $("#ruler");
}

