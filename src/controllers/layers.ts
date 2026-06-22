import * as d3 from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  BiomesRenderer,
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  CellsRenderer,
  CoordinatesRenderer,
  CulturesRenderer,
  drawStateLabels,
  drawTemperature,
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
  StatesRenderer,
  TextureRenderer,
  ZonesRenderer
} from "../renderers";
import { rulers } from "../store/editorState";
import { isCtrlClick, showPrompt } from "../utils";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

// Layer presets: map preset name → list of toggle button IDs that should be ON
let presets: Record<string, string[]> = {};

import { TradeAnimation } from "../modules/trade-animation";
import { drawGoods } from "../renderers/draw-goods";
import { drawMarketsLayer } from "../renderers/draw-markets";
import { clear as clearTradeAnim, draw as drawTradeAnim } from "../renderers/draw-trade-animation";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { DEFAULT_LAYERS, useLayerState } from "../store/layerState";
import { openDialog } from "../ui/dialogs/dialogService";
import { layerIsOn } from "../utils/nodeUtils";
import { tip } from "../utils/uiHelpers";

const editStyle = (element: string, group?: string) =>
  document.dispatchEvent(new CustomEvent("fmg:edit-style", { detail: { element, group } }));
const calculateFriendlyGridSize = () => import("./style").then(m => m.calculateFriendlyGridSize());

export function initLayers(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices): void {
  worldContext = wc;
  viewContext = vc;
  appServices = as;

  // Initialize default layers if not set
  if (useLayerState.getState().layers.length === 0) {
    useLayerState.getState().setLayers(DEFAULT_LAYERS);
  }

  restoreCustomPresets();
  initLayerClickHandlers();
  // initSortable is removed as React handles DND
}

export function initLayerClickHandlers(): void {
  viewContext.goods.on("click.openEditor", (event: MouseEvent) => {
    const target = event.target as SVGElement;
    if (target.closest("#goodsIcons, #goodsBurgs")) {
      openDialog("goodsEditor");
    }
  });

  viewContext.markets.on("click.openMarket", (event: MouseEvent) => {
    const target = event.target as SVGElement;
    const g = target.closest<SVGGElement>("g[data-id]");
    if (!g?.dataset.id) return;
    openDialog("marketOverview", { marketId: +g.dataset.id });
  });
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
    landmass: ["toggleScaleBar"],
    goods: ["toggleBurgIcons", "toggleGoods", "toggleLakes", "toggleRivers", "toggleScaleBar", "toggleVignette"],
    trade: [
      "toggleBurgIcons",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleTrade",
      "toggleVignette"
    ]
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

  layerState.layers.forEach(l => {
    const isOn = layerState.activeLayers[l.id];
    const shouldBeOn = layers.includes(l.id);
    if (shouldBeOn !== isOn) toggleLayerById(l.id);
  });
}

export function savePreset(): void {
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
  FeaturesRenderer.render(worldContext, viewContext, appServices);
  // FeaturesRenderer always renders lake paths (needed for masks), so explicitly
  // sync the #lakes display state with the toggle after rendering.
  if (!layerIsOn("toggleLakes")) d3.select("#lakes").style("display", "none");
  if (layerIsOn("toggleTexture")) TextureRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleHeight")) HeightmapRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCells")) CellsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCompass")) {
    if (!viewContext.compass.select("use").size())
      viewContext.compass.append("use").attr("xlink:href", "#defs-compass-rose");
    viewContext.compass.style("display", "block");
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
  if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleIce")) IceRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("togglePrecipitation")) PrecipitationRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleEmblems")) EmblemsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMarkers")) MarkersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleGoods")) drawGoods(getDefaultGoodsSet());
  if (layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
  if (layerIsOn("toggleTrade")) TradeAnimation.start();
  if (layerIsOn("toggleRulers")) rulers.draw();
}

function drawLabels(): void {
  drawStateLabels(worldContext, viewContext, appServices);
  BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  import("../main").then(m => m.invokeActiveZooming());
}

// ─── Button helpers ───────────────────────────────────────────────────────────

export function turnButtonOff(el: string): void {
  useLayerState.getState().toggleLayer(el, false);
  getCurrentPreset();
  schedule3dUpdate();
}

export function turnButtonOn(el: string): void {
  useLayerState.getState().toggleLayer(el, true);
  getCurrentPreset();
  schedule3dUpdate();
}

// ─── Toggle functions ─────────────────────────────────────────────────────────

export function toggleHeight(event?: MouseEvent): void {
  if (viewContext.customization === 1) {
    tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");
    return;
  }

  const children = viewContext.terrs.selectAll("#oceanHeights > *, #landHeights > *");
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
    children.remove();
  }
}

export function toggleTemperature(event?: MouseEvent): void {
  if (!viewContext.temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    drawTemperature(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("temperature");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("temperature");
      return;
    }
    turnButtonOff("toggleTemperature");
    viewContext.temperature.selectAll("*").remove();
  }
}

