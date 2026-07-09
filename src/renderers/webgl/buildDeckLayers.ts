import { COORDINATE_SYSTEM, type LayersList } from "@deck.gl/core";
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { useLayerState } from "../../store/layerState";
import {
  buildBackgroundPolygons,
  buildBiomesPolygons,
  buildBorderPaths,
  buildCellOutlinePaths,
  buildCulturePolygons,
  buildDangerPolygons,
  buildDivisionBoundaryPaths,
  buildGridPaths,
  buildHeightPolygons,
  buildLandPolygonsBase,
  buildPopulationPolygons,
  buildPrecipitationPolygons,
  buildProvincePolygons,
  buildReligionPolygons,
  buildRiverPaths,
  buildRoutePaths,
  buildStatePolygons,
  buildTemperaturePolygons,
  buildZonePolygons,
  colorToRgba,
  type DeckCellPolygon,
  type DeckDivisionBoundaryKind,
  type DeckPath,
  type DeckPosition
} from "./adapters/deckDataAdapters";

type PolygonBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckCellPolygon[];
type PathBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckPath[];
type CachedDeckData = DeckCellPolygon[] | DeckPath[];

interface CachedDeckDataEntry<T extends CachedDeckData> {
  signature: string;
  data: T;
}

const deckLayerDataCache = new Map<string, CachedDeckDataEntry<CachedDeckData>>();

const WEBGL_POLYGON_LAYERS: Array<{
  toggle: string;
  id: string;
  build: PolygonBuilder;
  boundary?: DeckDivisionBoundaryKind;
}> = [
  { toggle: "toggleHeight", id: "height", build: (world, view) => buildHeightPolygons(world, view.focusScope) },
  { toggle: "toggleBiomes", id: "biomes", build: (world, view) => buildBiomesPolygons(world, view.focusScope) },
  {
    toggle: "toggleReligions",
    id: "religions",
    build: (world, view) => buildReligionPolygons(world, view.focusScope),
    boundary: "religion"
  },
  {
    toggle: "toggleCultures",
    id: "cultures",
    build: (world, view) => buildCulturePolygons(world, view.focusScope),
    boundary: "culture"
  },
  {
    toggle: "toggleStates",
    id: "states",
    build: (world, view) => buildStatePolygons(world, view.focusScope),
    boundary: "state"
  },
  {
    toggle: "toggleProvinces",
    id: "provinces",
    build: (world, view) => buildProvincePolygons(world, view.focusScope),
    boundary: "province"
  },
  { toggle: "toggleZones", id: "zones", build: (world, view) => buildZonePolygons(world, view.focusScope) },
  {
    toggle: "toggleTemperature",
    id: "temperature",
    build: (world, view) => buildTemperaturePolygons(world, view.focusScope)
  },
  {
    toggle: "togglePopulation",
    id: "population",
    build: (world, view) => buildPopulationPolygons(world, view.focusScope)
  },
  {
    toggle: "togglePrecipitation",
    id: "precipitation",
    build: (world, view) => buildPrecipitationPolygons(world, view.focusScope)
  },
  { toggle: "toggleDanger", id: "danger", build: (world, view) => buildDangerPolygons(world, view.focusScope) }
];

const WEBGL_PATH_LAYERS: Array<{ toggle: string; id: string; build: PathBuilder }> = [
  { toggle: "toggleCells", id: "cells", build: (world, view) => buildCellOutlinePaths(world, view.focusScope) },
  { toggle: "toggleGrid", id: "grid", build: (world, view) => buildGridPaths(world, view.focusScope) },
  { toggle: "toggleRivers", id: "rivers", build: (world, view) => buildRiverPaths(world, view.focusScope) },
  { toggle: "toggleBorders", id: "borders", build: (world, view) => buildBorderPaths(world, view.focusScope) },
  { toggle: "toggleRoutes", id: "routes", build: (world, view) => buildRoutePaths(world, view.focusScope) }
];

export const WEBGL_LAYER_TOGGLES = new Set([
  ...WEBGL_POLYGON_LAYERS.map(layer => layer.toggle),
  ...WEBGL_PATH_LAYERS.map(layer => layer.toggle)
]);

export function clearDeckLayerDataCache(): void {
  deckLayerDataCache.clear();
}

export function getDeckLayerDataCacheSize(): number {
  return deckLayerDataCache.size;
}

