import { worldContext } from "../context/worldContext";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { useOptionsState } from "../store/optionsState";
import { closeDialogs } from "../ui/dialogs/dialogService";
import { createObjectURL, revokeObjectURL } from "../utils";
import { TIME } from "../utils/debug";
import { getFileName } from "../utils/editorHelpers";
import { VERSION } from "../versioning";

export function exportToJson(type: string): void {
  if (view.customization) {
    tip("Data cannot be exported when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }
  closeDialogs("#alert");

  TIME && console.time("exportToJson");
  const typeMap: Record<string, () => string> = {
    Full: getFullDataJson,
    Minimal: getMinimalDataJson,
    PackCells: getPackDataJson,
    GridCells: getGridDataJson
  };

  const mapData = typeMap[type]();
  const blob = new Blob([mapData], { type: "application/json" });
  const URL = createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${getFileName(type)}.json`;
  link.href = URL;
  link.click();
  tip(`${link.download} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
  revokeObjectURL(URL);
  TIME && console.timeEnd("exportToJson");
}

function getFullDataJson(): string {
  const info = getMapInfo();
  const settings = getSettings();
  const packData = getPackCellsData();
  const gridData = getGridCellsData();

  return JSON.stringify({
    info,
    settings,
    mapCoordinates: worldContext.mapCoordinates,
    pack: packData,
    grid: gridData,
    biomesData: worldContext.biomesData,
    mineralResources: getMineralResourcesData(),
    notes: worldContext.notes,
    nameBases: worldContext.nameBases
  });
}

function getMinimalDataJson(): string {
  const info = getMapInfo();
  const settings = getSettings();
  const packData = {
    features: worldContext.pack.features,
    cultures: worldContext.pack.cultures,
    burgs: worldContext.pack.burgs,
    states: worldContext.pack.states,
    provinces: worldContext.pack.provinces,
    religions: worldContext.pack.religions,
    rivers: worldContext.pack.rivers,
    lavaFlows: worldContext.pack.lavaFlows ?? [],
    markers: worldContext.pack.markers,
    routes: worldContext.pack.routes,
    zones: worldContext.pack.zones,
    mineralResources: getMineralResourcesData()
  };
  return JSON.stringify({
    info,
    settings,
    mapCoordinates: worldContext.mapCoordinates,
    pack: packData,
    biomesData: worldContext.biomesData,
    notes: worldContext.notes,
    nameBases: worldContext.nameBases
  });
}

/** Economy owns mineral data; read the runtime compatibility projection without importing an extension module. */
function getMineralResourcesData() {
  const pack = worldContext.pack as unknown as Record<string, unknown>;
  const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  return {
    geologicalProvinces: array(pack.mineralGeologicalProvinces),
    districts: array(pack.mineralDistricts),
    deposits: array(pack.mineralDeposits),
    operations: array(pack.mineOperations),
    mintLedgers: array(pack.mintLedgers),
    militaryResourceLedgers: array(pack.militaryResourceLedgers)
  };
}

function getPackDataJson(): string {
  const info = getMapInfo();
  const cells = getPackCellsData();
  return JSON.stringify({ info, cells });
}

function getGridDataJson(): string {
  const info = getMapInfo();
  const cells = getGridCellsData();
  return JSON.stringify({ info, cells });
}

function getMapInfo() {
  return {
    version: VERSION,
    description: "Azgaar's Fantasy Map Generator output: azgaar.github.io/Fantasy-map-generator",
    exportedAt: new Date().toISOString(),
    mapName: useOptionsState.getState().mapName,
    width: worldContext.graphWidth,
    height: worldContext.graphHeight,
    seed: worldContext.seed,
    mapId: worldContext.mapId
  };
}

function getSettings() {
  const options = useOptionsState.getState();
  return {
    distanceUnit: options.distanceUnit,
    distanceScale: worldContext.distanceScale,
    areaUnit: options.areaUnit,
    heightUnit: options.heightUnit,
    heightExponent: options.heightExponent,
    temperatureScale: options.temperatureScale,
    populationRate: worldContext.populationRate,
    urbanization: worldContext.urbanization,
    mapSize: options.mapSize,
    latitude: options.latitude,
    longitude: options.longitude,
    prec: options.prec,
    options: worldContext.options,
    mapName: options.mapName,
    hideLabels: useOptionsState.getState().hideLabels,
    stylePreset: options.stylePreset,
    rescaleLabels: options.rescaleLabels,
    urbanDensity: worldContext.urbanDensity
  };
}

function getPackCellsData() {
  const data = {
    v: worldContext.pack.cells.v,
    c: worldContext.pack.cells.c,
    p: worldContext.pack.cells.p,
    g: Array.from(worldContext.pack.cells.g),
    h: Array.from(worldContext.pack.cells.h),
    area: Array.from(worldContext.pack.cells.area),
    f: Array.from(worldContext.pack.cells.f),
    t: Array.from(worldContext.pack.cells.t),
    haven: Array.from(worldContext.pack.cells.haven),
    harbor: Array.from(worldContext.pack.cells.harbor),
    fl: Array.from(worldContext.pack.cells.fl),
    r: Array.from(worldContext.pack.cells.r),
    conf: Array.from(worldContext.pack.cells.conf),
    biome: Array.from(worldContext.pack.cells.biomeCode),
    s: Array.from(worldContext.pack.cells.s),
    pop: Array.from(worldContext.pack.cells.pop),
    culture: Array.from(worldContext.pack.cells.culture),
    burg: Array.from(worldContext.pack.cells.burg),
    routes: worldContext.pack.cells.routes,
    state: Array.from(worldContext.pack.cells.state),
    religion: Array.from(worldContext.pack.cells.religion),
    province: Array.from(worldContext.pack.cells.province)
  };

  return {
    cells: Array.from(worldContext.pack.cells.i).map(cellId => ({
      i: cellId,
      v: data.v[cellId],
      c: data.c[cellId],
      p: data.p[cellId],
      g: data.g[cellId],
      h: data.h[cellId],
      area: data.area[cellId],
      f: data.f[cellId],
      t: data.t[cellId],
      haven: data.haven[cellId],
      harbor: data.harbor[cellId],
      fl: data.fl[cellId],
      r: data.r[cellId],
      conf: data.conf[cellId],
      biome: data.biome[cellId],
      s: data.s[cellId],
      pop: data.pop[cellId],
      culture: data.culture[cellId],
      burg: data.burg[cellId],
      routes: data.routes[cellId],
      state: data.state[cellId],
      religion: data.religion[cellId],
      province: data.province[cellId]
    })),
    vertices: Array.from(worldContext.pack.vertices.p).map((_, vertexId) => ({
      i: vertexId,
      p: worldContext.pack.vertices.p[vertexId],
      v: worldContext.pack.vertices.v[vertexId],
      c: worldContext.pack.vertices.c[vertexId]
    })),
    features: worldContext.pack.features,
    cultures: worldContext.pack.cultures,
    burgs: worldContext.pack.burgs,
    states: worldContext.pack.states,
    provinces: worldContext.pack.provinces,
    religions: worldContext.pack.religions,
    rivers: worldContext.pack.rivers,
    lavaFlows: worldContext.pack.lavaFlows ?? [],
    markers: worldContext.pack.markers,
    routes: worldContext.pack.routes,
    zones: worldContext.pack.zones
  };
}

function getGridCellsData() {
  const dataArrays = {
    v: worldContext.grid.cells.v,
    c: worldContext.grid.cells.c,
    b: worldContext.grid.cells.b,
    f: Array.from(worldContext.grid.cells.f),
    t: Array.from(worldContext.grid.cells.t),
    h: Array.from(worldContext.grid.cells.h),
    temp: Array.from(worldContext.grid.cells.temp),
    prec: Array.from(worldContext.grid.cells.prec)
  };

  return {
    cells: Array.from(worldContext.grid.cells.i).map(cellId => ({
      i: cellId,
      v: dataArrays.v[cellId],
      c: dataArrays.c[cellId],
      b: dataArrays.b[cellId],
      f: dataArrays.f[cellId],
      t: dataArrays.t[cellId],
      h: dataArrays.h[cellId],
      temp: dataArrays.temp[cellId],
      prec: dataArrays.prec[cellId]
    })),
    vertices: Array.from(worldContext.grid.vertices.p).map((_, vertexId) => ({
      i: vertexId,
      p: worldContext.grid.vertices.p[vertexId],
      v: worldContext.grid.vertices.v[vertexId],
      c: worldContext.grid.vertices.c[vertexId]
    })),
    cellsDesired: worldContext.grid.cellsDesired,
    spacing: worldContext.grid.spacing,
    cellsY: worldContext.grid.cellsY,
    cellsX: worldContext.grid.cellsX,
    points: worldContext.grid.points,
    boundary: worldContext.grid.boundary,
    seed: worldContext.grid.seed,
    features: worldContext.pack.features
  };
}
