import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  animatePopulationTurnOff,
  animatePopulationTurnOn,
  animatePrecipitationTurnOff,
  animatePrecipitationTurnOn,
  BiomesRenderer,
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  CellsRenderer,
  CoordinatesRenderer,
  CulturesRenderer,
  DangerRenderer,
  EmblemsRenderer,
  FeaturesRenderer,
  GridRenderer,
  HeightmapRenderer,
  IceRenderer,
  MarkersRenderer,
  MilitaryRenderer,
  PopulationRenderer,
  PrecipitationRenderer,
  ProvincesRenderer,
  ReliefIconsRenderer,
  ReligionsRenderer,
  RiversRenderer,
  RoutesRenderer,
  StateLabelsRenderer,
  StatesRenderer,
  TemperatureLayerRenderer,
  TextureRenderer,
  ZonesRenderer
} from "../renderers";
import { viewLayerService as view } from "../services/viewLayerService";
import { rulers } from "../store/editorState";
import { openPrompt } from "../ui/dialogs/dialogService";
import { isCtrlClick } from "../utils";

let worldContext: WorldContext;
let appServices: AppServices;

// Layer presets: map preset name → list of toggle button IDs that should be ON
let presets: Record<string, string[]> = {};

import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { WEBGL_LAYER_TOGGLES } from "../renderers/webgl/buildDeckLayers";
import { DeckGlRenderer } from "../renderers/webgl/deckRenderer";
import { tip } from "../services/tooltipService";
import { DEFAULT_LAYERS, useLayerState } from "../store/layerState";
import { getElementById, layerIsOn } from "../utils/nodeUtils";

const editStyle = (element: string, group?: string) =>
  document.dispatchEvent(new CustomEvent("fmg:edit-style", { detail: { element, group } }));
const calculateFriendlyGridSize = () => document.dispatchEvent(new CustomEvent("fmg:calculate-friendly-grid-size"));
const HIDDEN_LAYER_CLASS = "fmg-layer-hidden";

function getLayerElementByToggleId(id: string): Element | null {
  if (id === "toggleVignette") return getElementById("vignette");
  return view.getLayerNodeByToggleId(id);
}

function setLayerVisibility(id: string, visible: boolean): void {
  const layer = getLayerElementByToggleId(id);
  if (!layer) return;
  layer.classList.toggle(HIDDEN_LAYER_CLASS, !visible);
  if (visible && (layer instanceof SVGElement || layer instanceof HTMLElement)) layer.style.removeProperty("display");
}

export function initLayers(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices): void {
  worldContext = wc;
  appServices = as;
  precipitationTransitionState = layerIsOn("togglePrecipitation") ? "on" : "off";
  precipitationTargetState = precipitationTransitionState;
  populationTransitionState = layerIsOn("togglePopulation") ? "on" : "off";
  populationTargetState = populationTransitionState;

  // Initialize default layers if not set
  if (useLayerState.getState().layers.length === 0) {
    useLayerState.getState().setLayers(DEFAULT_LAYERS);
  }

  restoreCustomPresets();

  // Listen for layers reorder from store
  document.addEventListener("fmg:sync-layers-order", (e: Event) => {
    const customEvent = e as CustomEvent<{ id: string }[]>;
    syncSVGLayersOrder(customEvent.detail);
  });
  // initSortable is removed as React handles DND

  document.addEventListener("fmg:toggle-emblems", () => toggleEmblems());
  document.addEventListener("fmg:turn-button-on", (e: Event) => turnButtonOn((e as CustomEvent<string>).detail));
  document.addEventListener("fmg:turn-button-off", (e: Event) => turnButtonOff((e as CustomEvent<string>).detail));
  document.addEventListener("fmg:get-current-preset", () => getCurrentPreset());
}

// ─── Preset management ───────────────────────────────────────────────────────

const DEFAULT_PRESET_LABELS: Record<string, string> = {
  political: "Political map",
  cultural: "Cultural map",
  religions: "Religions map",
  provinces: "Provinces map",
  biomes: "Biomes map",
  heightmap: "Heightmap",
  physical: "Physical map",
  poi: "Places of interest",
  military: "Military map",
  emblems: "Emblems",
  landmass: "Pure landmass",
  custom: "Custom (not saved)"
};

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
  } else {
    for (const preset in storedPresets) {
      if (!presets[preset]) presets[preset] = storedPresets[preset];
    }
    useLayerState.getState().setPresets(presets);
  }

  const state = useLayerState.getState();
  for (const [id, label] of Object.entries(DEFAULT_PRESET_LABELS)) {
    state.addPresetLabel(id, label);
  }
}

