import type { WorldContext } from "../context/worldContext";
import { EARTH_EQUATORIAL_CIRCUMFERENCE_KM, getEarthCoordinatesAtMapPoint } from "../data/earthConfig";
import { optionsStore } from "../state/optionsStore";
import {
  getGlobalClimateAnomaly,
  getMonthlyCellAnomalyC,
  normalizeClimateVariability
} from "../utils/climateVariability";
import {
  CLIMATE_MODEL_VERSION,
  distributeAnnualPrecipitationMm,
  getMonthlyMeanTemperaturesC,
  getTemperatureCurveParameters,
  type TemperatureCurve
} from "../utils/earthlikeClimate";
import { normalizeHeightExponent } from "../utils/height";
import { precipitationProxyToMillimeters } from "../utils/precipitationUnits";
import { getDaysInMonth } from "../utils/seasonUtils";
import { computeWorldTerrainAspect } from "./terrainAspect";

export type ContinentalitySource = "mappedCoast" | "regionalFallback";
export interface CellClimateNormals extends TemperatureCurve {
  readonly modelVersion: typeof CLIMATE_MODEL_VERSION;
  readonly climateRevision: number;
  readonly longitudeDeg: number;
  readonly monthlyMeanTemperatureC: Float32Array;
  /** Slope-aspect deviation from its own annual mean (that mean is already inside annual temp), °C by month. */
  readonly terrainOffsetC: Float32Array;
  /** Long-period / volcanic climate anomaly for this year, °C by month (already inside the monthly means). */
  readonly climateAnomalyC: Float32Array;
  readonly annualPrecipitationMm: number;
  readonly monthlyPrecipitationMm: Float64Array;
  readonly continentalitySource: ContinentalitySource;
  readonly precipitationSeasonalitySource: "uniformAssumption";
}
interface Geography {
  key: string;
  continentality: Float32Array;
  source: ContinentalitySource[];
}
interface ClimateCache {
  key: string;
  geography: Geography;
  revision: number;
  monthly: Float32Array;
  terrain: Float32Array;
  anomaly: Float32Array;
  year: number;
}
const cache = new WeakMap<WorldContext, ClimateCache>();
let nextRevision = 0;
const RADIUS = EARTH_EQUATORIAL_CIRCUMFERENCE_KM / (2 * Math.PI);
type Vector = [number, number, number];
interface Node {
  point: Vector;
  axis: number;
  left?: Node;
  right?: Node;
}
function vector(latitude: number, longitude: number): Vector {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}
function tree(points: Vector[], depth = 0): Node | undefined {
  if (!points.length) return undefined;
  const axis = depth % 3;
  points.sort((a, b) => a[axis] - b[axis]);
  const mid = Math.floor(points.length / 2);
  return {
    point: points[mid],
    axis,
    left: tree(points.slice(0, mid), depth + 1),
    right: tree(points.slice(mid + 1), depth + 1)
  };
}
function nearest(node: Node | undefined, target: Vector, best = Infinity): number {
  if (!node) return best;
  const distance = node.point.reduce((sum, value, axis) => sum + (value - target[axis]) ** 2, 0);
  best = Math.min(best, distance);
  const delta = target[node.axis] - node.point[node.axis];
  best = nearest(delta < 0 ? node.left : node.right, target, best);
  if (delta * delta < best) best = nearest(delta < 0 ? node.right : node.left, target, best);
  return best;
}
/** Content hash catches in-place edits as well as replacement arrays; geography is rebuilt only on geographical changes. */
const hashBuffer = new DataView(new ArrayBuffer(8));
function hash(values: ArrayLike<number> | undefined, initial = 2166136261): number {
  let result = initial;
  if (!values) return result;
  for (let i = 0; i < values.length; i++) {
    hashBuffer.setFloat64(0, values[i], true);
    result = Math.imul(result ^ hashBuffer.getUint32(0, true), 16777619);
    result = Math.imul(result ^ hashBuffer.getUint32(4, true), 16777619);
  }
  return Math.imul(result ^ values.length, 16777619) >>> 0;
}
function geographyKey(world: WorldContext): string {
  const { grid, mapCoordinates, graphHeight, graphWidth } = world;
  let pointHash = 2166136261;
  for (const point of grid.points) pointHash = hash(point, pointHash);
  let topologyHash = 2166136261;
  for (const neighbors of grid.cells.c ?? []) topologyHash = hash(neighbors, topologyHash);
  return JSON.stringify([
    world.mapId,
    graphWidth,
    graphHeight,
    mapCoordinates,
    pointHash,
    topologyHash,
    hash(grid.cells.h),
    hash(grid.cells.f),
    grid.features?.map(f => f?.type)
  ]);
}
/** Conservative lower bound on distance to unknown territory. Regional edges never become coastline. */
function boundaryDistance(world: WorldContext, latitude: number, longitude: number): number {
  const { latN = 0, latT = 0, lonW = 0, lonT = 0 } = world.mapCoordinates;
  const latS = latN - latT;
  const bounds: number[] = [];
  if (latN < 90) bounds.push(((Math.abs(latN - latitude) * Math.PI) / 180) * RADIUS);
  if (latS > -90) bounds.push(((Math.abs(latitude - latS) * Math.PI) / 180) * RADIUS);
  if (lonT < 359.999) {
    // Distance to the meridian's entire great circle is a lower bound for its finite segment.
    for (const edge of [lonW, lonW + lonT]) {
      bounds.push(
        RADIUS *
          Math.asin(
            Math.min(1, Math.abs(Math.cos((latitude * Math.PI) / 180) * Math.sin(((longitude - edge) * Math.PI) / 180)))
          )
      );
    }
  }
  return bounds.length ? Math.min(...bounds) : Infinity;
}
function buildGeography(world: WorldContext, key: string): Geography {
  const { grid } = world;
  const count = grid.cells.i.length;
  const continentality = new Float32Array(count).fill(0.5);
  const source: ContinentalitySource[] = Array.from({ length: count }, () => "regionalFallback");
  if (!grid.cells.h || !grid.cells.f || !grid.cells.c || !grid.features?.length) return { key, continentality, source };
  const coasts: Vector[] = [];
  const isOcean = (cell: number) => grid.features?.[grid.cells.f?.[cell]]?.type === "ocean";
  // Coast samples are edge midpoints, never inland lakes or arbitrary map edges.
  for (const cell of grid.cells.i) {
    if (grid.cells.h?.[cell] < 20) continue;
    for (const neighbor of grid.cells.c?.[cell] ?? []) {
      if (!isOcean(neighbor)) continue;
      const a = getEarthCoordinatesAtMapPoint(world, grid.points[cell]);
      const b = getEarthCoordinatesAtMapPoint(world, grid.points[neighbor]);
      if (!a || !b) continue;
      const va = vector(a.latitude, a.longitude);
      const vb = vector(b.latitude, b.longitude);
      const midpoint = va.map((value, axis) => value + vb[axis]) as Vector;
      const length = Math.hypot(...midpoint);
      if (length > 0) coasts.push(midpoint.map(value => value / length) as Vector);
    }
  }
  const root = tree(coasts);
  for (const cell of grid.cells.i) {
    const coordinates = getEarthCoordinatesAtMapPoint(world, grid.points[cell]);
    if (!coordinates) continue;
    if (isOcean(cell)) {
      continentality[cell] = 0;
      source[cell] = "mappedCoast";
      continue;
    }
    if (!root) continue;
    const squaredChord = nearest(root, vector(coordinates.latitude, coordinates.longitude));
    const distance = 2 * RADIUS * Math.asin(Math.min(1, Math.sqrt(squaredChord) / 2));
    if (distance > boundaryDistance(world, coordinates.latitude, coordinates.longitude)) continue;
    continentality[cell] = 1 - Math.exp(-distance / 300);
    source[cell] = "mappedCoast";
  }
  return { key, continentality, source };
}

