import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  drawBiomes,
  drawBorders,
  drawBurgIcons,
  drawBurgLabels,
  drawCells,
  drawCoordinates,
  drawCultures,
  drawEmblems,
  drawFeatures,
  drawGrid,
  drawHeightmap,
  drawIce,
  drawMarkers,
  drawMilitary,
  drawPopulation,
  drawPrecipitation,
  drawProvinces,
  drawReliefIcons,
  drawReligions,
  drawRivers,
  drawRoutes,
  drawStateLabels,
  drawStates,
  drawTemperature,
  drawTexture,
  drawZones
} from "../renderers";
import { isCtrlClick, showPrompt } from "../utils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

// Layer presets: map preset name → list of toggle button IDs that should be ON
let presets: Record<string, string[]> = {};

import { DEFAULT_LAYERS, useLayerState } from "../store/layerState";

export function initLayers(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices): void {
  worldContext = wc;
  viewContext = vc;
  appServices = as;

  // Initialize default layers if not set
  if (useLayerState.getState().layers.length === 0) {
    useLayerState.getState().setLayers(DEFAULT_LAYERS);
  }

  restoreCustomPresets();
  // initSortable is removed as React handles DND
}

// ─── Preset management ───────────────────────────────────────────────────────

function getDefaultPresets(): Record<string, string[]> {
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
    physical: [
      "toggleCoordinates",
      "toggleHeight",
      "toggleIce",
      "toggleLakes",
      "toggleRivers",
      "toggleScaleBar",
      "toggleVignette"
    ],
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

function restoreCustomPresets(): void {
  presets = getDefaultPresets();
  const stored = localStorage.getItem("presets");
  const storedPresets: Record<string, string[]> | null = stored ? JSON.parse(stored) : null;
  if (!storedPresets) {
    useLayerState.getState().setPresets(presets);
    return;
  }

  for (const preset in storedPresets) {
    if (!presets[preset]) presets[preset] = storedPresets[preset];
  }
  useLayerState.getState().setPresets(presets);
}

function applyLayersPreset(): void {
  const layerState = useLayerState.getState();
  const preset = localStorage.getItem("preset") || layerState.activePreset;
  setLayersPreset(preset);

  const layers = layerState.presets[preset] ?? [];
  const nextActiveLayers: Record<string, boolean> = { ...layerState.activeLayers };

  layerState.layers.forEach(l => {
    nextActiveLayers[l.id] = layers.includes(l.id);
  });
  layerState.setAllActiveLayers(nextActiveLayers);
}

function setLayersPreset(preset: string): void {
  useLayerState.getState().setActivePreset(preset);
  localStorage.setItem("preset", preset);
}

function handleLayersPresetChange(preset: string): void {
  setLayersPreset(preset);

  const layerState = useLayerState.getState();
  const layers = layerState.presets[preset] ?? [];

  // Toggle actual SVG rendering logic (legacy layer drawing still triggers via window functions)
  layerState.layers.forEach(l => {
    const isOn = layerState.activeLayers[l.id];
    const shouldBeOn = layers.includes(l.id);
    if (shouldBeOn && !isOn) {
      const fn = window[l.id];
      if (typeof fn === "function") (fn as () => void)();
    }
    if (isOn && !shouldBeOn) {
      const fn = window[l.id];
      if (typeof fn === "function") (fn as () => void)();
    }
  });

  if (document.getElementById("canvas3d")) setTimeout(() => ThreeD.update(), 400);
}

function savePreset(): void {
  showPrompt("Please provide a preset name", { default: "" }, value => {
    const preset = String(value);
    const state = useLayerState.getState();
    const newPresets = { ...state.presets };
    newPresets[preset] = state.layers
      .filter(l => state.activeLayers[l.id])
      .map(l => l.id)
      .sort();

    state.setPresets(newPresets);
    state.setActivePreset(preset);

    localStorage.setItem("presets", JSON.stringify(newPresets));
    localStorage.setItem("preset", preset);
  });
}

function removePreset(): void {
  const state = useLayerState.getState();
  const preset = state.activePreset;
  const newPresets = { ...state.presets };
  delete newPresets[preset];

  state.setPresets(newPresets);
  state.setActivePreset("custom");

  localStorage.setItem("presets", JSON.stringify(newPresets));
  localStorage.removeItem("preset");
}

function getCurrentPreset(): void {
  const state = useLayerState.getState();
  const layers = state.layers
    .filter(l => state.activeLayers[l.id])
    .map(l => l.id)
    .sort();

  for (const preset in state.presets) {
    if (JSON.stringify(state.presets[preset].sort()) === JSON.stringify(layers)) {
      state.setActivePreset(preset);
      return;
    }
  }

  state.setActivePreset("custom");
}

// ─── Layer orchestration ──────────────────────────────────────────────────────

function drawLayers(): void {
  drawFeatures(worldContext, viewContext, appServices);
  if (layerIsOn("toggleTexture")) drawTexture(worldContext, viewContext, appServices);
  if (layerIsOn("toggleHeight")) drawHeightmap(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) drawBiomes(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCells")) drawCells(worldContext, viewContext, appServices);
  if (layerIsOn("toggleGrid")) drawGrid(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCoordinates")) drawCoordinates(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCompass")) {
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    compass.style("display", "block");
  }
  if (layerIsOn("toggleRivers")) drawRivers(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRelief")) drawReliefIcons(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) drawReligions(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCultures")) drawCultures(worldContext, viewContext, appServices);
  if (layerIsOn("toggleStates")) drawStates(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) drawProvinces(worldContext, viewContext, appServices);
  if (layerIsOn("toggleZones")) drawZones(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRoutes")) drawRoutes(worldContext, viewContext, appServices);
  if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  if (layerIsOn("togglePopulation")) drawPopulation(worldContext, viewContext, appServices);
  if (layerIsOn("toggleIce")) drawIce(worldContext, viewContext, appServices);
  if (layerIsOn("togglePrecipitation")) drawPrecipitation(worldContext, viewContext, appServices);
  if (layerIsOn("toggleEmblems")) drawEmblems(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) drawBurgIcons(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) drawMilitary(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMarkers")) drawMarkers(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRulers")) rulers.draw();
}