export function registerPreset(id: string, label: string, layers: string[]): void {
  const state = useLayerState.getState();
  state.setPresets({ ...state.presets, [id]: layers });
  state.addPresetLabel(id, label);
}

export function unregisterPreset(id: string): void {
  const state = useLayerState.getState();
  const newPresets = { ...state.presets };
  delete newPresets[id];
  state.setPresets(newPresets);
  state.removePresetLabel(id);
  if (state.activePreset === id) {
    state.setActivePreset("political");
    localStorage.setItem("preset", "political");
  }
}

export function applyLayersPreset(): void {
  const layerState = useLayerState.getState();
  let preset = localStorage.getItem("preset") || layerState.activePreset;
  // Fall back to "political" if preset doesn't exist (e.g. first run or cleared storage)
  if (!layerState.presets[preset]) preset = "political";
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

export function handleLayersPresetChange(preset: string): void {
  setLayersPreset(preset);

  const layerState = useLayerState.getState();
  const layers = layerState.presets[preset] ?? [];

  if (viewContext.renderMode === "webglHybrid") {
    const nextActiveLayers: Record<string, boolean> = { ...layerState.activeLayers };
    layerState.layers.forEach(l => {
      nextActiveLayers[l.id] = layers.includes(l.id);
    });
    layerState.setAllActiveLayers(nextActiveLayers);
    drawLayers();
    return;
  }

  layerState.layers.forEach(l => {
    const isOn = Boolean(layerState.activeLayers[l.id]);
    const shouldBeOn = layers.includes(l.id);
    if (shouldBeOn !== isOn) toggleLayerById(l.id);
  });
}

export function savePreset(): void {
  openPrompt({
    message: "Please provide a preset name",
    default: "",
    onConfirm: value => {
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
    }
  });
}

export function removePreset(): void {
  const state = useLayerState.getState();
  const preset = state.activePreset;
  const newPresets = { ...state.presets };
  delete newPresets[preset];

  state.setPresets(newPresets);
  state.setActivePreset("custom");

  localStorage.setItem("presets", JSON.stringify(newPresets));
  localStorage.removeItem("preset");
}

export function getCurrentPreset(): void {
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

export function drawLayers(): void {
  if (viewContext.renderMode === "webglHybrid" && DeckGlRenderer.render(worldContext, viewContext, appServices)) {
    drawHybridSvgOverlays();
    return;
  }

  DeckGlRenderer.finalize(viewContext);
  FeaturesRenderer.render(worldContext, viewContext, appServices);
  // FeaturesRenderer always renders lake paths (needed for masks), so explicitly
  // sync the #lakes display state with the toggle after rendering.
  if (!layerIsOn("toggleLakes")) setLayerVisibility("toggleLakes", false);
  if (layerIsOn("toggleTexture")) TextureRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleHeight")) HeightmapRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCells")) CellsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCompass")) {
    if (!view.compass.select("use").size()) view.compass.append("use").attr("xlink:href", "#defs-compass-rose");
    setLayerVisibility("toggleCompass", true);
  }
  if (layerIsOn("toggleRivers")) RiversRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRelief")) ReliefIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) ReligionsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCultures")) CulturesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleZones")) ZonesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRoutes")) RoutesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleTemperature")) TemperatureLayerRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleIce")) IceRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("togglePrecipitation")) PrecipitationRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleDanger")) DangerRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMarkers")) MarkersRenderer.render(worldContext, viewContext, appServices);
  for (const hook of _drawLayerHooks) hook();
  if (layerIsOn("toggleRulers")) rulers.draw();
}

