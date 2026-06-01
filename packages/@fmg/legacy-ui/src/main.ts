// Azgaar (azgaar.fmg@yandex.com). Minsk, 2017-2023. MIT License
// https://github.com/Azgaar/Fantasy-Map-Generator

// Temporary shim to make `window.fmg` available (queued stubs) during incremental migration.
import "./modules/runtime/legacy-fmg-shim";

// Ensure core API is initialized as early as possible so UI event handlers
// don't just queue calls on the shim and become non-responsive.
import { initializeFmg } from "@fmg/core/modules/initialize-fmg";
initializeFmg();
// Ensure core generators register their window.fmg APIs before legacy UI modules
// Also publish legacy compatibility APIs onto `window.fmg` early so that
// inline `onclick="window.fmg.*"` handlers and other UI bindings work
// immediately instead of only queuing calls on the shim.
import "@legacy-ui-runtime/globals-compat";

// Ensure core generators register their window.fmg APIs before legacy UI modules
// that call requireFmgApi during module initialization.
import "@fmg/core/modules/features";
import "@fmg/burgs";
import "@fmg/markers";
import "@fmg/core/modules/zones-generator";
import "@fmg/core/modules/cultures-generator";
import "@fmg/core/modules/religions-generator";
import "@fmg/states";

import { invokeActiveZoomingView, resetZoomToInitial, zoomToPoint } from "./modules/ui/zoom-utils";
import { buildInvokeActiveZoomingDeps, buildResetZoomDeps, buildZoomToPointDeps } from "./modules/ui/zoom-deps";
import { initTourPromptButtonUI, toggleAssistantWidget } from "./modules/ui/assistant";
import { initDragToUpload } from "./modules/ui/drag-upload";
import { hideLoadingUI, showLoadingUI } from "./modules/ui/loading-ui";
import { initStartupOnDomContentLoaded } from "./modules/ui/startup-init";
import {
  checkLoadParametersFlow,
  type FocusDeps,
  findBurgForMFCGFlow,
  focusOnFlow,
  generateMapOnLoadFlow,
  type SelectMfcgDeps
} from "./modules/ui/initial-load";
import { applyLayersPreset, drawLayers, layerIsOn } from "./modules/ui/layers";
import {
  buildCheckLoadParametersDeps,
  buildFindBurgForMFCGDeps,
  buildFocusOnDeps,
  buildGenerateMapOnLoadDeps
} from "./modules/ui/initial-load-deps";
import {
  addLakesInDeepDepressionsFlow,
  generateMapFlow,
  openNearSeaLakesFlow,
  setSeedFlow
} from "./modules/ui/generation-flow";
import { loadMapFromURL, showUploadErrorMessage, uploadMap } from "./modules/io/load";
import { rankCellsFlow, reGraphFlow } from "./modules/ui/generation-graph";
import { createRegenerateMap, showStatisticsFlow, undrawFlow } from "./modules/ui/generation-runtime";
import {
  calculateMapCoordinatesFlow,
  calculateTemperaturesFlow,
  defineMapSizeFlow,
  generatePrecipitationFlow
} from "./modules/ui/generation-climate";
import {
  buildCalculateMapCoordinatesDeps,
  buildCalculateTemperaturesDeps,
  buildDefineMapSizeDeps,
  buildGenerateDeps,
  buildGenerationModules,
  buildGeneratePrecipitationDeps,
  buildRankCellsDeps,
  buildRegenerateMapDeps,
  buildReGraphDeps,
  buildShowStatisticsDeps,
  buildSetSeedDeps,
  buildUndrawDeps,
} from "./modules/ui/generation-deps";
import { clearMainTip, locked, showDataTip, showMainTip, tip } from "./modules/ui/general";
import { createDefaultRuler, Rulers } from "./modules/ui/measurers";
import { applyStyleOnLoad } from "./modules/ui/style-presets";
import { applyGraphSize, applyStoredOptions, fitMapToScreen, randomizeOptions } from "./modules/ui/options";
import { closeDialogs, restoreDefaultEvents } from "./modules/ui/editors";
import { editUnits } from "./modules/ui/units-editor";
import { initiateAutosave } from "./modules/io/save";
import { editWorld } from "./modules/ui/world-configurator";
import { scaleBarRenderer as drawScaleBar, scaleBarResize as fitScaleBar } from "#renderers/draw-scalebar";
import { Biomes } from "@fmg/core/modules/biomes";
import { Ice } from "@fmg/core/modules/ice";
import { Lakes } from "@fmg/core/modules/lakes";
import { Military } from "@fmg/core/modules/military-generator";
import { Names } from "@fmg/core/modules/names-generator";
import { drawOceanLayers } from "@fmg/core/modules/ocean-layers";
import { Rivers } from "@fmg/rivers";
import { Routes } from "@fmg/core/modules/routes-generator";
import { States } from "@fmg/states";
import type { FmgGlobalContext, Grid, PackedGraph } from "@fmg/types";
import { getFmgOptionalService, getFmg } from "./modules/runtime/get-fmg";
import { getCoreFmgInstances } from "#modules/initialize-fmg";
import { rn } from "@fmg/shared";

