import { heightmapTemplates } from "./data";
import { createViewLayers, populateSizeRects, reinitializeMapLayers } from "./initViewLayers";
import { generationErrorDialogStore } from "./store/generationErrorDialogState";
import { closeDialogs, openAlert } from "./ui/dialogs/dialogService";
import { DEBUG, ERROR, INFO, TIME, WARN } from "./utils/debug";

// Azgaar (azgaar.fmg@yandex.com). Minsk, 2017-2023. MIT License
// https://github.com/Azgaar/Fantasy-Map-Generator

// jQuery setup: globals must be in a separate module so they are evaluated

import Alea from "alea";
import * as d3 from "d3";
import { getWorldState, resetZoom, zoomTo } from "./actions";
import { appServices, initRng } from "./context/appServices";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { applyLayersPreset, drawLayers, scheduleWebglUpdate } from "./controllers/layers";
import { createDefaultRuler } from "./controllers/measurers";
import { updateMinimap } from "./controllers/minimap";
import { applyGraphSize, applyStoredOptions, fitMapToScreen, randomizeOptions } from "./controllers/options";
import { applyStyleOnLoad } from "./controllers/style";
import { Biomes } from "./generators/biomes";
import { Burgs } from "./generators/burgs-generator";
import { Cultures } from "./generators/cultures-generator";
import { applyHistoricalWarScars } from "./generators/demography-simulator";
import { Features } from "./generators/features";
import { HeightmapGenerator } from "./generators/heightmap-generator";
import { Ice } from "./generators/ice";
import { Lakes } from "./generators/lakes";
import { Markers } from "./generators/markers-generator";
import { Military } from "./generators/military-generator";
import { Names } from "./generators/names-generator";
import { Provinces } from "./generators/provinces-generator";
import { Religions } from "./generators/religions-generator";
import { Rivers } from "./generators/river-generator";
import { Routes } from "./generators/routes-generator";
import { States } from "./generators/states-generator";
import { Threats } from "./generators/threats-generator";
import { initSimulationClock } from "./generators/timeEngine";
import { establishVassalage } from "./generators/vassalage";
import { Zones } from "./generators/zones-generator";
import { ldb } from "./io/ldb";
import { loadMapFromURL, showUploadErrorMessage, uploadMap } from "./io/load";
import { initiateAutosave } from "./io/save";
import { renderGroupCOAs } from "./renderers/draw-emblems";
import { CoordinatesRenderer, drawCalendar, drawScaleBar, fitScaleBar } from "./renderers/index";
import { OceanLayers } from "./renderers/ocean-layers";
import { ThreeDRenderer } from "./renderers/three-d-renderer";
import { DeckGlRenderer } from "./renderers/webgl/deckRenderer";
import { clearMainTip, tip } from "./services/tooltipService";
import { UITour } from "./services/ui-tour";
import { useDebugSnapshotState } from "./store/debugSnapshotState";
import { dialogStore } from "./store/dialogState";
import { type OptionsState, useOptionsState } from "./store/optionsState";
import type { Grid } from "./types/Grid";
import type { Burg, BurgGroup } from "./types/models";
import {
  TYPED_ARRAY_MAX_VALUES as _TMP,
  calculateVoronoi,
  createTypedArray,
  debounce,
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
  safeParseJSON,
  shouldRegenerateGrid
} from "./utils";
import { captureSnapshotData } from "./utils/aiDebugExporter";
import { locked } from "./utils/domUtils";
import { EditorBus } from "./utils/editorBus";
import { dampenBurgLabelSize, dampenStateLabelSize } from "./utils/labelZoomScale";
import { getElementById, layerIsOn } from "./utils/nodeUtils";
import { cleanupData } from "./versioning";

const UINT16_MAX = _TMP.UINT16_MAX;

// ─── Debug / feature flags ────────────────────────────────────────────────────

const PRODUCTION = location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";

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

// ─── SVG layer reinitialization (called after a new map SVG is loaded) ────────

// ─── Fit loaded map to screen (called after reinitializeMapLayers + fitMapToScreen) ─

