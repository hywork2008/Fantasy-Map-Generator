export function exportToJson(type: string): void {
  if (customization)
    return (tip as any)("Data cannot be exported when edit mode is active, please exit the mode and retry", false, "error");
  (closeDialogs as any)("#alert");

  TIME && console.time("exportToJson");
  const typeMap: Record<string, () => string> = {
    Full: getFullDataJson,
    Minimal: getMinimalDataJson,
    PackCells: getPackDataJson,
    GridCells: getGridDataJson
  };

  const mapData = typeMap[type]();
  const blob = new Blob([mapData], {type: "application/json"});
  const URL = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = (getFileName as any)(type) + ".json";
  link.href = URL;
  link.click();
  (tip as any)(`${link.download} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
  window.URL.revokeObjectURL(URL);
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
  const packData = {
    features: (pack as any).features,
    cultures: (pack as any).cultures,
    burgs: (pack as any).burgs,
    states: (pack as any).states,
    provinces: (pack as any).provinces,
    religions: (pack as any).religions,
    rivers: (pack as any).rivers,
    markers: (pack as any).markers,
    routes: (pack as any).routes,
    zones: (pack as any).zones
  };
  return JSON.stringify({info, settings, mapCoordinates, pack: packData, biomesData, notes, nameBases: _nameBases});
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

function getMapInfo(): Record<string, any> {
  return {
    version: (VERSION as any) || "unknown",
    description: "Azgaar's Fantasy Map Generator output: azgaar.github.io/Fantasy-map-generator",
    exportedAt: new Date().toISOString(),
    mapName: ((mapName as any) as HTMLInputElement)?.value || ((mapNameInput as any) as HTMLInputElement)?.value,
    width: graphWidth,
    height: graphHeight,
    seed: (seed as any) || "unknown",
    mapId: (mapId as any) || undefined
  };
}

function getSettings(): Record<string, any> {
  return {
    distanceUnit: ((distanceUnitInput as any) as HTMLSelectElement)?.value,
    distanceScale: _distanceScale,
    areaUnit: ((areaUnit as any) as HTMLSelectElement)?.value,
    heightUnit: ((heightUnit as any) as HTMLSelectElement)?.value,
    heightExponent: ((heightExponentInput as any) as HTMLInputElement)?.value,
    temperatureScale: ((temperatureScale as any) as HTMLSelectElement)?.value,
    populationRate: _populationRate,
    urbanization: _urbanization,
    mapSize: ((mapSizeOutput as any) as HTMLInputElement)?.value,
    latitude: ((latitudeOutput as any) as HTMLInputElement)?.value,
    longitude: ((longitudeOutput as any) as HTMLInputElement)?.value,
    prec: ((precOutput as any) as HTMLInputElement)?.value,
    options: options,
    mapName: ((mapName as any) as HTMLInputElement)?.value || ((mapNameInput as any) as HTMLInputElement)?.value,
    hideLabels: ((hideLabels as any) as HTMLInputElement)?.checked,
    stylePreset: ((stylePreset as any) as HTMLSelectElement)?.value,
    rescaleLabels: ((rescaleLabels as any) as HTMLInputElement)?.checked,
    urbanDensity: _urbanDensity
  };
}

function getPackCellsData(): Record<string, any> {
  const data = {
    v: (pack as any).cells.v,
    c: (pack as any).cells.c,
    p: (pack as any).cells.p,
    g: Array.from((pack as any).cells.g),
    h: Array.from((pack as any).cells.h),
    area: Array.from((pack as any).cells.area),
    f: Array.from((pack as any).cells.f),
    t: Array.from((pack as any).cells.t),
    haven: Array.from((pack as any).cells.haven),
    harbor: Array.from((pack as any).cells.harbor),
    fl: Array.from((pack as any).cells.fl),
    r: Array.from((pack as any).cells.r),
    conf: Array.from((pack as any).cells.conf),
    biome: Array.from((pack as any).cells.biome),
    s: Array.from((pack as any).cells.s),
    pop: Array.from((pack as any).cells.pop),
    culture: Array.from((pack as any).cells.culture),
    burg: Array.from((pack as any).cells.burg),
    routes: (pack as any).cells.routes,
    state: Array.from((pack as any).cells.state),
    religion: Array.from((pack as any).cells.religion),
    province: Array.from((pack as any).cells.province)
  };

  return {
    cells: Array.from((pack as any).cells.i).map((cellId: any) => ({
      i: cellId as number,
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
    vertices: Array.from((pack as any).vertices.p).map((_: any, vertexId: number) => ({
      i: vertexId,
      p: (pack as any).vertices.p[vertexId],
      v: (pack as any).vertices.v[vertexId],
      c: (pack as any).vertices.c[vertexId]
    })),
    features: (pack as any).features,
    cultures: (pack as any).cultures,
    burgs: (pack as any).burgs,
    states: (pack as any).states,
    provinces: (pack as any).provinces,
    religions: (pack as any).religions,
    rivers: (pack as any).rivers,
    markers: (pack as any).markers,
    routes: (pack as any).routes,
    zones: (pack as any).zones
  };
}

function getGridCellsData(): Record<string, any> {
  const dataArrays = {
    v: (grid as any).cells.v,
    c: (grid as any).cells.c,
    b: (grid as any).cells.b,
    f: Array.from((grid as any).cells.f),
    t: Array.from((grid as any).cells.t),
    h: Array.from((grid as any).cells.h),
    temp: Array.from((grid as any).cells.temp),
    prec: Array.from((grid as any).cells.prec)
  };

  const gridData = {
    cells: Array.from((grid as any).cells.i).map((cellId: any) => ({
      i: cellId as number,
      v: dataArrays.v[cellId],
      c: dataArrays.c[cellId],
      b: dataArrays.b[cellId],
      f: dataArrays.f[cellId],
      t: dataArrays.t[cellId],
      h: dataArrays.h[cellId],
      temp: dataArrays.temp[cellId],
      prec: dataArrays.prec[cellId]
    })),
    vertices: Array.from((grid as any).vertices.p).map((_: any, vertexId: number) => ({
      i: vertexId,
      p: (grid as any).vertices.p[vertexId],
      v: (grid as any).vertices.v[vertexId],
      c: (grid as any).vertices.c[vertexId]
    })),
    cellsDesired: (grid as any).cellsDesired,
    spacing: (grid as any).spacing,
    cellsY: (grid as any).cellsY,
    cellsX: (grid as any).cellsX,
    points: (grid as any).points,
    boundary: (grid as any).boundary,
    seed: (grid as any).seed,
    features: (pack as any).features
  };
  return gridData;
}