type RuntimeBridge = {
  rn: (value: number, digits?: number) => number;
  applyGraphSize: () => void;
  randomizeOptions: () => void;
  shouldRegenerateGrid: (grid: unknown, expectedSeed: unknown) => boolean;
  generateGrid: () => unknown;
  HeightmapGenerator?: { generate: (grid: unknown) => Promise<unknown> };
  parseError: (error: unknown) => string;
  clearMainTip: () => void;
  cleanupData: () => void;
  generateSeed: () => string;
  aleaPRNG: (seed: string) => () => number;
  gauss: (...args: number[]) => number;
  P: (probability: number) => boolean;
  mapSizeOutput: HTMLInputElement;
  mapSizeInput: HTMLInputElement;
  latitudeOutput: HTMLInputElement;
  latitudeInput: HTMLInputElement;
  longitudeOutput: HTMLInputElement;
  longitudeInput: HTMLInputElement;
  minmax: (value: number, min: number, max: number) => number;
  pointsInput: HTMLInputElement;
  precInput: HTMLInputElement;
  rand: (min?: number, max?: number) => number;
  calculateVoronoi: (points: [number, number][], boundary: unknown) => { cells: unknown; vertices: unknown };
  createTypedArray: (options: { maxValue: number; length?: number; from?: ArrayLike<number> }) => unknown;
  UINT16_MAX: number;
  getPackPolygon: (cellIndex: number, packedGraph: unknown) => unknown;
  normalize: (value: number, min?: number, max?: number) => number;
  culturesSet: HTMLInputElement;
  mapId: number;
  debounce: <T extends (...args: unknown[]) => unknown>(fn: T, delay: number) => T;
  ThreeD: { options?: { isOn?: boolean }; redraw?: () => void };
  unfog: () => void;
};

type SafeJSON = JSON & {
  safeParse: (value: string | null) => unknown;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { mobile?: boolean };
};

type InstallationEvent = Event & { prompt?: () => Promise<void> | void };

type InstallationModule = {
  default?: { init?: (event: InstallationEvent) => void | Promise<void> };
  init?: (event: InstallationEvent) => void | Promise<void>;
};

type MapCoordinatesLike = {
  latT: number;
  latN: number;
  latS: number;
  lonT: number;
  lonW: number;
  lonE: number;
};

const runtime = window as unknown as Window & RuntimeBridge;
const safeJSON = JSON as SafeJSON;
const navigatorWithUserAgentData = navigator as NavigatorWithUserAgentData;

// Expose common legacy helpers on globalThis for legacy modules that rely on them
(globalThis as any).rn = rn;

// set debug options (resolved in globals.d.ts - this file defines actual values)
const PRODUCTION_VAL = location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
const DEBUG_VAL = safeJSON.safeParse(localStorage.getItem("debug")) || {};
const INFO = true;
const TIME = true;
const WARN = true;
const ERROR = true;
const PRODUCTION = PRODUCTION_VAL;
const DEBUG = (typeof DEBUG_VAL === "object" && DEBUG_VAL !== null ? DEBUG_VAL : {}) as Record<string, boolean>;

// detect device
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _MOBILE = window.innerWidth < 600 || (navigatorWithUserAgentData.userAgentData?.mobile ?? false);

if (PRODUCTION && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.error("ServiceWorker registration failed: ", err);
    });
  });

  window.addEventListener(
    "beforeinstallprompt",
    async (event: Event) => {
      event.preventDefault();
      try {
        const Installation = (await import("./modules/dynamic/installation.js")) as unknown as InstallationModule;
        if (Installation.default?.init) await Installation.default.init(event);
        else if (Installation.init) await Installation.init(event);
      } catch (err) {
        console.error("Failed to load Installation module:", err);
      }
    },
    { once: true }
  );
}

