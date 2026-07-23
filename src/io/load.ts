import type * as d3 from "d3";
import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { Biomes } from "../generators/biomes";
import { Burgs } from "../generators/burgs-generator";
import { Features } from "../generators/features";
import { Routes } from "../generators/routes-generator";
import { initSimulationClock } from "../generators/timeEngine";
import { GridRenderer } from "../renderers";
import { DeckGlRenderer } from "../renderers/webgl/deckRenderer";
import { importLegacyPresentationFromSvg } from "../runtime/legacyPresentationImport";
import { bindSimulationBurgState, resetSimulationBurgState } from "../runtime/simulationBurgState";
import { bindSimulationMilitaryState, resetSimulationMilitaryState } from "../runtime/simulationMilitaryState";
import { bindSimulationStateState, resetSimulationStateState } from "../runtime/simulationStateState";
import {
  assertValidWorldDocument,
  ChunkedWorldCodecAdapter,
  decodeAndValidateWorldArchive,
  LegacyMapCodecAdapter
} from "../runtime/worldArchive";
import { legacyMutation, worldRuntime } from "../runtime/worldRuntime";
import { declareFont, fonts } from "../services/fonts";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { rulers } from "../store/editorState";
import { DEFAULT_LAYERS, useLayerState } from "../store/layerState";
import { loadErrorDialogStore } from "../store/loadErrorDialogState";
import { loadMapDialogStore } from "../store/loadMapDialogState";
import { type OptionsState, useOptionsState } from "../store/optionsState";
import type { NameBase, River, Route, SeaRouteGenerationMode } from "../types/models";
import { closeDialogs, openConfirm } from "../ui/dialogs/dialogService";
import { calculateVoronoi, findCell, last, link, minmax, parseError, rn } from "../utils";
import { heightmapColorSchemes } from "../utils/colorUtils";
import { normalizeConflictAutonomy } from "../utils/conflictAutonomy";
import { ERROR, INFO, WARN } from "../utils/debug";

import { layerIsOn } from "../utils/nodeUtils";
import { cleanupData, compareVersions, isValidVersion, parseMapVersion, VERSION } from "../versioning";
import { resolveVersionConflicts } from "./auto-update";
import { Cloud } from "./cloud";
import { ldb } from "./ldb";

// ─── Quick load from browser storage ─────────────────────────────────────────

export async function quickLoad(): Promise<void> {
  const blob = await ldb.get("lastMap");
  if (blob) loadMapPrompt(blob);
  else {
    tip("No map stored. Save map to browser storage first", true, "error", 2000);
    ERROR && console.error("No map stored");
  }
}

// ─── Dropbox load ─────────────────────────────────────────────────────────────

export async function loadFromDropbox(): Promise<void> {
  const mapPath = loadMapDialogStore.getState().selectedDropboxPath;
  if (!mapPath) {
    tip("Please select a map file first", true, "error", 2000);
    return;
  }
  console.info("Loading map from Dropbox:", mapPath);
  const blob = await Cloud.providers.dropbox.load(mapPath);
  uploadMap(blob);
}

export async function createSharableDropboxLink(): Promise<void> {
  const mapPath = loadMapDialogStore.getState().selectedDropboxPath;
  if (!mapPath) {
    tip("Please select a map file first", true, "error", 2000);
    return;
  }

  try {
    const previewLink = await Cloud.providers.dropbox.getLink(mapPath);
    const directLink = previewLink.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    const finalLink = `${location.origin}${location.pathname}?maplink=${directLink}`;

    loadMapDialogStore.getState().setSharableLink(finalLink, `${finalLink.slice(0, 45)}...`);
  } catch (error) {
    ERROR && console.error(error);
    loadMapDialogStore.getState().hideSharableLink();
    tip("Dropbox API error. Can not create link.", true, "error", 2000);
  }
}

// ─── Load prompt (check for unsaved changes) ─────────────────────────────────

export function loadMapPrompt(blob: Blob): void {
  const workingTime = (Date.now() - last(worldContext.mapHistory).created) / 60000;
  if (workingTime < 5) {
    loadLastSavedMap();
    return;
  }

  openConfirm(
    `Are you sure you want to load saved map?<br />All unsaved changes made to the current map will be lost`,
    {
      title: "Load saved map",
      confirm: "Load",
      onConfirm: () => loadLastSavedMap()
    }
  );

  function loadLastSavedMap() {
    WARN && console.warn("Load last saved map");
    try {
      uploadMap(blob);
    } catch (error) {
      ERROR && console.error(error);
      tip("Cannot load last saved map", true, "error", 2000);
    }
  }
}

// ─── Load from URL ────────────────────────────────────────────────────────────

export async function loadMapFromURL(maplink: string, random: number): Promise<void> {
  const controller = new AbortController();
  const TIMEOUT = 120000;
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const url = decodeURIComponent(maplink);
    const response = await fetch(url, { method: "GET", mode: "cors", signal: controller.signal });
    if (!response.ok) throw new Error("Cannot load map from URL");
    const blob = await response.blob();
    uploadMap(blob);
  } catch (error) {
    const message =
      (error as Error)?.name === "AbortError"
        ? "Cannot load map from URL: request timed out"
        : (error as Error).message;
    showUploadErrorMessage(message, maplink, random);
    if (random) document.dispatchEvent(new CustomEvent("fmg:generate-map-on-load"));
  } finally {
    clearTimeout(timeoutId);
  }
}

export function showUploadErrorMessage(error: string, maplink: string, random: number): void {
  ERROR && console.error(error);
  openConfirm(
    `Cannot load map from the ${link(maplink, "link provided")}. ${
      random ? `A new random map is generated. ` : ""
    } Please ensure the linked file is reachable and CORS is allowed on server side`,
    {
      title: "Loading error",
      confirm: "Clear cache",
      cancel: "OK",
      onConfirm: () => cleanupData()
    }
  );
}

// ─── Upload & parse ───────────────────────────────────────────────────────────