const geographyCache = new WeakMap<WorldContext, Geography>();
/** Year-independent continentality, shared with consumers (wind) that must not evict the yearly climate cache. */
export function ensureClimateGeography(
  world: WorldContext,
  key = geographyKey(world)
): { readonly continentality: Float32Array; readonly source: readonly ContinentalitySource[] } {
  const cached = geographyCache.get(world);
  if (cached?.key === key) return cached;
  const geography = buildGeography(world, key);
  geographyCache.set(world, geography);
  return geography;
}

function fallbackLatitude(world: WorldContext, cell: number): number {
  return (
    (world.mapCoordinates.latN ?? 0) -
    (world.grid.points[cell][1] / world.graphHeight) * (world.mapCoordinates.latT ?? 0)
  );
}

/** Runtime-only cache; old saved monthly buckets cannot validate this model's derived fields. */
export function ensureCellClimateNormals(world: WorldContext, year: number): ClimateCache {
  const previous = cache.get(world);
  const geoKey = geographyKey(world);
  const exponent = normalizeHeightExponent(optionsStore.getState().heightExponent);
  const variability = normalizeClimateVariability(world.options.climateVariability);
  const globalAnomaly = getGlobalClimateAnomaly(variability, world.seed ?? "", year);
  const key = `${geoKey}:${hash(world.grid.cells.temp)}:${hash(world.grid.cells.prec)}:${world.options.axialTilt}:${world.distanceScale}:${exponent}:${globalAnomaly.episodeC}:${globalAnomaly.volcanicC}:${year}`;
  if (previous?.key === key) return previous;
  const geography =
    previous?.geography.key === geoKey ? previous.geography : (ensureClimateGeography(world, geoKey) as Geography);
  const count = world.grid.cells.i.length;
  const monthly = new Float32Array(count * 12);
  const terrain = buildTerrainDeviation(world, exponent, count);
  const anomaly = new Float32Array(count * 12);
  const result: ClimateCache = { key, geography, revision: ++nextRevision, monthly, terrain, anomaly, year };
  const hasAnomaly = globalAnomaly.episodeC !== 0 || globalAnomaly.volcanicC !== 0;
  const warmth = new Float64Array(12);
  for (const cell of world.grid.cells.i) {
    const coordinates = getEarthCoordinatesAtMapPoint(world, world.grid.points[cell]);
    const latitude = coordinates?.latitude ?? fallbackLatitude(world, cell);
    const curve: TemperatureCurve = {
      annualMeanTemperatureC: world.grid.cells.temp[cell],
      latitudeDeg: latitude,
      continentality: geography.continentality[cell],
      axialTiltDeg: world.options.axialTilt,
      year
    };
    monthly.set(getMonthlyMeanTemperaturesC(curve), cell * 12);
    for (let m = 0; m < 12; m++) monthly[cell * 12 + m] += terrain[cell * 12 + m];
    if (hasAnomaly) {
      const { peakDay, daysInYear } = getTemperatureCurveParameters(curve);
      for (let m = 0, start = 0; m < 12; m++) {
        const days = getDaysInMonth(year, m + 1);
        warmth[m] = Math.cos((2 * Math.PI * (start + days / 2 - peakDay)) / daysInYear);
        start += days;
      }
      const cellAnomaly = getMonthlyCellAnomalyC(globalAnomaly, latitude, curve.continentality, warmth, year);
      for (let m = 0; m < 12; m++) {
        anomaly[cell * 12 + m] = cellAnomaly[m];
        monthly[cell * 12 + m] += cellAnomaly[m];
      }
    }
  }
  cache.set(world, result);
  return result;
}