export function fitMapView(): void {
  const gw = worldContext.graphWidth;
  const gh = worldContext.graphHeight;
  const sw = viewContext.svgWidth;
  const sh = viewContext.svgHeight;
  const z = rn(Math.max(sw / gw, sh / gh), 3);
  const tx = rn((-gw / 2) * z + sw / 2, 2);
  const ty = rn((-gh / 2) * z + sh / 2, 2);
  const transform = d3.zoomIdentity.translate(tx, ty).scale(z);

  // Update module-level state before svg.call so zoomRaf's no-change guard
  // doesn't skip the RAF when loading the same map a second time.
  scale = z;
  viewX = tx;
  viewY = ty;
  viewContext.scale = scale;
  viewContext.viewX = viewX;
  viewContext.viewY = viewY;

  // Set viewbox transform synchronously to avoid a one-frame flash at identity.
  viewContext.viewbox.attr("transform", `translate(${tx} ${ty}) scale(${z})`);

  // Sync D3 zoom internal state so subsequent wheel/drag events compute correctly.
  viewContext.svg.call(zoom.transform, transform);
  DeckGlRenderer.syncViewState(viewContext);
}

// ─── Main data variables ──────────────────────────────────────────────────────

const mapHistory: Array<{ seed: string; width: number; height: number; template: string; created: number }> = [];

viewContext.customization = 0;

const options = {
  pinNotes: false,
  winds: [225, 45, 225, 315, 135, 315],
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  stateLabelsMode: "auto",
  showBurgPreview: true,
  burgs: {
    groups: (safeParseJSON(localStorage.getItem("burg-groups") ?? "") as BurgGroup[] | null) || Burgs.getDefaultGroups()
  }
};

const style = { burgLabels: {}, burgIcons: {}, anchors: {} };

const biomesData = Biomes.getDefault();
const nameBases = Names.getNameBases();
const lineGen = d3.line().curve(d3.curveBasis);

// ─── Populate worldContext singleton (initial values) ─────────────────────────

Object.assign(worldContext, {
  mapHistory,
  options,
  style,
  biomesData,
  nameBases
});

Object.assign(viewContext, {
  lineGen
});

// ─── d3 zoom behavior ─────────────────────────────────────────────────────────

let scale = 1;
let viewX = 0;
let viewY = 0;

let rafId: number | null = null;
let pendingScaleChange = false;
let pendingPositionChange = false;
let activeZoomingTimeout: ReturnType<typeof setTimeout> | undefined;

function zoomRaf(event: { transform: { k: number; x: number; y: number } }) {
  const { k, x, y } = event.transform;

  const isScaleChanged = Boolean(scale - k);
  const isPositionChanged = Boolean(viewX - x || viewY - y);
  if (!isScaleChanged && !isPositionChanged) return;

  scale = k;
  viewX = x;
  viewY = y;
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

    viewContext.viewbox.attr("transform", `translate(${viewX} ${viewY}) scale(${scale})`);
    DeckGlRenderer.syncViewState(viewContext);

    if (didPositionChange) {
      if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
    }

    if (viewContext.customization === 1) {
      const canvas = getElementById<HTMLCanvasElement>("canvas");
      if (canvas && canvas.style.opacity !== "0") {
        const img = getElementById<HTMLImageElement>("imageToConvert");
        if (img) {
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(scale, 0, 0, scale, viewX, viewY);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }
    }

    if (didScaleChange || didPositionChange) {
      clearTimeout(activeZoomingTimeout);
      activeZoomingTimeout = setTimeout(() => {
        invokeActiveZooming();
      }, 100);
    }

    if (didScaleChange) {
      drawScaleBar(worldContext, viewContext, appServices, viewContext.scaleBar, scale);
      fitScaleBar(
        worldContext,
        viewContext,
        appServices,
        viewContext.scaleBar,
        viewContext.svgWidth,
        viewContext.svgHeight
      );
    }

    if (didPositionChange || didScaleChange) {
      updateMinimap();
    }
  });
}

const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([1, 20]).on("zoom", zoomRaf);

viewContext.zoom = zoom;
viewContext.scale = scale;
viewContext.viewX = viewX;
viewContext.viewY = viewY;

// ─── Map dimensions and settings ──────────────────────────────────────────────

const { populationRate, distanceScale, urbanization } = useOptionsState.getState();

applyStoredOptions();

const { mapWidth: graphWidth, mapHeight: graphHeight } = useOptionsState.getState();
const svgWidth = graphWidth;
const svgHeight = graphHeight;

Object.assign(worldContext, {
  populationRate,
  distanceScale,
  urbanization,
  graphWidth,
  graphHeight
});

Object.assign(viewContext, {
  svgWidth,
  svgHeight
});

// ─── App initialization ───────────────────────────────────────────────────────

