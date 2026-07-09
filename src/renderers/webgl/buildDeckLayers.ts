import { COORDINATE_SYSTEM, type Color, type LayersList } from "@deck.gl/core";
import { PathLayer, PolygonLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { useLayerState } from "../../store/layerState";
import {
  buildBackgroundPolygons,
  buildBiomesPolygons,
  buildBorderPaths,
  buildCellOutlinePaths,
  buildCoastlinePaths,
  buildCulturePolygons,
  buildDangerPolygons,
  buildDivisionBoundaryPaths,
  buildGridPaths,
  buildHeightPolygons,
  buildIcePolygons,
  buildLakeOutlinePaths,
  buildLakePolygons,
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
  type DeckFeaturePolygon,
  type DeckIcePolygon,
  type DeckPath,
  type DeckPosition
} from "./adapters/deckDataAdapters";

type PolygonBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckCellPolygon[];
type PathBuilder = (worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>) => DeckPath[];
type CachedDeckData = DeckCellPolygon[] | DeckIcePolygon[] | DeckPath[];

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
  ...WEBGL_PATH_LAYERS.map(layer => layer.toggle),
  "toggleIce"
]);

export function clearDeckLayerDataCache(): void {
  deckLayerDataCache.clear();
}

export function getDeckLayerDataCacheSize(): number {
  return deckLayerDataCache.size;
}