function drawLabels(): void {
  drawStateLabels(worldContext, viewContext, appServices);
  drawBurgLabels(worldContext, viewContext, appServices);
  invokeActiveZooming();
}

// ─── Button helpers ───────────────────────────────────────────────────────────

function layerIsOn(el: string): boolean {
  return useLayerState.getState().activeLayers[el] === true;
}

function turnButtonOff(el: string): void {
  useLayerState.getState().toggleLayer(el, false);
  getCurrentPreset();
}

function turnButtonOn(el: string): void {
  useLayerState.getState().toggleLayer(el, true);
  getCurrentPreset();
}

// ─── Toggle functions ─────────────────────────────────────────────────────────

function toggleHeight(event?: MouseEvent): void {
  if (customization === 1) {
    tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");
    return;
  }

  const children = terrs.selectAll("#oceanHeights > *, #landHeights > *");
  if (!children.size()) {
    turnButtonOn("toggleHeight");
    drawHeightmap(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("terrs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("terrs");
      return;
    }
    turnButtonOff("toggleHeight");
    children.remove();
  }
}

function toggleTemperature(event?: MouseEvent): void {
  if (!temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    drawTemperature(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("temperature");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("temperature");
      return;
    }
    turnButtonOff("toggleTemperature");
    temperature.selectAll("*").remove();
  }
}

function toggleBiomes(event?: MouseEvent): void {
  if (!biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    drawBiomes(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("biomes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("biomes");
      return;
    }
    biomes.selectAll("path").remove();
    turnButtonOff("toggleBiomes");
  }
}

function togglePrecipitation(event?: MouseEvent): void {
  if (!prec.selectAll("circle").size()) {
    turnButtonOn("togglePrecipitation");
    drawPrecipitation(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("prec");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("prec");
      return;
    }
    turnButtonOff("togglePrecipitation");
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    prec.selectAll("text").attr("opacity", 1).transition(hide).attr("opacity", 0);
    prec.selectAll("circle").transition(hide).attr("r", 0).remove();
    prec.transition().delay(1000).style("display", "none");
  }
}

function togglePopulation(event?: MouseEvent): void {
  if (!population.selectAll("line").size()) {
    turnButtonOn("togglePopulation");
    drawPopulation(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("population");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("population");
      return;
    }
    turnButtonOff("togglePopulation");

    const isD3data = population.select("line").datum();
    if (!isD3data) {
      population.selectAll("line").remove();
    } else {
      const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
      population
        .select("#rural")
        .selectAll("line")
        .transition(hide)
        .attr("y2", (d: unknown) => (d as [number, number])[1])
        .remove();
      population
        .select("#urban")
        .selectAll("line")
        .transition(hide)
        .delay(1000)
        .attr("y2", (d: unknown) => (d as [number, number])[1])
        .remove();
    }
  }
}

function toggleCells(event?: MouseEvent): void {
  if (!cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    drawCells(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cells");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cells");
      return;
    }
    cells.selectAll("path").remove();
    turnButtonOff("toggleCells");
  }
}

function toggleIce(event?: MouseEvent): void {
  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    d3.select("#ice").style("display", "block");
    if (!ice.selectAll("*").size()) drawIce(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("ice");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ice");
      return;
    }
    d3.select("#ice").style("display", "none");
    turnButtonOff("toggleIce");
  }
}