export async function initMain(drawMap: boolean = true): Promise<void> {
  registerMapFileInput();

  if (drawMap) {
    createViewLayers();
    populateSizeRects();

    viewContext.scaleBar.node()?.addEventListener("mousemove", () => tip("Click to open Units Editor"));
    viewContext.scaleBar.node()?.addEventListener("click", () => EditorBus.editUnits());
    viewContext.legend
      .node()
      ?.addEventListener("mousemove", () => tip("Drag to change the position. Click to hide the legend"));
    viewContext.legend.node()?.addEventListener("click", () => EditorBus.clearLegend());
  }

  if (!location.hostname) {
    openAlert(
      `Fantasy Map Generator cannot run serverless. Follow the <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Run-FMG-locally" target="_blank">instructions</a> on how you can easily run a local web-server`,
      { title: "Loading error" }
    );
  } else {
    hideLoading();
    await checkLoadParameters(drawMap);
  }
  EditorBus.restoreDefaultEvents?.();
  initiateAutosave();
  initTourPromptButton();
  document.addEventListener("fmg:regenerate-map", (e: Event) => {
    regenerateMap((e as CustomEvent<{ seed?: string } | undefined>).detail);
  });
  document.addEventListener("fmg:world-recalculate", (e: Event) => {
    const { coords, temps, prec } = (e as CustomEvent<{ coords?: boolean; temps?: boolean; prec?: boolean }>).detail;
    if (coords) calculateMapCoordinates();
    if (temps) calculateTemperatures();
    if (prec) generatePrecipitation();
  });
  document.addEventListener("fmg:invoke-active-zooming", invokeActiveZooming);
  document.addEventListener("fmg:fit-map-view", fitMapView);
  document.addEventListener("fmg:focus-on", focusOn);
  document.addEventListener("fmg:re-graph", () => {
    reGraph();
    if (viewContext.renderMap) OceanLayers();
  });
  document.addEventListener("fmg:reinitialize-map-layers", reinitializeMapLayers);
  document.addEventListener("fmg:simulation-updated", () => drawCalendar(worldContext, viewContext));
  document.addEventListener("fmg:render-mode-changed", () => {
    if (viewContext.renderMap) drawLayers();
  });
  document.addEventListener("fmg:show-statistics", showStatistics);
  document.addEventListener("fmg:generate-map-on-load", () => generateMapOnLoad(drawMap));

  window.addEventListener("resize", () => {
    if (!viewContext.renderMap) return;
    fitMapToScreen();
    fitMapView();
  });
}

function registerMapFileInput(): void {
  const input = document.querySelector<HTMLInputElement>("#fileInputs #mapToLoad");
  if (!input) return;

  input.addEventListener("change", event => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;

    if (!file.name.endsWith(".map") && !file.name.endsWith(".gz")) {
      openAlert("Please upload a map file (<i>.map</i> or <i>.gz</i> formats) you have previously downloaded", {
        title: "Invalid file format"
      });
      return;
    }

    uploadMap(file);
  });
}

function applyTransition(id: string, duration: number, opacity: number) {
  const el = getElementById<HTMLElement>(id);
  if (!el) return;
  el.style.transition = `opacity ${duration}ms`;
  el.style.opacity = String(opacity);
}

export function hideLoading() {
  applyTransition("loading", 3000, 0);
  applyTransition("optionsContainer", 2000, 1);
  applyTransition("tooltip", 3000, 1);
}

export function showLoading() {
  applyTransition("loading", 200, 1);
  applyTransition("optionsContainer", 100, 0);
  applyTransition("tooltip", 200, 0);
}

async function checkLoadParameters(drawMap: boolean) {
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
    await generateMapOnLoad(drawMap);
    return;
  }

  if (useOptionsState.getState().onloadBehavior === "lastSaved") {
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
  generateMapOnLoad(drawMap);
}

export async function generateMapOnLoad(drawMap: boolean = true) {
  await applyStyleOnLoad();
  await generate();
  if (drawMap) {
    applyLayersPreset();
    drawLayers();
    fitMapToScreen();
    focusOn();
  }
}

export function focusOn() {
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

    const x = +params.get("x")! || worldContext.graphWidth / 2;
    const y = +params.get("y")! || worldContext.graphHeight / 2;
    zoomTo(x, y, z, 1600);
  }
}

function setElementDisplayById(id: string, display: string): void {
  const element = getElementById<HTMLElement>(id);
  if (!element) return;
  element.style.display = display;
}

