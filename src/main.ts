import { openRichDialog } from "./ui/dialogs/dialogService";
// Azgaar (azgaar.fmg@yandex.com). Minsk, 2017-2023. MIT License
// https://github.com/Azgaar/Fantasy-Map-Generator

// jQuery setup: globals must be in a separate module so they are evaluated

import type { Selection } from "d3";
import * as d3 from "d3";
import { aleaPRNG } from "./components/AleaPRNG";
import { appServices } from "./context/appServices";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { Rulers } from "./controllers/measurers";
import { updateMinimap } from "./controllers/minimap";
import { applyStoredOptions, fitMapToScreen } from "./controllers/options";
import { editUnits } from "./editors/units-editor";
import { Biomes } from "./modules/biomes";
import type { Burg, BurgGroup } from "./modules/burgs-generator";
import { Burgs } from "./modules/burgs-generator";
import { Cultures } from "./modules/cultures-generator";
import { Features } from "./modules/features";
import { HeightmapGenerator } from "./modules/heightmap-generator";
import { Ice } from "./modules/ice";
import { Lakes } from "./modules/lakes";
import { Markers } from "./modules/markers-generator";
import { Military } from "./modules/military-generator";
import { Names } from "./modules/names-generator";
import { OceanLayers } from "./modules/ocean-layers";
import { Provinces } from "./modules/provinces-generator";
import { Religions } from "./modules/religions-generator";
import { Rivers } from "./modules/river-generator";
import { Routes } from "./modules/routes-generator";
import { States } from "./modules/states-generator";
import { Zones } from "./modules/zones-generator";
import { renderGroupCOAs } from "./renderers/draw-emblems";
import { CoordinatesRenderer, drawScaleBar, fitScaleBar } from "./renderers/index";
import { useOptionsState } from "./store/optionsState";
import {
  TYPED_ARRAY_MAX_VALUES as _TMP,
  calculateVoronoi,
  createTypedArray,
  debounce,
  ensureEl,
  gauss,
  generateGrid,
  generateSeed,
  getPackPolygon,
  minmax,
  normalize,
  P,
  parseError,
  rand,
  rn,
  shouldRegenerateGrid
} from "./utils";
import type { Grid } from "./utils/graphUtils";

window.alertMessage = document.createElement("div");

const UINT16_MAX = _TMP.UINT16_MAX;

// ─── Debug / feature flags ────────────────────────────────────────────────────

const PRODUCTION = location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
const DEBUG: Record<string, boolean | undefined> =
  (JSON.safeParse(localStorage.getItem("debug") ?? "") as Record<string, boolean | undefined>) || {};
const INFO = true;
const TIME = true;
const WARN = true;
const ERROR = true;
const MOBILE: boolean =
  window.innerWidth < 600 ||
  (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true;

window.DEBUG = DEBUG;
window.INFO = INFO;
window.TIME = TIME;
window.WARN = WARN;
window.ERROR = ERROR;
window.MOBILE = MOBILE;

if (PRODUCTION && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.error("ServiceWorker registration failed: ", err);
    });
  });

  window.addEventListener(
    "beforeinstallprompt",
    async event => {
      event.preventDefault();
      const Installation = await import(
        /* @vite-ignore */ `${import.meta.env.BASE_URL}modules/dynamic/installation.js?v=1.89.19`
      );
      Installation.init(event);
    },
    { once: true }
  );
}

// ─── SVG layers (appended in default render order) ───────────────────────────

let svg = d3.select("#map") as unknown as Selection<SVGSVGElement, unknown, null, undefined>;
let defs = svg.select("#deftemp") as Selection<SVGDefsElement, unknown, null, undefined>;
let viewbox = svg.select("#viewbox") as Selection<SVGGElement, unknown, null, undefined>;
let scaleBar = svg.select("#scaleBar") as Selection<SVGGElement, unknown, null, undefined>;
let legend = svg.append("g").attr("id", "legend") as Selection<SVGGElement, unknown, null, undefined>;
let ocean = viewbox.append("g").attr("id", "ocean") as Selection<SVGGElement, unknown, null, undefined>;
let oceanLayers = ocean.append("g").attr("id", "oceanLayers") as Selection<SVGGElement, unknown, null, undefined>;
let oceanPattern = ocean.append("g").attr("id", "oceanPattern") as Selection<SVGGElement, unknown, null, undefined>;
let landmass = viewbox.append("g").attr("id", "landmass") as Selection<SVGGElement, unknown, null, undefined>;
let texture = viewbox.append("g").attr("id", "texture") as Selection<SVGGElement, unknown, null, undefined>;
let terrs = viewbox.append("g").attr("id", "terrs") as Selection<SVGGElement, unknown, null, undefined>;
let lakes = viewbox.append("g").attr("id", "lakes") as Selection<SVGGElement, unknown, null, undefined>;
let biomes = viewbox.append("g").attr("id", "biomes") as Selection<SVGGElement, unknown, null, undefined>;
let cells = viewbox.append("g").attr("id", "cells") as Selection<SVGGElement, unknown, null, undefined>;
let gridOverlay = viewbox.append("g").attr("id", "gridOverlay") as Selection<SVGGElement, unknown, null, undefined>;
let coordinates = viewbox.append("g").attr("id", "coordinates") as Selection<SVGGElement, unknown, null, undefined>;
let compass = viewbox.append("g").attr("id", "compass").style("display", "none") as Selection<
  SVGGElement,
  unknown,
  null,
  undefined
>;
let rivers = viewbox.append("g").attr("id", "rivers") as Selection<SVGGElement, unknown, null, undefined>;
let terrain = viewbox.append("g").attr("id", "terrain") as Selection<SVGGElement, unknown, null, undefined>;
let relig = viewbox.append("g").attr("id", "relig") as Selection<SVGGElement, unknown, null, undefined>;
let cults = viewbox.append("g").attr("id", "cults") as Selection<SVGGElement, unknown, null, undefined>;
let regions = viewbox.append("g").attr("id", "regions") as Selection<SVGGElement, unknown, null, undefined>;
let statesBody = regions.append("g").attr("id", "statesBody") as Selection<SVGGElement, unknown, null, undefined>;
let statesHalo = regions.append("g").attr("id", "statesHalo") as Selection<SVGGElement, unknown, null, undefined>;
let provs = viewbox.append("g").attr("id", "provs") as Selection<SVGGElement, unknown, null, undefined>;
let zones = viewbox.append("g").attr("id", "zones") as Selection<SVGGElement, unknown, null, undefined>;
let borders = viewbox.append("g").attr("id", "borders") as Selection<SVGGElement, unknown, null, undefined>;
let stateBorders = borders.append("g").attr("id", "stateBorders") as Selection<SVGGElement, unknown, null, undefined>;
let provinceBorders = borders.append("g").attr("id", "provinceBorders") as Selection<
  SVGGElement,
  unknown,
  null,
  undefined
>;
let routes = viewbox.append("g").attr("id", "routes") as Selection<SVGGElement, unknown, null, undefined>;
let roads = routes.append("g").attr("id", "roads") as Selection<SVGGElement, unknown, null, undefined>;
let trails = routes.append("g").attr("id", "trails") as Selection<SVGGElement, unknown, null, undefined>;
let searoutes = routes.append("g").attr("id", "searoutes") as Selection<SVGGElement, unknown, null, undefined>;
let temperature = viewbox.append("g").attr("id", "temperature") as Selection<SVGGElement, unknown, null, undefined>;
let coastline = viewbox.append("g").attr("id", "coastline") as Selection<SVGGElement, unknown, null, undefined>;
let ice = viewbox.append("g").attr("id", "ice") as Selection<SVGGElement, unknown, null, undefined>;
let prec = viewbox.append("g").attr("id", "prec").style("display", "none") as Selection<
  SVGGElement,
  unknown,
  null,
  undefined