function drawHybridSvgOverlays(): void {
  FeaturesRenderer.render(worldContext, viewContext, appServices);
  if (!layerIsOn("toggleLakes")) setLayerVisibility("toggleLakes", false);
  // Ice, like lakes/coastline above, is kept in sync as a hidden SVG layer so WebGL pick
  // candidates (kind: "ice") can resolve to a real element via editIceById().
  IceRenderer.render(worldContext, viewContext, appServices);
  if (!layerIsOn("toggleIce")) setLayerVisibility("toggleIce", false);
  if (layerIsOn("toggleTexture")) {
    if (!view.texture.select("image").size()) TextureRenderer.render(worldContext, viewContext, appServices);
    setLayerVisibility("toggleTexture", true);
  } else {
    setLayerVisibility("toggleTexture", false);
  }
  if (layerIsOn("toggleRelief")) {
    ReliefIconsRenderer.render(worldContext, viewContext, appServices);
    setLayerVisibility("toggleRelief", true);
  } else {
    setLayerVisibility("toggleRelief", false);
  }
  if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCompass")) {
    if (!view.compass.select("use").size()) view.compass.append("use").attr("xlink:href", "#defs-compass-rose");
    setLayerVisibility("toggleCompass", true);
  }
  for (const hook of _drawLayerHooks) hook();
  if (layerIsOn("toggleRulers")) rulers.draw();
}

function drawLabels(): void {
  StateLabelsRenderer.render(worldContext, viewContext, appServices);
  BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
}

// ─── Button helpers ───────────────────────────────────────────────────────────

export function turnButtonOff(el: string): void {
  useLayerState.getState().toggleLayer(el, false);
  getCurrentPreset();
  schedule3dUpdate();
  scheduleWebglUpdate();
}

export function turnButtonOn(el: string): void {
  useLayerState.getState().toggleLayer(el, true);
  getCurrentPreset();
  schedule3dUpdate();
  scheduleWebglUpdate();
}

// ─── Toggle functions ─────────────────────────────────────────────────────────

function toggleWebglManagedLayer(id: string, styleElement: string, event?: MouseEvent): boolean {
  if (viewContext.renderMode !== "webglHybrid" || !WEBGL_LAYER_TOGGLES.has(id)) return false;

  const active = layerIsOn(id);
  if (event && isCtrlClick(event) && active) {
    editStyle(styleElement);
    return true;
  }

  if (active) {
    turnButtonOff(id);
  } else {
    turnButtonOn(id);
    if (event && isCtrlClick(event)) editStyle(styleElement);
  }

  return true;
}

export function toggleHeight(event?: MouseEvent): void {
  if (view.customization === 1) {
    tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");
    return;
  }

  if (toggleWebglManagedLayer("toggleHeight", "terrs", event)) return;

  const children = view.terrs.selectAll("#oceanHeights > *, #landHeights > *");
  if (!children.size()) {
    turnButtonOn("toggleHeight");
    HeightmapRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("terrs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("terrs");
      return;
    }
    turnButtonOff("toggleHeight");
    HeightmapRenderer.clear?.(viewContext);
  }
}

export function toggleTemperature(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleTemperature", "temperature", event)) return;

  if (!view.temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    TemperatureLayerRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("temperature");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("temperature");
      return;
    }
    turnButtonOff("toggleTemperature");
    TemperatureLayerRenderer.clear?.(viewContext);
  }
}

export function toggleBiomes(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleBiomes", "biomes", event)) return;

  if (!view.biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    BiomesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("biomes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("biomes");
      return;
    }
    BiomesRenderer.clear?.(viewContext);
    turnButtonOff("toggleBiomes");
  }
}

export function toggleDanger(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleDanger", "danger", event)) return;

  if (!layerIsOn("toggleDanger")) {
    turnButtonOn("toggleDanger");
    setLayerVisibility("toggleDanger", true);
    DangerRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("danger");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("danger");
      return;
    }
    setLayerVisibility("toggleDanger", false);
    turnButtonOff("toggleDanger");
    DangerRenderer.clear?.(viewContext);
  }
}

export function togglePrecipitation(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("togglePrecipitation", "prec", event)) return;

  const layerIsActive = layerIsOn("togglePrecipitation");
  if (event && isCtrlClick(event) && layerIsActive) {
    editStyle("prec");
    return;
  }

  syncPrecipitationTransitionState();
  precipitationTargetState = layerIsActive ? "off" : "on";
  processPrecipitationTransition();

  if (event && isCtrlClick(event) && !layerIsActive) editStyle("prec");
}

