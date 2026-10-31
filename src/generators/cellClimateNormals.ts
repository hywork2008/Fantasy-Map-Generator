import type { WorldContext } from "../context/worldContext";
import { getEarthCoordinatesAtMapPoint } from "../data/earthConfig";
import { optionsStore } from "../state/optionsStore";
import {
  getGlobalClimateAnomaly,
  getMonthlyCellAnomalyC,
  normalizeClimateVariability
} from "../utils/climateVariability";
import {
  CLIMATE_MODEL_VERSION,
  getMonthlyMeanTemperaturesC,
  getTemperatureCurveParameters,
  type TemperatureCurve
} from "../utils/earthlikeClimate";
import { normalizeHeightExponent } from "../utils/height";
import {
  distributeSeasonalPrecipitation,
  PRECIPITATION_MODEL_VERSION,
  type PrecipitationSeasonalitySource
} from "../utils/precipitationSeasonality";
import { precipitationProxyToMillimeters } from "../utils/precipitationUnits";
import { getDaysInMonth } from "../utils/seasonUtils";
import { type CellPrecipitationClimate, ensureCellPrecipitationClimate } from "./cellPrecipitationClimate";
import { computeWorldTerrainAspect } from "./terrainAspect";

export type { ContinentalitySource } from "./cellClimateGeography";

import {
  type ContinentalitySource,
  ensureClimateGeography,
  type Geography,
  geographyKey,
  hash
} from "./cellClimateGeography";
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
  readonly precipitationModelVersion: typeof PRECIPITATION_MODEL_VERSION;
  readonly precipitationSeasonalitySource: PrecipitationSeasonalitySource;
  readonly precipitationSeasonalityConfidence: number;
  readonly invalidAnnualPrecipitation: boolean;
  readonly monthlyMoistureSupply: Float32Array;
  readonly precipitationOutsideEarthlikeTilt: boolean;
}
interface ClimateCache {
  key: string;
  geography: Geography;
  revision: number;
  monthly: Float32Array;
  terrain: Float32Array;
  anomaly: Float32Array;
  year: number;
  precipitation: CellPrecipitationClimate;
}
const cache = new WeakMap<WorldContext, ClimateCache>();
let nextRevision = 0;

function fallbackLatitude(world: WorldContext, cell: number): number {
  return (
    (world.mapCoordinates.latN ?? 0) -
    (world.grid.points[cell][1] / world.graphHeight) * (world.mapCoordinates.latT ?? 0)
  );
}

/** Runtime-only cache; old saved monthly buckets cannot validate this model's derived fields. */
export function ensureCellClimateNormals(world: WorldContext, year: number): ClimateCache {
  const previous = cache.get(world);
  const precipitationClimate = ensureCellPrecipitationClimate(world);
  const geoKey = geographyKey(world);
  const exponent = normalizeHeightExponent(optionsStore.getState().heightExponent);
  const variability = normalizeClimateVariability(world.options.climateVariability);
  const globalAnomaly = getGlobalClimateAnomaly(variability, world.seed ?? "", year);
  const key = `${CLIMATE_MODEL_VERSION}:${precipitationClimate.key}:${geoKey}:${hash(world.grid.cells.temp)}:${hash(world.grid.cells.prec)}:${world.options.axialTilt}:${world.distanceScale}:${exponent}:${globalAnomaly.episodeC}:${globalAnomaly.volcanicC}:${year}`;
  if (previous?.key === key) return previous;
  const geography =
    previous?.geography.key === geoKey ? previous.geography : (ensureClimateGeography(world, geoKey) as Geography);
  const count = world.grid.cells.i.length;
  const monthly = new Float32Array(count * 12);
  const terrain = buildTerrainDeviation(world, exponent, count);
  const anomaly = new Float32Array(count * 12);
  const result: ClimateCache = {
    key,
    geography,
    revision: ++nextRevision,
    monthly,
    terrain,
    anomaly,
    year,
    precipitation: precipitationClimate
  };
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
  const seasonal = distributeSeasonalPrecipitation(
    world.grid.cells.prec?.[gridCellId] === undefined ||
      !Number.isFinite(world.grid.cells.prec[gridCellId]) ||
      world.grid.cells.prec[gridCellId] < 0
      ? NaN
      : precipitation,
    year,
    state.precipitation.dailyScores.subarray(gridCellId * 12, gridCellId * 12 + 12),
    state.precipitation.confidence[gridCellId],
    world.options.axialTilt ?? 23.5
  );
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
    monthlyPrecipitationMm: seasonal.monthly,
    precipitationModelVersion: PRECIPITATION_MODEL_VERSION,
    precipitationSeasonalitySource: seasonal.source,
    precipitationSeasonalityConfidence: seasonal.confidence,
    invalidAnnualPrecipitation: seasonal.invalidAnnualPrecipitation,
    monthlyMoistureSupply: state.precipitation.monthlyMoistureSupply.slice(gridCellId * 12, gridCellId * 12 + 12),
    precipitationOutsideEarthlikeTilt: state.precipitation.outsideEarthlikeTilt
  };
}