export function uploadMap(file: Blob, callback?: () => void): void {
  (uploadMap as { timeStart?: number }).timeStart = performance.now();

  const fileReader = new FileReader();
  fileReader.onloadend = async (fileLoadedEvent: ProgressEvent<FileReader>) => {
    const result = fileLoadedEvent.target!.result as ArrayBuffer;
    const header = new Uint8Array(result, 0, Math.min(4, result.byteLength));
    if (new ChunkedWorldCodecAdapter().canDecode(header)) {
      await loadChunkedWorldArchive(file, header, callback);
      return;
    }

    if (callback) callback();
    document.getElementById("coas")!.innerHTML = "";
    const { mapData, mapVersion } = await parseLoadedResult(result);

    const isInvalid = !mapData || !isValidVersion(mapVersion ?? "") || mapData.length < 10 || !mapData[5];
    if (isInvalid) return showUploadMessage("invalid", mapData, mapVersion ?? "");

    const isUpdated = compareVersions(mapVersion!, VERSION).isEqual;
    if (isUpdated) return showUploadMessage("updated", mapData, mapVersion!);

    const isAncient = compareVersions(mapVersion!, "0.70.0").isOlder;
    if (isAncient) return showUploadMessage("ancient", mapData, mapVersion!);

    const isNewer = compareVersions(mapVersion!, VERSION).isNewer;
    if (isNewer) return showUploadMessage("newer", mapData, mapVersion!);

    const isOutdated = compareVersions(mapVersion!, VERSION).isOlder;
    if (isOutdated) return showUploadMessage("outdated", mapData, mapVersion!);
  };

  fileReader.readAsArrayBuffer(file);
}

async function loadChunkedWorldArchive(file: Blob, header: Uint8Array, callback?: () => void): Promise<void> {
  try {
    // Decode, migrate and validate are complete before the first live mutation.
    // A malformed archive therefore leaves the active world and SVG untouched.
    const validated = await decodeAndValidateWorldArchive({ blob: file, header });
    const seaRouteGenerationMode = validated.document.world.options.seaRouteGenerationMode;
    const commit = await worldRuntime.dispatch({ type: "world.replace", payload: validated });
    if (!commit) throw new Error("World archive did not produce a replacement commit");

    // Archives created before the generation-mode field was introduced have no
    // reliable indication of which algorithm produced their routes. Preserve
    // those routes verbatim instead of forcibly replacing them with augmented.
    if (seaRouteGenerationMode) {
      legacyMutation(() => {
        regenerateLoadedRoutes(seaRouteGenerationMode);
        return { result: undefined, topics: ["map.networks"] };
      });
    }

    useOptionsState.getState().setOptions({
      seed: worldContext.seed,
      year: validated.document.simulation.currentYear,
      era: validated.document.simulation.era,
      mapWidth: worldContext.graphWidth,
      mapHeight: worldContext.graphHeight
    });
    callback?.();
    document.getElementById("coas")?.replaceChildren();

    // The full-replace commit has already reached RenderCoordinator. A renderer
    // failure is isolated from the accepted world by WorldRuntime listeners.
    document.dispatchEvent(new CustomEvent("fmg:render-mode-changed"));
    document.dispatchEvent(new CustomEvent("fmg:refresh-editors"));
    tip("Map is successfully loaded", true, "success", 7000);
  } catch (error) {
    ERROR && console.error(error);
    clearMainTip();
    loadErrorDialogStore.getState().open({
      errorText: parseError(error as Error),
      mapVersion: "fmg",
      onClearCache: () => cleanupData(),
      onSelectFile: () => document.getElementById("mapToLoad")?.click(),
      onNewMap: () => document.dispatchEvent(new CustomEvent("fmg:regenerate-map", { detail: "loading error" }))
    });
  }
}

/**
 * Route generation is intentionally upgraded when an archive is loaded. A
 * `.fmg` archives that explicitly record a generation mode are rebuilt using
 * that mode. Locked routes remain user-authored and are retained.
 *
 * This runs immediately after `world.replace`: `Routes.sync()` uses the River
 * singleton's current world context to build river geometry, so it cannot
 * safely operate on the detached decoded document.
 */
function regenerateLoadedRoutes(seaRouteGenerationMode: SeaRouteGenerationMode): void {
  const lockedRoutes = worldContext.pack.routes
    .filter((route: Route) => route.lock)
    .map((route: Route, index: number) => ({ ...route, i: index }));
  const { pack, grid, seed, options, nameBases, biomesData, notes } = worldContext;
  Routes.generate(
    worldContext,
    viewContext,
    appServices,
    { pack, grid, seed, options, nameBases, biomesData, notes },
    lockedRoutes,
    seaRouteGenerationMode
  );
}

export async function parseLoadedResult(
  result: ArrayBuffer | Uint8Array
): Promise<{ mapData: string[] | null; mapVersion: string | null }> {
  try {
    const bytes = result instanceof Uint8Array ? Uint8Array.from(result) : new Uint8Array(result);
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    const staged = await new LegacyMapCodecAdapter().decode({ blob, header: new Uint8Array(0) });
    const mapData = [...staged.mapData];
    const mapVersion = parseMapVersion(mapData[0].split("|")[0] || mapData[0] || "");
    return { mapData, mapVersion };
  } catch (error) {
    ERROR && console.error(error);
    return { mapData: null, mapVersion: null };
  }
}

function showUploadMessage(type: string, mapData: string[] | null, mapVersion: string): void {
  let message: string;
  let title: string;

  if (type === "invalid") {
    message = "The file does not look like a valid save file.<br>Please check the data format";
    title = "Invalid file";
  } else if (type === "updated") {
    parseLoadedData(mapData!, mapVersion);
    return;
  } else if (type === "ancient") {
    const archive = link("https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog", "archived version");

    message = `The map version you are trying to load (${mapVersion}) is too old and cannot be updated to the current version.<br>Please keep using an ${archive}`;
    title = "Ancient file";
  } else if (type === "newer") {
    message = `The map version you are trying to load (${mapVersion}) is newer than the current version.<br>Please load the file in the appropriate version`;
    title = "Newer file";
  } else if (type === "outdated") {
    INFO && console.info(`Loading map. Auto-updating from ${mapVersion} to ${VERSION}`);
    parseLoadedData(mapData!, mapVersion);
    return;
  } else {
    message = "Unknown error";
    title = "Error";
  }

  openConfirm(message, {
    title,
    confirm: "Clear cache",
    cancel: "OK",
    onConfirm: () => cleanupData()
  });
}