export function toggleBiomes(event?: MouseEvent): void {
  if (!viewContext.biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    BiomesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("biomes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("biomes");
      return;
    }
    viewContext.biomes.selectAll("path").remove();
    turnButtonOff("toggleBiomes");
  }
}

export function togglePrecipitation(event?: MouseEvent): void {
  if (!viewContext.prec.selectAll("circle").size()) {
    turnButtonOn("togglePrecipitation");
    PrecipitationRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("prec");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("prec");
      return;
    }
    turnButtonOff("togglePrecipitation");
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    viewContext.prec.selectAll("text").attr("opacity", 1).transition(hide).attr("opacity", 0);
    viewContext.prec.selectAll("circle").transition(hide).attr("r", 0).remove();
    viewContext.prec.transition().delay(1000).style("display", "none");
  }
}

export function togglePopulation(event?: MouseEvent): void {
  if (!viewContext.population.selectAll("line").size()) {
    turnButtonOn("togglePopulation");
    PopulationRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("population");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("population");
      return;
    }
    turnButtonOff("togglePopulation");

    const isD3data = viewContext.population.select("line").datum();
    if (!isD3data) {
      viewContext.population.selectAll("line").remove();
    } else {
      const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
      viewContext.population
        .select("#rural")
        .selectAll("line")
        .transition(hide)
        .attr("y2", (d: unknown) => (d as [number, number])[1])
        .remove();
      viewContext.population
        .select("#urban")
        .selectAll("line")
        .transition(hide)
        .delay(1000)
        .attr("y2", (d: unknown) => (d as [number, number])[1])
        .remove();
    }
  }
}

export function toggleCells(event?: MouseEvent): void {
  if (!viewContext.cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    CellsRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cells");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cells");
      return;
    }
    viewContext.cells.selectAll("path").remove();
    turnButtonOff("toggleCells");
  }
}

export function toggleIce(event?: MouseEvent): void {
  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    d3.select("#ice").style("display", "block");
    if (!viewContext.ice.selectAll("*").size()) IceRenderer.render(worldContext, viewContext, appServices);
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

export function toggleCultures(event?: MouseEvent): void {
  const activeCultures = worldContext.pack.cultures.filter(c => c.i && !c.removed);
  const empty = !viewContext.cults.selectAll("path").size();
  if (empty && activeCultures.length) {
    turnButtonOn("toggleCultures");
    CulturesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("cults");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("cults");
      return;
    }
    viewContext.cults.selectAll("path").remove();
    turnButtonOff("toggleCultures");
  }
}

export function toggleReligions(event?: MouseEvent): void {
  const activeReligions = worldContext.pack.religions.filter(r => r.i && !r.removed);
  if (!viewContext.relig.selectAll("path").size() && activeReligions.length) {
    turnButtonOn("toggleReligions");
    ReligionsRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("relig");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("relig");
      return;
    }
    viewContext.relig.selectAll("path").remove();
    turnButtonOff("toggleReligions");
  }
}

export function toggleStates(event?: MouseEvent): void {
  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    StatesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("regions");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("regions");
      return;
    }
    viewContext.regions.selectAll("path").remove();
    turnButtonOff("toggleStates");
  }
}

export function toggleBorders(event?: MouseEvent): void {
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
    viewContext.borders.selectAll("path").remove();
  }
}

export function toggleProvinces(event?: MouseEvent): void {
  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    ProvincesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("provs");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("provs");
      return;
    }
    viewContext.provs.selectAll("*").remove();
    turnButtonOff("toggleProvinces");
  }
}

export function toggleGrid(event?: MouseEvent): void {
  if (!viewContext.gridOverlay.selectAll("*").size()) {
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
    viewContext.gridOverlay.selectAll("*").remove();
  }
}

export function toggleCoordinates(event?: MouseEvent): void {
  if (!viewContext.coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    CoordinatesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("coordinates");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("coordinates");
      return;
    }
    turnButtonOff("toggleCoordinates");
    viewContext.coordinates.selectAll("*").remove();
  }
}

export function toggleCompass(event?: MouseEvent): void {
  if (!layerIsOn("toggleCompass")) {
    turnButtonOn("toggleCompass");
    if (!viewContext.compass.select("use").size())
      viewContext.compass.append("use").attr("xlink:href", "#defs-compass-rose");
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

export function toggleRelief(event?: MouseEvent): void {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!viewContext.terrain.selectAll("*").size()) ReliefIconsRenderer.render(worldContext, viewContext, appServices);
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

export function toggleLakes(event?: MouseEvent): void {
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

export function toggleTexture(event?: MouseEvent): void {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    TextureRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("texture");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("texture");
      return;
    }
    turnButtonOff("toggleTexture");
    viewContext.texture.select("image").remove();
  }
}

export function toggleRivers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    RiversRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("rivers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("rivers");
      return;
    }
    viewContext.rivers.selectAll("*").remove();
    turnButtonOff("toggleRivers");
  }
}