export function togglePopulation(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("togglePopulation", "population", event)) return;

  const layerIsActive = layerIsOn("togglePopulation");
  if (event && isCtrlClick(event) && layerIsActive) {
    editStyle("population");
    return;
  }

  syncPopulationTransitionState();
  populationTargetState = layerIsActive ? "off" : "on";
  processPopulationTransition();

  if (event && isCtrlClick(event) && !layerIsActive) editStyle("population");
}

export function toggleCells(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleCells", "cells", event)) return;

  if (!view.cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    CellsRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cells");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cells");
      return;
    }
    CellsRenderer.clear?.(viewContext);
    turnButtonOff("toggleCells");
  }
}

export function toggleIce(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleIce", "ice", event)) return;

  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    setLayerVisibility("toggleIce", true);
    if (!view.ice.selectAll("*").size()) IceRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("ice");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ice");
      return;
    }
    setLayerVisibility("toggleIce", false);
    turnButtonOff("toggleIce");
  }
}

export function toggleCultures(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleCultures", "cults", event)) return;

  const activeCultures = worldContext.pack.cultures.filter(c => c.i && !c.removed);
  const empty = !view.cults.selectAll("path").size();
  if (empty && activeCultures.length) {
    turnButtonOn("toggleCultures");
    CulturesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cults");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cults");
      return;
    }
    CulturesRenderer.clear?.(viewContext);
    turnButtonOff("toggleCultures");
  }
}

export function toggleReligions(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleReligions", "relig", event)) return;

  const activeReligions = worldContext.pack.religions.filter(r => r.i && !r.removed);
  if (!view.relig.selectAll("path").size() && activeReligions.length) {
    turnButtonOn("toggleReligions");
    ReligionsRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("relig");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("relig");
      return;
    }
    ReligionsRenderer.clear?.(viewContext);
    turnButtonOff("toggleReligions");
  }
}

export function toggleStates(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleStates", "regions", event)) return;

  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    StatesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("regions");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("regions");
      return;
    }
    StatesRenderer.clear?.(viewContext);
    turnButtonOff("toggleStates");
  }
}

export function toggleBorders(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleBorders", "borders", event)) return;

  if (!layerIsOn("toggleBorders")) {
    turnButtonOn("toggleBorders");
    BordersRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("borders");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("borders");
      return;
    }
    turnButtonOff("toggleBorders");
    BordersRenderer.clear?.(viewContext);
  }
}

export function toggleProvinces(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleProvinces", "provs", event)) return;

  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    ProvincesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("provs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("provs");
      return;
    }
    ProvincesRenderer.clear?.(viewContext);
    turnButtonOff("toggleProvinces");
  }
}

export function toggleGrid(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleGrid", "gridOverlay", event)) return;

  if (!view.gridOverlay.selectAll("*").size()) {
    turnButtonOn("toggleGrid");
    GridRenderer.render(worldContext, viewContext, appServices);
    calculateFriendlyGridSize();
    if (event && isCtrlClick(event)) editStyle("gridOverlay");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("gridOverlay");
      return;
    }
    turnButtonOff("toggleGrid");
    GridRenderer.clear?.(viewContext);
  }
}

export function toggleCoordinates(event?: MouseEvent): void {
  if (!view.coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    CoordinatesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("coordinates");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("coordinates");
      return;
    }
    turnButtonOff("toggleCoordinates");
    CoordinatesRenderer.clear?.(viewContext);
  }
}

export function toggleCompass(event?: MouseEvent): void {
  if (!layerIsOn("toggleCompass")) {
    turnButtonOn("toggleCompass");
    if (!view.compass.select("use").size()) view.compass.append("use").attr("xlink:href", "#defs-compass-rose");
    setLayerVisibility("toggleCompass", true);
    if (event && isCtrlClick(event)) editStyle("compass");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("compass");
      return;
    }
    setLayerVisibility("toggleCompass", false);
    turnButtonOff("toggleCompass");
  }
}

export function toggleRelief(event?: MouseEvent): void {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!view.terrain.selectAll("*").size()) ReliefIconsRenderer.render(worldContext, viewContext, appServices);
    setLayerVisibility("toggleRelief", true);
    if (event && isCtrlClick(event)) editStyle("terrain");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("terrain");
      return;
    }
    setLayerVisibility("toggleRelief", false);
    turnButtonOff("toggleRelief");
  }
}