function toggleCultures(event?: MouseEvent): void {
  const activeCultures = pack.cultures.filter(c => c.i && !c.removed);
  const empty = !cults.selectAll("path").size();
  if (empty && activeCultures.length) {
    turnButtonOn("toggleCultures");
    drawCultures(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cults");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cults");
      return;
    }
    cults.selectAll("path").remove();
    turnButtonOff("toggleCultures");
  }
}

function toggleReligions(event?: MouseEvent): void {
  const activeReligions = pack.religions.filter(r => r.i && !r.removed);
  if (!relig.selectAll("path").size() && activeReligions.length) {
    turnButtonOn("toggleReligions");
    drawReligions(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("relig");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("relig");
      return;
    }
    relig.selectAll("path").remove();
    turnButtonOff("toggleReligions");
  }
}

function toggleStates(event?: MouseEvent): void {
  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    drawStates(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("regions");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("regions");
      return;
    }
    regions.selectAll("path").remove();
    turnButtonOff("toggleStates");
  }
}

function toggleBorders(event?: MouseEvent): void {
  if (!layerIsOn("toggleBorders")) {
    turnButtonOn("toggleBorders");
    drawBorders(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("borders");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("borders");
      return;
    }
    turnButtonOff("toggleBorders");
    borders.selectAll("path").remove();
  }
}

function toggleProvinces(event?: MouseEvent): void {
  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    drawProvinces(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("provs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("provs");
      return;
    }
    provs.selectAll("*").remove();
    turnButtonOff("toggleProvinces");
  }
}

function toggleGrid(event?: MouseEvent): void {
  if (!gridOverlay.selectAll("*").size()) {
    turnButtonOn("toggleGrid");
    drawGrid(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
    if (event && isCtrlClick(event)) editStyle("gridOverlay");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("gridOverlay");
      return;
    }
    turnButtonOff("toggleGrid");
    gridOverlay.selectAll("*").remove();
  }
}

function toggleCoordinates(event?: MouseEvent): void {
  if (!coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    drawCoordinates(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("coordinates");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("coordinates");
      return;
    }
    turnButtonOff("toggleCoordinates");
    coordinates.selectAll("*").remove();
  }
}

function toggleCompass(event?: MouseEvent): void {
  if (!layerIsOn("toggleCompass")) {
    turnButtonOn("toggleCompass");
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    d3.select("#compass").style("display", "block");
    if (event && isCtrlClick(event)) editStyle("compass");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("compass");
      return;
    }
    d3.select("#compass").style("display", "none");
    turnButtonOff("toggleCompass");
  }
}

function toggleRelief(event?: MouseEvent): void {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!terrain.selectAll("*").size()) drawReliefIcons(worldContext, viewContext, appServices);
    d3.select("#terrain").style("display", "block");
    if (event && isCtrlClick(event)) editStyle("terrain");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("terrain");
      return;
    }
    d3.select("#terrain").style("display", "none");
    turnButtonOff("toggleRelief");
  }
}