// ─── Main data parser ─────────────────────────────────────────────────────────

/**
 * Apply a fully decoded legacy `.map` payload.
 *
 * Ordering (P2-9):
 * 1. Decode already completed (mapData staged) before this runs.
 * 2. Snapshot live world for rollback.
 * 3. Stage world data into live buffers (no permanent commit yet).
 * 4. Validate → `world.replace` (fullReplace commit). Failure restores the snapshot.
 * 5. Only then inject the saved SVG and re-bind view layers.
 */
export async function parseLoadedData(data: string[], mapVersion: string): Promise<void> {
  try {
    closeDialogs?.();
    view.setCustomization(0);
    document.dispatchEvent(new CustomEvent("react-exit-heightmap-edit"));
    document.dispatchEvent(new CustomEvent("react-hide-exit-customization"));

    // Decode is complete (positional slots in `data`). Snapshot before any live write.
    const previous = worldRuntime.captureRollbackDocument();
    let dataCommitted = false;
    try {
      await stageLegacyMapData(data, mapVersion);

      const staged = worldRuntime.captureRollbackDocument();
      assertValidWorldDocument(staged);
      const commit = await worldRuntime.dispatch({
        type: "world.replace",
        payload: { stage: "validated", document: staged }
      });
      if (!commit) throw new Error("Legacy map load did not produce a replacement commit");
      dataCommitted = true;

      // View-plane only: SVG injection, layer reinit, presentation import.
      // Listener/view failures must not roll back an accepted world replace.
      applyLegacyMapView(data, mapVersion);
    } catch (stageError) {
      if (!dataCommitted) {
        try {
          worldRuntime.restoreRollbackDocument(previous);
        } catch (restoreError) {
          ERROR && console.error("[legacy map] Failed to restore world after load failure", restoreError);
        }
      }
      throw stageError;
    }

    WARN &&
      console.warn(
        `TOTAL: ${rn((performance.now() - ((uploadMap as { timeStart?: number }).timeStart ?? 0)) / 1000, 2)}s`
      );
    document.dispatchEvent(new CustomEvent("fmg:show-statistics"));
    INFO && console.groupEnd();
    tip("Map is successfully loaded", true, "success", 7000);
  } catch (error) {
    ERROR && console.error(error);
    clearMainTip();

    loadErrorDialogStore.getState().open({
      errorText: parseError(error as Error),
      mapVersion,
      onClearCache: () => cleanupData(),
      onSelectFile: () => document.getElementById("mapToLoad")?.click(),
      onNewMap: () => document.dispatchEvent(new CustomEvent("fmg:regenerate-map", { detail: "loading error" }))
    });
  }
}

/**
 * Stage legacy positional slots into live world/simulation buffers without
 * publishing a commit and without replacing the SVG DOM. Callers must snapshot
 * first and either `world.replace` or restore on failure.
 */