export function toggleLakes(event?: MouseEvent): void {
  if (!layerIsOn("toggleLakes")) {
    turnButtonOn("toggleLakes");
    setLayerVisibility("toggleLakes", true);
    if (event && isCtrlClick(event)) editStyle("lakes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("lakes");
      return;
    }
    setLayerVisibility("toggleLakes", false);
    turnButtonOff("toggleLakes");
  }
}

export function toggleTexture(event?: MouseEvent): void {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    TextureRenderer.render(worldContext, viewContext, appServices);
    setLayerVisibility("toggleTexture", true);
    if (event && isCtrlClick(event)) editStyle("texture");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("texture");
      return;
    }
    turnButtonOff("toggleTexture");
    setLayerVisibility("toggleTexture", false);
    TextureRenderer.clear?.(viewContext);
  }
}

export function toggleRivers(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleRivers", "rivers", event)) return;

  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    RiversRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("rivers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("rivers");
      return;
    }
    RiversRenderer.clear?.(viewContext);
    turnButtonOff("toggleRivers");
  }
}

export function toggleRoutes(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleRoutes", "routes", event)) return;

  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    RoutesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("routes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("routes");
      return;
    }
    RoutesRenderer.clear?.(viewContext);
    turnButtonOff("toggleRoutes");
  }
}

export function toggleMilitary(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleMilitary", "armies", event)) return;
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    MilitaryRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("armies");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("armies");
      return;
    }
    MilitaryRenderer.clear?.(viewContext);
    turnButtonOff("toggleMilitary");
  }
}

export function toggleMarkers(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleMarkers", "markers", event)) return;
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    MarkersRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("markers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("markers");
      return;
    }
    MarkersRenderer.clear?.(viewContext);
    turnButtonOff("toggleMarkers");
  }
}

export function toggleLabels(event?: MouseEvent): void {
  if (!viewContext.renderMap) return;
  if (toggleWebglManagedLayer("toggleLabels", "labels", event)) return;
  if (!layerIsOn("toggleLabels")) {
    turnButtonOn("toggleLabels");
    setLayerVisibility("toggleLabels", true);
    if (view.labels.selectAll("text").size() === 0) drawLabels();
    if (event && isCtrlClick(event)) editStyle("labels");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("labels");
      return;
    }
    turnButtonOff("toggleLabels");
    setLayerVisibility("toggleLabels", false);
  }
}

export function toggleBurgIcons(event?: MouseEvent): void {
  if (!viewContext.renderMap) return;
  if (toggleWebglManagedLayer("toggleBurgIcons", "burgIcons", event)) return;
  if (!layerIsOn("toggleBurgIcons")) {
    turnButtonOn("toggleBurgIcons");
    BurgIconsRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("burgIcons");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("burgIcons");
      return;
    }
    turnButtonOff("toggleBurgIcons");
    BurgIconsRenderer.clear?.(viewContext);
  }
}

export function toggleRulers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRulers")) {
    turnButtonOn("toggleRulers");
    if (event && isCtrlClick(event)) editStyle("ruler");
    rulers.draw();
    setLayerVisibility("toggleRulers", true);
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ruler");
      return;
    }
    turnButtonOff("toggleRulers");
    viewContext.ruler.selectAll("*").remove();
    setLayerVisibility("toggleRulers", false);
  }
}

export function toggleScaleBar(event?: MouseEvent): void {
  if (!layerIsOn("toggleScaleBar")) {
    turnButtonOn("toggleScaleBar");
    setLayerVisibility("toggleScaleBar", true);
    if (event && isCtrlClick(event)) editStyle("scaleBar");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("scaleBar");
      return;
    }
    setLayerVisibility("toggleScaleBar", false);
    turnButtonOff("toggleScaleBar");
  }
}

export function toggleZones(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleZones", "zones", event)) return;

  if (!layerIsOn("toggleZones")) {
    turnButtonOn("toggleZones");
    ZonesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("zones");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("zones");
      return;
    }
    turnButtonOff("toggleZones");
    ZonesRenderer.clear?.(viewContext);
  }
}

export function toggleEmblems(event?: MouseEvent): void {
  if (toggleWebglManagedLayer("toggleEmblems", "emblems", event)) return;

  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!view.emblems.selectAll("use").size()) EmblemsRenderer.render(worldContext, viewContext, appServices);
    setLayerVisibility("toggleEmblems", true);
    document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
    if (event && isCtrlClick(event)) editStyle("emblems");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("emblems");
      return;
    }
    setLayerVisibility("toggleEmblems", false);
    turnButtonOff("toggleEmblems");
  }
}