function toggleLakes(event?: MouseEvent): void {
  if (!layerIsOn("toggleLakes")) {
    turnButtonOn("toggleLakes");
    d3.select("#lakes").style("display", "block");
    if (event && isCtrlClick(event)) editStyle("lakes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("lakes");
      return;
    }
    d3.select("#lakes").style("display", "none");
    turnButtonOff("toggleLakes");
  }
}

function toggleTexture(event?: MouseEvent): void {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    drawTexture(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("texture");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("texture");
      return;
    }
    turnButtonOff("toggleTexture");
    texture.select("image").remove();
  }
}

function toggleRivers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    drawRivers(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("rivers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("rivers");
      return;
    }
    rivers.selectAll("*").remove();
    turnButtonOff("toggleRivers");
  }
}

function toggleRoutes(event?: MouseEvent): void {
  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    drawRoutes(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("routes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("routes");
      return;
    }
    routes.selectAll("path").remove();
    turnButtonOff("toggleRoutes");
  }
}

function toggleMilitary(event?: MouseEvent): void {
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    drawMilitary(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("armies");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("armies");
      return;
    }
    armies.selectAll("g").remove();
    turnButtonOff("toggleMilitary");
  }
}

function toggleMarkers(event?: MouseEvent): void {
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    drawMarkers(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("markers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("markers");
      return;
    }
    markers.html("");
    turnButtonOff("toggleMarkers");
  }
}

function toggleLabels(event?: MouseEvent): void {
  if (!layerIsOn("toggleLabels")) {
    turnButtonOn("toggleLabels");
    d3.select("#labels").style("display", "block");
    if (labels.selectAll("text").size() === 0) drawLabels();
    if (event && isCtrlClick(event)) editStyle("labels");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("labels");
      return;
    }
    turnButtonOff("toggleLabels");
    d3.select("#labels").style("display", "none");
  }
}

function toggleBurgIcons(event?: MouseEvent): void {
  if (!layerIsOn("toggleBurgIcons")) {
    turnButtonOn("toggleBurgIcons");
    drawBurgIcons(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("burgIcons");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("burgIcons");
      return;
    }
    turnButtonOff("toggleBurgIcons");
    icons.selectAll("circle, use").remove();
  }
}

function toggleRulers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRulers")) {
    turnButtonOn("toggleRulers");
    if (event && isCtrlClick(event)) editStyle("ruler");
    rulers.draw();
    ruler.style("display", null);
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ruler");
      return;
    }
    turnButtonOff("toggleRulers");
    ruler.selectAll("*").remove();
    ruler.style("display", "none");
  }
}

function toggleScaleBar(event?: MouseEvent): void {
  if (!layerIsOn("toggleScaleBar")) {
    turnButtonOn("toggleScaleBar");
    d3.select("#scaleBar").style("display", "block");
    if (event && isCtrlClick(event)) editStyle("scaleBar");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("scaleBar");
      return;
    }
    d3.select("#scaleBar").style("display", "none");
    turnButtonOff("toggleScaleBar");
  }
}

function toggleZones(event?: MouseEvent): void {
  if (!layerIsOn("toggleZones")) {
    turnButtonOn("toggleZones");
    drawZones(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("zones");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("zones");
      return;
    }
    turnButtonOff("toggleZones");
    zones.selectAll("*").remove();
  }
}

function toggleEmblems(event?: MouseEvent): void {
  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!emblems.selectAll("use").size()) drawEmblems(worldContext, viewContext, appServices);
    d3.select("#emblems").style("display", "block");
    invokeActiveZooming();
    if (event && isCtrlClick(event)) editStyle("emblems");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("emblems");
      return;
    }
    d3.select("#emblems").style("display", "none");
    turnButtonOff("toggleEmblems");
  }
}

function toggleVignette(event?: MouseEvent): void {
  if (!layerIsOn("toggleVignette")) {
    turnButtonOn("toggleVignette");
    d3.select("#vignette").style("display", "block");
    if (event && isCtrlClick(event)) editStyle("vignette");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("vignette");
      return;
    }
    d3.select("#vignette").style("display", "none");
    turnButtonOff("toggleVignette");
  }
}