// append svg layers (in default order)
const svg = d3.select("#map");
const _defs = svg.select("#deftemp");
const viewbox = svg.select("#viewbox");
const scaleBar = svg.select("#scaleBar");
const legend = svg.append("g").attr("id", "legend");
const ocean = viewbox.append("g").attr("id", "ocean");
const oceanLayers = ocean.append("g").attr("id", "oceanLayers");
const oceanPattern = ocean.append("g").attr("id", "oceanPattern");
const landmass = viewbox.append("g").attr("id", "landmass");
const _texture = viewbox.append("g").attr("id", "texture");
const terrs = viewbox.append("g").attr("id", "terrs");
const lakes = viewbox.append("g").attr("id", "lakes");
const _biomes = viewbox.append("g").attr("id", "biomes");
const _cells = viewbox.append("g").attr("id", "cells");
const _gridOverlay = viewbox.append("g").attr("id", "gridOverlay");
const _coordinates = viewbox.append("g").attr("id", "coordinates");
const compass = viewbox.append("g").attr("id", "compass").style("display", "none");
const _rivers = viewbox.append("g").attr("id", "rivers");
const _terrain = viewbox.append("g").attr("id", "terrain");
const _relig = viewbox.append("g").attr("id", "relig");
const _cults = viewbox.append("g").attr("id", "cults");
const regions = viewbox.append("g").attr("id", "regions");
const _statesBody = regions.append("g").attr("id", "statesBody");
const statesHalo = regions.append("g").attr("id", "statesHalo");
const _provs = viewbox.append("g").attr("id", "provs");
const _zones = viewbox.append("g").attr("id", "zones");
const borders = viewbox.append("g").attr("id", "borders");
const _stateBorders = borders.append("g").attr("id", "stateBorders");
const _provinceBorders = borders.append("g").attr("id", "provinceBorders");
const routes = viewbox.append("g").attr("id", "routes");
const _roads = routes.append("g").attr("id", "roads");
const _trails = routes.append("g").attr("id", "trails");
const _searoutes = routes.append("g").attr("id", "searoutes");
const _temperature = viewbox.append("g").attr("id", "temperature");
const coastline = viewbox.append("g").attr("id", "coastline");
const _ice = viewbox.append("g").attr("id", "ice");
const prec = viewbox.append("g").attr("id", "prec").style("display", "none");
const population = viewbox.append("g").attr("id", "population");
const emblems = viewbox.append("g").attr("id", "emblems").style("display", "none");
const icons = viewbox.append("g").attr("id", "icons");
const labels = viewbox.append("g").attr("id", "labels");
const _burgIcons = icons.append("g").attr("id", "burgIcons");
const _anchors = icons.append("g").attr("id", "anchors");
const _armies = viewbox.append("g").attr("id", "armies");
const markers = viewbox.append("g").attr("id", "markers");
const fogging = viewbox
  .append("g")
  .attr("id", "fogging-cont")
  .attr("mask", "url(#fog)")
  .append("g")
  .attr("id", "fogging")
  .style("display", "none");
const ruler = viewbox.append("g").attr("id", "ruler").style("display", "none");
var _debug = viewbox.append("g").attr("id", "debug");

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
const burgLabels = labels.append("g").attr("id", "burgLabels");

// population groups
population.append("g").attr("id", "rural");
population.append("g").attr("id", "urban");

// emblem groups
emblems.append("g").attr("id", "burgEmblems");
emblems.append("g").attr("id", "provinceEmblems");
emblems.append("g").attr("id", "stateEmblems");

// compass
compass.append("use").attr("xlink:href", "#defs-compass-rose");

// fogging
fogging.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
fogging
  .append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("fill", "#e8f0f6")
  .attr("filter", "url(#splotch)");

// assign events separately as not a viewbox child
scaleBar.on("mousemove", () => tip("Click to open Units Editor")).on("click", () => editUnits());
legend
  .on("mousemove", () => tip("Drag to change the position. Click to hide the legend"))
  .on("click", () => clearLegend());

// main data variables
var grid = {}; // initial graph based on jittered square grid and data
var pack = {}; // packed graph and data
var seed;
let mapId;
const mapHistory = [];
let _elSelected;
const _modules = ((window as Window & { modules?: Record<string, unknown> }).modules ||= {});
let _notes = [];
const _rulers = new Rulers();
let customization = 0;

// global options; in v2.0 to be used for all UI settings
const getDefaultBurgGroups = () => {
  const fmg = getFmg();
  if (fmg?.Burgs?.getDefaultGroups) return fmg.Burgs.getDefaultGroups();

  // If window.fmg isn't populated yet due to import/initialization order,
  // prefer core instances directly to obtain default groups synchronously.
  try {
    const core = getCoreFmgInstances();
    if (core && core.Burgs && typeof core.Burgs.getDefaultGroups === "function") return core.Burgs.getDefaultGroups();
  } catch (e) {
    // ignore and fallthrough to empty
  }

  return [];
};

const options = {
  pinNotes: false,
  winds: [225, 45, 225, 315, 135, 315],
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  stateLabelsMode: "auto",
  showBurgPreview: true,
  burgs: {
    groups: JSON.safeParse(localStorage.getItem("burg-groups")) || getDefaultBurgGroups()
  }
};