export function toggleRoutes(event?: MouseEvent): void {
  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    RoutesRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("routes");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("routes");
      return;
    }
    viewContext.routes.selectAll("path").remove();
    turnButtonOff("toggleRoutes");
  }
}

export function toggleMilitary(event?: MouseEvent): void {
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    MilitaryRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("armies");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("armies");
      return;
    }
    viewContext.armies.selectAll("g").remove();
    turnButtonOff("toggleMilitary");
  }
}

export function toggleMarkers(event?: MouseEvent): void {
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    MarkersRenderer.render(worldContext, viewContext, appServices);
    if (event && isCtrlClick(event)) editStyle("markers");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("markers");
      return;
    }
    viewContext.markers.html("");
    turnButtonOff("toggleMarkers");
  }
}

export function toggleLabels(event?: MouseEvent): void {
  if (!layerIsOn("toggleLabels")) {
    turnButtonOn("toggleLabels");
    d3.select("#labels").style("display", "block");
    if (viewContext.labels.selectAll("text").size() === 0) drawLabels();
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

export function toggleBurgIcons(event?: MouseEvent): void {
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
    viewContext.icons.selectAll("circle, use").remove();
  }
}

export function toggleRulers(event?: MouseEvent): void {
  if (!layerIsOn("toggleRulers")) {
    turnButtonOn("toggleRulers");
    if (event && isCtrlClick(event)) editStyle("ruler");
    rulers.draw();
    viewContext.ruler.style("display", null);
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("ruler");
      return;
    }
    turnButtonOff("toggleRulers");
    viewContext.ruler.selectAll("*").remove();
    viewContext.ruler.style("display", "none");
  }
}

export function toggleScaleBar(event?: MouseEvent): void {
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

export function toggleZones(event?: MouseEvent): void {
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
    viewContext.zones.selectAll("*").remove();
  }
}

export function toggleEmblems(event?: MouseEvent): void {
  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!viewContext.emblems.selectAll("use").size()) EmblemsRenderer.render(worldContext, viewContext, appServices);
    d3.select("#emblems").style("display", "block");
    import("../main").then(m => m.invokeActiveZooming());
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

export function toggleVignette(event?: MouseEvent): void {
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

function getDefaultGoodsSet(): Set<number> {
  const wood = worldContext.pack.goods?.find(g => g.name === "Wood");
  return wood ? new Set([wood.i]) : new Set(worldContext.pack.goods?.map(g => g.i) ?? []);
}

export function toggleGoods(event?: MouseEvent): void {
  if (!layerIsOn("toggleGoods")) {
    turnButtonOn("toggleGoods");
    drawGoods(getDefaultGoodsSet());
    if (event && isCtrlClick(event)) editStyle("goodsIcons");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("goodsIcons");
      return;
    }
    viewContext.goods.selectAll("#goodsCells,#goodsIcons,#goodsBurgs").html("");
    turnButtonOff("toggleGoods");
  }
}

export function toggleMarketsLayer(event?: MouseEvent): void {
  if (!layerIsOn("toggleMarketsLayer")) {
    turnButtonOn("toggleMarketsLayer");
    drawMarketsLayer();
    if (event && isCtrlClick(event)) editStyle("markets");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("markets");
      return;
    }
    viewContext.marketsFill.html("").style("display", "none");
    viewContext.markets.html("").style("display", "none");
    turnButtonOff("toggleMarketsLayer");
  }
}

export function toggleTrade(event?: MouseEvent): void {
  if (!layerIsOn("toggleTrade")) {
    turnButtonOn("toggleTrade");
    TradeAnimation.start();
    if (event && isCtrlClick(event)) editStyle("tradeAnimation");
  } else {
    if (event && isCtrlClick(event)) {
      editStyle("tradeAnimation");
      return;
    }
    TradeAnimation.stop();
    turnButtonOff("toggleTrade");
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
  if (id === "toggleGoods") return document.getElementById("goodsCells");
  if (id === "toggleMarketsLayer") return document.getElementById("marketsLayer");
  if (id === "toggleTrade") return document.getElementById("tradeAnimation");
  if (id === "toggleRulers") return document.getElementById("ruler");
  return null;
}

const TOGGLE_REGISTRY: Record<string, (event?: MouseEvent) => void> = {
  toggleHeight,
  toggleTemperature,
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
  toggleVignette,
  toggleGoods,
  toggleMarketsLayer,
  toggleTrade
};

let pending3dUpdate = false;
function schedule3dUpdate() {
  if (ThreeDRenderer.options.isOn && !pending3dUpdate) {
    pending3dUpdate = true;
    requestAnimationFrame(() => {
      pending3dUpdate = false;
      ThreeDRenderer.update();
    });
  }
}

export function toggleLayerById(id: string, event?: MouseEvent): void {
  TOGGLE_REGISTRY[id]?.(event);
}

TradeAnimation.bind({
  draw: drawTradeAnim,
  clear: clearTradeAnim,
  isLayerOn: () => layerIsOn("toggleTrade")
});

// d3 is the UMD global exposed by the legacy <script> tag in index.html