>;
let population = viewbox.append("g").attr("id", "population") as Selection<SVGGElement, unknown, null, undefined>;
let emblems = viewbox.append("g").attr("id", "emblems").style("display", "none") as Selection<
  SVGGElement,
  unknown,
  null,
  undefined
>;
let icons = viewbox.append("g").attr("id", "icons") as Selection<SVGGElement, unknown, null, undefined>;
let labels = viewbox.append("g").attr("id", "labels") as Selection<SVGGElement, unknown, null, undefined>;
let burgIcons = icons.append("g").attr("id", "burgIcons") as Selection<SVGGElement, unknown, null, undefined>;
let anchors = icons.append("g").attr("id", "anchors") as Selection<SVGGElement, unknown, null, undefined>;
let armies = viewbox.append("g").attr("id", "armies") as Selection<SVGGElement, unknown, null, undefined>;
let markers = viewbox.append("g").attr("id", "markers") as Selection<SVGGElement, unknown, null, undefined>;
let fogging = viewbox
  .append("g")
  .attr("id", "fogging-cont")
  .attr("mask", "url(#fog)")
  .append("g")
  .attr("id", "fogging")
  .style("display", "none") as Selection<SVGGElement, unknown, null, undefined>;
let ruler = viewbox.append("g").attr("id", "ruler").style("display", "none") as Selection<
  SVGGElement,
  unknown,
  null,
  undefined
>;
let debug = viewbox.append("g").attr("id", "debug") as Selection<SVGGElement, unknown, null, undefined>;

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
let burgLabels = labels.append("g").attr("id", "burgLabels") as Selection<SVGGElement, unknown, null, undefined>;

population.append("g").attr("id", "rural");
population.append("g").attr("id", "urban");

emblems.append("g").attr("id", "burgEmblems");
emblems.append("g").attr("id", "provinceEmblems");
emblems.append("g").attr("id", "stateEmblems");

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

scaleBar.node()?.addEventListener("mousemove", () => tip("Click to open Units Editor"));
scaleBar.node()?.addEventListener("click", () => editUnits());
legend.node()?.addEventListener("mousemove", () => tip("Drag to change the position. Click to hide the legend"));
legend.node()?.addEventListener("click", () => clearLegend());

// ─── Expose SVG layers globally ───────────────────────────────────────────────

window.svg = svg;
window.defs = defs;
window.viewbox = viewbox;
window.scaleBar = scaleBar;
window.legend = legend;
window.ocean = ocean;
window.oceanLayers = oceanLayers;
window.oceanPattern = oceanPattern;
window.landmass = landmass;
window.texture = texture;
window.terrs = terrs;
window.lakes = lakes;
window.biomes = biomes;
window.cells = cells;
window.gridOverlay = gridOverlay;
window.coordinates = coordinates;
window.compass = compass;
window.rivers = rivers;
window.terrain = terrain;
window.relig = relig;
window.cults = cults;
window.regions = regions;
window.statesBody = statesBody;
window.statesHalo = statesHalo;
window.provs = provs;
window.zones = zones;
window.borders = borders;
window.stateBorders = stateBorders;
window.provinceBorders = provinceBorders;
window.routes = routes;
window.roads = roads;
window.trails = trails;
window.searoutes = searoutes;
window.temperature = temperature;
window.coastline = coastline;
window.ice = ice;
window.prec = prec;
window.population = population;
window.emblems = emblems;
window.icons = icons;
window.labels = labels;
window.burgIcons = burgIcons;
window.anchors = anchors;
window.armies = armies;
window.markers = markers;
window.fogging = fogging;
window.ruler = ruler;
window.debug = debug;
window.burgLabels = burgLabels;

// ─── Populate viewContext singleton ────────────────────────────────────────────

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

// ─── SVG layer reinitialization (called after a new map SVG is loaded) ────────

export function reinitializeMapLayers(): void {
  svg = d3.select<SVGSVGElement, unknown>("#map") as unknown as Selection<SVGSVGElement, unknown, null, undefined>;
  defs = svg.select("#deftemp") as Selection<SVGDefsElement, unknown, null, undefined>;
  viewbox = svg.select("#viewbox") as Selection<SVGGElement, unknown, null, undefined>;
  scaleBar = svg.select("#scaleBar") as Selection<SVGGElement, unknown, null, undefined>;
  legend = svg.select("#legend") as Selection<SVGGElement, unknown, null, undefined>;
  ocean = viewbox.select("#ocean") as Selection<SVGGElement, unknown, null, undefined>;
  oceanLayers = ocean.select("#oceanLayers") as Selection<SVGGElement, unknown, null, undefined>;
  oceanPattern = ocean.select("#oceanPattern") as Selection<SVGGElement, unknown, null, undefined>;
  lakes = viewbox.select("#lakes") as Selection<SVGGElement, unknown, null, undefined>;
  landmass = viewbox.select("#landmass") as Selection<SVGGElement, unknown, null, undefined>;
  texture = viewbox.select("#texture") as Selection<SVGGElement, unknown, null, undefined>;
  terrs = viewbox.select("#terrs") as Selection<SVGGElement, unknown, null, undefined>;
  biomes = viewbox.select("#biomes") as Selection<SVGGElement, unknown, null, undefined>;
  ice = viewbox.select("#ice") as Selection<SVGGElement, unknown, null, undefined>;
  cells = viewbox.select("#cells") as Selection<SVGGElement, unknown, null, undefined>;
  gridOverlay = viewbox.select("#gridOverlay") as Selection<SVGGElement, unknown, null, undefined>;
  coordinates = viewbox.select("#coordinates") as Selection<SVGGElement, unknown, null, undefined>;
  compass = viewbox.select("#compass") as Selection<SVGGElement, unknown, null, undefined>;
  rivers = viewbox.select("#rivers") as Selection<SVGGElement, unknown, null, undefined>;
  terrain = viewbox.select("#terrain") as Selection<SVGGElement, unknown, null, undefined>;
  relig = viewbox.select("#relig") as Selection<SVGGElement, unknown, null, undefined>;
  cults = viewbox.select("#cults") as Selection<SVGGElement, unknown, null, undefined>;
  regions = viewbox.select("#regions") as Selection<SVGGElement, unknown, null, undefined>;
  statesBody = regions.select("#statesBody") as Selection<SVGGElement, unknown, null, undefined>;
  statesHalo = regions.select("#statesHalo") as Selection<SVGGElement, unknown, null, undefined>;
  provs = viewbox.select("#provs") as Selection<SVGGElement, unknown, null, undefined>;
  zones = viewbox.select("#zones") as Selection<SVGGElement, unknown, null, undefined>;
  borders = viewbox.select("#borders") as Selection<SVGGElement, unknown, null, undefined>;
  stateBorders = borders.select("#stateBorders") as Selection<SVGGElement, unknown, null, undefined>;
  provinceBorders = borders.select("#provinceBorders") as Selection<SVGGElement, unknown, null, undefined>;
  routes = viewbox.select("#routes") as Selection<SVGGElement, unknown, null, undefined>;
  roads = routes.select("#roads") as Selection<SVGGElement, unknown, null, undefined>;
  trails = routes.select("#trails") as Selection<SVGGElement, unknown, null, undefined>;
  searoutes = routes.select("#searoutes") as Selection<SVGGElement, unknown, null, undefined>;
  temperature = viewbox.select("#temperature") as Selection<SVGGElement, unknown, null, undefined>;
  coastline = viewbox.select("#coastline") as Selection<SVGGElement, unknown, null, undefined>;
  prec = viewbox.select("#prec") as Selection<SVGGElement, unknown, null, undefined>;
  population = viewbox.select("#population") as Selection<SVGGElement, unknown, null, undefined>;
  emblems = viewbox.select("#emblems") as Selection<SVGGElement, unknown, null, undefined>;
  labels = viewbox.select("#labels") as Selection<SVGGElement, unknown, null, undefined>;
  icons = viewbox.select("#icons") as Selection<SVGGElement, unknown, null, undefined>;
  burgIcons = icons.select("#burgIcons") as Selection<SVGGElement, unknown, null, undefined>;
  anchors = icons.select("#anchors") as Selection<SVGGElement, unknown, null, undefined>;
  armies = viewbox.select("#armies") as Selection<SVGGElement, unknown, null, undefined>;
  markers = viewbox.select("#markers") as Selection<SVGGElement, unknown, null, undefined>;
  ruler = viewbox.select("#ruler") as Selection<SVGGElement, unknown, null, undefined>;
  fogging = viewbox.select("#fogging") as Selection<SVGGElement, unknown, null, undefined>;
  debug = viewbox.select("#debug") as Selection<SVGGElement, unknown, null, undefined>;
  burgLabels = labels.select("#burgLabels") as Selection<SVGGElement, unknown, null, undefined>;

  window.svg = svg;
  window.defs = defs;
  window.viewbox = viewbox;
  window.scaleBar = scaleBar;
  window.legend = legend;
  window.ocean = ocean;
  window.oceanLayers = oceanLayers;
  window.oceanPattern = oceanPattern;
  window.landmass = landmass;
  window.texture = texture;
  window.terrs = terrs;
  window.lakes = lakes;
  window.biomes = biomes;
  window.cells = cells;
  window.gridOverlay = gridOverlay;
  window.coordinates = coordinates;
  window.compass = compass;
  window.rivers = rivers;
  window.terrain = terrain;
  window.relig = relig;
  window.cults = cults;
  window.regions = regions;
  window.statesBody = statesBody;
  window.statesHalo = statesHalo;
  window.provs = provs;
  window.zones = zones;
  window.borders = borders;
  window.stateBorders = stateBorders;
  window.provinceBorders = provinceBorders;
  window.routes = routes;
  window.roads = roads;
  window.trails = trails;
  window.searoutes = searoutes;
  window.temperature = temperature;
  window.coastline = coastline;
  window.ice = ice;
  window.prec = prec;
  window.population = population;
  window.emblems = emblems;
  window.icons = icons;
  window.labels = labels;
  window.burgIcons = burgIcons;
  window.anchors = anchors;
  window.armies = armies;
  window.markers = markers;
  window.fogging = fogging;
  window.ruler = ruler;
  window.debug = debug;
  window.burgLabels = burgLabels;

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
}

