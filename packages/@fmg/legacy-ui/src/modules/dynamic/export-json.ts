type TipFn = (message: string, pinned?: boolean, level?: string, timeout?: number) => void;

type CloseDialogsFn = (selector?: string) => void;

type GetFileNameFn = (type: string) => string;

type InputLike = HTMLInputElement | HTMLSelectElement;

type PackCellsState = {
  i: ArrayLike<number>;
  v: ArrayLike<unknown>;
  c: ArrayLike<unknown>;
  p: ArrayLike<unknown>;
  g: ArrayLike<number>;
  h: ArrayLike<number>;
  area: ArrayLike<number>;
  f: ArrayLike<number>;
  t: ArrayLike<number>;
  haven: ArrayLike<number>;
  harbor: ArrayLike<number>;
  fl: ArrayLike<number>;
  r: ArrayLike<number>;
  conf: ArrayLike<number>;
  biome: ArrayLike<number>;
  s: ArrayLike<number>;
  pop: ArrayLike<number>;
  culture: ArrayLike<number>;
  burg: ArrayLike<number>;
  routes: ArrayLike<unknown>;
  state: ArrayLike<number>;
  religion: ArrayLike<number>;
  province: ArrayLike<number>;
};

type PackVerticesState = {
  p: ArrayLike<unknown>;
  v: ArrayLike<unknown>;
  c: ArrayLike<unknown>;
};

type PackState = {
  cells: PackCellsState;
  vertices: PackVerticesState;
  features: unknown;
  cultures: unknown;
  burgs: unknown;
  states: unknown;
  provinces: unknown;
  religions: unknown;
  rivers: unknown;
  markers: unknown;
  routes: unknown;
  zones: unknown;
};

type GridCellsState = {
  i: ArrayLike<number>;
  v: ArrayLike<unknown>;
  c: ArrayLike<unknown>;
  b: ArrayLike<unknown>;
  f: ArrayLike<number>;
  t: ArrayLike<number>;
  h: ArrayLike<number>;
  temp: ArrayLike<number>;
  prec: ArrayLike<number>;
};

type GridVerticesState = {
  p: ArrayLike<unknown>;
  v: ArrayLike<unknown>;
  c: ArrayLike<unknown>;
};

type GridState = {
  cells: GridCellsState;
  vertices: GridVerticesState;
  cellsDesired: unknown;
  spacing: unknown;
  cellsY: unknown;
  cellsX: unknown;
  points: unknown;
  boundary: unknown;
  seed: unknown;
};

const tipFn = tip as unknown as TipFn;
const closeDialogsFn = closeDialogs as unknown as CloseDialogsFn;
const getFileNameFn = getFileName as unknown as GetFileNameFn;

function readElementValue(el: unknown): string | undefined {
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el.value;
  return undefined;
}

function readChecked(el: unknown): boolean | undefined {
  if (el instanceof HTMLInputElement) return el.checked;
  return undefined;
}