// global style object; in v2.0 to be used for all map styles and render settings
const _style = { burgLabels: {}, burgIcons: {}, anchors: {} };

const biomesData = Biomes.getDefault();
const _nameBases = Names.getNameBases(); // cultures-related data
const _color = d3.scaleSequential(d3.interpolateSpectral); // default color scheme
const _lineGen = d3.line().curve(d3.curveBasis); // d3 line generator with default curve interpolation

// d3 zoom behavior
let scale = 1;
let viewX = 0;
let viewY = 0;

let rafId = null;
let pendingScaleChange = false;
let pendingPositionChange = false;
function zoomRaf() {
  const { k, x, y } = d3.event.transform;

  const isScaleChanged = Boolean(scale - k);
  const isPositionChanged = Boolean(viewX - x || viewY - y);
  if (!isScaleChanged && !isPositionChanged) return;

  scale = k;
  viewX = x;
  viewY = y;

  // Coalesce multiple zoom events into one paint.
  // While a RAF is pending, keep updating latest transform state and OR-change flags.
  // The scheduled RAF consumes these accumulated flags and then resets them.
  pendingScaleChange = pendingScaleChange || isScaleChanged;
  pendingPositionChange = pendingPositionChange || isPositionChanged;

  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;

    const mapSvg = d3.select("#map");
    const currentViewbox = mapSvg.select("#viewbox");
    const currentScaleBar = mapSvg.select("#scaleBar");

    // Safely clears these flags for future renders
    const didScaleChange = pendingScaleChange;
    const didPositionChange = pendingPositionChange;
    pendingScaleChange = false;
    pendingPositionChange = false;

    // Uses global values, so each frame always draws using the latest positioning values
    currentViewbox.attr("transform", `translate(${viewX} ${viewY}) scale(${scale})`);

    if (didPositionChange) {
      if (layerIsOn("toggleCoordinates")) drawCoordinates();
    }

    if (customization === 1) {
      const canvas = ensureEl("canvas") as unknown as HTMLCanvasElement | null;
      if (canvas && canvas.style.opacity !== "0") {
        const img = ensureEl("imageToConvert") as unknown as HTMLImageElement | null;
        if (img) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(scale, 0, 0, scale, viewX, viewY);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
        }
      }
    }

    if (didScaleChange) {
      invokeActiveZooming();
      drawScaleBar(currentScaleBar, scale);
      fitScaleBar(currentScaleBar, svgWidth, svgHeight);
    }

    if (didPositionChange || didScaleChange) {
      (getFmg() as FmgGlobalContext & { updateMinimap?: () => void } | undefined)?.updateMinimap?.();
    }
  });
}

const zoom = d3.zoom().scaleExtent([1, 20]).on("zoom", zoomRaf);

var mapCoordinates = {}; // map coordinates on globe
const _populationRate = +ensureEl("populationRateInput")?.value;
const _distanceScale = +ensureEl("distanceScaleInput")?.value;
const _urbanization = +ensureEl("urbanizationInput")?.value;
const _urbanDensity = +ensureEl("urbanDensityInput")?.value;

publishLegacyMainGlobals();

applyStoredOptions();

// voronoi graph extension, cannot be changed after generation
var graphWidth = +mapWidthInput?.value;
var graphHeight = +mapHeightInput?.value;

// svg canvas resolution, can be changed
const svgWidth = graphWidth;
const svgHeight = graphHeight;

(window as unknown as Record<string, unknown>).svgWidth = svgWidth;
(window as unknown as Record<string, unknown>).svgHeight = svgHeight;

landmass.append("rect").attr("x", 0).attr("y", 0).attr("width", graphWidth).attr("height", graphHeight);
oceanPattern
  .append("rect")
  .attr("fill", "url(#oceanic)")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", graphWidth)
  .attr("height", graphHeight);
oceanLayers
  .append("rect")
  .attr("id", "oceanBase")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", graphWidth)
  .attr("height", graphHeight);

initStartupOnDomContentLoaded({
  document,
  locationHostname: location.hostname,
  alertMessage,
  jqueryDialog: options => $("#alert").dialog(options),
  hideLoading,
  checkLoadParameters,
  restoreDefaultEvents,
  initiateAutosave,
  initTourPromptButton
});

function hideLoading() {
  hideLoadingUI({ d3 });
}

function showLoading() {
  showLoadingUI({ d3 });
}