export function buildDeckLayers(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>): LayersList {
  const { activeLayers } = useLayerState.getState();
  const oceanFill = viewContext.oceanLayers?.select<SVGRectElement>("#oceanBase").attr("fill") || "#466eab";
  const landFill = viewContext.landmass?.attr("fill") || "#eef6fb";
  const oceanColor = colorToRgba(oceanFill, "#466eab");
  const signatures = buildLayerSignatures(worldContext, viewContext, oceanFill, landFill);
  const layers: LayersList = [
    new SolidPolygonLayer<DeckCellPolygon>({
      id: "fmg-webgl-background",
      data: getCachedDeckData("background", signatures.background, () => buildBackgroundPolygons(worldContext)),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: datum => datum.polygon,
      getFillColor: () => oceanColor,
      pickable: false
    }),
    new SolidPolygonLayer<DeckCellPolygon>({
      id: "fmg-webgl-land",
      data: getCachedDeckData("land", signatures.land, () =>
        buildLandPolygonsBase(worldContext, viewContext.focusScope, landFill)
      ),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: datum => datum.polygon,
      getFillColor: datum => datum.fillColor,
      pickable: true
    })
  ];

  for (const layer of WEBGL_POLYGON_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      new SolidPolygonLayer<DeckCellPolygon>({
        id: `fmg-webgl-${layer.id}`,
        data: getCachedDeckData(`polygon:${layer.id}`, signatures.byLayer[layer.id], () =>
          layer.build(worldContext, viewContext)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        pickable: true
      })
    );
    if (layer.boundary) {
      const boundary = layer.boundary;
      layers.push(
        new PathLayer<DeckPath>({
          id: `fmg-webgl-${layer.id}-boundaries`,
          data: getCachedDeckData(`boundary:${layer.boundary}`, signatures.byLayer[`${layer.id}-boundaries`], () =>
            buildDivisionBoundaryPaths(worldContext, viewContext.focusScope, boundary)
          ),
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPath: datum => datum.path,
          getColor: datum => datum.color,
          getWidth: datum => datum.width,
          widthUnits: "pixels",
          widthMinPixels: 0.35,
          widthMaxPixels: 2.5,
          jointRounded: true,
          capRounded: true,
          pickable: false
        })
      );
    }
  }

  for (const layer of WEBGL_PATH_LAYERS) {
    if (!activeLayers[layer.toggle]) continue;
    layers.push(
      new PathLayer<DeckPath>({
        id: `fmg-webgl-${layer.id}`,
        data: getCachedDeckData(`path:${layer.id}`, signatures.byLayer[layer.id], () =>
          layer.build(worldContext, viewContext)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPath: datum => datum.path,
        getColor: datum => datum.color,
        getWidth: datum => datum.width,
        widthUnits: "pixels",
        widthMinPixels: 0.5,
        widthMaxPixels: layer.id === "rivers" ? 10 : 4,
        jointRounded: true,
        capRounded: true,
        pickable: true
      })
    );
  }

  return layers;
}

function getCachedDeckData<T extends CachedDeckData>(key: string, signature: string, build: () => T): T {
  const cached = deckLayerDataCache.get(key);
  if (cached?.signature === signature) return cached.data as T;
  const data = build();
  deckLayerDataCache.set(key, { signature, data });
  return data;
}

function buildLayerSignatures(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  oceanFill: string,
  landFill: string
): { background: string; land: string; byLayer: Record<string, string> } {
  const { pack, grid, biomesData, mapId, graphWidth, graphHeight } = worldContext;
  const scope = getFocusScopeSignature(viewContext);
  const geometry = `${mapId}|${scope}|${pointListSignature(pack.vertices?.p)}|${nestedNumberListSignature(pack.cells?.v)}`;
  const cellHeights = numberListSignature(pack.cells?.h);
  const landGeometry = `${geometry}|h:${cellHeights}`;
  const states = `${numberListSignature(pack.cells?.state)}|${colorListSignature(pack.states)}`;
  const provinces = `${numberListSignature(pack.cells?.province)}|${colorListSignature(pack.provinces)}`;
  const cultures = `${numberListSignature(pack.cells?.culture)}|${colorListSignature(pack.cultures)}`;
  const religions = `${numberListSignature(pack.cells?.religion)}|${colorListSignature(pack.religions)}`;

  return {
    background: `${mapId}|${graphWidth}x${graphHeight}|${oceanFill}`,
    land: `${landGeometry}|${landFill}`,
    byLayer: {
      height: `${geometry}|${cellHeights}`,
      biomes: `${landGeometry}|${numberListSignature(pack.cells?.biome)}|${stringListSignature(biomesData.color)}`,
      religions: `${landGeometry}|${religions}`,
      "religions-boundaries": `${landGeometry}|${religions}`,
      cultures: `${landGeometry}|${cultures}`,
      "cultures-boundaries": `${landGeometry}|${cultures}`,
      states: `${landGeometry}|${states}`,
      "states-boundaries": `${landGeometry}|${states}`,
      provinces: `${landGeometry}|${provinces}`,
      "provinces-boundaries": `${landGeometry}|${provinces}`,
      zones: `${landGeometry}|${zonesSignature(pack.zones)}`,
      temperature: `${geometry}|${numberListSignature(pack.cells?.g)}|${numberListSignature(grid.cells?.temp)}`,
      population: `${landGeometry}|${numberListSignature(pack.cells?.pop)}`,
      precipitation: `${landGeometry}|${numberListSignature(pack.cells?.g)}|${numberListSignature(grid.cells?.prec)}`,
      danger: `${landGeometry}|${numberListSignature(pack.cells?.danger)}`,
      cells: geometry,
      grid: `${geometry}|${nestedNumberListSignature(pack.cells?.c)}`,
      rivers: `${mapId}|${scope}|${riversSignature(pack.rivers)}`,
      borders: `${landGeometry}|${states}|${provinces}|${nestedNumberListSignature(pack.cells?.c)}`,
      routes: `${mapId}|${scope}|${routesSignature(pack.routes)}`
    }
  };
}

function getFocusScopeSignature(viewContext: Readonly<ViewContext>): string {
  const scope = viewContext.focusScope;
  if (!scope) return "all";
  return `${scope.kind}:${scope.id}:${scope.stateId}:${setSignature(scope.cellIds)}:${setSignature(scope.gridCellIds)}`;
}

function setSignature(values: ReadonlySet<number>): string {
  let hash = 2166136261;
  for (const value of values) hash = hashNumber(hash, value);
  return `${values.size}:${hash >>> 0}`;
}

function numberListSignature(values: ArrayLike<number> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) hash = hashNumber(hash, values[index] ?? 0);
  return `${values.length}:${hash >>> 0}`;
}