// ─── Fit loaded map to screen (called after reinitializeMapLayers + fitMapToScreen) ─

export function fitMapView(): void {
  const gw = window.graphWidth;
  const gh = window.graphHeight;
  const sw = window.svgWidth;
  const sh = window.svgHeight;
  const z = rn(Math.max(sw / gw, sh / gh), 3);
  const tx = rn((-gw / 2) * z + sw / 2, 2);
  const ty = rn((-gh / 2) * z + sh / 2, 2);
  const transform = d3.zoomIdentity.translate(tx, ty).scale(z);

  // Update module-level state before svg.call so zoomRaf's no-change guard
  // doesn't skip the RAF when loading the same map a second time.
  scale = z;
  viewX = tx;
  viewY = ty;
  window.scale = scale;
  window.viewX = viewX;
  window.viewY = viewY;
  viewContext.scale = scale;
  viewContext.viewX = viewX;
  viewContext.viewY = viewY;

  // Set viewbox transform synchronously to avoid a one-frame flash at identity.
  viewbox.attr("transform", `translate(${tx} ${ty}) scale(${z})`);

  // Sync D3 zoom internal state so subsequent wheel/drag events compute correctly.
  svg.call(zoom.transform, transform);
}

// ─── Main data variables ──────────────────────────────────────────────────────

const mapHistory: typeof window.mapHistory = [];
const elSelected: typeof window.elSelected = null;
const modules: typeof window.modules = window.modules ?? {};
const rulers = new Rulers();
let customization = 0;

const options: typeof window.options = {
  pinNotes: false,
  winds: [225, 45, 225, 315, 135, 315],
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  stateLabelsMode: "auto",
  showBurgPreview: true,
  burgs: {
    groups:
      (JSON.safeParse(localStorage.getItem("burg-groups") ?? "") as BurgGroup[] | null) || Burgs.getDefaultGroups()
  }
};

const style: typeof window.style = { burgLabels: {}, burgIcons: {}, anchors: {} };

const biomesData: typeof window.biomesData = Biomes.getDefault();
const nameBases: typeof window.nameBases = Names.getNameBases();
const color = d3.scaleSequential(d3.interpolateSpectral);
const lineGen = d3.line().curve(d3.curveBasis);

window.grid = worldContext.grid;
window.pack = worldContext.pack;
window.seed = worldContext.seed;
window.mapId = worldContext.mapId;
window.mapHistory = mapHistory;
window.elSelected = elSelected;
window.modules = modules;
window.notes = worldContext.notes;
window.rulers = rulers;
window.customization = customization;
window.options = options;
window.style = style;
window.biomesData = biomesData;
window.nameBases = nameBases;
window.color = color;
window.lineGen = lineGen;

// ─── Populate worldContext singleton (initial values) ─────────────────────────

Object.assign(worldContext, {
  mapHistory,
  options,
  style,
  biomesData,
  nameBases,
  lineGen
});

// ─── d3 zoom behavior ─────────────────────────────────────────────────────────

let scale = 1;
let viewX = 0;
let viewY = 0;

let rafId: number | null = null;
let pendingScaleChange = false;
let pendingPositionChange = false;

function zoomRaf(event: { transform: { k: number; x: number; y: number } }) {
  const { k, x, y } = event.transform;

  const isScaleChanged = Boolean(scale - k);
  const isPositionChanged = Boolean(viewX - x || viewY - y);
  if (!isScaleChanged && !isPositionChanged) return;

  scale = k;
  viewX = x;
  viewY = y;
  window.scale = scale;
  window.viewX = viewX;
  window.viewY = viewY;
  viewContext.scale = scale;
  viewContext.viewX = viewX;
  viewContext.viewY = viewY;

  pendingScaleChange = pendingScaleChange || isScaleChanged;
  pendingPositionChange = pendingPositionChange || isPositionChanged;

  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;

    const didScaleChange = pendingScaleChange;
    const didPositionChange = pendingPositionChange;
    pendingScaleChange = false;
    pendingPositionChange = false;

    viewbox.attr("transform", `translate(${viewX} ${viewY}) scale(${scale})`);

    if (didPositionChange) {
      if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
    }

    if (customization === 1) {
      const canvas = ensureEl("canvas") as HTMLCanvasElement | null;
      if (canvas && canvas.style.opacity !== "0") {
        const img = ensureEl("imageToConvert") as HTMLImageElement | null;
        if (img) {
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(scale, 0, 0, scale, viewX, viewY);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }
    }

    if (didScaleChange) {
      invokeActiveZooming();
      drawScaleBar(worldContext, viewContext, appServices, scaleBar, scale);
      fitScaleBar(worldContext, viewContext, appServices, scaleBar, svgWidth, svgHeight);
    }

    if (didPositionChange || didScaleChange) {
      updateMinimap();
    }
  });
}

const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([1, 20]).on("zoom", zoomRaf);

window.scale = scale;
window.viewX = viewX;
window.viewY = viewY;
window.zoom = zoom;
viewContext.zoom = zoom;
viewContext.scale = scale;
viewContext.viewX = viewX;
viewContext.viewY = viewY;

// ─── Map dimensions and settings ──────────────────────────────────────────────

const { populationRate, distanceScale, urbanization, urbanDensity } = useOptionsState.getState();

applyStoredOptions();

const { mapWidth: graphWidth, mapHeight: graphHeight } = useOptionsState.getState();
const svgWidth = graphWidth;
const svgHeight = graphHeight;

window.mapCoordinates = worldContext.mapCoordinates;
window.populationRate = populationRate;
window.distanceScale = distanceScale;
window.urbanization = urbanization;
window.urbanDensity = urbanDensity;
window.graphWidth = graphWidth;
window.graphHeight = graphHeight;
window.svgWidth = svgWidth;
window.svgHeight = svgHeight;