function publishLegacyMainGlobals() {
  const legacyGlobals = window as unknown as Record<string, unknown>;
  const fmg = getFmg() as (FmgGlobalContext & {
    generateMapOnLoad?: () => Promise<void>;
    reGraph?: () => void;
    focusOn?: () => void;
    showStatistics: () => void;
    clearMainTip: () => void;
    fitMapToScreen?: () => void;
  }) | undefined;

  const defineMutableGlobal = <T>(name: string, getValue: () => T, setValue: (value: T) => void) => {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: getValue,
      set: value => setValue(value as T)
    });
  };

  // Runtime flags used across legacy modules.
  legacyGlobals.PRODUCTION = PRODUCTION;
  legacyGlobals.DEBUG = DEBUG;
  legacyGlobals.INFO = INFO;
  legacyGlobals.TIME = TIME;
  legacyGlobals.WARN = WARN;
  legacyGlobals.ERROR = ERROR;
  legacyGlobals.MOBILE = _MOBILE;

  // Frequently referenced d3 selections.
  legacyGlobals.svg = svg;
  legacyGlobals.defs = _defs;
  legacyGlobals.viewbox = viewbox;
  legacyGlobals.scaleBar = scaleBar;
  legacyGlobals.legend = legend;
  legacyGlobals.ocean = ocean;
  legacyGlobals.oceanLayers = oceanLayers;
  legacyGlobals.oceanPattern = oceanPattern;
  legacyGlobals.landmass = landmass;
  legacyGlobals.texture = _texture;
  legacyGlobals.terrs = terrs;
  legacyGlobals.lakes = lakes;
  legacyGlobals.biomes = _biomes;
  legacyGlobals.cells = _cells;
  legacyGlobals.gridOverlay = _gridOverlay;
  legacyGlobals.coordinates = _coordinates;
  legacyGlobals.rivers = _rivers;
  legacyGlobals.terrain = _terrain;
  legacyGlobals.relig = _relig;
  legacyGlobals.cults = _cults;
  legacyGlobals.regions = regions;
  legacyGlobals.statesBody = _statesBody;
  legacyGlobals.statesHalo = statesHalo;
  legacyGlobals.provs = _provs;
  legacyGlobals.zones = _zones;
  legacyGlobals.borders = borders;
  legacyGlobals.stateBorders = _stateBorders;
  legacyGlobals.provinceBorders = _provinceBorders;
  legacyGlobals.routes = routes;
  legacyGlobals.roads = _roads;
  legacyGlobals.trails = _trails;
  legacyGlobals.searoutes = _searoutes;
  legacyGlobals.temperature = _temperature;
  legacyGlobals.coastline = coastline;
  legacyGlobals.ice = _ice;
  legacyGlobals.prec = prec;
  legacyGlobals.population = population;
  legacyGlobals.emblems = emblems;
  legacyGlobals.icons = icons;
  legacyGlobals.labels = labels;
  legacyGlobals.burgLabels = burgLabels;
  legacyGlobals.burgIcons = _burgIcons;
  legacyGlobals.anchors = _anchors;
  legacyGlobals.armies = _armies;
  legacyGlobals.compass = compass;
  legacyGlobals.markers = markers;
  legacyGlobals.fogging = fogging;
  legacyGlobals.ruler = ruler;
  legacyGlobals.debug = _debug;

  // Legacy mutable state that existing modules still access as globals.
  defineMutableGlobal("grid", () => grid, value => {
    grid = value as typeof grid;
  });
  defineMutableGlobal("pack", () => pack, value => {
    pack = value as typeof pack;
  });
  defineMutableGlobal("seed", () => seed, value => {
    seed = value;
  });
  defineMutableGlobal("mapId", () => mapId, value => {
    mapId = value;
  });
  defineMutableGlobal("elSelected", () => _elSelected, value => {
    _elSelected = value;
  });
  defineMutableGlobal("notes", () => _notes, value => {
    _notes = value;
  });
  defineMutableGlobal("customization", () => customization, value => {
    customization = value;
  });
  defineMutableGlobal("scale", () => scale, value => {
    scale = value;
  });
  defineMutableGlobal("viewX", () => viewX, value => {
    viewX = value;
  });
  defineMutableGlobal("viewY", () => viewY, value => {
    viewY = value;
  });
  defineMutableGlobal("graphWidth", () => graphWidth, value => {
    graphWidth = value;
  });
  defineMutableGlobal("graphHeight", () => graphHeight, value => {
    graphHeight = value;
  });
  defineMutableGlobal("mapCoordinates", () => mapCoordinates, value => {
    mapCoordinates = value;
  });

  legacyGlobals.mapHistory = mapHistory;
  legacyGlobals.modules = _modules;
  legacyGlobals.rulers = _rulers;
  legacyGlobals.options = options;
  legacyGlobals.style = _style;
  legacyGlobals.biomesData = biomesData;
  legacyGlobals.nameBases = _nameBases;
  legacyGlobals.color = _color;
  legacyGlobals.lineGen = _lineGen;
  legacyGlobals.populationRate = _populationRate;
  legacyGlobals.distanceScale = _distanceScale;
  legacyGlobals.urbanization = _urbanization;
  legacyGlobals.urbanDensity = _urbanDensity;
  legacyGlobals.zoom = zoom;
  legacyGlobals.zoomTo = zoomTo;
  legacyGlobals.calculateTemperatures = calculateTemperatures;

  fmg.generateMapOnLoad = generateMapOnLoad;
  fmg.reGraph = reGraph;
  fmg.focusOn = focusOn;
  fmg.showStatistics = showStatistics;
  fmg.fitMapToScreen = fitMapToScreen;
  (fmg as any).tip = tip;
  (fmg as any).showMainTip = showMainTip;
  fmg.clearMainTip = clearMainTip;
}