function initTourPromptButton() {
  const MAX_SHOWS = 3;
  const STORAGE_KEY = "fmg-tour-prompt-count";
  const btn = getElementById<HTMLElement>("tourPromptButton");
  if (!btn) return;

  const count = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (count >= MAX_SHOWS) return;

  localStorage.setItem(STORAGE_KEY, String(count + 1));
  setElementDisplayById("tourPromptButton", "flex");
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

  const label = viewContext.burgLabels.select(`[data-id='${burgId}']`);
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

export { zoomTo } from "./actions";

// Hide state-level labels and emblems when zoomed in past this scale (city-level view)
const STATE_HIDE_SCALE = 7;

export function invokeActiveZooming() {
  const isOptimized = useOptionsState.getState().shapeRendering === "optimizeSpeed";

  if (
    viewContext.coastline.select("#sea_island").size() &&
    +viewContext.coastline.select("#sea_island").attr("auto-filter")
  ) {
    const filter = scale > 1.5 && scale <= 2.6 ? null : scale > 2.6 ? "url(#blurFilter)" : "url(#dropShadow)";
    viewContext.coastline.select("#sea_island").attr("filter", filter);
  }

  const burgGroups = worldContext.options.burgs?.groups || [];
  const maxBurgOrder = Math.max(...(burgGroups as BurgGroup[]).map((g: BurgGroup) => g.order), 1);
  const getScaleThreshold = (groupId: string) => {
    const group = (burgGroups as BurgGroup[]).find(g => g.name === groupId);
    if (!group) return 0;
    // Higher order = more important (capital=9) = visible at lower zoom levels
    // Lower order = less important (hamlet=1) = visible only at high zoom
    const invertedOrder = maxBurgOrder - group.order + 1;
    return invertedOrder === 1 ? 1.5 : invertedOrder * 2 - 1.5;
  };

  const isBurgGroupHidden = (groupId: string) => scale < getScaleThreshold(groupId);

  const cullViewportElements = <GElement extends d3.BaseType, Datum, PElement extends d3.BaseType, PDatum>(
    selection: d3.Selection<GElement, Datum, PElement, PDatum>,
    margin: number,
    selector: string
  ) => {
    if (scale > 3) {
      const vLeft = -viewX / scale - margin;
      const vTop = -viewY / scale - margin;
      const vRight = (viewContext.svgWidth - viewX) / scale + margin;
      const vBottom = (viewContext.svgHeight - viewY) / scale + margin;

      selection.selectAll<SVGElement, unknown>(selector).each(function () {
        if (!this.hasAttribute("x") || !this.hasAttribute("y")) return;
        const x = +this.getAttribute("x")!;
        const y = +this.getAttribute("y")!;
        if (x > vLeft && x < vRight && y > vTop && y < vBottom) this.classList.remove("hidden");
        else this.classList.add("hidden");
      });
    } else {
      const hiddenSelector = selector
        .split(",")
        .map(s => `${s.trim()}.hidden`)
        .join(", ");
      selection.selectAll<SVGElement, unknown>(hiddenSelector).each(function () {
        this.classList.remove("hidden");
      });
    }
  };

  if (layerIsOn("toggleLabels")) {
    viewContext.labels.selectAll<SVGGElement, unknown>("g").each(function () {
      if (this.id === "burgLabels") return;

      const parent = this.parentElement;
      if (parent && parent.id === "burgLabels") {
        const hidden = isBurgGroupHidden(this.id);
        if (hidden) {
          this.classList.add("hidden");
        } else {
          this.classList.remove("hidden");
          // Reduce font-size at high zoom so labels don't overrun each other
          const baseSize = +(this.getAttribute("data-size") || this.getAttribute("font-size") || 0);
          if (baseSize > 0) {
            if (!this.hasAttribute("data-size")) this.setAttribute("data-size", String(baseSize));
            this.setAttribute("font-size", String(dampenBurgLabelSize(baseSize, scale)));
          }
        }
        return;
      }

      // Hide state-level label groups at high zoom (city-level view)
      if ((this.id === "states" || this.id === "countries") && scale >= STATE_HIDE_SCALE) {
        this.classList.add("hidden");
        return;
      }

      const desired = +(this.getAttribute("data-size") || 0);
      const relative = dampenStateLabelSize(desired, scale);
      if (useOptionsState.getState().rescaleLabels) this.setAttribute("font-size", String(relative));

      const hidden = useOptionsState.getState().hideLabels && (relative * scale < 6 || relative * scale > 60);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
    });

    cullViewportElements(viewContext.labels, 100, "text");
  }

  if (layerIsOn("toggleBurgIcons")) {
    viewContext.icons.selectAll<SVGGElement, unknown>("g#burgIcons > g").each(function () {
      const hidden = isBurgGroupHidden(this.id);
      if (hidden) {
        this.classList.add("hidden");
      } else {
        this.classList.remove("hidden");
        // Reduce icon size (1em-based symbols) at high zoom
        const baseSize = +(this.getAttribute("data-size") || this.getAttribute("font-size") || 0);
        if (baseSize > 0) {
          if (!this.hasAttribute("data-size")) this.setAttribute("data-size", String(baseSize));
          this.setAttribute("font-size", String(dampenBurgLabelSize(baseSize, scale)));
        }
      }
    });

    cullViewportElements(viewContext.icons, 20, "use, circle");
  }

  if (layerIsOn("toggleEmblems")) {
    viewContext.emblems.selectAll<SVGGElement, unknown>("g").each(function () {
      // burgEmblems container: reduce font-size at high zoom (COA <use> elements use width/height in em units)
      if (this.id === "burgEmblems") {
        const baseSize = +(this.getAttribute("data-zoom-size") || this.getAttribute("font-size") || 0);
        if (baseSize > 0) {
          this.setAttribute("font-size", String(dampenBurgLabelSize(baseSize, scale)));
        }
        return;
      }

      const parent = this.parentElement;
      if (parent && parent.id === "burgEmblems") {
        const hidden = isBurgGroupHidden(this.id);
        if (hidden) this.classList.add("hidden");
        else this.classList.remove("hidden");
        return;
      }

      const emblemScaleThresholds: Record<string, number> = { stateEmblems: 0, provinceEmblems: 2 };
      const minScale = emblemScaleThresholds[this.id] ?? 0;
      // Reduce font-size at high zoom so state/province COAs don't grow too large
      const baseSize = +(this.getAttribute("data-zoom-size") || this.getAttribute("font-size") || 0);
      if (baseSize > 0) {
        this.setAttribute("font-size", String(dampenBurgLabelSize(baseSize, scale)));
      }
      const scaledSize = +(this.getAttribute("font-size") ?? 0) * scale;
      const isStateEmblem = this.id === "stateEmblems";
      const hidden =
        scale < minScale ||
        (isStateEmblem && scale >= STATE_HIDE_SCALE) ||
        ((getElementById("hideEmblems") as HTMLInputElement)?.checked && (scaledSize < 25 || scaledSize > 300));
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
      if (!hidden && appServices.COArenderer && this.children.length && !this.children[0].getAttribute("href"))
        renderGroupCOAs(worldContext, viewContext, appServices, this);
    });

    viewContext.emblems.selectAll<SVGGElement, unknown>("g#burgEmblems > g").each(function () {
      const hidden = this.classList.contains("hidden");
      if (!hidden && appServices.COArenderer && this.children.length && !this.children[0].getAttribute("href")) {
        renderGroupCOAs(worldContext, viewContext, appServices, this.parentElement as unknown as SVGGElement);
      }
    });

    // Viewport culling: hide individual <use> elements whose positions fall outside the visible area.
    // x/y attributes are top-left corners in map coordinates; margin accounts for emblem half-size.
    cullViewportElements(viewContext.emblems, 100, "use");
  }

  if (layerIsOn("toggleGoods")) {
    // Viewport culling + zoom-scale threshold for goods icons and burg plates.
    // data-min-scale encodes the minimum zoom level needed to show each element:
    // high-production locations are visible from afar, low-production only when zoomed in.
    const GOODS_MARGIN = 20;
    const vLeft = -viewX / scale - GOODS_MARGIN;
    const vTop = -viewY / scale - GOODS_MARGIN;
    const vRight = (viewContext.svgWidth - viewX) / scale + GOODS_MARGIN;
    const vBottom = (viewContext.svgHeight - viewY) / scale + GOODS_MARGIN;

    d3.select<SVGGElement, unknown>("#goods")
      .selectAll<SVGGElement, unknown>("#goodsIcons > g, #goodsBurgs > g")
      .each(function () {
        const x = +this.getAttribute("data-x")!;
        const y = +this.getAttribute("data-y")!;
        const minScale = +this.getAttribute("data-min-scale")! || 0;

        const inViewport = x > vLeft && x < vRight && y > vTop && y < vBottom;
        const aboveThreshold = scale >= minScale;

        if (inViewport && aboveThreshold) this.classList.remove("hidden");
        else this.classList.add("hidden");
      });
  }

  if (!viewContext.customization && !isOptimized) {
    const desired = +viewContext.statesHalo.attr("data-width");
    const haloSize = rn(desired / scale ** 0.8, 2);
    viewContext.statesHalo.attr("stroke-width", haloSize).style("display", haloSize > 0.1 ? "block" : "none");
  }

  +viewContext.markers.attr("rescale") &&
    worldContext.pack.markers?.forEach(marker => {
      const { i, x = 0, y = 0, size = 30, hidden } = marker;
      const el = !hidden ? getElementById<SVGUseElement>(`marker${i}`) : null;
      if (!el) return;

      const zoomedSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);
      el.setAttribute("width", String(zoomedSize));
      el.setAttribute("height", String(zoomedSize));
      el.setAttribute("x", String(rn(x - zoomedSize / 2, 1)));
      el.setAttribute("y", String(rn(y - zoomedSize, 1)));
    });

  if (layerIsOn("toggleRulers")) {
    const size = rn((10 / scale ** 0.3) * 2, 2);
    viewContext.ruler.selectAll("text").attr("font-size", size);
  }

  // WebGL labels read their base size directly from data-size (not the SVG font-size attribute
  // updated above) and dampen it themselves using the current scale, so a rebuild here just
  // reflects the settled zoom level. No-op when the render mode isn't webglHybrid.
  scheduleWebglUpdate();
}

