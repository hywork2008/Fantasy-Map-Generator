// Azgaar (azgaar.fmg@yandex.com). Minsk, 2017-2023. MIT License
// https://github.com/Azgaar/Fantasy-Map-Generator

import { invokeActiveZoomingView, resetZoomToInitial, zoomToPoint } from "./modules/ui/zoom-utils";
import { buildInvokeActiveZoomingDeps, buildResetZoomDeps, buildZoomToPointDeps } from "./modules/ui/zoom-deps";
import { initTourPromptButtonUI, toggleAssistantWidget } from "./modules/ui/assistant";
import { initDragToUpload } from "./modules/ui/drag-upload";
import { hideLoadingUI, showLoadingUI } from "./modules/ui/loading-ui";
import { initStartupOnDomContentLoaded } from "./modules/ui/startup-init";
import {
  checkLoadParametersFlow,
  findBurgForMFCGFlow,
  focusOnFlow,
  generateMapOnLoadFlow
} from "./modules/ui/initial-load";
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

// set debug options (resolved in globals.d.ts - this file defines actual values)
const PRODUCTION_VAL = location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
const DEBUG_VAL = (JSON as any).safeParse(localStorage.getItem("debug")) || {};
const INFO = true;
const TIME = true;
const WARN = true;
const ERROR = true;

// detect device
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _MOBILE = window.innerWidth < 600 || ((navigator as any).userAgentData?.mobile ?? false);