Object.assign(worldContext, {
  populationRate,
  distanceScale,
  urbanization,
  graphWidth,
  graphHeight,
  svgWidth,
  svgHeight
});

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

// ─── App initialization ───────────────────────────────────────────────────────

export async function initMain(): Promise<void> {
  if (!location.hostname) {
    alertMessage.innerHTML = /* html */ `Fantasy Map Generator cannot run serverless. Follow the <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Run-FMG-locally" target="_blank">instructions</a> on how you can easily run a local web-server`;

    openRichDialog({ content: alertMessage.innerHTML, title: "Loading error" });
  } else {
    hideLoading();
    await checkLoadParameters();
  }
  restoreDefaultEvents?.();
  initiateAutosave();
  initTourPromptButton();
}

function applyTransition(id: string, duration: number, opacity: number) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.transition = `opacity ${duration}ms`;
  el.style.opacity = String(opacity);
}

function hideLoading() {
  applyTransition("loading", 3000, 0);
  applyTransition("optionsContainer", 2000, 1);
  applyTransition("tooltip", 3000, 1);
}

function showLoading() {
  applyTransition("loading", 200, 1);
  applyTransition("optionsContainer", 100, 0);
  applyTransition("tooltip", 200, 0);
}

async function checkLoadParameters() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  if (params.get("maplink")) {
    WARN && console.warn("Load map from URL");
    const maplink = params.get("maplink")!;
    const pattern = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
    const valid = pattern.test(maplink);
    if (valid) {
      setTimeout(() => {
        loadMapFromURL(maplink, 1);
      }, 1000);
      return;
    } else showUploadErrorMessage("Map link is not a valid URL", maplink, 0);
  }

  if (params.get("seed")) {
    WARN && console.warn("Generate map for seed");
    await generateMapOnLoad();
    return;
  }

  if (ensureEl<HTMLSelectElement>("onloadBehavior").value === "lastSaved") {
    try {
      const blob = await ldb.get("lastMap");
      if (blob) {
        WARN && console.warn("Loading last stored map");
        uploadMap(blob);
        return;
      }
    } catch (error) {
      ERROR && console.error(error);
    }
  }

  WARN && console.warn("Generate random map");
  generateMapOnLoad();
}

async function generateMapOnLoad() {
  await applyStyleOnLoad();
  await generate();
  applyLayersPreset();
  drawLayers();
  fitMapToScreen();
  focusOn();
  toggleAssistant?.();
}

function focusOn() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const fromMGCG = params.get("from") === "MFCG" && document.referrer;
  if (fromMGCG) {
    if (params.get("seed")!.length === 13) {
      const burgSeed = params.get("seed")!.slice(-4);
      params.set("burg", burgSeed);
    } else {
      findBurgForMFCG(params);
      return;
    }
  }

  const scaleParam = params.get("scale");
  const cellParam = params.get("cell");
  const burgParam = params.get("burg");

  if (scaleParam || cellParam || burgParam) {
    const z = +scaleParam! || 8;

    if (cellParam) {
      const cell = +cellParam;
      const [x, y] = worldContext.pack.cells.p[cell];
      zoomTo(x, y, z, 1600);
      return;
    }

    if (burgParam) {
      const burg = Number.isNaN(+burgParam)
        ? worldContext.pack.burgs.find(b => b.name === burgParam)
        : worldContext.pack.burgs[+burgParam];
      if (!burg) return;

      const { x, y } = burg;
      zoomTo(x, y, z, 1600);
      return;
    }

    const x = +params.get("x")! || graphWidth / 2;
    const y = +params.get("y")! || graphHeight / 2;
    zoomTo(x, y, z, 1600);
  }
}

let isAssistantLoaded = false;
function toggleAssistant() {
  const showAssistant = useOptionsState.getState().azgaarAssistant === "show";
  if (showAssistant) {
    if (isAssistantLoaded) {
      const assistantContainer = document.getElementById("chat-widget-container");
      if (assistantContainer) assistantContainer.style.display = "block";
    } else {
      import(/* @vite-ignore */ `${import.meta.env.BASE_URL}libs/openwidget.min.js`).then(() => {
        isAssistantLoaded = true;
        setTimeout(() => {
          const bubble = document.getElementById("chat-widget-minimized");
          if (bubble) {
            bubble.dataset.tip = "Click to open the Assistant";
            bubble.addEventListener("mouseover", showDataTip as EventListener);
          }
        }, 5000);
      });
    }
  } else if (isAssistantLoaded) {
    const assistantContainer = document.getElementById("chat-widget-container");
    if (assistantContainer) assistantContainer.style.display = "none";
  }
}

function initTourPromptButton() {
  const MAX_SHOWS = 3;
  const STORAGE_KEY = "fmg-tour-prompt-count";
  const btn = document.getElementById("tourPromptButton");
  if (!btn) return;

  const count = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (count >= MAX_SHOWS) return;

  localStorage.setItem(STORAGE_KEY, String(count + 1));
  (btn as HTMLElement).style.display = "flex";
  btn.addEventListener("click", () => {
    UITour.start();
  });
}

function findBurgForMFCG(params: URLSearchParams) {
  const { cells: packedCells, burgs } = worldContext.pack;
  if (worldContext.pack.burgs.length < 2) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }

  const size = +params.get("size")!;
  const coast = +params.get("coast")!;
  const port = +params.get("port")!;
  const river = +params.get("river")!;

  let selection = defineSelection(coast, port, river);
  if (!selection.length) selection = defineSelection(coast, !port, !river);
  if (!selection.length) selection = defineSelection(!coast, 0, !river);
  if (!selection.length) selection = [burgs[1]];

  function defineSelection(c: number | boolean, p: number | boolean, r: number | boolean) {
    if (p && r) return burgs.filter(b => b.port && packedCells.r[b.cell]);
    if (!p && c && r) return burgs.filter(b => !b.port && packedCells.t[b.cell] === 1 && packedCells.r[b.cell]);
    if (!c && !r) return burgs.filter(b => packedCells.t[b.cell] !== 1 && !packedCells.r[b.cell]);
    if (!c && r) return burgs.filter(b => packedCells.t[b.cell] !== 1 && packedCells.r[b.cell]);
    if (c && r) return burgs.filter(b => packedCells.t[b.cell] === 1 && packedCells.r[b.cell]);
    return [];
  }

  const selected = d3.leastIndex(
    selection,
    (a, b) => Math.abs((a.population ?? 0) - size) - Math.abs((b.population ?? 0) - size)
  );
  if (selected === undefined) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }
  const burgId = selection[selected].i;
  if (!burgId) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }

  const b = burgs[burgId] as Burg & Record<string, unknown>;
  const referrer = new URL(document.referrer);
  for (const p of referrer.searchParams) {
    if (p[0] === "name") b.name = p[1];
    else if (p[0] === "size") b.population = +p[1];
    else if (p[0] === "seed") b.MFCG = +p[1];
    else if (p[0] === "shantytown") b.shanty = +p[1];
    else b[p[0]] = +p[1];
  }
  if (params.get("name") && params.get("name") !== "null") b.name = params.get("name") ?? undefined;

  const label = burgLabels.select(`[data-id='${burgId}']`);
  if (label.size()) {
    label
      .text(b.name ?? "")
      .classed("drag", true)
      .on("mouseover", function () {
        (this as Element).classList.remove("drag");
        label.on("mouseover", null);
      });
  }

  zoomTo(b.x, b.y, 8, 1600);
  invokeActiveZooming();
  tip(`Here stands the glorious city of ${b.name}`, true, "success", 15000);
}

// ─── Zoom helpers ─────────────────────────────────────────────────────────────

function zoomTo(x: number, y: number, z = 8, d = 2000) {
  const transform = d3.zoomIdentity.translate(x * -z + svgWidth / 2, y * -z + svgHeight / 2).scale(z);
  svg.transition().duration(d).call(zoom.transform, transform);
}