// ─── Drag-to-upload ───────────────────────────────────────────────────────────

function getMapOverlayElement(): HTMLElement | null {
  return getElementById<HTMLElement>("mapOverlay");
}

function setMapOverlayVisible(visible: boolean): void {
  const overlay = getMapOverlayElement();
  if (!overlay) return;
  overlay.style.display = visible ? "" : "none";
}

function setMapOverlayContent(content: string): void {
  const overlay = getMapOverlayElement();
  if (!overlay) return;
  overlay.innerHTML = content;
}

void (function addDragToUpload() {
  document.addEventListener("dragover", e => {
    e.stopPropagation();
    e.preventDefault();
    setMapOverlayVisible(true);
  });

  document.addEventListener("dragleave", () => {
    setMapOverlayVisible(false);
  });

  document.addEventListener("drop", e => {
    e.stopPropagation();
    e.preventDefault();

    setMapOverlayVisible(false);
    if (e.dataTransfer?.items?.length !== 1) return;
    const file = e.dataTransfer.items[0].getAsFile();
    if (!file) return;

    if (!file.name.endsWith(".map") && !file.name.endsWith(".gz")) {
      openAlert("Please upload a map file (<i>.map</i> or <i>.gz</i> formats) you have previously downloaded", {
        title: "Invalid file format"
      });
      return;
    }

    setMapOverlayVisible(true);
    setMapOverlayContent("Uploading<span>.</span><span>.</span><span>.</span>");
    if (closeDialogs) closeDialogs();
    uploadMap(file, () => {
      setMapOverlayVisible(false);
      setMapOverlayContent("Drop a map file to open");
    });
  });
})();