// decide which map should be loaded or generated on page load
async function checkLoadParameters() {
  await checkLoadParametersFlow(
    buildCheckLoadParametersDeps({
      WARN,
      ERROR,
      ensureEl,
      ldb,
      uploadMap,
      loadMapFromURL,
      showUploadErrorMessage,
      applyStyleOnLoad,
      generate,
      applyLayersPreset,
      drawLayers,
      fitMapToScreen,
      focusOn,
      toggleAssistant
    })
  );
}

async function generateMapOnLoad() {
  await generateMapOnLoadFlow(
    buildGenerateMapOnLoadDeps({
      applyStyleOnLoad,
      generate,
      applyLayersPreset,
      drawLayers,
      fitMapToScreen,
      focusOn,
      toggleAssistant
    })
  );
}

// focus on coordinates, cell or burg provided in searchParams
function focusOn() {
  focusOnFlow(buildFocusOnDeps({ pack: pack as FocusDeps["pack"], graphWidth, graphHeight, zoomTo, findBurgForMFCG }));
}

function toggleAssistant() {
  toggleAssistantWidget({ showDataTip });
}

function initTourPromptButton() {
  initTourPromptButtonUI({
    document,
    localStorage,
    startTour: () => {
      getFmg()?.startUITour?.();
    }
  });
}

// find burg for MFCG and focus on it
function findBurgForMFCG(params) {
  findBurgForMFCGFlow(
    buildFindBurgForMFCGDeps({
      pack: pack as SelectMfcgDeps["pack"],
      d3,
      ERROR,
      burgLabels,
      zoomTo,
      invokeActiveZooming,
      tip
    }),
    params
  );
}

// Zoom to a specific point
function zoomTo(x, y, z = 8, d = 2000) {
  const currentSvg = d3.select("#map");
  zoomToPoint(buildZoomToPointDeps({ d3, svg: currentSvg, zoom, svgWidth, svgHeight }), x, y, z, d);
}

// Reset zoom to initial
function resetZoom(d = 1000) {
  const currentSvg = d3.select("#map");
  resetZoomToInitial(buildResetZoomDeps({ d3, svg: currentSvg, zoom }), d);
}

// active zooming feature
export function invokeActiveZooming() {
  const mapSvg = d3.select("#map");
  const currentCoastline = mapSvg.select("#coastline");
  const currentLabels = mapSvg.select("#labels");
  const currentEmblems = mapSvg.select("#emblems");
  const currentStatesHalo = mapSvg.select("#statesHalo");
  const currentMarkers = mapSvg.select("#markers");
  const currentRuler = mapSvg.select("#ruler");

  const renderGroupCOAs = (group: Element) => {
    const renderer = getFmg()?.renderGroupCOAs;
    if (!renderer) return;
    void renderer(group as SVGGElement);
  };

  invokeActiveZoomingView(
    buildInvokeActiveZoomingDeps({
      coastline: currentCoastline,
      scale,
      labels: currentLabels,
      emblems: currentEmblems,
      statesHalo: currentStatesHalo,
      customization,
      markers: currentMarkers,
      pack,
      ruler: currentRuler,
      shapeRendering,
      rn: runtime.rn,
      rescaleLabels,
      hideLabels,
      hideEmblems,
      renderGroupCOAs
    })
  );
}

initDragToUpload({
  document,
  ensureEl,
  alertMessage,
  closeDialogs,
  uploadMap,
  jqueryDialog: options => $("#alert").dialog(options)
});