function resetZoom(d = 1000) {
  svg.transition().duration(d).call(zoom.transform, d3.zoomIdentity);
}

function invokeActiveZooming() {
  const isOptimized = useOptionsState.getState().shapeRendering === "optimizeSpeed";

  if (coastline.select("#sea_island").size() && +coastline.select("#sea_island").attr("auto-filter")) {
    const filter = scale > 1.5 && scale <= 2.6 ? null : scale > 2.6 ? "url(#blurFilter)" : "url(#dropShadow)";
    coastline.select("#sea_island").attr("filter", filter);
  }

  if (labels.style("display") !== "none") {
    labels.selectAll<SVGGElement, unknown>("g").each(function () {
      if (this.id === "burgLabels") return;
      const desired = +this.dataset.size!;
      const relative = Math.max(rn((desired + desired / scale) / 2, 2), 1);
      if (useOptionsState.getState().rescaleLabels) this.setAttribute("font-size", String(relative));

      const hidden = hideLabels.checked && (relative * scale < 6 || relative * scale > 60);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
    });
  }

  if (emblems.style("display") !== "none") {
    emblems.selectAll<SVGGElement, unknown>("g").each(function () {
      const size = +(this.getAttribute("font-size") ?? 0) * scale;
      const hidden = hideEmblems.checked && (size < 25 || size > 300);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
      if (!hidden && appServices.COArenderer && this.children.length && !this.children[0].getAttribute("href"))
        renderGroupCOAs(worldContext, viewContext, appServices, this);
    });
  }

  if (!customization && !isOptimized) {
    const desired = +statesHalo.attr("data-width");
    const haloSize = rn(desired / scale ** 0.8, 2);
    statesHalo.attr("stroke-width", haloSize).style("display", haloSize > 0.1 ? "block" : "none");
  }

  +markers.attr("rescale") &&
    worldContext.pack.markers?.forEach(marker => {
      const { i, x = 0, y = 0, size = 30, hidden } = marker;
      const el = !hidden && document.getElementById(`marker${i}`);
      if (!el) return;

      const zoomedSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);
      el.setAttribute("width", String(zoomedSize));
      el.setAttribute("height", String(zoomedSize));
      el.setAttribute("x", String(rn(x - zoomedSize / 2, 1)));
      el.setAttribute("y", String(rn(y - zoomedSize, 1)));
    });

  if (ruler.style("display") !== "none") {
    const size = rn((10 / scale ** 0.3) * 2, 2);
    ruler.selectAll("text").attr("font-size", size);
  }
}

// ─── Drag-to-upload ───────────────────────────────────────────────────────────

void (function addDragToUpload() {
  document.addEventListener("dragover", e => {
    e.stopPropagation();
    e.preventDefault();
    ensureEl("mapOverlay").style.display = "";
  });

  document.addEventListener("dragleave", () => {
    ensureEl("mapOverlay").style.display = "none";
  });

  document.addEventListener("drop", e => {
    e.stopPropagation();
    e.preventDefault();

    const overlay = ensureEl("mapOverlay");
    overlay.style.display = "none";
    if (!e.dataTransfer?.items || e.dataTransfer.items.length !== 1) return;
    const file = e.dataTransfer.items[0].getAsFile();
    if (!file) return;

    if (!file.name.endsWith(".map") && !file.name.endsWith(".gz")) {
      alertMessage.innerHTML =
        "Please upload a map file (<i>.map</i> or <i>.gz</i> formats) you have previously downloaded";
      openRichDialog({
        content: window.alertMessage.innerHTML,
        resizable: false,
        title: "Invalid file format",
        position: { my: "center", at: "center", of: "svg" },
        buttons: {
          Close: () => {
            /* $(this).dialog("close") removed */
          }
        }
      });
      return;
    }

    overlay.style.display = "";
    overlay.innerHTML = "Uploading<span>.</span><span>.</span><span>.</span>";
    if (closeDialogs) closeDialogs();
    uploadMap(file, () => {
      overlay.style.display = "none";
      overlay.innerHTML = "Drop a map file to open";
    });
  });
})();

// ─── Map generation ───────────────────────────────────────────────────────────

async function generate(opts?: { seed?: string; graph?: Grid | null }) {
  try {
    const timeStart = performance.now();
    const { seed: precreatedSeed, graph: precreatedGraph } = opts || {};

    invokeActiveZooming();
    setSeed(precreatedSeed);
    INFO && console.group(`Generated Map ${worldContext.seed}`);

    applyGraphSize();
    randomizeOptions();

    if (shouldRegenerateGrid(worldContext.grid, +(precreatedSeed ?? 0), graphWidth, graphHeight))
      worldContext.grid = precreatedGraph || generateGrid(worldContext.seed, graphWidth, graphHeight);
    else delete (worldContext.grid.cells as { h?: unknown }).h;
    worldContext.grid.cells.h = await HeightmapGenerator.generate(
      worldContext,
      viewContext,
      appServices,
      worldContext.grid
    );
    window.grid = worldContext.grid;

    worldContext.pack = {} as typeof worldContext.pack;
    window.pack = worldContext.pack;

    Features.markupGrid();
    addLakesInDeepDepressions();
    openNearSeaLakes();

    OceanLayers();
    defineMapSize();
    calculateMapCoordinates();
    calculateTemperatures();
    generatePrecipitation();

    reGraph();
    Features.markupPack();
    createDefaultRuler();

    const state = getWorldState();
    Rivers.generate(worldContext, viewContext, appServices, state);
    Biomes.define(state);
    Features.defineGroups();

    Ice.generate(worldContext, viewContext, appServices, state);

    rankCells();
    Cultures.generate(worldContext, viewContext, appServices, state);
    Cultures.expand(state);

    Burgs.generate(worldContext, viewContext, appServices, state);
    States.generate(worldContext, viewContext, appServices, state);
    Routes.generate(worldContext, viewContext, appServices, state);
    Religions.generate(worldContext, viewContext, appServices, state);

    Burgs.specify(worldContext, viewContext, appServices, state);
    States.collectStatistics(state);
    States.defineStateForms(state);

    Provinces.generate(worldContext, viewContext, appServices, state);
    Provinces.getPoles(state);

    Rivers.specify(worldContext, viewContext, appServices, state);
    Lakes.defineNames(state);

    Military.generate(worldContext, viewContext, appServices, state);
    Markers.generate(worldContext, viewContext, appServices, state);
    Zones.generate(worldContext, viewContext, appServices, state);

    drawScaleBar(worldContext, viewContext, appServices, scaleBar, scale);
    Names.getMapName(false);

    WARN && console.warn(`TOTAL: ${rn((performance.now() - timeStart) / 1000, 2)}s`);
    showStatistics();
    INFO && console.groupEnd();
  } catch (error) {
    ERROR && console.error(error);
    const parsedError = parseError(error);
    clearMainTip();

    alertMessage.innerHTML = /* html */ `An error has occurred on map generation. Please retry. <br />If error is critical, clear the stored data and try again.
      <p id="errorBox">${parsedError}</p>`;
    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Generation error",
      width: "32em",
      buttons: {
        "Cleanup data": () => cleanupData(),
        Regenerate: () => {
          regenerateMap("generation error");
          /* $(this).dialog("close") removed */
        },
        Ignore: () => {
          /* $(this).dialog("close") removed */
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });
  }
}

function getWorldState() {
  const { pack, grid, seed, options, nameBases, biomesData, notes, style } = worldContext;
  return { pack, grid, seed, options, nameBases, biomesData, notes, style };
}

function setSeed(precreatedSeed?: string) {
  if (!precreatedSeed) {
    const first = !mapHistory[0];
    const params = new URL(window.location.href).searchParams;
    const urlSeed = params.get("seed");
    if (first && params.get("from") === "MFCG" && urlSeed && urlSeed.length === 13)
      worldContext.seed = urlSeed.slice(0, -4);
    else if (first && urlSeed) worldContext.seed = urlSeed;
    else worldContext.seed = generateSeed();
  } else {
    worldContext.seed = precreatedSeed;
  }

  window.seed = worldContext.seed;
  useOptionsState.getState().setOption("seed", worldContext.seed);
  const seedInput = document.getElementById("optionsSeed") as HTMLInputElement | null;
  if (seedInput) seedInput.value = worldContext.seed;
  Math.random = aleaPRNG(worldContext.seed);
}