// ─── Map generation ───────────────────────────────────────────────────────────

export async function generate(opts?: { seed?: string; graph?: Grid | null }) {
  try {
    useDebugSnapshotState.getState().clearAll();

    const timeStart = performance.now();
    const { seed: precreatedSeed, graph: precreatedGraph } = opts || {};

    invokeActiveZooming();
    setSeed(precreatedSeed);
    INFO && console.group(`Generated Map ${worldContext.seed}`);

    applyGraphSize();
    randomizeOptions();
    worldContext.options.gunpowderEraEnabled = useOptionsState.getState().gunpowderEraEnabled;

    if (
      shouldRegenerateGrid(worldContext.grid, +(precreatedSeed ?? 0), worldContext.graphWidth, worldContext.graphHeight)
    ) {
      Object.keys(worldContext.grid).forEach(k => {
        delete (worldContext.grid as unknown as Record<string, unknown>)[k];
      });
      Object.assign(
        worldContext.grid,
        precreatedGraph || generateGrid(worldContext.seed, worldContext.graphWidth, worldContext.graphHeight)
      );
    } else delete (worldContext.grid.cells as { h?: unknown }).h;
    worldContext.grid.cells.h = await HeightmapGenerator.generate(
      worldContext,
      viewContext,
      appServices,
      worldContext.grid
    );
    Object.keys(worldContext.pack).forEach(k => {
      delete (worldContext.pack as unknown as Record<string, unknown>)[k];
    });
    Object.assign(worldContext.pack, {} as typeof worldContext.pack);

    Features.markupGrid();
    addLakesInDeepDepressions();
    openNearSeaLakes();

    if (viewContext.renderMap) OceanLayers();
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

    Threats.generate(worldContext, viewContext, appServices, state);
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
    establishVassalage(worldContext.pack, worldContext.populationRate);
    Markers.generate(worldContext, viewContext, appServices, state);
    Zones.generate(worldContext, viewContext, appServices, state);

    initSimulationClock();
    document.dispatchEvent(new CustomEvent("fmg:generate-post-core"));

    if (import.meta.env.DEV) {
      useDebugSnapshotState.getState().addSnapshot({
        tickCount: 0,
        year: worldContext.options.year ?? 0,
        label: "Initial Generation",
        isLocked: true,
        data: captureSnapshotData()
      });
    }

    // Apply demographic scars from past wars generated by states history
    applyHistoricalWarScars();

    // Calculate and append flavor text for monster casualties in notes
    Threats.appendCasualtyNotes(worldContext);

    drawScaleBar(worldContext, viewContext, appServices, viewContext.scaleBar, scale);
    drawCalendar(worldContext, viewContext);
    Names.getMapName(false);

    WARN && console.warn(`TOTAL: ${rn((performance.now() - timeStart) / 1000, 2)}s`);
    showStatistics();
    INFO && console.groupEnd();
  } catch (error) {
    ERROR && console.error(error);
    const parsedError = parseError(error);
    clearMainTip();

    generationErrorDialogStore.getState().open({
      errorText: parsedError,
      onCleanup: () => cleanupData(),
      onRegenerate: () => regenerateMap("generation error")
    });
  }
}