// ─── Layer reordering (jQuery UI sortable) ────────────────────────────────────

export function syncSVGLayersOrder(layers: { id: string }[]): void {
  for (let i = 1; i < layers.length; i++) {
    const current = getLayer(layers[i].id);
    const prev = getLayer(layers[i - 1].id);
    if (current && prev && current.parentNode === prev.parentNode) {
      prev.parentNode?.insertBefore(current, prev.nextSibling);
    }
  }
}

function getLayer(id: string): HTMLElement | null {
  if (id === "toggleLakes") return document.getElementById("lakes");
  if (id === "toggleHeight") return document.getElementById("terrs");
  if (id === "toggleBiomes") return document.getElementById("biomes");
  if (id === "toggleCells") return document.getElementById("cells");
  if (id === "toggleGrid") return document.getElementById("gridOverlay");
  if (id === "toggleCoordinates") return document.getElementById("coordinates");
  if (id === "toggleCompass") return document.getElementById("compass");
  if (id === "toggleRivers") return document.getElementById("rivers");
  if (id === "toggleRelief") return document.getElementById("terrain");
  if (id === "toggleReligions") return document.getElementById("relig");
  if (id === "toggleCultures") return document.getElementById("cults");
  if (id === "toggleStates") return document.getElementById("regions");
  if (id === "toggleProvinces") return document.getElementById("provs");
  if (id === "toggleBorders") return document.getElementById("borders");
  if (id === "toggleRoutes") return document.getElementById("routes");
  if (id === "toggleTemperature") return document.getElementById("temperature");
  if (id === "togglePrecipitation") return document.getElementById("prec");
  if (id === "togglePopulation") return document.getElementById("population");
  if (id === "toggleIce") return document.getElementById("ice");
  if (id === "toggleTexture") return document.getElementById("texture");
  if (id === "toggleEmblems") return document.getElementById("emblems");
  if (id === "toggleLabels") return document.getElementById("labels");
  if (id === "toggleBurgIcons") return document.getElementById("icons");
  if (id === "toggleMarkers") return document.getElementById("markers");
  if (id === "toggleRulers") return document.getElementById("ruler");
  return null;
}

// ─── Global exports ───────────────────────────────────────────────────────────

window.layerIsOn = layerIsOn;
window.turnButtonOn = turnButtonOn;
window.turnButtonOff = turnButtonOff;
window.getCurrentPreset = getCurrentPreset;
window.applyLayersPreset = applyLayersPreset;
window.drawLayers = drawLayers;
window.handleLayersPresetChange = handleLayersPresetChange;
window.savePreset = savePreset;
window.removePreset = removePreset;

window.toggleHeight = toggleHeight;
window.toggleTemperature = toggleTemperature;
window.toggleBiomes = toggleBiomes;
window.togglePrecipitation = togglePrecipitation;
window.togglePopulation = togglePopulation;
window.toggleCells = toggleCells;
window.toggleIce = toggleIce;
window.toggleCultures = toggleCultures;
window.toggleReligions = toggleReligions;
window.toggleStates = toggleStates;
window.toggleBorders = toggleBorders;
window.toggleProvinces = toggleProvinces;
window.toggleGrid = toggleGrid;
window.toggleCoordinates = toggleCoordinates;
window.toggleCompass = toggleCompass;
window.toggleRelief = toggleRelief;
window.toggleLakes = toggleLakes;
window.toggleTexture = toggleTexture;
window.toggleRivers = toggleRivers;
window.toggleRoutes = toggleRoutes;
window.toggleMilitary = toggleMilitary;
window.toggleMarkers = toggleMarkers;
window.toggleLabels = toggleLabels;
window.toggleBurgIcons = toggleBurgIcons;
window.toggleRulers = toggleRulers;
window.toggleScaleBar = toggleScaleBar;
window.toggleZones = toggleZones;
window.toggleEmblems = toggleEmblems;
window.toggleVignette = toggleVignette;

// d3 is the UMD global exposed by the legacy <script> tag in index.html