// ─── Lake helpers ──────────────────────────────────────────────────────────

function addLakesInDeepDepressions() {
  TIME && console.time("addLakesInDeepDepressions");
  const elevationLimit = +ensureEl<HTMLOutputElement>("lakeElevationLimitOutput").value;
  if (elevationLimit === 80) return;

  const { cells: gridCells, features } = worldContext.grid;
  const { c, h, b } = gridCells;

  for (const i of gridCells.i) {
    if (b[i] || h[i] < 20) continue;

    const minHeight = d3.min(c[i].map((idx: number) => h[idx])) ?? Infinity;
    if (h[i] > minHeight) continue;

    let deep = true;
    const threshold = h[i] + elevationLimit;
    const queue = [i];
    const checked: boolean[] = [];
    checked[i] = true;

    while (deep && queue.length) {
      const q = queue.pop()!;

      for (const n of c[q]) {
        if (checked[n]) continue;
        if (h[n] >= threshold) continue;
        if (h[n] < 20) {
          deep = false;
          break;
        }

        checked[n] = true;
        queue.push(n);
      }
    }

    if (deep) {
      const lakeCells = [i].concat(c[i].filter((n: number) => h[n] === h[i]));
      addLake(lakeCells);
    }
  }

  function addLake(lakeCells: number[]) {
    const f = features.length;

    lakeCells.forEach(i => {
      gridCells.h[i] = 19;
      gridCells.t[i] = -1;
      gridCells.f[i] = f;
      c[i].forEach((n: number) => {
        if (!lakeCells.includes(n)) gridCells.t[n] = 1;
      });
    });

    features.push({ i: f, land: false, border: false, type: "lake" });
  }

  TIME && console.timeEnd("addLakesInDeepDepressions");
}

function openNearSeaLakes() {
  if (useOptionsState.getState().template === "Atoll") return;

  const { cells: gridCells, features } = worldContext.grid;
  if (!features.find(f => f.type === "lake")) return;
  TIME && console.time("openLakes");
  const LIMIT = 22;

  for (const i of gridCells.i) {
    const lakeFeatureId = gridCells.f[i];
    if (features[lakeFeatureId].type !== "lake") continue;

    check_neighbours: for (const c of gridCells.c[i]) {
      if (gridCells.t[c] !== 1 || gridCells.h[c] > LIMIT) continue;

      for (const n of gridCells.c[c]) {
        const ocean = gridCells.f[n];
        if (features[ocean].type !== "ocean") continue;
        removeLake(c, lakeFeatureId, ocean);
        break check_neighbours;
      }
    }
  }

  function removeLake(thresholdCellId: number, lakeFeatureId: number, oceanFeatureId: number) {
    gridCells.h[thresholdCellId] = 19;
    gridCells.t[thresholdCellId] = -1;
    gridCells.f[thresholdCellId] = oceanFeatureId;
    gridCells.c[thresholdCellId].forEach((c: number) => {
      if (gridCells.h[c] >= 20) gridCells.t[c] = 1;
    });

    gridCells.i.forEach((i: number) => {
      if (gridCells.f[i] === lakeFeatureId) gridCells.f[i] = oceanFeatureId;
    });
    features[lakeFeatureId].type = "ocean";
  }

  TIME && console.timeEnd("openLakes");
}

// ─── Map size and coordinates ──────────────────────────────────────────────

function defineMapSize() {
  const [size, latitude, longitude] = getSizeAndLatitude();
  const randomize = new URL(window.location.href).searchParams.get("options") === "default";
  if (randomize || !locked("mapSize")) mapSizeOutput.value = mapSizeInput.value = String(size);
  if (randomize || !locked("latitude")) latitudeOutput.value = latitudeInput.value = String(latitude);
  if (randomize || !locked("longitude")) longitudeOutput.value = longitudeInput.value = String(longitude);

  function getSizeAndLatitude(): [number, number, number] {
    const template = useOptionsState.getState().template;

    if (template === "africa-centric") return [45, 53, 38];
    if (template === "arabia") return [20, 35, 35];
    if (template === "atlantics") return [42, 23, 65];
    if (template === "britain") return [7, 20, 51.3];
    if (template === "caribbean") return [15, 40, 74.8];
    if (template === "east-asia") return [11, 28, 9.4];
    if (template === "eurasia") return [38, 19, 27];
    if (template === "europe") return [20, 16, 44.8];
    if (template === "europe-accented") return [14, 22, 44.8];
    if (template === "europe-and-central-asia") return [25, 10, 39.5];
    if (template === "europe-central") return [11, 22, 46.4];
    if (template === "europe-north") return [7, 18, 48.9];
    if (template === "greenland") return [22, 7, 55.8];
    if (template === "hellenica") return [8, 27, 43.5];
    if (template === "iceland") return [2, 15, 55.3];
    if (template === "indian-ocean") return [45, 55, 14];
    if (template === "mediterranean-sea") return [10, 29, 45.8];
    if (template === "middle-east") return [8, 31, 34.4];
    if (template === "north-america") return [37, 17, 87];
    if (template === "us-centric") return [66, 27, 100];
    if (template === "us-mainland") return [16, 30, 77.5];
    if (template === "world") return [78, 27, 40];
    if (template === "world-from-pacific") return [75, 32, 30];

    const part = worldContext.grid.features.some(f => f.land && f.border);
    const max = part ? 80 : 100;
    const lat = () => gauss(P(0.5) ? 40 : 60, 20, 25, 75);

    if (!part) {
      if (template === "pangea") return [100, 50, 50];
      if (template === "shattered" && P(0.7)) return [100, 50, 50];
      if (template === "continents" && P(0.5)) return [100, 50, 50];
      if (template === "archipelago" && P(0.35)) return [100, 50, 50];
      if (template === "highIsland" && P(0.25)) return [100, 50, 50];
      if (template === "lowIsland" && P(0.1)) return [100, 50, 50];
    }

    if (template === "pangea") return [gauss(70, 20, 30, max), lat(), 50];
    if (template === "volcano") return [gauss(20, 20, 10, max), lat(), 50];
    if (template === "mediterranean") return [gauss(25, 30, 15, 80), lat(), 50];
    if (template === "peninsula") return [gauss(15, 15, 5, 80), lat(), 50];
    if (template === "isthmus") return [gauss(15, 20, 3, 80), lat(), 50];
    if (template === "atoll") return [gauss(3, 2, 1, 5, 1), lat(), 50];

    return [gauss(30, 20, 15, max), lat(), 50];
  }
}

function calculateMapCoordinates() {
  const sizeFraction = +ensureEl<HTMLOutputElement>("mapSizeOutput").value / 100;
  const latShift = +ensureEl<HTMLOutputElement>("latitudeOutput").value / 100;
  const lonShift = +ensureEl<HTMLOutputElement>("longitudeOutput").value / 100;

  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);

  const lonT = rn(Math.min((graphWidth / graphHeight) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);
  worldContext.mapCoordinates = { latT, latN, latS, lonT, lonW, lonE };
  window.mapCoordinates = worldContext.mapCoordinates;
}

// ─── Temperature model ────────────────────────────────────────────────────────