if (PRODUCTION && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.error("ServiceWorker registration failed: ", err);
    });
  });

  window.addEventListener(
    "beforeinstallprompt",
    async (event: any) => {
      event.preventDefault();
      try {
        const Installation = await import("./modules/dynamic/installation.js");
        (Installation as any).default?.init?.(event) || (Installation as any).init?.(event);
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
const _modules = {};
let _notes = [];
const _rulers = new Rulers();
let customization = 0;

// global options; in v2.0 to be used for all UI settings
const options = {
  pinNotes: false,
  winds: [225, 45, 225, 315, 135, 315],
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  stateLabelsMode: "auto",
  showBurgPreview: true,
  burgs: {
    groups: JSON.safeParse(localStorage.getItem("burg-groups")) || Burgs.getDefaultGroups()
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

    // Safely clears these flags for future renders
    const didScaleChange = pendingScaleChange;
    const didPositionChange = pendingPositionChange;
    pendingScaleChange = false;
    pendingPositionChange = false;

    // Uses global values, so each frame always draws using the latest positioning values
    viewbox.attr("transform", `translate(${viewX} ${viewY}) scale(${scale})`);

    if (didPositionChange) {
      if (layerIsOn("toggleCoordinates")) drawCoordinates();
    }

    if (customization === 1) {
      const canvas = ensureEl("canvas") as HTMLCanvasElement | null;
      if (canvas && canvas.style.opacity !== "0") {
        const img = ensureEl("imageToConvert") as HTMLImageElement | null;
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
      drawScaleBar(scaleBar, scale);
      fitScaleBar(scaleBar, svgWidth, svgHeight);
    }

    if (didPositionChange || didScaleChange) {
      window.updateMinimap && updateMinimap();
    }
  });
}

const zoom = d3.zoom().scaleExtent([1, 20]).on("zoom", zoomRaf);

var mapCoordinates = {}; // map coordinates on globe
const _populationRate = +(ensureEl("populationRateInput") as HTMLInputElement)?.value;
const _distanceScale = +(ensureEl("distanceScaleInput") as HTMLInputElement)?.value;
const _urbanization = +(ensureEl("urbanizationInput") as HTMLInputElement)?.value;
const _urbanDensity = +(ensureEl("urbanDensityInput") as HTMLInputElement)?.value;

applyStoredOptions();

// voronoi graph extension, cannot be changed after generation
var graphWidth = +(mapWidthInput as HTMLInputElement)?.value;
var graphHeight = +(mapHeightInput as HTMLInputElement)?.value;

// svg canvas resolution, can be changed
const svgWidth = graphWidth;
const svgHeight = graphHeight;

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
  focusOnFlow(buildFocusOnDeps({ pack, graphWidth, graphHeight, zoomTo, findBurgForMFCG }));
}

function toggleAssistant() {
  toggleAssistantWidget({ showDataTip });
}

function initTourPromptButton() {
  initTourPromptButtonUI({ document, localStorage, UITour });
}

// find burg for MFCG and focus on it
function findBurgForMFCG(params) {
  findBurgForMFCGFlow(
    buildFindBurgForMFCGDeps({ pack, d3, ERROR, burgLabels, zoomTo, invokeActiveZooming, tip }),
    params
  );
}

// Zoom to a specific point
function zoomTo(x, y, z = 8, d = 2000) {
  zoomToPoint(buildZoomToPointDeps({ d3, svg, zoom, svgWidth, svgHeight }), x, y, z, d);
}

// Reset zoom to initial
function resetZoom(d = 1000) {
  resetZoomToInitial(buildResetZoomDeps({ d3, svg, zoom }), d);
}

// active zooming feature
function invokeActiveZooming() {
  invokeActiveZoomingView(
    buildInvokeActiveZoomingDeps({
      coastline,
      scale,
      labels,
      emblems,
      statesHalo,
      customization,
      markers,
      pack,
      ruler,
      shapeRendering,
      rn: (window as any).rn,
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
  const generationModules = buildGenerationModules({
    Features,
    Rivers,
    Biomes,
    Ice,
    Cultures,
    Burgs,
    States,
    Routes,
    Religions,
    Provinces,
    Lakes,
    Military,
    Markers: (window as any).Markers,
    Zones,
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
    applyGraphSize: (window as any).applyGraphSize,
    randomizeOptions: (window as any).randomizeOptions,
    shouldRegenerateGrid: (window as any).shouldRegenerateGrid,
    generateGrid: (window as any).generateGrid,
    HeightmapGenerator: (window as any).HeightmapGenerator,
    addLakesInDeepDepressions,
    openNearSeaLakes,
    OceanLayers: (window as any).OceanLayers,
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
    rn: (window as any).rn,
    showStatistics,
    parseError: (window as any).parseError,
    clearMainTip: (window as any).clearMainTip,
    alertMessage,
    cleanupData: (window as any).cleanupData,
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
      generateSeed: (window as any).generateSeed,
      ensureEl,
      aleaPRNG: (window as any).aleaPRNG
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
      gauss: (window as any).gauss,
      P: (window as any).P,
      locked,
      locationHref: window.location.href,
      mapSizeOutput: (window as any).mapSizeOutput,
      mapSizeInput: (window as any).mapSizeInput,
      latitudeOutput: (window as any).latitudeOutput,
      latitudeInput: (window as any).latitudeInput,
      longitudeOutput: (window as any).longitudeOutput,
      longitudeInput: (window as any).longitudeInput
    })
  );
}

// calculate map position on globe
function calculateMapCoordinates() {
  mapCoordinates = calculateMapCoordinatesFlow(
    buildCalculateMapCoordinatesDeps({ ensureEl, rn: (window as any).rn, graphWidth, graphHeight })
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
      heightExponentInput,
      mapCoordinates: mapCoordinates as any,
      graphHeight,
      rn: (window as any).rn,
      minmax: (window as any).minmax,
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
      pointsInput: (window as any).pointsInput,
      precInput: (window as any).precInput,
      mapCoordinates: mapCoordinates as any,
      graphHeight,
      graphWidth,
      options,
      rand: (window as any).rand,
      minmax: (window as any).minmax,
      d3
    })
  );
}

// recalculate Voronoi Graph to pack cells
function reGraph() {
  reGraphFlow(
    buildReGraphDeps({
      TIME,
      grid,
      pack,
      rn: (window as any).rn,
      calculateVoronoi: (window as any).calculateVoronoi,
      createTypedArray: (window as any).createTypedArray,
      UINT16_MAX: (window as any).UINT16_MAX,
      getPackPolygon: (window as any).getPackPolygon,
      d3
    })
  );
}

// assess cells suitability to calculate population and rand cells for culture center and burgs placement
function rankCells() {
  rankCellsFlow(buildRankCellsDeps({ TIME, pack, biomesData, normalize: (window as any).normalize, d3 }));
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
      mapSizeValue: (window as any).mapSizeOutput.value,
      culturesSetValue: (window as any).culturesSet.value,
      mapHistory,
      INFO,
      setMapId: id => {
        mapId = id;
        (window as any).mapId = id;
      }
    })
  );
}

const regenerateMap = createRegenerateMap(
  (window as any).debounce,
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
    ThreeD: (window as any).ThreeD,
    isWorldConfiguratorVisible: () => $("#worldConfigurator").is(":visible"),
    editWorld,
    fitMapToScreen,
    clearMainTip: (window as any).clearMainTip
  })
);

// clear the map
function undraw() {
  undrawFlow(
    buildUndrawDeps({
      viewbox,
      ensureEl,
      resetNotes: () => {
        _notes = [];
      },
      unfog: (window as any).unfog
    })
  );
}