export { getWorldState } from "./actions";

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

  useOptionsState.getState().setOption("seed", worldContext.seed);
  const seedInput = getElementById<HTMLInputElement>("optionsSeed");
  if (seedInput) seedInput.value = worldContext.seed;
  Math.random = Alea(worldContext.seed);
  initRng(worldContext.seed);
}

// ─── Lake helpers ──────────────────────────────────────────────────────────

export function addLakesInDeepDepressions() {
  TIME && console.time("addLakesInDeepDepressions");
  const elevationLimit = +(getElementById<HTMLOutputElement>("lakeElevationLimitOutput")?.value ?? "80");
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

export function openNearSeaLakes() {
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
  const updates: Partial<OptionsState> = {};
  if (randomize || !locked("mapSize")) updates.mapSize = size;
  if (randomize || !locked("latitude")) updates.latitude = latitude;
  if (randomize || !locked("longitude")) updates.longitude = longitude;
  if (Object.keys(updates).length > 0) useOptionsState.getState().setOptions(updates);

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

export function calculateMapCoordinates() {
  const options = useOptionsState.getState();
  const sizeFraction = options.mapSize / 100;
  const latShift = options.latitude / 100;
  const lonShift = options.longitude / 100;

  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);

  const lonT = rn(Math.min((worldContext.graphWidth / worldContext.graphHeight) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);
  worldContext.mapCoordinates = { latT, latN, latS, lonT, lonW, lonE };
}

// ─── Temperature model ────────────────────────────────────────────────────────

export function calculateTemperatures() {
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

  const rawExp = useOptionsState.getState().heightExponent;
  const exponent = Number.isFinite(rawExp) && rawExp >= 1 && rawExp <= 5 ? rawExp : 1.8;

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

export function generatePrecipitation() {
  TIME && console.time("generatePrecipitation");
  viewContext.prec.selectAll("*").remove();
  const { cells: gridCells, cellsX, cellsY } = worldContext.grid;
  gridCells.prec = new Uint8Array(gridCells.i.length);

  const { points: pointsOpt } = useOptionsState.getState();
  const cellsNumberModifier = ((pointsOpt === 4 ? 10000 : pointsOpt * 2500) / 10000) ** 0.25;
  const precInputModifier = useOptionsState.getState().prec / 100;
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
    const wind = viewContext.prec.append("g").attr("id", "wind");

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
            .attr("x", worldContext.graphWidth - 52)
            .attr("y", y)
            .text("⇇");
        }
      }
    });

    if (northerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", worldContext.graphWidth / 2)
        .attr("y", 42)
        .text("⇊");
    if (southerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", worldContext.graphWidth / 2)
        .attr("y", worldContext.graphHeight - 20)
        .text("⇈");
  })();

  TIME && console.timeEnd("generatePrecipitation");
}

// ─── Graph operations ─────────────────────────────────────────────────────────