function nestedNumberListSignature(values: ArrayLike<ArrayLike<number>> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    hash = hashNumber(hash, row?.length ?? 0);
    if (!row) continue;
    for (let innerIndex = 0; innerIndex < row.length; innerIndex++) hash = hashNumber(hash, row[innerIndex] ?? 0);
  }
  return `${values.length}:${hash >>> 0}`;
}

function pointListSignature(values: ArrayLike<DeckPosition> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) {
    const point = values[index];
    hash = hashNumber(hash, point?.[0] ?? 0);
    hash = hashNumber(hash, point?.[1] ?? 0);
  }
  return `${values.length}:${hash >>> 0}`;
}

function stringListSignature(values: ArrayLike<string> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (let index = 0; index < values.length; index++) hash = hashString(hash, values[index] ?? "");
  return `${values.length}:${hash >>> 0}`;
}

function colorListSignature(values: ReadonlyArray<{ color?: string }> | undefined): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const value of values) hash = hashString(hash, value?.color ?? "");
  return `${values.length}:${hash >>> 0}`;
}

function zonesSignature(
  values: ReadonlyArray<{ cells?: number[]; color?: string; hidden?: boolean }> | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const zone of values) {
    hash = hashString(hash, zone?.color ?? "");
    hash = hashNumber(hash, zone?.hidden ? 1 : 0);
    hash = hashNumber(hash, zone?.cells?.length ?? 0);
    for (const cellId of zone?.cells ?? []) hash = hashNumber(hash, cellId);
  }
  return `${values.length}:${hash >>> 0}`;
}

function riversSignature(
  values:
    | ReadonlyArray<{
        i?: number;
        cells?: number[];
        points?: [number, number][];
        sourceWidth?: number;
        widthFactor?: number;
      }>
    | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const river of values) {
    hash = hashNumber(hash, river?.i ?? 0);
    hash = hashNumber(hash, river?.sourceWidth ?? 0);
    hash = hashNumber(hash, river?.widthFactor ?? 0);
    hash = hashNumber(hash, river?.cells?.length ?? 0);
    for (const cellId of river?.cells ?? []) hash = hashNumber(hash, cellId);
    hash = hashNumber(hash, river?.points?.length ?? 0);
    for (const point of river?.points ?? []) {
      hash = hashNumber(hash, point[0]);
      hash = hashNumber(hash, point[1]);
    }
  }
  return `${values.length}:${hash >>> 0}`;
}

function routesSignature(
  values:
    | ReadonlyArray<{ i?: number; group?: string; cells?: number[]; points?: [number, number, number?][] }>
    | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const route of values) {
    hash = hashNumber(hash, route?.i ?? 0);
    hash = hashString(hash, route?.group ?? "");
    hash = hashNumber(hash, route?.cells?.length ?? 0);
    for (const cellId of route?.cells ?? []) hash = hashNumber(hash, cellId);
    hash = hashNumber(hash, route?.points?.length ?? 0);
    for (const point of route?.points ?? []) {
      hash = hashNumber(hash, point[0]);
      hash = hashNumber(hash, point[1]);
    }
  }
  return `${values.length}:${hash >>> 0}`;
}

function hashString(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index++) next = hashNumber(next, value.charCodeAt(index));
  return next;
}

function hashNumber(hash: number, value: number): number {
  let next = hash;
  next ^= Math.round(value * 1000);
  return Math.imul(next, 16777619);
}