export function exportToJson(type: string): void {
  if (customization)
    return tipFn("Data cannot be exported when edit mode is active, please exit the mode and retry", false, "error");
  closeDialogsFn("#alert");

  TIME && console.time("exportToJson");
  const typeMap: Record<string, () => string> = {
    Full: getFullDataJson,
    Minimal: getMinimalDataJson,
    PackCells: getPackDataJson,
    GridCells: getGridDataJson
  };

  const mapData = typeMap[type]();
  const blob = new Blob([mapData], { type: "application/json" });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = getFileNameFn(type) + ".json";
  link.href = objectUrl;
  link.click();
  tipFn(`${link.download} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
  window.URL.revokeObjectURL(objectUrl);
  TIME && console.timeEnd("exportToJson");
}

function getFullDataJson(): string {
  const info = getMapInfo();
  const settings = getSettings();
  const pack = getPackCellsData();
  const grid = getGridCellsData();

  return JSON.stringify({
    info,
    settings,
    mapCoordinates,
    pack,
    grid,
    biomesData,
    notes,
    nameBases: _nameBases
  });
}

function getMinimalDataJson(): string {
  const info = getMapInfo();
  const settings = getSettings();
  const packState = pack as unknown as PackState;
  const packData = {
    features: packState.features,
    cultures: packState.cultures,
    burgs: packState.burgs,
    states: packState.states,
    provinces: packState.provinces,
    religions: packState.religions,
    rivers: packState.rivers,
    markers: packState.markers,
    routes: packState.routes,
    zones: packState.zones
  };
  return JSON.stringify({ info, settings, mapCoordinates, pack: packData, biomesData, notes, nameBases: _nameBases });
}

function getPackDataJson(): string {
  const info = getMapInfo();
  const cells = getPackCellsData();
  return JSON.stringify({info, cells});
}

function getGridDataJson(): string {
  const info = getMapInfo();
  const cells = getGridCellsData();
  return JSON.stringify({info, cells});
}

function getMapInfo(): Record<string, unknown> {
  const primaryMapName = readElementValue(mapName as unknown);
  const fallbackMapName = readElementValue(mapNameInput as unknown);
  return {
    version: VERSION || "unknown",
    description: "Azgaar's Fantasy Map Generator output: azgaar.github.io/Fantasy-map-generator",
    exportedAt: new Date().toISOString(),
    mapName: primaryMapName || fallbackMapName,
    width: graphWidth,
    height: graphHeight,
    seed: seed || "unknown",
    mapId: mapId || undefined
  };
}

function getSettings(): Record<string, unknown> {
  const primaryMapName = readElementValue(mapName as unknown);
  const fallbackMapName = readElementValue(mapNameInput as unknown);
  return {
    distanceUnit: readElementValue(distanceUnitInput as unknown),
    distanceScale: _distanceScale,
    areaUnit: readElementValue(areaUnit as unknown),
    heightUnit: readElementValue(heightUnit as unknown),
    heightExponent: readElementValue(heightExponentInput as unknown),
    temperatureScale: readElementValue(temperatureScale as unknown),
    populationRate: _populationRate,
    urbanization: _urbanization,
    mapSize: readElementValue(mapSizeOutput as unknown),
    latitude: readElementValue(latitudeOutput as unknown),
    longitude: readElementValue(longitudeOutput as unknown),
    prec: readElementValue(precOutput as unknown),
    options: options,
    mapName: primaryMapName || fallbackMapName,
    hideLabels: readChecked(hideLabels as unknown),
    stylePreset: readElementValue(stylePreset as unknown),
    rescaleLabels: readChecked(rescaleLabels as unknown),
    urbanDensity: _urbanDensity
  };
}

function getPackCellsData(): Record<string, unknown> {
  const packState = pack as unknown as PackState;
  const data = {
    v: packState.cells.v,
    c: packState.cells.c,
    p: packState.cells.p,
    g: Array.from(packState.cells.g),
    h: Array.from(packState.cells.h),
    area: Array.from(packState.cells.area),
    f: Array.from(packState.cells.f),
    t: Array.from(packState.cells.t),
    haven: Array.from(packState.cells.haven),
    harbor: Array.from(packState.cells.harbor),
    fl: Array.from(packState.cells.fl),
    r: Array.from(packState.cells.r),
    conf: Array.from(packState.cells.conf),
    biome: Array.from(packState.cells.biome),
    s: Array.from(packState.cells.s),
    pop: Array.from(packState.cells.pop),
    culture: Array.from(packState.cells.culture),
    burg: Array.from(packState.cells.burg),
    routes: packState.cells.routes,
    state: Array.from(packState.cells.state),
    religion: Array.from(packState.cells.religion),
    province: Array.from(packState.cells.province)
  };

  const cellIds = Array.from(packState.cells.i, cellId => Number(cellId));

  return {
    cells: cellIds.map(cellId => ({
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
    vertices: Array.from(packState.vertices.p).map((_value, vertexId: number) => ({
      i: vertexId,
      p: packState.vertices.p[vertexId],
      v: packState.vertices.v[vertexId],
      c: packState.vertices.c[vertexId]
    })),
    features: packState.features,
    cultures: packState.cultures,
    burgs: packState.burgs,
    states: packState.states,
    provinces: packState.provinces,
    religions: packState.religions,
    rivers: packState.rivers,
    markers: packState.markers,
    routes: packState.routes,
    zones: packState.zones
  };
}

function getGridCellsData(): Record<string, unknown> {
  const gridState = grid as unknown as GridState;
  const packState = pack as unknown as PackState;
  const dataArrays = {
    v: gridState.cells.v,
    c: gridState.cells.c,
    b: gridState.cells.b,
    f: Array.from(gridState.cells.f),
    t: Array.from(gridState.cells.t),
    h: Array.from(gridState.cells.h),
    temp: Array.from(gridState.cells.temp),
    prec: Array.from(gridState.cells.prec)
  };

  const cellIds = Array.from(gridState.cells.i, cellId => Number(cellId));

  const gridData = {
    cells: cellIds.map(cellId => ({
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
    vertices: Array.from(gridState.vertices.p).map((_value, vertexId: number) => ({
      i: vertexId,
      p: gridState.vertices.p[vertexId],
      v: gridState.vertices.v[vertexId],
      c: gridState.vertices.c[vertexId]
    })),
    cellsDesired: gridState.cellsDesired,
    spacing: gridState.spacing,
    cellsY: gridState.cellsY,
    cellsX: gridState.cellsX,
    points: gridState.points,
    boundary: gridState.boundary,
    seed: gridState.seed,
    features: packState.features
  };
  return gridData;
}