function calculateTemperatures() {
  TIME && console.time("calculateTemperatures");
  const { cells: gridCells } = worldContext.grid;
  gridCells.temp = new Int8Array(gridCells.i.length);

  const { temperatureEquator, temperatureNorthPole, temperatureSouthPole } = options;
  const tropics = [16, -20];
  const tropicalGradient = 0.15;

  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);

  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);

  const exponent = +heightExponentInput.value;

  for (let rowCellId = 0; rowCellId < gridCells.i.length; rowCellId += worldContext.grid.cellsX) {
    const [, y] = worldContext.grid.points[rowCellId];
    const rowLatitude = worldContext.mapCoordinates.latN! - (y / graphHeight) * worldContext.mapCoordinates.latT!;
    const tempSeaLevel = calculateSeaLevelTemp(rowLatitude);
    DEBUG.temperature && console.info(`${rn(rowLatitude)}° sea temperature: ${rn(tempSeaLevel)}°C`);

    for (let cellId = rowCellId; cellId < rowCellId + worldContext.grid.cellsX; cellId++) {
      const tempAltitudeDrop = getAltitudeTemperatureDrop(gridCells.h[cellId]);
      gridCells.temp[cellId] = minmax(tempSeaLevel - tempAltitudeDrop, -128, 127);
    }
  }

  function calculateSeaLevelTemp(latitude: number) {
    const isTropical = latitude <= 16 && latitude >= -20;
    if (isTropical) return temperatureEquator - Math.abs(latitude) * tropicalGradient;

    return latitude > 0
      ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
      : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
  }

  function getAltitudeTemperatureDrop(h: number) {
    if (h < 20) return 0;
    const height = (h - 18) ** exponent;
    return rn((height / 1000) * 6.5);
  }

  TIME && console.timeEnd("calculateTemperatures");
}

// ─── Precipitation model ──────────────────────────────────────────────────────