async function stageLegacyMapData(data: string[], _mapVersion: string): Promise<void> {
  {
    const params = data[0].split("|");
    if (params[3]) {
      worldContext.seed = params[3];
      useOptionsState.getState().setOption("seed", worldContext.seed);
      INFO && console.group(`Loaded Map ${worldContext.seed}`);
    } else INFO && console.group("Loaded Map");
    if (params[4]) worldContext.graphWidth = +params[4];
    if (params[5]) worldContext.graphHeight = +params[5];
    worldContext.mapId = params[6] ? +params[6] : Date.now();
  }

  {
    const settings = data[1].split("|");
    const updates: Partial<OptionsState> = {};

    if (settings[0]) updates.distanceUnit = settings[0];
    if (settings[1]) {
      updates.distanceScale = +settings[1];
      worldContext.distanceScale = +settings[1];
    }
    if (settings[2]) updates.areaUnit = settings[2];
    if (settings[3]) updates.heightUnit = settings[3];
    if (settings[4]) updates.heightExponent = +settings[4];
    if (settings[5]) updates.temperatureScale = settings[5];

    if (settings[12]) {
      updates.populationRate = +settings[12];
      worldContext.populationRate = +settings[12];
    }
    if (settings[13]) {
      updates.urbanization = +settings[13];
      worldContext.urbanization = +settings[13];
    }
    if (settings[14]) updates.mapSize = minmax(+settings[14], 1, 100);
    if (settings[15]) updates.latitude = minmax(+settings[15], 0, 100);
    if (settings[18]) updates.prec = +settings[18];

    useOptionsState.getState().setOptions(updates);
    if (settings[19]) worldContext.options = JSON.parse(settings[19]);
    worldContext.options.conflictAutonomy = normalizeConflictAutonomy(worldContext.options.conflictAutonomy);
    if (settings[16]) worldContext.options.temperatureEquator = +settings[16];
    if (settings[17])
      worldContext.options.temperatureNorthPole = worldContext.options.temperatureSouthPole = +settings[17];
  }

  // Sync loaded values into Zustand store so React UI reflects the loaded map
  {
    const settings = (data[1] || "").split("|");
    const zustandUpdates: Partial<Omit<OptionsState, "setOption" | "setOptions">> = {};
    if (settings[20]) zustandUpdates.mapName = settings[20];
    if (settings[21]) zustandUpdates.hideLabels = !!+settings[21];
    if (settings[22]) zustandUpdates.stylePreset = settings[22];
    if (settings[23]) zustandUpdates.rescaleLabels = !!+settings[23];
    if (settings[24]) {
      zustandUpdates.urbanDensity = +settings[24];
      worldContext.urbanDensity = +settings[24];
    }
    if (settings[25]) zustandUpdates.longitude = minmax(+(settings[25] || "50"), 0, 100);
    if (settings[26]) zustandUpdates.growthRate = +settings[26];
    if (worldContext.options.stateLabelsMode) zustandUpdates.stateLabelsMode = worldContext.options.stateLabelsMode;
    if (worldContext.options.year != null) zustandUpdates.year = worldContext.options.year;
    if (worldContext.options.era != null) zustandUpdates.era = worldContext.options.era;
    zustandUpdates.gunpowderEraEnabled = worldContext.options.gunpowderEraEnabled !== false;
    zustandUpdates.conflictAutonomy = normalizeConflictAutonomy(worldContext.options.conflictAutonomy);
    useOptionsState.getState().setOptions(zustandUpdates);
  }

  if (data[2]) worldContext.mapCoordinates = JSON.parse(data[2]);
  if (data[4]) worldContext.notes = JSON.parse(data[4]);
  if (data[33]) rulers.fromString(data[33]);
  if (data[34]) {
    const usedFonts = JSON.parse(data[34]);
    usedFonts.forEach((usedFont: { family: string; unicodeRange?: string; variant?: string }) => {
      const { family: usedFamily, unicodeRange: usedRange, variant: usedVariant } = usedFont;
      const defaultFont = fonts.find(
        ({ family, unicodeRange, variant }) =>
          family === usedFamily && unicodeRange === usedRange && variant === usedVariant
      );
      if (!defaultFont) fonts.push(usedFont);
      declareFont(usedFont);
    });
  }

  {
    const biomesRaw = data[3].split("|");
    worldContext.biomesData = Biomes.getDefault();
    worldContext.biomesData.color = biomesRaw[0].split(",");
    worldContext.biomesData.habitability = biomesRaw[1].split(",").map(h => +h);
    worldContext.biomesData.name = biomesRaw[2].split(",");
    for (let i = worldContext.biomesData.i.length; i < worldContext.biomesData.name.length; i++) {
      worldContext.biomesData.i.push(worldContext.biomesData.i.length);
      worldContext.biomesData.iconsDensity.push(0);
      worldContext.biomesData.icons.push([]);
      worldContext.biomesData.cost.push(50);
    }
  }
  // Simulation clock from loaded options — pure data; calendar SVG is drawn after view reinit.
  initSimulationClock();
  resetSimulationBurgState(simulationContext);
  resetSimulationStateState(simulationContext);
  resetSimulationMilitaryState(simulationContext);

  {
    const parsedGrid = JSON.parse(data[6]) as typeof worldContext.grid;
    for (const key of Object.keys(worldContext.grid))
      delete (worldContext.grid as unknown as Record<string, unknown>)[key];
    Object.assign(worldContext.grid, parsedGrid);
    const { cells: gCells, vertices } = calculateVoronoi(worldContext.grid.points, worldContext.grid.boundary);
    worldContext.grid.cells = gCells as typeof worldContext.grid.cells;
    worldContext.grid.vertices = vertices;
    worldContext.grid.cells.h = Uint8Array.from(data[7].split(","), Number);
    worldContext.grid.cells.prec = Uint8Array.from(data[8].split(","), Number);
    worldContext.grid.cells.f = Uint16Array.from(data[9].split(","), Number);
    worldContext.grid.cells.t = Int8Array.from(data[10].split(","), Number);
    worldContext.grid.cells.temp = Int8Array.from(data[11].split(","), Number);
  }
  document.dispatchEvent(new CustomEvent("fmg:re-graph"));
  Features.markupPack();
  worldContext.pack.features = JSON.parse(data[12]);
  worldContext.pack.cultures = JSON.parse(data[13]);
  worldContext.pack.states = JSON.parse(data[14]);
  bindSimulationStateState(worldContext, simulationContext);
  bindSimulationMilitaryState(worldContext, simulationContext);
  worldContext.pack.burgs = JSON.parse(data[15]);
  bindSimulationBurgState(worldContext, simulationContext);
  worldContext.pack.religions = data[29] ? JSON.parse(data[29]) : [{ i: 0, name: "No religion" }];
  worldContext.pack.provinces = data[30] ? JSON.parse(data[30]) : [0];
  worldContext.pack.rivers = data[32] ? JSON.parse(data[32]) : [];
  worldContext.pack.markers = data[35] ? JSON.parse(data[35]) : [];
  worldContext.pack.frontierForts = data[51] ? JSON.parse(data[51]) : [];
  worldContext.pack.routes = data[37] ? JSON.parse(data[37]) : [];
  worldContext.pack.zones = data[38] ? JSON.parse(data[38]) : [];
  worldContext.pack.cells.biome = Uint8Array.from(data[16].split(","), Number);
  worldContext.pack.cells.burg = Uint16Array.from(data[17].split(","), Number);
  worldContext.pack.cells.conf = Uint8Array.from(data[18].split(","), Number);
  worldContext.pack.cells.culture = Uint16Array.from(data[19].split(","), Number);
  worldContext.pack.cells.fl = Uint16Array.from(data[20].split(","), Number);
  worldContext.pack.cells.pop = Float32Array.from(data[21].split(","), Number);
  worldContext.pack.cells.r = Uint16Array.from(data[22].split(","), Number);
  // data[23] had deprecated cells.road
  worldContext.pack.cells.s = Uint16Array.from(data[24].split(","), Number);
  worldContext.pack.cells.state = Uint16Array.from(data[25].split(","), Number);
  worldContext.pack.cells.religion = data[26]
    ? Uint16Array.from(data[26].split(","), Number)
    : new Uint16Array(worldContext.pack.cells.i.length);
  worldContext.pack.cells.province = data[27]
    ? Uint16Array.from(data[27].split(","), Number)
    : new Uint16Array(worldContext.pack.cells.i.length);
  // data[28] had deprecated cells.crossroad
  worldContext.pack.cells.routes = data[36] ? JSON.parse(data[36]) : {};
  worldContext.pack.ice = data[39] ? JSON.parse(data[39]) : [];
  (worldContext.pack.cells as unknown as Record<string, unknown>).good = data[40]
    ? Uint16Array.from(data[40].split(","), Number)
    : new Uint16Array(worldContext.pack.cells.i.length);
  getMutableLegacyPack().goods = data[41] ? JSON.parse(data[41]) : [];
  getMutableLegacyPack().markets = data[42] ? JSON.parse(data[42]) : [];
  getMutableLegacyPack().deals = data[43] ? JSON.parse(data[43]) : [];
  (worldContext.pack.cells as unknown as Record<string, unknown>).market = data[44]
    ? Uint16Array.from(data[44].split(","), Number)
    : new Uint16Array(worldContext.pack.cells.i.length);
  worldContext.pack.characters = data[45] ? JSON.parse(data[45]) : [];
  restoreStrategicEconomyState(data[52]);

  {
    // Demography arrays (capacity, age-structure breakdown) were added after this save format was
    // established, so older saves lack data[46-50]. Backfill using the same formulas as rankCells()
    // in main.ts so simulateDemographics() always has valid data to read.
    const cellCount = worldContext.pack.cells.i.length;
    const { s, area, pop } = worldContext.pack.cells;

    if (data[46]) {
      worldContext.pack.cells.capacity = Float32Array.from(data[46].split(","), Number);
    } else {
      const areaValues = Array.from(area);
      const meanArea = areaValues.length ? areaValues.reduce((sum, a) => sum + a, 0) / areaValues.length : 1;
      const capacity = new Float32Array(cellCount);
      for (let i = 0; i < cellCount; i++) capacity[i] = s[i] > 0 ? (s[i] * area[i]) / meanArea : 0;
      worldContext.pack.cells.capacity = capacity;
    }

    if (data[47] && data[48] && data[49] && data[50]) {
      worldContext.pack.cells.children = Float32Array.from(data[47].split(","), Number);
      worldContext.pack.cells.maleAdults = Float32Array.from(data[48].split(","), Number);
      worldContext.pack.cells.femaleAdults = Float32Array.from(data[49].split(","), Number);
      worldContext.pack.cells.elders = Float32Array.from(data[50].split(","), Number);
    } else {
      const children = new Float32Array(cellCount);
      const maleAdults = new Float32Array(cellCount);
      const femaleAdults = new Float32Array(cellCount);
      const elders = new Float32Array(cellCount);
      for (let i = 0; i < cellCount; i++) {
        children[i] = pop[i] * 0.4;
        maleAdults[i] = pop[i] * 0.2205;
        femaleAdults[i] = pop[i] * 0.2295;
        elders[i] = pop[i] * 0.15;
      }
      worldContext.pack.cells.children = children;
      worldContext.pack.cells.maleAdults = maleAdults;
      worldContext.pack.cells.femaleAdults = femaleAdults;
      worldContext.pack.cells.elders = elders;
    }
  }

  if (data[31]) {
    const namesDL = data[31].split("/");
    namesDL.forEach((d, i) => {
      const e = d.split("|");
      if (!e.length) return;
      const b = e[5].split(",").length > 2 || !worldContext.nameBases[i] ? e[5] : worldContext.nameBases[i].b;
      worldContext.nameBases[i] = { name: e[0], min: +e[1], max: +e[2], d: e[3], m: +e[4], b } as NameBase;
    });
  }

  // data integrity checks (DOM-free; marker SVG id fixes run in applyLegacyMapView)
  {
    const { cells: pCells, vertices: pVertices } = worldContext.pack;

    const cellsMismatch = pCells.i.length !== pCells.state.length;
    const featureVerticesMismatch = worldContext.pack.features.some(f =>
      f?.vertices?.some((vertex: number) => !pVertices.p[vertex])
    );

    if (cellsMismatch || featureVerticesMismatch) {
      WARN && console.warn("[Data integrity] Striping issue detected, attempting auto-repair");

      if (cellsMismatch) {
        const n = pCells.i.length;
        const typedArrayKeys = [
          "h",
          "t",
          "r",
          "f",
          "fl",
          "s",
          "pop",
          "conf",
          "haven",
          "culture",
          "biome",
          "harbor",
          "burg",
          "religion",
          "state",
          "area",
          "province"
        ] as const;
        typedArrayKeys.forEach(key => {
          type ResizableArray = {
            length: number;
            slice(s: number, e: number): ResizableArray;
            constructor: new (n: number) => ResizableArray;
            set(src: ResizableArray): void;
          };
          const arr = pCells[key] as unknown as ResizableArray;
          if (arr.length === n) return;
          if (arr.length > n) {
            (pCells as unknown as Record<string, unknown>)[key] = arr.slice(0, n);
          } else {
            const extended = new arr.constructor(n);
            extended.set(arr);
            (pCells as unknown as Record<string, unknown>)[key] = extended;
          }
        });

        worldContext.pack.burgs.forEach(burg => {
          if (!burg.i || burg.removed || burg.cell === undefined || burg.x === undefined || burg.y === undefined)
            return;
          if (burg.cell >= n) {
            pCells.i
              .filter((i: number) => pCells.burg[i] === burg.i)
              .forEach((i: number) => {
                pCells.burg[i] = 0;
              });
            burg.cell = findCell(burg.x, burg.y);
            pCells.burg[burg.cell] = burg.i;
          }
        });
      }

      if (featureVerticesMismatch) {
        worldContext.pack.features.forEach(f => {
          if (f?.vertices) f.vertices = f.vertices.filter((v: number) => !!pVertices.p[v]);
        });
      }
    }

    const invalidStates = [...new Set(pCells.state)].filter(
      (s): s is number => !worldContext.pack.states[s as number] || !!worldContext.pack.states[s as number].removed
    );
    invalidStates.forEach(s => {
      const invalidCells = pCells.i.filter(i => pCells.state[i] === s);
      invalidCells.forEach(i => {
        pCells.state[i] = 0;
      });
      ERROR && console.error("[Data integrity] Invalid state", s, "is assigned to cells", invalidCells);
    });

    const invalidProvinces = [...new Set(pCells.province)].filter(
      (p): p is number =>
        !!p && (!worldContext.pack.provinces[p as number] || !!worldContext.pack.provinces[p as number].removed)
    );
    invalidProvinces.forEach(p => {
      const invalidCells = pCells.i.filter(i => pCells.province[i] === p);
      invalidCells.forEach(i => {
        pCells.province[i] = 0;
      });
      ERROR && console.error("[Data integrity] Invalid province", p, "is assigned to cells", invalidCells);
    });

    const invalidCultures = [...new Set(pCells.culture)].filter(
      (c): c is number => !worldContext.pack.cultures[c as number] || !!worldContext.pack.cultures[c as number].removed
    );
    invalidCultures.forEach(c => {
      const invalidCells = pCells.i.filter(i => pCells.culture[i] === c);
      invalidCells.forEach(i => {
        pCells.province[i] = 0;
      });
      ERROR && console.error("[Data integrity] Invalid culture", c, "is assigned to cells", invalidCells);
    });

    const invalidReligions = [...new Set(pCells.religion)].filter(
      (r): r is number =>
        !worldContext.pack.religions[r as number] || !!worldContext.pack.religions[r as number].removed
    );
    invalidReligions.forEach(r => {
      const invalidCells = pCells.i.filter(i => pCells.religion[i] === r);
      invalidCells.forEach(i => {
        pCells.religion[i] = 0;
      });
      ERROR && console.error("[Data integrity] Invalid religion", r, "is assigned to cells", invalidCells);
    });

    const invalidFeatures = [...new Set(pCells.f)].filter(
      (f): f is number => !!f && !worldContext.pack.features[f as number]
    );
    invalidFeatures.forEach(f => {
      const invalidCells = pCells.i.filter(i => pCells.f[i] === f);
      invalidCells.forEach(i => {
        pCells.f[i] = 0;
      });
      WARN && console.warn("[Data integrity] Invalid feature", f, "is assigned to cells", invalidCells);
    });

    const invalidBurgs = [...new Set(pCells.burg)].filter(
      (burgId): burgId is number =>
        !!burgId && (!worldContext.pack.burgs[burgId as number] || !!worldContext.pack.burgs[burgId as number].removed)
    );
    invalidBurgs.forEach(burgId => {
      const invalidCells = pCells.i.filter(i => pCells.burg[i] === burgId);
      invalidCells.forEach(i => {
        pCells.burg[i] = 0;
      });
      ERROR && console.error("[Data integrity] Invalid burg", burgId, "is assigned to cells", invalidCells);
    });

    const invalidRivers = [...new Set(pCells.r)].filter(
      (r): r is number => !!r && !worldContext.pack.rivers.find((river: River) => river.i === r)
    );
    invalidRivers.forEach(r => {
      const invalidCells = pCells.i.filter(i => pCells.r[i] === r);
      invalidCells.forEach(i => {
        pCells.r[i] = 0;
      });
      // SVG may not be loaded yet during data staging; view cleanup runs after inject.
      try {
        view.rivers.select(`river${r}`).remove();
      } catch {
        /* view not ready during staged apply */
      }
      ERROR && console.error("[Data integrity] Invalid river", r, "is assigned to cells", invalidCells);
    });

    worldContext.pack.burgs.forEach(burg => {
      if (typeof burg.capital === "boolean") burg.capital = Number(burg.capital);

      if (!burg.i && burg.lock) {
        ERROR && console.error(`[Data integrity] Burg 0 is marked as locked, removing the status`);
        delete burg.lock;
        return;
      }

      if (burg.removed && burg.lock) {
        ERROR && console.error(`[Data integrity] Removed burg ${burg.i} is marked as locked. Unlocking the burg`);
        delete burg.lock;
        return;
      }

      if (!burg.i || burg.removed) return;

      if (burg.cell === undefined || burg.x === undefined || burg.y === undefined) {
        ERROR &&
          console.error(`[Data integrity] Burg ${burg.i} is missing cell info or coordinates. Removing the burg`);
        burg.removed = true;
      }

      if ((burg.port ?? 0) < 0) {
        ERROR && console.error("[Data integrity] Burg", burg.i, "has invalid port value", burg.port);
        burg.port = 0;
      }

      if (burg.cell !== undefined && burg.cell >= pCells.i.length) {
        ERROR && console.error("[Data integrity] Burg", burg.i, "is linked to invalid cell", burg.cell);
        burg.cell = findCell(burg.x!, burg.y!);
        pCells.i
          .filter((i: number) => pCells.burg[i] === burg.i)
          .forEach((i: number) => {
            pCells.burg[i] = 0;
          });
        pCells.burg[burg.cell] = burg.i;
      }

      if (burg.state && !worldContext.pack.states[burg.state]) {
        ERROR && console.error("[Data integrity] Burg", burg.i, "is linked to invalid state", burg.state);
        burg.state = 0;
      }

      if (burg.state && worldContext.pack.states[burg.state].removed) {
        ERROR && console.error("[Data integrity] Burg", burg.i, "is linked to removed state", burg.state);
        burg.state = 0;
      }

      if (burg.state === undefined) {
        ERROR && console.error("[Data integrity] Burg", burg.i, "has no state data");
        burg.state = 0;
      }
    });

    worldContext.pack.states.forEach((state: { i: number; removed?: boolean }) => {
      if (state.removed) return;

      const stateBurgs = worldContext.pack.burgs.filter(b => b.state === state.i && !b.removed);
      const capitalBurgs = stateBurgs.filter(b => b.capital);

      if (!state.i && capitalBurgs.length) {
        ERROR &&
          console.error(`[Data integrity] Neutral burgs (${capitalBurgs.map(b => b.i).join(", ")}) marked as capitals`);
        capitalBurgs.forEach(burg => {
          burg.capital = 0;
          Burgs.changeGroup(burg);
        });
        return;
      }

      if (capitalBurgs.length > 1) {
        ERROR &&
          console.error(
            `[Data integrity] State ${state.i} has multiple capitals (${capitalBurgs
              .map(b => b.i)
              .join(", ")}) assigned. Keeping the first as capital and moving others`
          );
        capitalBurgs.forEach((burg, i) => {
          if (!i) return;
          burg.capital = 0;
          Burgs.changeGroup(burg);
        });
        return;
      }

      if (state.i && stateBurgs.length && !capitalBurgs.length) {
        ERROR && console.error(`[Data integrity] State ${state.i} has no capital. Making the first burg capital`);
        const capital = stateBurgs[0];
        capital.capital = 1;
        Burgs.changeGroup(capital);
      }
    });

    worldContext.pack.provinces.forEach((p: { i: number; removed?: boolean; state: number }) => {
      if (!p.i || p.removed) return;
      if (worldContext.pack.states[p.state] && !worldContext.pack.states[p.state].removed) return;
      ERROR &&
        console.error(`[Data integrity] Province ${p.i} is linked to removed state ${p.state}. Removing the province`);
      p.removed = true;
    });

    worldContext.pack.routes.forEach((route: { i: number; points: unknown[] }) => {
      if (!route.points || route.points.length < 2) {
        ERROR && console.error(`[Data integrity] Route ${route.i} has less than 2 points. Removing the route`);
        Routes.remove(route as Parameters<typeof Routes.remove>[0]);
      }
    });

    for (const from in worldContext.pack.cells.routes) {
      const value = worldContext.pack.cells.routes[from];
      if (!value) continue;

      if (Object.keys(value).length === 0) {
        delete worldContext.pack.cells.routes[from];
        continue;
      }

      for (const to in value) {
        const routeId = value[to];
        const route = worldContext.pack.routes.find((r: { i: number }) => r.i === routeId);
        if (!route) {
          ERROR &&
            console.error(`[Data integrity] Route ${routeId} from ${from} to ${to} is missing. Removing the route`);
          delete worldContext.pack.cells.routes[from][to];
        }
      }
    }

    {
      const markerIds: boolean[] = [];
      const lastMarker = last(worldContext.pack.markers) as { i: number } | undefined;
      let nextId = lastMarker ? lastMarker.i + 1 : 0;

      worldContext.pack.markers.forEach((marker: { i: number }) => {
        if (markerIds[marker.i]) {
          ERROR && console.error("[Data integrity] Marker", marker.i, "has non-unique id. Changing to", nextId);

          const noteElements = worldContext.notes.filter(note => note.id === `marker${marker.i}`);
          if (noteElements[1]) noteElements[1].id = `marker${nextId}`;

          marker.i = nextId;
          nextId += 1;
        } else {
          markerIds[marker.i] = true;
        }
      });

      worldContext.pack.markers.sort((a: { i: number }, b: { i: number }) => a.i - b.i);
    }
  }
  // SVG / view application happens after world.replace (see applyLegacyMapView).
}