async function generate(options) {
  let Burgs: any = getFmgOptionalService("Burgs");
  const Markers = getFmgOptionalService("Markers");
  const Provinces = getFmgOptionalService("Provinces");
  if (!Burgs) throw new Error("Burgs is not available");
  if (!Markers) throw new Error("Markers is not available");
  if (!Provinces) throw new Error("Provinces is not available");

  // Normalize Burgs shape: handle several legacy shapes (constructor, stub).
  // Prefer real core instances when available to guarantee `.generate()`.
  if (typeof Burgs === "function" || typeof Burgs?.generate === "undefined") {
    try {
      const core = getCoreFmgInstances();
      if (core && core.Burgs) {
        Burgs = core.Burgs;
        WARN && console.warn("Burgs: resolved to core instance via getCoreFmgInstances()");
      }
    } catch (err) {
      // last-resort: if it's a callable factory, try calling it
      if (typeof Burgs === "function") {
        try {
          const maybe = Burgs();
          if (maybe && typeof maybe.generate === "function") Burgs = maybe;
        } catch (e) {
          WARN && console.warn("Burgs: unable to resolve instance", e);
        }
      }
    }
  }

  const generationModules = buildGenerationModules({
    Features: getFmgOptionalService("Features") || (window as unknown as {Features?: {markupGrid: () => void; markupPack: () => void; defineGroups: () => void}}).Features,
    Rivers,
    Biomes,
    Ice,
    Cultures: getFmgOptionalService("Cultures") || (window as unknown as {Cultures?: {generate: () => void; expand: () => void}}).Cultures,
    Burgs,
    States,
    Routes,
    Religions: getFmgOptionalService("Religions") || (window as unknown as {Religions?: {generate: () => void}}).Religions,
    Provinces,
    Lakes,
    Military,
    Markers,
    Zones: getFmgOptionalService("Zones") || (window as unknown as {Zones?: {generate: (globalModifier?: number) => void}}).Zones,
    Names
  });

  const deps = buildGenerateDeps({
    INFO,
    WARN,
    ERROR,
    getSeed: () => seed,
    setSeed,
    getGrid: () => grid,
    setGrid: nextGrid => {
      grid = nextGrid;
    },
    resetPack: () => {
      pack = {};
    },
    invokeActiveZooming,
    applyGraphSize,
    randomizeOptions,
    shouldRegenerateGrid: runtime.shouldRegenerateGrid,
    generateGrid: runtime.generateGrid,
    HeightmapGenerator: getFmgOptionalService("HeightmapGenerator") || runtime.HeightmapGenerator,
    addLakesInDeepDepressions,
    openNearSeaLakes,
    OceanLayers: drawOceanLayers,
    defineMapSize,
    calculateMapCoordinates,
    calculateTemperatures,
    generatePrecipitation,
    reGraph,
    createDefaultRuler,
    rankCells,
    drawScaleBar,
    scaleBar,
    scale,
    rn: runtime.rn,
    showStatistics,
    parseError: runtime.parseError,
    clearMainTip,
    alertMessage,
    cleanupData: runtime.cleanupData,
    regenerateMap,
    jqueryDialog: options => $("#alert").dialog(options),
    generationModules
  });

  await generateMapFlow(deps, options);
}

// set map seed (string!)
function setSeed(precreatedSeed) {
  seed = setSeedFlow(
    buildSetSeedDeps({
      mapHistory,
      locationHref: window.location.href,
      generateSeed: runtime.generateSeed,
      ensureEl,
      aleaPRNG: runtime.aleaPRNG
    }),
    precreatedSeed
  );
}

function addLakesInDeepDepressions() {
  addLakesInDeepDepressionsFlow({ TIME, ensureEl, grid, d3 });
}

// near sea lakes usually get a lot of water inflow, most of them should break threshold and flow out to sea (see Ancylus Lake)
function openNearSeaLakes() {
  openNearSeaLakesFlow({ ensureEl, grid, TIME });
}

// define map size and position based on template and random factor
function defineMapSize() {
  defineMapSizeFlow(
    buildDefineMapSizeDeps({
      ensureEl,
      grid,
      gauss: runtime.gauss,
      P: runtime.P,
      locked,
      locationHref: window.location.href,
      mapSizeOutput: runtime.mapSizeOutput,
      mapSizeInput: runtime.mapSizeInput,
      latitudeOutput: runtime.latitudeOutput,
      latitudeInput: runtime.latitudeInput,
      longitudeOutput: runtime.longitudeOutput,
      longitudeInput: runtime.longitudeInput
    })
  );
}

// calculate map position on globe
function calculateMapCoordinates() {
  mapCoordinates = calculateMapCoordinatesFlow(
    buildCalculateMapCoordinatesDeps({ ensureEl, rn: runtime.rn, graphWidth, graphHeight })
  );
}

// temperature model, trying to follow real-world data
// based on http://www-das.uwyo.edu/~geerts/cwx/notes/chap16/Image64.gif
function calculateTemperatures() {
  calculateTemperaturesFlow(
    buildCalculateTemperaturesDeps({
      TIME,
      grid,
      options,
      heightExponentInput: heightExponentInput as unknown as HTMLInputElement,
      mapCoordinates: mapCoordinates as MapCoordinatesLike,
      graphHeight,
      rn: runtime.rn,
      minmax: runtime.minmax,
      DEBUG
    })
  );
}