export function reGraph() {
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

export function isWetLand(moisture: number, temperature: number, height: number) {
  if (moisture > 40 && temperature > -2 && height < 25) return true;
  if (moisture > 24 && temperature > -2 && height > 24 && height < 60) return true;
  return false;
}

export function rankCells() {
  TIME && console.time("rankCells");
  const { cells: packCells, features } = worldContext.pack;
  packCells.s = new Int16Array(packCells.i.length);
  packCells.pop = new Float32Array(packCells.i.length);
  packCells.capacity = new Float32Array(packCells.i.length);
  packCells.children = new Float32Array(packCells.i.length);
  packCells.maleAdults = new Float32Array(packCells.i.length);
  packCells.femaleAdults = new Float32Array(packCells.i.length);
  packCells.elders = new Float32Array(packCells.i.length);

  const initialPopulationSaturation = useOptionsState.getState().initialPopulationSaturation / 100;

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

    const danger = packCells.danger ? packCells.danger[i] : 0;
    if (danger > 0) {
      const multiplier = Math.max(0, 1 - danger / 200);
      packCells.s[i] = Math.round(packCells.s[i] * multiplier);
    }

    packCells.capacity[i] = packCells.s[i] > 0 ? (packCells.s[i] * packCells.area[i]) / meanArea : 0;
    packCells.pop[i] = packCells.capacity[i] * initialPopulationSaturation;

    packCells.children[i] = packCells.pop[i] * 0.4;
    packCells.maleAdults[i] = packCells.pop[i] * 0.2205;
    packCells.femaleAdults[i] = packCells.pop[i] * 0.2295;
    packCells.elders[i] = packCells.pop[i] * 0.15;
  }

  TIME && console.timeEnd("rankCells");
}

export function showStatistics() {
  const heightmap = useOptionsState.getState().template;
  const isTemplate = heightmap in heightmapTemplates;
  const heightmapType = isTemplate ? "template" : "precreated";
  const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

  const stats = `  Seed: ${worldContext.seed}
    Canvas size: ${worldContext.graphWidth}x${worldContext.graphHeight} px
    Heightmap: ${heightmap}
    Template: ${isRandomTemplate}${heightmapType}
    Points: ${worldContext.grid.points.length}
    Cells: ${worldContext.pack.cells.i.length}
    Map size: ${useOptionsState.getState().mapSize}%
    States: ${worldContext.pack.states.length - 1}
    Provinces: ${worldContext.pack.provinces.length - 1}
    Burgs: ${worldContext.pack.burgs.length - 1}
    Religions: ${worldContext.pack.religions.length - 1}
    Culture set: ${useOptionsState.getState().culturesSet}
    Cultures: ${worldContext.pack.cultures.length - 1}`;

  worldContext.mapId = Date.now();
  mapHistory.push({
    seed: worldContext.seed,
    width: worldContext.graphWidth,
    height: worldContext.graphHeight,
    template: heightmap,
    created: worldContext.mapId
  });
  INFO && console.info(stats);

  window.dispatchEvent(
    new CustomEvent("map:generated", { detail: { seed: worldContext.seed, mapId: worldContext.mapId } })
  );
}

export const regenerateMap = debounce(async (opts?: { seed?: string } | string) => {
  WARN && console.warn("Generate new random map");

  const { points: pointsForLoading } = useOptionsState.getState();
  const cellsDesired = pointsForLoading === 4 ? 10000 : pointsForLoading * 2500;
  const shouldShowLoading = cellsDesired > 10000;
  shouldShowLoading && showLoading();

  closeDialogs("#worldConfigurator, #options3d");
  viewContext.customization = 0;

  resetZoom(1000);
  undraw();
  await generate(typeof opts === "string" ? { seed: opts } : opts);
  drawLayers();
  if (ThreeDRenderer.options.isOn) ThreeDRenderer.redraw();
  if (dialogStore.getState().openDialogs.has("worldConfigurator")) EditorBus.editWorld();

  fitMapToScreen();
  shouldShowLoading && hideLoading();
  clearMainTip();
}, 250);

export function undraw() {
  viewContext.viewbox
    .selectAll("path, circle, polygon, line, text, use, #texture > image, #zones > g, #armies > g, #ruler > g")
    .remove();
  viewContext.defs
    .node()!
    .querySelectorAll("path, clipPath, svg")
    .forEach(el => {
      el.remove();
    });
  const coasEl = getElementById<HTMLElement>("coas");
  if (coasEl) coasEl.innerHTML = "";
  worldContext.notes = [];
  EditorBus.unfog();
}