/**
 * Inject the saved SVG, re-acquire layers, import presentation, and run view-only
 * post-load work. Called only after a successful `world.replace` for the staged data.
 */
function applyLegacyMapView(data: string[], mapVersion: string): void {
  DeckGlRenderer.finalize(viewContext);
  view.svg.remove();
  document.body.insertAdjacentHTML("afterbegin", data[5]);
  document.dispatchEvent(new CustomEvent("fmg:reinitialize-map-layers"));

  if (!view.texture.size()) {
    viewContext.texture = view.viewbox
      .insert("g", "#landmass")
      .attr("id", "texture")
      .attr("data-href", "./images/textures/plaster.jpg") as typeof view.texture;
  }
  if (!view.emblems.size()) {
    viewContext.emblems = view.viewbox
      .insert("g", "#labels")
      .attr("id", "emblems")
      .style("display", "none") as typeof view.emblems;
  }

  useOptionsState
    .getState()
    .setOption(
      "shapeRendering",
      (view.viewbox.attr("shape-rendering") || "optimizeSpeed") as "crispEdges" | "optimizeSpeed" | "geometricPrecision"
    );

  {
    const isVisible = <T extends d3.BaseType, P extends d3.BaseType>(selection: d3.Selection<T, unknown, P, unknown>) =>
      selection.node() && (selection.node() as unknown as HTMLElement | SVGElement).style?.display !== "none";
    const isVisibleNode = (node: HTMLElement | null) => node && node.style.display !== "none";
    const hasChildren = <T extends d3.BaseType, P extends d3.BaseType>(
      selection: d3.Selection<T, unknown, P, unknown>
    ) => (selection.node() as Element | null)?.hasChildNodes();
    const hasChild = <T extends d3.BaseType, P extends d3.BaseType>(
      selection: d3.Selection<T, unknown, P, unknown>,
      selector: string
    ) => (selection.node() as Element | null)?.querySelector(selector);

    const layerState = useLayerState.getState();
    const extensionLayerIds = new Set(
      layerState.layers
        .filter(layer => !DEFAULT_LAYERS.some(defaultLayer => defaultLayer.id === layer.id))
        .map(layer => layer.id)
    );
    const nextActiveLayers: Record<string, boolean> = {};
    layerState.layers.forEach(layer => {
      // A .map file serializes host SVG visibility, but extension-owned layers are not part of
      // ViewContext and may be recreated after the SVG is replaced. Keep their current toggle
      // state instead of inferring "off" from the loaded host SVG.
      nextActiveLayers[layer.id] = extensionLayerIds.has(layer.id)
        ? (layerState.activeLayers[layer.id] ?? false)
        : false;
    });
    const turnOn = (el: string) => {
      nextActiveLayers[el] = true;
    };

    if (hasChild(view.texture, "image")) turnOn("toggleTexture");
    if (hasChildren(view.terrs.select("#landHeights"))) turnOn("toggleHeight");
    if (isVisible(view.lakes)) turnOn("toggleLakes");
    if (hasChildren(view.biomes)) turnOn("toggleBiomes");
    if (hasChildren(view.cells)) turnOn("toggleCells");
    if (hasChildren(view.gridOverlay)) turnOn("toggleGrid");
    if (hasChildren(view.coordinates)) turnOn("toggleCoordinates");
    if (isVisible(view.compass) && hasChild(view.compass, "use")) turnOn("toggleCompass");
    if (hasChildren(view.rivers)) turnOn("toggleRivers");
    if (isVisible(view.terrain) && hasChildren(view.terrain)) turnOn("toggleRelief");
    if (hasChildren(view.relig)) turnOn("toggleReligions");
    if (hasChildren(view.cults)) turnOn("toggleCultures");
    if (hasChildren(view.statesBody)) turnOn("toggleStates");
    if (hasChildren(view.provs)) turnOn("toggleProvinces");
    if (hasChildren(view.zones) && isVisible(view.zones)) turnOn("toggleZones");
    if (isVisible(view.borders) && hasChild(view.borders, "path")) turnOn("toggleBorders");
    if (isVisible(view.routes) && hasChild(view.routes, "path")) turnOn("toggleRoutes");
    if (hasChildren(view.temperature)) turnOn("toggleTemperature");
    if (hasChild(view.population, "line")) turnOn("togglePopulation");
    if (hasChildren(view.ice)) turnOn("toggleIce");
    if (hasChild(view.prec, "circle")) turnOn("togglePrecipitation");
    if (isVisible(view.emblems) && hasChild(view.emblems, "use")) turnOn("toggleEmblems");
    if (hasChild(view.labels, "text")) turnOn("toggleLabels");
    if (hasChild(view.icons, "use, circle")) turnOn("toggleBurgIcons");
    if (hasChildren(view.armies) && isVisible(view.armies)) turnOn("toggleMilitary");
    if (hasChild(view.markers, "svg")) turnOn("toggleMarkers");
    if (isVisible(view.ruler)) turnOn("toggleRulers");
    if (isVisible(view.scaleBar)) turnOn("toggleScaleBar");
    if (isVisibleNode(document.getElementById("vignette") as HTMLElement)) turnOn("toggleVignette");

    useLayerState.getState().setAllActiveLayers(nextActiveLayers);
    importLegacyPresentationFromSvg();
    document.dispatchEvent(new CustomEvent("fmg:get-current-preset"));
  }
  view.scaleBar
    .on("mousemove", () => tip("Click to open Units Editor"))
    .on("click", () => document.dispatchEvent(new CustomEvent("fmg:edit-units")));
  view.legend
    .on("mousemove", () => tip("Drag to change the position. Click to hide the legend"))
    .on("click", () => document.dispatchEvent(new CustomEvent("fmg:clear-legend")));

  resolveVersionConflicts(mapVersion);

  if (heightmapColorSchemes) {
    const oceanHeights = document.getElementById("oceanHeights");
    const oceanScheme = oceanHeights?.getAttribute("scheme");
    if (oceanScheme && !(oceanScheme in heightmapColorSchemes))
      document.dispatchEvent(new CustomEvent("fmg:add-custom-color-scheme", { detail: oceanScheme }));
    const landHeights = document.getElementById("landHeights");
    const landScheme = landHeights?.getAttribute("scheme");
    if (landScheme && !(landScheme in heightmapColorSchemes))
      document.dispatchEvent(new CustomEvent("fmg:add-custom-color-scheme", { detail: landScheme }));
  }

  {
    const textureHref = view.texture.attr("data-href");
    if (textureHref)
      document.dispatchEvent(new CustomEvent("fmg:update-texture-select-value", { detail: textureHref }));
  }

  // Re-apply marker DOM id fixes now that the loaded SVG is present.
  {
    const markerIds: boolean[] = [];
    const lastMarker = last(worldContext.pack.markers) as { i: number } | undefined;
    let nextId = lastMarker ? lastMarker.i + 1 : 0;
    worldContext.pack.markers.forEach((marker: { i: number }) => {
      if (markerIds[marker.i]) {
        const domElements = document.querySelectorAll(`#marker${marker.i}`);
        if (domElements[1]) domElements[1].id = `marker${nextId}`;
        nextId += 1;
      } else {
        markerIds[marker.i] = true;
      }
    });
  }

  view.emblems.selectAll("use").attr("href", null);
  if (rulers && layerIsOn("toggleRulers")) rulers.draw();
  if (layerIsOn("toggleGrid")) GridRenderer.render(worldContext, viewContext, appServices);
  document.dispatchEvent(new CustomEvent("fmg:restore-default-events"));
  document.dispatchEvent(new CustomEvent("fmg:focus-on"));
  document.dispatchEvent(new CustomEvent("fmg:invoke-active-zooming"));
  document.dispatchEvent(new CustomEvent("fmg:fit-map-to-screen"));
  document.dispatchEvent(new CustomEvent("fmg:fit-map-view"));
  if (viewContext.renderMode === "webglHybrid") {
    document.dispatchEvent(new CustomEvent("fmg:render-mode-changed"));
  }
}