/**
 * Monthly slope-aspect offsets minus their annual mean: calculateTemperatures() bakes that mean
 * into grid.cells.temp, so only the seasonal deviation is added here (no double counting).
 */
function buildTerrainDeviation(world: WorldContext, exponent: number, count: number): Float32Array {
  if (!world.grid.cells.c || !world.grid.cells.h || !(world.graphHeight > 0)) return new Float32Array(count * 12);
  const { monthlyOffsetC, annualOffsetC } = computeWorldTerrainAspect(world, exponent);
  for (let cell = 0; cell < count; cell++)
    for (let m = 0; m < 12; m++) monthlyOffsetC[cell * 12 + m] -= annualOffsetC[cell];
  return monthlyOffsetC;
}

/** Reads unrounded cell climate without initializing or importing any extension. */
export function createCellClimateNormalsReader(
  world: WorldContext,
  year: number
): (gridCellId: number) => CellClimateNormals | null {
  const state = ensureCellClimateNormals(world, year);
  return gridCellId => readCellClimateNormals(world, gridCellId, year, state);
}

export function getCellClimateNormals(
  world: WorldContext,
  gridCellId: number,
  year: number
): CellClimateNormals | null {
  if (
    !world.grid?.cells.i?.length ||
    !world.grid.cells.temp ||
    !Number.isInteger(gridCellId) ||
    gridCellId < 0 ||
    gridCellId >= world.grid.cells.i.length
  )
    return null;
  return readCellClimateNormals(world, gridCellId, year, ensureCellClimateNormals(world, year));
}

function readCellClimateNormals(
  world: WorldContext,
  gridCellId: number,
  year: number,
  state: ClimateCache
): CellClimateNormals | null {
  if (!Number.isInteger(gridCellId) || gridCellId < 0 || gridCellId >= world.grid.cells.i.length) return null;
  const coordinates = getEarthCoordinatesAtMapPoint(world, world.grid.points[gridCellId]);
  const latitude = coordinates?.latitude ?? fallbackLatitude(world, gridCellId);
  const precipitation = precipitationProxyToMillimeters(world.grid.cells.prec?.[gridCellId] ?? 0);
  const annualPrecipitationMm = Number.isFinite(precipitation) ? Math.max(0, precipitation) : 0;
  return {
    modelVersion: CLIMATE_MODEL_VERSION,
    climateRevision: state.revision,
    year,
    annualMeanTemperatureC: world.grid.cells.temp[gridCellId],
    latitudeDeg: latitude,
    longitudeDeg: coordinates?.longitude ?? 0,
    continentality: state.geography.continentality[gridCellId],
    continentalitySource: state.geography.source[gridCellId],
    axialTiltDeg: world.options.axialTilt,
    monthlyMeanTemperatureC: state.monthly.slice(gridCellId * 12, gridCellId * 12 + 12),
    terrainOffsetC: state.terrain.slice(gridCellId * 12, gridCellId * 12 + 12),
    climateAnomalyC: state.anomaly.slice(gridCellId * 12, gridCellId * 12 + 12),
    annualPrecipitationMm,
    monthlyPrecipitationMm: distributeAnnualPrecipitationMm(annualPrecipitationMm, year),
    precipitationSeasonalitySource: "uniformAssumption"
  };
}