export function buildDeckLayers(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): LayersList {
  const { activeLayers } = useLayerState.getState();
  const oceanFill = viewContext.oceanLayers?.select<SVGRectElement>("#oceanBase").attr("fill") || "#466eab";
  const landFill = viewContext.landmass?.attr("fill") || "#eef6fb";
  const oceanColor = colorToRgba(oceanFill, "#466eab");
  const signatures = buildLayerSignatures(worldContext, viewContext, oceanFill, landFill);
  const lakePaint = getLakePaint(viewContext);
  const coastlinePaint = getCoastlinePaint(viewContext);
  const icePaint = getIcePaint(viewContext);
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

  if (activeLayers.toggleLakes) {
    layers.push(
      new SolidPolygonLayer<DeckFeaturePolygon>({
        id: "fmg-webgl-lakes",
        data: getCachedDeckData("features:lakes", signatures.byLayer.lakes, () =>
          buildLakePolygons(
            worldContext,
            viewContext.focusScope,
            appServices,
            group => lakePaint[group]?.fill ?? lakePaint.freshwater.fill
          )
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        pickable: true
      }),
      new PathLayer<DeckPath>({
        id: "fmg-webgl-lakes-outlines",
        data: getCachedDeckData("features:lakes-outlines", signatures.byLayer["lakes-outlines"], () =>
          buildLakeOutlinePaths(
            worldContext,
            viewContext.focusScope,
            appServices,
            group => lakePaint[group]?.stroke ?? lakePaint.freshwater.stroke,
            group => lakePaint[group]?.strokeWidth ?? lakePaint.freshwater.strokeWidth
          )
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPath: datum => datum.path,
        getColor: datum => datum.color,
        getWidth: datum => datum.width,
        widthUnits: "pixels",
        widthMinPixels: 0,
        widthMaxPixels: 6,
        jointRounded: true,
        capRounded: true,
        pickable: false
      })
    );
  }

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

  if (activeLayers.toggleIce) {
    layers.push(
      new PolygonLayer<DeckIcePolygon>({
        id: "fmg-webgl-ice",
        data: getCachedDeckData("polygon:ice", signatures.byLayer.ice, () =>
          buildIcePolygons(worldContext, viewContext.focusScope, icePaint.fill, icePaint.stroke, icePaint.strokeWidth)
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPolygon: datum => datum.polygon,
        getFillColor: datum => datum.fillColor,
        getLineColor: datum => datum.lineColor,
        getLineWidth: datum => datum.lineWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 0,
        lineWidthMaxPixels: 2,
        stroked: true,
        pickable: true
      })
    );
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

  layers.push(
    new PathLayer<DeckPath>({
      id: "fmg-webgl-coastline",
      data: getCachedDeckData("features:coastline", signatures.byLayer.coastline, () =>
        buildCoastlinePaths(
          worldContext,
          viewContext.focusScope,
          appServices,
          group => coastlinePaint[group]?.stroke ?? coastlinePaint.sea_island.stroke,
          group => coastlinePaint[group]?.strokeWidth ?? coastlinePaint.sea_island.strokeWidth
        )
      ),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPath: datum => datum.path,
      getColor: datum => datum.color,
      getWidth: datum => datum.width,
      widthUnits: "pixels",
      widthMinPixels: 0.25,
      widthMaxPixels: 4,
      jointRounded: true,
      capRounded: true,
      pickable: true
    })
  );

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
      lakes: `${geometry}|${featuresSignature(pack.features, "lake")}|${paintSignature(getLakePaint(viewContext))}`,
      "lakes-outlines": `${geometry}|${featuresSignature(pack.features, "lake")}|${paintSignature(getLakePaint(viewContext))}`,
      coastline: `${geometry}|${featuresSignature(pack.features, "island")}|${paintSignature(getCoastlinePaint(viewContext))}`,
      ice: `${scope}|${iceSignature(pack.ice)}|${paintSignature({ ice: getIcePaint(viewContext) })}`,
      cells: geometry,
      grid: `${geometry}|${nestedNumberListSignature(pack.cells?.c)}`,
      rivers: `${mapId}|${scope}|${riversSignature(pack.rivers)}`,
      borders: `${landGeometry}|${states}|${provinces}|${nestedNumberListSignature(pack.cells?.c)}`,
      routes: `${mapId}|${scope}|${routesSignature(pack.routes)}`
    }
  };
}

interface LayerPaint {
  fill: Color;
  stroke: Color;
  strokeWidth: number;
}

function getLakePaint(viewContext: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    freshwater: getLayerPaint(viewContext, "lakes", "freshwater", "#a6c1fd", "#5f799d", 0.7, 0.5),
    salt: getLayerPaint(viewContext, "lakes", "salt", "#409b8a", "#388985", 0.7, 0.5),
    sinkhole: getLayerPaint(viewContext, "lakes", "sinkhole", "#5bc9fd", "#53a3b0", 0.7, 1),
    frozen: getLayerPaint(viewContext, "lakes", "frozen", "#cdd4e7", "#cfe0eb", 0, 0.95),
    lava: getLayerPaint(viewContext, "lakes", "lava", "#90270d", "#f93e0c", 2, 0.7),
    dry: getLayerPaint(viewContext, "lakes", "dry", "#c9bfa7", "#8e816f", 0.7, 1)
  };
}

function getCoastlinePaint(viewContext: Readonly<ViewContext>): Record<string, LayerPaint> {
  return {
    sea_island: getLayerPaint(viewContext, "coastline", "sea_island", "transparent", "#1f3846", 0.5, 0.5),
    lake_island: getLayerPaint(viewContext, "coastline", "lake_island", "transparent", "#7c8eaf", 0.35, 1)
  };
}

function getIcePaint(viewContext: Readonly<ViewContext>): LayerPaint {
  const fallback = {
    fill: colorToRgba("#f1f8fe", "#f1f8fe", 0.9),
    stroke: colorToRgba("#e8f0f6", "#e8f0f6", 0.9),
    strokeWidth: 0.5
  };
  if (!viewContext.ice) return fallback;

  const opacity = parseOptionalNumber(viewContext.ice.attr("opacity") ?? viewContext.ice.style("opacity")) ?? 0.9;
  return {
    fill: colorToRgba(viewContext.ice.attr("fill") ?? viewContext.ice.style("fill"), "#f1f8fe", opacity),
    stroke: colorToRgba(viewContext.ice.attr("stroke") ?? viewContext.ice.style("stroke"), "#e8f0f6", opacity),
    strokeWidth:
      parseOptionalNumber(viewContext.ice.attr("stroke-width") ?? viewContext.ice.style("stroke-width")) ?? 0.5
  };
}

function getLayerPaint(
  viewContext: Readonly<ViewContext>,
  root: "lakes" | "coastline",
  id: string,
  fillFallback: string,
  strokeFallback: string,
  strokeWidthFallback: number,
  opacityFallback: number
): LayerPaint {
  if (!viewContext[root]) {
    return {
      fill: colorToRgba(fillFallback, fillFallback, opacityFallback),
      stroke: colorToRgba(strokeFallback, strokeFallback, opacityFallback),
      strokeWidth: strokeWidthFallback
    };
  }
  const group = viewContext[root].select<SVGGElement>(`#${id}`);
  const opacity = parseOptionalNumber(group.attr("opacity") ?? group.style("opacity")) ?? opacityFallback;
  const fill = colorToRgba(group.attr("fill") ?? group.style("fill"), fillFallback, opacity);
  const stroke = colorToRgba(group.attr("stroke") ?? group.style("stroke"), strokeFallback, opacity);
  return {
    fill,
    stroke,
    strokeWidth: parseOptionalNumber(group.attr("stroke-width") ?? group.style("stroke-width")) ?? strokeWidthFallback
  };
}

function parseOptionalNumber(value: string | null | undefined): number | null {
  if (!value || value === "none" || value === "null") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function featuresSignature(
  values:
    | ReadonlyArray<{ i?: number; type?: string; group?: string; firstCell?: number; vertices?: number[] }>
    | undefined,
  type: "lake" | "island"
): string {
  if (!values) return "0:0";
  let count = 0;
  let hash = 2166136261;
  for (const feature of values) {
    if (!feature || feature.type !== type) continue;
    count++;
    hash = hashNumber(hash, feature.i ?? 0);
    hash = hashString(hash, feature.group ?? "");
    hash = hashNumber(hash, feature.firstCell ?? 0);
    hash = hashNumber(hash, feature.vertices?.length ?? 0);
    for (const vertexId of feature.vertices ?? []) hash = hashNumber(hash, vertexId);
  }
  return `${count}:${hash >>> 0}`;
}

function iceSignature(
  values:
    | ReadonlyArray<{
        i?: number;
        type?: string;
        cellId?: number;
        points?: [number, number][];
        offset?: [number, number];
      }>
    | undefined
): string {
  if (!values) return "0:0";
  let hash = 2166136261;
  for (const ice of values) {
    hash = hashNumber(hash, ice?.i ?? 0);
    hash = hashString(hash, ice?.type ?? "");
    hash = hashNumber(hash, ice?.cellId ?? -1);
    hash = hashNumber(hash, ice?.offset?.[0] ?? 0);
    hash = hashNumber(hash, ice?.offset?.[1] ?? 0);
    hash = hashNumber(hash, ice?.points?.length ?? 0);
    for (const point of ice?.points ?? []) {
      hash = hashNumber(hash, point[0]);
      hash = hashNumber(hash, point[1]);
    }
  }
  return `${values.length}:${hash >>> 0}`;
}

function paintSignature(values: Record<string, LayerPaint>): string {
  let hash = 2166136261;
  for (const key of Object.keys(values).sort()) {
    const paint = values[key];
    hash = hashString(hash, key);
    for (const value of paint.fill) hash = hashNumber(hash, value);
    for (const value of paint.stroke) hash = hashNumber(hash, value);
    hash = hashNumber(hash, paint.strokeWidth);
  }
  return hash.toString();
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