// Economy's `strategicProcurementOrders`/`strategicGoodsPolicies`/... no longer augment
// PackedGraph's type (see src/extensions/economy/types.ts) — they live in
// simulation.extensions.economy and are only mirrored onto `pack` at runtime via
// extensionStateSlices.ts's compatibility projection. The legacy `.map` positional slot
// format (deferred to a later phase, see docs/plan/unite-data-and-map.md §11 Phase 6)
// still writes them straight onto `pack`, so read/write them structurally here instead of
// importing Economy.
interface LegacyStrategicProcurementOrder {
  status: string;
  blockedReason?: string;
  caravanId?: number;
  [key: string]: unknown;
}

function getMutableLegacyPack(): Record<string, unknown> {
  return worldContext.pack as unknown as Record<string, unknown>;
}

function restoreStrategicEconomyState(serialized: string | undefined): void {
  const pack = getMutableLegacyPack();
  pack.strategicProcurementOrders = [];
  pack.strategicGoodsPolicies = [];
  pack.nextStrategicProcurementOrderId = 0;
  pack.strategicLaborMarkets = [];
  if (!serialized) return;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return;

    if (Array.isArray(parsed.strategicProcurementOrders)) {
      pack.strategicProcurementOrders = parsed.strategicProcurementOrders;
    }
    if (Array.isArray(parsed.strategicGoodsPolicies)) {
      pack.strategicGoodsPolicies = parsed.strategicGoodsPolicies;
    }
    if (
      typeof parsed.nextStrategicProcurementOrderId === "number" &&
      Number.isSafeInteger(parsed.nextStrategicProcurementOrderId)
    ) {
      pack.nextStrategicProcurementOrderId = Math.max(0, parsed.nextStrategicProcurementOrderId);
    }
    if (Array.isArray(parsed.strategicLaborMarkets)) {
      pack.strategicLaborMarkets = parsed.strategicLaborMarkets;
    }
    // Caravans are not part of the host .map format. Treat strategic cargo that
    // was in transit at save time as lost, rather than retaining an order whose
    // active allocation can never arrive after a reload.
    for (const order of pack.strategicProcurementOrders as LegacyStrategicProcurementOrder[]) {
      if (order.status !== "inTransit") continue;
      order.status = "blocked";
      order.blockedReason = "noRoute";
      order.caravanId = undefined;
    }
  } catch {
    // A malformed optional extension slot must not block loading the host map.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