// simplest precipitation model
function generatePrecipitation() {
  generatePrecipitationFlow(
    buildGeneratePrecipitationDeps({
      TIME,
      prec,
      grid,
      pointsInput: runtime.pointsInput,
      precInput: runtime.precInput,
      mapCoordinates: mapCoordinates as MapCoordinatesLike,
      graphHeight,
      graphWidth,
      options,
      rand: runtime.rand,
      minmax: runtime.minmax,
      d3
    })
  );
}

// recalculate Voronoi Graph to pack cells
function reGraph() {
  const deps = buildReGraphDeps({
    TIME,
    grid,
    pack,
    rn: runtime.rn,
    calculateVoronoi: runtime.calculateVoronoi,
    createTypedArray: runtime.createTypedArray,
    UINT16_MAX: runtime.UINT16_MAX,
    getPackPolygon: (cellId: number) => runtime.getPackPolygon(cellId, pack as unknown as PackedGraph),
    d3
  });

  reGraphFlow(deps as unknown as Parameters<typeof reGraphFlow>[0]);
}

// assess cells suitability to calculate population and rand cells for culture center and burgs placement
function rankCells() {
  rankCellsFlow(
    buildRankCellsDeps({
      TIME,
      pack: pack as unknown as PackedGraph,
      biomesData,
      normalize: runtime.normalize,
      d3
    })
  );
}

// show map stats on generation complete
function showStatistics() {
  showStatisticsFlow(
    buildShowStatisticsDeps({
      ensureEl,
      heightmapTemplates,
      locked,
      seed,
      graphWidth,
      graphHeight,
      grid,
      pack,
      mapSizeValue: runtime.mapSizeOutput.value,
      culturesSetValue: runtime.culturesSet.value,
      mapHistory,
      INFO,
      setMapId: id => {
        mapId = id;
        runtime.mapId = id;
      }
    })
  );
}

let regenerateMapImpl: ((options: unknown) => unknown) | undefined;

function regenerateMap(options: unknown) {
  if (!regenerateMapImpl) {
    // Compatibility wrapper: prefer runtime.ThreeD when available (legacy global),
    // otherwise fall back to window.fmg compatibility API exposed by globals-compat.
    const threeDCompat: { options?: any; redraw?: () => void; update?: () => void; stop?: () => void } = {
      get options() {
        // runtime.ThreeD (if present) contains live `options` object
        if ((runtime as any).ThreeD && (runtime as any).ThreeD.options) return (runtime as any).ThreeD.options;
        // fallback: window.fmg.get3dOptions() provided by globals-compat
        const f = getFmg();
        if (f && typeof f.get3dOptions === "function") return f.get3dOptions();
        return {};
      },
      redraw() {
        if ((runtime as any).ThreeD && typeof (runtime as any).ThreeD.redraw === "function") return (runtime as any).ThreeD.redraw();
        const f = getFmg();
        if (f && typeof f.redraw3d === "function") return f.redraw3d();
      },
      update() {
        if ((runtime as any).ThreeD && typeof (runtime as any).ThreeD.update === "function") return (runtime as any).ThreeD.update();
        const f = getFmg();
        if (f && typeof f.update3d === "function") return f.update3d();
      },
      stop() {
        if ((runtime as any).ThreeD && typeof (runtime as any).ThreeD.stop === "function") return (runtime as any).ThreeD.stop();
        const f = getFmg();
        if (f && typeof f.stop3d === "function") return f.stop3d();
      }
    };

    regenerateMapImpl = createRegenerateMap(
      runtime.debounce,
      buildRegenerateMapDeps({
        WARN,
        ensureEl,
        showLoading,
        hideLoading,
        closeDialogs,
        setCustomization: value => {
          customization = value;
        },
        resetZoom,
        undraw,
        generate,
        drawLayers,
        ThreeD: threeDCompat,
        isWorldConfiguratorVisible: () => $("#worldConfigurator").is(":visible"),
        editWorld,
        fitMapToScreen,
        clearMainTip
      })
    );
  }

  return regenerateMapImpl(options);
}

// clear the map
function undraw() {
  undrawFlow(
    buildUndrawDeps({
      viewbox,
      ensureEl,
      resetNotes: () => {
        _notes = [];
      },
      unfog: runtime.unfog
    })
  );
}

// Register invokeActiveZooming on window.fmg for HTML onclick handlers
if (typeof window !== "undefined") {
  const fmg = getFmg() as (FmgGlobalContext & {
    invokeActiveZooming?: () => void;
    regenerateMap?: (options: unknown) => void;
    rankCells?: () => void;
  }) | undefined;
  if (fmg) {
    fmg.invokeActiveZooming = invokeActiveZooming;
    fmg.regenerateMap = regenerateMap;
    fmg.rankCells = rankCells;
  }
}