function generatePrecipitation() {
  TIME && console.time("generatePrecipitation");
  prec.selectAll("*").remove();
  const { cells: gridCells, cellsX, cellsY } = worldContext.grid;
  gridCells.prec = new Uint8Array(gridCells.i.length);

  const { points: pointsOpt } = useOptionsState.getState();
  const cellsNumberModifier = ((pointsOpt === 4 ? 10000 : pointsOpt * 2500) / 10000) ** 0.25;
  const precInputModifier = +precInput.value / 100;
  const modifier = cellsNumberModifier * precInputModifier;

  const westerly: [number, number, number][] = [];
  const easterly: [number, number, number][] = [];
  let southerly = 0;
  let northerly = 0;

  const latitudeModifier = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];
  const MAX_PASSABLE_ELEVATION = 85;

  const { mapCoordinates } = worldContext;
  d3.range(0, gridCells.i.length, cellsX).forEach((c: number, i: number) => {
    const lat = mapCoordinates.latN! - (i / cellsY) * mapCoordinates.latT!;
    const latBand = ((Math.abs(lat) - 1) / 5) | 0;
    const latMod = latitudeModifier[latBand];
    const windTier = (Math.abs(lat - 89) / 30) | 0;
    const { isWest, isEast, isNorth, isSouth } = getWindDirections(windTier);

    if (isWest) westerly.push([c, latMod, windTier]);
    if (isEast) easterly.push([c + cellsX - 1, latMod, windTier]);
    if (isNorth) northerly++;
    if (isSouth) southerly++;
  });

  if (westerly.length) passWind(westerly, 120 * modifier, 1, cellsX);
  if (easterly.length) passWind(easterly, 120 * modifier, -1, cellsX);

  const vertT = southerly + northerly;
  if (northerly) {
    const bandN = ((Math.abs(mapCoordinates.latN!) - 1) / 5) | 0;
    const latModN = (mapCoordinates.latT! > 60 ? d3.mean(latitudeModifier) : latitudeModifier[bandN]) ?? 0;
    const maxPrecN = (northerly / vertT) * 60 * modifier * latModN;
    passWind(d3.range(0, cellsX, 1), maxPrecN, cellsX, cellsY);
  }

  if (southerly) {
    const bandS = ((Math.abs(mapCoordinates.latS!) - 1) / 5) | 0;
    const latModS = (mapCoordinates.latT! > 60 ? d3.mean(latitudeModifier) : latitudeModifier[bandS]) ?? 0;
    const maxPrecS = (southerly / vertT) * 60 * modifier * latModS;
    passWind(d3.range(gridCells.i.length - cellsX, gridCells.i.length, 1), maxPrecS, -cellsX, cellsY);
  }

  function getWindDirections(tier: number) {
    const angle = options.winds[tier as 0 | 1 | 2 | 3 | 4 | 5];

    const isWest = angle > 40 && angle < 140;
    const isEast = angle > 220 && angle < 320;
    const isNorth = angle > 100 && angle < 260;
    const isSouth = angle > 280 || angle < 80;

    return { isWest, isEast, isNorth, isSouth };
  }

  function passWind(source: number[] | [number, number, number][], maxPrec: number, next: number, steps: number) {
    const maxPrecInit = maxPrec;

    for (let first of source) {
      if (Array.isArray(first)) {
        maxPrec = Math.min(maxPrecInit * first[1], 255);
        first = first[0];
      }

      let humidity = maxPrec - gridCells.h[first as number];
      if (humidity <= 0) continue;

      for (let s = 0, current = first as number; s < steps; s++, current += next) {
        if (gridCells.temp[current] < -5) continue;

        if (gridCells.h[current] < 20) {
          if (gridCells.h[current + next] >= 20) {
            gridCells.prec[current + next] += Math.max(humidity / rand(10, 20), 1);
          } else {
            humidity = Math.min(humidity + 5 * modifier, maxPrec);
            gridCells.prec[current] += 5 * modifier;
          }
          continue;
        }

        const isPassable = gridCells.h[current + next] <= MAX_PASSABLE_ELEVATION;
        const precipitation = isPassable ? getPrecipitation(humidity, current, next) : humidity;
        gridCells.prec[current] += precipitation;
        const evaporation = precipitation > 1.5 ? 1 : 0;
        humidity = isPassable ? minmax(humidity - precipitation + evaporation, 0, maxPrec) : 0;
      }
    }
  }

  function getPrecipitation(humidity: number, i: number, n: number) {
    const normalLoss = Math.max(humidity / (10 * modifier), 1);
    const diff = Math.max(gridCells.h[i + n] - gridCells.h[i], 0);
    const mod = (gridCells.h[i + n] / 70) ** 2;
    return minmax(normalLoss + diff * mod, 1, humidity);
  }

  void (function drawWindDirection() {
    const wind = prec.append("g").attr("id", "wind");

    d3.range(0, 6).forEach((t: number) => {
      if (westerly.length > 1) {
        const west = westerly.filter(w => w[2] === t);
        if (west && west.length > 3) {
          const from = west[0][0];
          const to = west[west.length - 1][0];
          const y = (worldContext.grid.points[from][1] + worldContext.grid.points[to][1]) / 2;
          wind.append("text").attr("text-rendering", "optimizeSpeed").attr("x", 20).attr("y", y).text("⇉");
        }
      }
      if (easterly.length > 1) {
        const east = easterly.filter(w => w[2] === t);
        if (east && east.length > 3) {
          const from = east[0][0];
          const to = east[east.length - 1][0];
          const y = (worldContext.grid.points[from][1] + worldContext.grid.points[to][1]) / 2;
          wind
            .append("text")
            .attr("text-rendering", "optimizeSpeed")
            .attr("x", graphWidth - 52)
            .attr("y", y)
            .text("⇇");
        }
      }
    });

    if (northerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", graphWidth / 2)
        .attr("y", 42)
        .text("⇊");
    if (southerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", graphWidth / 2)
        .attr("y", graphHeight - 20)
        .text("⇈");
  })();

  TIME && console.timeEnd("generatePrecipitation");
}

// ─── Graph operations ─────────────────────────────────────────────────────────

function reGraph() {
  TIME && console.time("reGraph");
  const { cells: gridCells, points, features } = worldContext.grid;
  const newCells: { p: [number, number][]; g: number[]; h: number[] } = { p: [], g: [], h: [] };
  const spacing2 = worldContext.grid.spacing ** 2;

  for (const i of gridCells.i) {
    const height = gridCells.h[i];
    const type = gridCells.t[i];

    if (height < 20 && type !== -1 && type !== -2) continue;
    if (type === -2 && (i % 4 === 0 || features[gridCells.f[i]].type === "lake")) continue;

    const [x, y] = points[i];
    addNewPoint(i, x, y, height);

    if (type === 1 || type === -1) {
      if (gridCells.b[i]) continue;
      gridCells.c[i].forEach((e: number) => {
        if (i > e) return;
        if (gridCells.t[e] === type) {
          const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
          if (dist2 < spacing2) return;
          const x1 = rn((x + points[e][0]) / 2, 1);
          const y1 = rn((y + points[e][1]) / 2, 1);
          addNewPoint(i, x1, y1, height);
        }
      });
    }
  }

  function addNewPoint(i: number, x: number, y: number, height: number) {
    newCells.p.push([x, y]);
    newCells.g.push(i);
    newCells.h.push(height);
  }

  const { cells: packCells, vertices } = calculateVoronoi(newCells.p, worldContext.grid.boundary);
  worldContext.pack.vertices = vertices as typeof worldContext.pack.vertices;
  worldContext.pack.cells = packCells as typeof worldContext.pack.cells;
  worldContext.pack.cells.p = newCells.p;
  worldContext.pack.cells.g = createTypedArray({
    maxValue: worldContext.grid.points.length,
    from: newCells.g
  }) as typeof worldContext.pack.cells.g;
  worldContext.pack.cells.h = createTypedArray({
    maxValue: 100,
    from: newCells.h
  }) as typeof worldContext.pack.cells.h;
  worldContext.pack.cells.area = createTypedArray({ maxValue: UINT16_MAX, length: packCells.i.length }).map(
    (_: unknown, cellId: number) => {
      const area = Math.abs(d3.polygonArea(getPackPolygon(cellId, worldContext.pack)));
      return Math.min(area, UINT16_MAX);
    }
  );

  TIME && console.timeEnd("reGraph");
}

function isWetLand(moisture: number, temperature: number, height: number) {
  if (moisture > 40 && temperature > -2 && height < 25) return true;
  if (moisture > 24 && temperature > -2 && height > 24 && height < 60) return true;
  return false;
}

function rankCells() {
  TIME && console.time("rankCells");
  const { cells: packCells, features } = worldContext.pack;
  packCells.s = new Int16Array(packCells.i.length);
  packCells.pop = new Float32Array(packCells.i.length);

  const meanFlux = d3.median(packCells.fl.filter((f: number) => f)) ?? 0;
  const maxFlux = (d3.max(packCells.fl) ?? 0) + (d3.max(packCells.conf) ?? 0);
  const meanArea = d3.mean(packCells.area) ?? 1;

  const scoreMap: Record<string, number> = {
    estuary: 15,
    ocean_coast: 5,
    save_harbor: 20,
    freshwater: 30,
    salt: 10,
    frozen: 1,
    dry: -5,
    sinkhole: -5,
    lava: -30
  };

  for (const i of packCells.i) {
    if (packCells.h[i] < 20) continue;
    let score = biomesData.habitability[packCells.biome[i]];
    if (!score) continue;

    if (meanFlux) score += normalize(packCells.fl[i] + packCells.conf[i], meanFlux, maxFlux) * 250;
    score -= (packCells.h[i] - 50) / 5;

    if (packCells.t[i] === 1) {
      if (packCells.r[i]) score += scoreMap.estuary;
      const feature = features[packCells.f[packCells.haven[i]]];
      if (feature.type === "lake") {
        score += scoreMap[feature.group] || 0;
      } else {
        score += scoreMap.ocean_coast;
        if (packCells.harbor[i] === 1) score += scoreMap.save_harbor;
      }
    }

    packCells.s[i] = score / 5;
    packCells.pop[i] = packCells.s[i] > 0 ? (packCells.s[i] * packCells.area[i]) / meanArea : 0;
  }

  TIME && console.timeEnd("rankCells");
}

function showStatistics() {
  const heightmap = useOptionsState.getState().template;
  const isTemplate = heightmap in heightmapTemplates;
  const heightmapType = isTemplate ? "template" : "precreated";
  const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

  const stats = `  Seed: ${worldContext.seed}
    Canvas size: ${graphWidth}x${graphHeight} px
    Heightmap: ${heightmap}
    Template: ${isRandomTemplate}${heightmapType}
    Points: ${worldContext.grid.points.length}
    Cells: ${worldContext.pack.cells.i.length}
    Map size: ${mapSizeOutput.value}%
    States: ${worldContext.pack.states.length - 1}
    Provinces: ${worldContext.pack.provinces.length - 1}
    Burgs: ${worldContext.pack.burgs.length - 1}
    Religions: ${worldContext.pack.religions.length - 1}
    Culture set: ${useOptionsState.getState().culturesSet}
    Cultures: ${worldContext.pack.cultures.length - 1}`;

  worldContext.mapId = Date.now();
  window.mapId = worldContext.mapId;
  mapHistory.push({
    seed: worldContext.seed,
    width: graphWidth,
    height: graphHeight,
    template: heightmap,
    created: worldContext.mapId
  });
  INFO && console.info(stats);

  window.dispatchEvent(
    new CustomEvent("map:generated", { detail: { seed: worldContext.seed, mapId: worldContext.mapId } })
  );
}

const regenerateMap = debounce(async (opts?: { seed?: string } | string) => {
  WARN && console.warn("Generate new random map");

  const { points: pointsForLoading } = useOptionsState.getState();
  const cellsDesired = pointsForLoading === 4 ? 10000 : pointsForLoading * 2500;
  const shouldShowLoading = cellsDesired > 10000;
  shouldShowLoading && showLoading();

  closeDialogs("#worldConfigurator, #options3d");
  customization = 0;
  window.customization = customization;
  viewContext.customization = customization;
  resetZoom(1000);
  undraw();
  await generate(typeof opts === "string" ? { seed: opts } : opts);
  drawLayers();
  if (ThreeD.options.isOn) ThreeD.redraw();
  if (document.getElementById("worldConfigurator") !== null) editWorld();

  fitMapToScreen();
  shouldShowLoading && hideLoading();
  clearMainTip();
}, 250);

function undraw() {
  viewbox
    .selectAll("path, circle, polygon, line, text, use, #texture > image, #zones > g, #armies > g, #ruler > g")
    .remove();
  ensureEl("deftemp")
    .querySelectorAll("path, clipPath, svg")
    .forEach(el => {
      el.remove();
    });
  ensureEl("coas").innerHTML = "";
  worldContext.notes = [];
  window.notes = worldContext.notes;
  unfog();
}

// ─── Global exports ───────────────────────────────────────────────────────────

window.generate = generate;
window.getWorldState = getWorldState;
window.generateMapOnLoad = generateMapOnLoad;
window.checkLoadParameters = checkLoadParameters;
window.focusOn = focusOn;
window.toggleAssistant = toggleAssistant;
window.zoomTo = zoomTo;
window.resetZoom = resetZoom;
window.invokeActiveZooming = invokeActiveZooming;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.addLakesInDeepDepressions = addLakesInDeepDepressions;
window.openNearSeaLakes = openNearSeaLakes;
window.defineMapSize = defineMapSize;
window.calculateMapCoordinates = calculateMapCoordinates;
window.calculateTemperatures = calculateTemperatures;
window.generatePrecipitation = generatePrecipitation;
window.reGraph = reGraph;
window.rankCells = rankCells;
window.showStatistics = showStatistics;
window.regenerateMap = regenerateMap;
window.undraw = undraw;
window.isWetLand = isWetLand;

// ─── Controlled debug namespace ───────────────────────────────────────────────
// In DEV builds, expose organized debug access instead of scattered window.pack etc.
// Usage: window.__fmg.worldContext.pack, window.__fmg.viewContext.svg
if (import.meta.env.DEV) {
  window.__fmg = { worldContext, viewContext };
  console.info("[FMG] debug: You can access the internal state with window.__fmg");
}