export function toggleVignette(event?: MouseEvent): void {
  if (!layerIsOn("toggleVignette")) {
    turnButtonOn("toggleVignette");
    setLayerVisibility("toggleVignette", true);
    if (event && isCtrlClick(event)) editStyle("vignette");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("vignette");
      return;
    }
    setLayerVisibility("toggleVignette", false);
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

function getLayer(id: string): SVGGElement | HTMLElement | null {
  return view.getLayerNodeByToggleId(id) ?? _layerElementGetters.get(id)?.() ?? null;
}

const TOGGLE_REGISTRY: Record<string, (event?: MouseEvent) => void> = {
  toggleHeight,
  toggleTemperature,
  toggleDanger,
  toggleBiomes,
  togglePrecipitation,
  togglePopulation,
  toggleCells,
  toggleIce,
  toggleCultures,
  toggleReligions,
  toggleStates,
  toggleBorders,
  toggleProvinces,
  toggleGrid,
  toggleCoordinates,
  toggleCompass,
  toggleRelief,
  toggleLakes,
  toggleTexture,
  toggleRivers,
  toggleRoutes,
  toggleMilitary,
  toggleMarkers,
  toggleLabels,
  toggleBurgIcons,
  toggleRulers,
  toggleScaleBar,
  toggleZones,
  toggleEmblems,
  toggleVignette
};

let pending3dUpdate = false;
let precipitationAnimRafId: number | null = null;
let populationAnimRafId: number | null = null;
type LayerToggleTransitionState = "off" | "turning-on" | "on" | "turning-off";
type LayerToggleTargetState = "off" | "on";
let precipitationTransitionState: LayerToggleTransitionState = "off";
let precipitationTargetState: LayerToggleTargetState = "off";
let precipitationTransitionToken = 0;
let populationTransitionState: LayerToggleTransitionState = "off";
let populationTargetState: LayerToggleTargetState = "off";
let populationTransitionToken = 0;
let pendingWebglUpdate = false;

function syncPrecipitationTransitionState(): void {
  if (precipitationTransitionState === "turning-on" || precipitationTransitionState === "turning-off") return;
  precipitationTransitionState = layerIsOn("togglePrecipitation") ? "on" : "off";
}

function processPrecipitationTransition(): void {
  if (precipitationTransitionState === "turning-on" || precipitationTransitionState === "turning-off") return;
  if (precipitationTransitionState === precipitationTargetState) return;

  if (precipitationTargetState === "on") {
    startPrecipitationTurnOn();
    return;
  }

  startPrecipitationTurnOff();
}

function startPrecipitationTurnOn(): void {
  precipitationTransitionState = "turning-on";
  const transitionToken = ++precipitationTransitionToken;

  if (precipitationAnimRafId !== null) {
    cancelAnimationFrame(precipitationAnimRafId);
    precipitationAnimRafId = null;
  }

  if (!layerIsOn("togglePrecipitation")) turnButtonOn("togglePrecipitation");

  precipitationAnimRafId = requestAnimationFrame(() => {
    precipitationAnimRafId = null;
    if (transitionToken !== precipitationTransitionToken) return;

    animatePrecipitationTurnOn(worldContext, viewContext, appServices, () => {
      if (transitionToken !== precipitationTransitionToken) return;
      precipitationTransitionState = "on";
      processPrecipitationTransition();
    });
  });
}

function startPrecipitationTurnOff(): void {
  precipitationTransitionState = "turning-off";
  const transitionToken = ++precipitationTransitionToken;

  if (precipitationAnimRafId !== null) {
    cancelAnimationFrame(precipitationAnimRafId);
    precipitationAnimRafId = null;
  }

  if (layerIsOn("togglePrecipitation")) turnButtonOff("togglePrecipitation");

  animatePrecipitationTurnOff(viewContext, () => {
    if (transitionToken !== precipitationTransitionToken) return;
    precipitationTransitionState = "off";
    if (ThreeDRenderer.options.isOn) ThreeDRenderer.update();
    processPrecipitationTransition();
  });
}

function syncPopulationTransitionState(): void {
  if (populationTransitionState === "turning-on" || populationTransitionState === "turning-off") return;
  populationTransitionState = layerIsOn("togglePopulation") ? "on" : "off";
}

function processPopulationTransition(): void {
  if (populationTransitionState === "turning-on" || populationTransitionState === "turning-off") return;
  if (populationTransitionState === populationTargetState) return;

  if (populationTargetState === "on") {
    startPopulationTurnOn();
    return;
  }

  startPopulationTurnOff();
}

function startPopulationTurnOn(): void {
  populationTransitionState = "turning-on";
  const transitionToken = ++populationTransitionToken;

  if (populationAnimRafId !== null) {
    cancelAnimationFrame(populationAnimRafId);
    populationAnimRafId = null;
  }

  if (!layerIsOn("togglePopulation")) turnButtonOn("togglePopulation");

  populationAnimRafId = requestAnimationFrame(() => {
    populationAnimRafId = null;
    if (transitionToken !== populationTransitionToken) return;

    animatePopulationTurnOn(worldContext, viewContext, appServices, () => {
      if (transitionToken !== populationTransitionToken) return;
      populationTransitionState = "on";
      processPopulationTransition();
    });
  });
}

function startPopulationTurnOff(): void {
  populationTransitionState = "turning-off";
  const transitionToken = ++populationTransitionToken;

  if (populationAnimRafId !== null) {
    cancelAnimationFrame(populationAnimRafId);
    populationAnimRafId = null;
  }

  if (layerIsOn("togglePopulation")) turnButtonOff("togglePopulation");

  animatePopulationTurnOff(viewContext, () => {
    if (transitionToken !== populationTransitionToken) return;
    populationTransitionState = "off";
    if (ThreeDRenderer.options.isOn) ThreeDRenderer.update();
    processPopulationTransition();
  });
}

function schedule3dUpdate() {
  if (ThreeDRenderer.options.isOn && !pending3dUpdate) {
    pending3dUpdate = true;
    requestAnimationFrame(() => {
      pending3dUpdate = false;
      ThreeDRenderer.update();
    });
  }
}

export function scheduleWebglUpdate(): void {
  if (viewContext.renderMode !== "webglHybrid" || pendingWebglUpdate) return;
  pendingWebglUpdate = true;
  requestAnimationFrame(() => {
    pendingWebglUpdate = false;
    DeckGlRenderer.render(worldContext, viewContext, appServices);
  });
}

/** Extension hooks called at the end of drawLayers() */
const _drawLayerHooks: Array<() => void> = [];
/** Extension layer element getters registered by extensions */
const _layerElementGetters = new Map<string, () => HTMLElement | null>();

/** Register a custom layer toggle handler for an extension-owned layer id */
export function registerLayerToggle(id: string, handler: (event?: MouseEvent) => void): void {
  TOGGLE_REGISTRY[id] = handler;
}

/** Register a function that returns the DOM element for an extension-owned layer */
export function registerLayerElement(id: string, getter: () => HTMLElement | null): void {
  _layerElementGetters.set(id, getter);
}

/** Register a hook called at the end of drawLayers() — used by extensions to redraw their layers */
export function registerDrawLayerHook(fn: () => void): void {
  _drawLayerHooks.push(fn);
}

// ─── Tool action registry (for extension-owned react-tool-action events) ─────

const _toolActionRegistry = new Map<string, (detail?: Record<string, unknown>) => void>();

/** Register a handler for a react-tool-action event name — used by extensions. */
export function registerToolAction(eventName: string, handler: (detail?: Record<string, unknown>) => void): void {
  _toolActionRegistry.set(eventName, handler);
}

/** Unregister a previously registered tool action handler. */
export function unregisterToolAction(eventName: string): void {
  _toolActionRegistry.delete(eventName);
}

/** Look up a registered tool action handler — called by tools.ts as fallback. */
export function getToolActionHandler(eventName: string): ((detail?: Record<string, unknown>) => void) | undefined {
  return _toolActionRegistry.get(eventName);
}

export function toggleLayerById(id: string, event?: MouseEvent): void {
  if (!viewContext.renderMap) return;
  TOGGLE_REGISTRY[id]?.(event);
}

// d3 is the UMD global exposed by the legacy <script> tag in index.html
