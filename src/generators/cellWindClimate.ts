/**
 * Per-grid-cell monthly mean surface wind (docs/plan/wind-aspect-climate-variability.md §5, W1):
 * season-shifted band wind with boundary blending, then surface roughness, exposure and lee
 * shelter. Runtime-only derived values: nothing here is saved, and generation outputs
 * (temp / prec / ocean currents) are never read back or rewritten.
 *
 * Terrain scans (land fraction, exposure) run once per geography; only the band wind and the
 * upwind lee walk depend on the month, and all 12 months are built together and cached.
 *
 * W2 adds the monsoon term (§5.3: flow toward the seasonally warm side of a smoothed land–sea
 * temperature contrast, turned by Coriolis) and per-month diurnal parameters (§5.5: mixing, sea
 * breeze, slope winds) from which any hour's wind and daily aggregates are evaluated.
 */

import type { WorldContext } from "../context/worldContext";
import { getEarthCoordinatesAtMapPoint } from "../data/earthConfig";
import { pow } from "../simulation/deterministicMath";
import { optionsStore } from "../state/optionsStore";
import { getMonthlyMeanTemperaturesC } from "../utils/earthlikeClimate";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { precipitationProxyToMillimeters } from "../utils/precipitationUnits";
import { getDayOfYear, getDaysInMonth } from "../utils/seasonUtils";
import {
  type DailyWindStats,
  type DiurnalWindParameters,
  getDailyWindStatsFromParameters,
  getExposureFactor,
  getHourlyWindVector,
  getMixingAmplitude,
  getMonsoonVector,
  getSeaBreezeAmplitude,
  getSlopeWindAmplitude,
  getZonalWindVector,
  MONSOON_BLUR_RADIUS_KM,
  SEA_BREEZE_REACH_KM,
  WIND_CALM_SPEED,
  WIND_FOEHN_OBSTACLE_M,
  WIND_LEE_FACTOR,
  WIND_LEE_OBSTACLE_M,
  WIND_LEE_SEARCH_KM,
  WIND_ROUGHNESS_COAST,
  WIND_ROUGHNESS_LAND,
  windVectorToFromDeg,
  windVectorToTowardDeg
} from "../utils/windClimate";
import { ensureClimateGeography } from "./cellClimateNormals";
import { computeWorldTerrainAspect, HILLSIDE_LENGTH_M } from "./terrainAspect";

export const WIND_FLAG_LEE = 1;
export const WIND_FLAG_FOEHN = 2;
/** §5.2: land share is measured over a ~1500 km square. */
const LAND_FRACTION_HALF_WIDTH_KM = 750;
/** §5.4: exposure compares a cell with its ~100 km surroundings. */
const EXPOSURE_RADIUS_KM = 100;
const LAND_HEIGHT = 20;
/** Calendar used for month midpoints; leap years would only move them by half a day. */
const REFERENCE_YEAR = 1;

export interface CellWindClimate {
  readonly key: string;
  /** Month-major per cell: index cell * 12 + month (0-based). m/s, east / north positive. */
  readonly u: Float32Array;
  readonly v: Float32Array;
  /** WIND_FLAG_* bits per cell and month. */
  readonly flags: Uint8Array;
  readonly landFraction: Float32Array;
  readonly exposure: Float32Array;
  /** Monsoon part of u/v (already included in them), month-major like u/v. */
  readonly monsoonU: Float32Array;
  readonly monsoonV: Float32Array;
  /** 0–1 trust in the monsoon term; < 1 within MONSOON_BLUR_RADIUS_KM of an unknown map edge. */
  readonly monsoonConfidence: Float32Array;
  /** §5.5 diurnal parameters. Month-major arrays are indexed cell * 12 + month. */
  readonly mixAmp: Float32Array;
  readonly breezeAmp: Float32Array;
  readonly slopeNightFactor: Float32Array;
  readonly breezeDirDeg: Float32Array;
  readonly slopeAmp: Float32Array;
  readonly upslopeDirDeg: Float32Array;
  /** km from the nearest open-ocean cell for land cells within reach of the sea breeze, else NaN. */
  readonly coastDistanceKm: Float32Array;
}

const cache = new WeakMap<WorldContext, CellWindClimate>();

function hash(values: ArrayLike<number> | undefined): number {
  let result = 2166136261;
  if (!values) return result;
  for (let i = 0; i < values.length; i++) result = Math.imul((result ^ (values[i] * 1000)) | 0, 16777619);
  return (result ^ values.length) >>> 0;
}

function cacheKey(world: WorldContext, exponent: number): string {
  const { grid, mapCoordinates, graphWidth, graphHeight, options, distanceScale } = world;
  return JSON.stringify([
    world.mapId,
    graphWidth,
    graphHeight,
    mapCoordinates,
    grid.cells.i.length,
    grid.cellsX,
    grid.cellsY,
    hash(grid.cells.h),
    hash(grid.cells.prec),
    grid.features?.map(f => f?.type),
    options.winds,
    options.axialTilt,
    distanceScale,
    exponent
  ]);
}

/** Box mean over a row-major raster, separable running sums, repeated twice (≈ triangular kernel). O(n). */
function boxBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return values.slice();
  let source = values;
  const line = new Float64Array(Math.max(width, height));
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(source.length);
    blurLines(source, out, height, width, 1, width, radius, line);
    const out2 = new Float32Array(source.length);
    blurLines(out, out2, width, height, width, 1, radius, line);
    source = out2;
  }
  return source;
}

/** Blurs `count` lines of `length` samples; sample k of line j is at j * lineStride + k * step. */
function blurLines(
  source: Float32Array,
  target: Float32Array,
  count: number,
  length: number,
  step: number,
  lineStride: number,
  radius: number,
  prefix: Float64Array
): void {
  for (let j = 0; j < count; j++) {
    const base = j * lineStride;
    let running = 0;
    for (let k = 0; k < length; k++) {
      running += source[base + k * step];
      prefix[k] = running;
    }
    for (let k = 0; k < length; k++) {
      const lo = Math.max(0, k - radius);
      const hi = Math.min(length - 1, k + radius);
      target[base + k * step] = (prefix[hi] - (lo > 0 ? prefix[lo - 1] : 0)) / (hi - lo + 1);
    }
  }
}

function latitudeOf(world: WorldContext, cell: number): number {
  const coordinates = getEarthCoordinatesAtMapPoint(world, world.grid.points[cell]);
  if (coordinates) return coordinates.latitude;
  const { latN = 0, latT = 0 } = world.mapCoordinates;
  return latN - (world.grid.points[cell][1] / world.graphHeight) * latT;
}

export function ensureCellWindClimate(world: WorldContext): CellWindClimate {
  const exponent = normalizeHeightExponent(optionsStore.getState().heightExponent);
  const key = cacheKey(world, exponent);
  const previous = cache.get(world);
  if (previous?.key === key) return previous;

  const { grid } = world;
  const n = grid.cells.i.length;
  const heights = grid.cells.h ?? new Uint8Array(n);
  const neighbors = grid.cells.c ?? [];
  const points = grid.points;
  const winds = world.options.winds ?? [225, 45, 225, 315, 135, 315];
  const axialTilt = world.options.axialTilt ?? 23.5;
  const kmPerUnit = world.distanceScale > 0 ? world.distanceScale : 0;
  const spacingKm = (grid.spacing ?? 0) * kmPerUnit;
  const meters = new Float32Array(n);
  const land = new Float32Array(n);
  for (let cell = 0; cell < n; cell++) {
    land[cell] = heights[cell] >= LAND_HEIGHT ? 1 : 0;
    meters[cell] = heightToMeters(heights[cell], exponent);
  }

  // Raster smoothing needs the row-major jittered-square grid; otherwise fall back to map-wide values.
  const isRaster = grid.cellsX > 0 && grid.cellsY > 0 && grid.cellsX * grid.cellsY === n && spacingKm > 0;
  let landFraction: Float32Array;
  let surroundings: Float32Array;
  if (isRaster) {
    landFraction = boxBlur(land, grid.cellsX, grid.cellsY, Math.round(LAND_FRACTION_HALF_WIDTH_KM / spacingKm / 1.5));
    surroundings = boxBlur(meters, grid.cellsX, grid.cellsY, Math.round(EXPOSURE_RADIUS_KM / spacingKm / 1.5));
  } else {
    const meanLand = n ? land.reduce((a, b) => a + b, 0) / n : 0;
    landFraction = new Float32Array(n).fill(meanLand);
    surroundings = meters.slice();
  }

  // Static (month-independent) speed multiplier: roughness × exposure.
  const exposure = new Float32Array(n);
  const staticFactor = new Float32Array(n);
  for (let cell = 0; cell < n; cell++) {
    if (!land[cell]) {
      exposure[cell] = 1;
      staticFactor[cell] = 1;
      continue;
    }
    const coastal = (neighbors[cell] ?? []).some(other => !land[other]);
    exposure[cell] = getExposureFactor(meters[cell] - surroundings[cell]);
    staticFactor[cell] = (coastal ? WIND_ROUGHNESS_COAST : WIND_ROUGHNESS_LAND) * exposure[cell];
  }

  const latitudes = new Float32Array(n);
  for (let cell = 0; cell < n; cell++) latitudes[cell] = latitudeOf(world, cell);

  // §5.3 seasonal temperature anomaly r[m] (monthly − annual), from the same earth-like curve the
  // monthly normals use. Terrain and long-period anomalies are left out: neither moves pressure.
  const { continentality } = ensureClimateGeography(world);
  const seasonal = new Float32Array(n * 12);
  const seasonalAmplitude = new Float32Array(n);
  for (let cell = 0; cell < n; cell++) {
    const curve = getMonthlyMeanTemperaturesC({
      annualMeanTemperatureC: 0,
      latitudeDeg: latitudes[cell],
      continentality: continentality[cell] ?? 0.5,
      axialTiltDeg: axialTilt,
      year: REFERENCE_YEAR
    });
    let amplitude = 0;
    for (let m = 0; m < 12; m++) {
      seasonal[cell * 12 + m] = curve[m];
      amplitude = Math.max(amplitude, Math.abs(curve[m]));
    }
    seasonalAmplitude[cell] = amplitude;
  }
  const monsoonU = new Float32Array(n * 12);
  const monsoonV = new Float32Array(n * 12);
  const monsoonConfidence = new Float32Array(n);
  if (isRaster) buildMonsoon();

  const u = new Float32Array(n * 12);
  const v = new Float32Array(n * 12);
  const flags = new Uint8Array(n * 12);
  const daysInYear = 365;
  for (let m = 0; m < 12; m++) {
    const day = getDayOfYear(REFERENCE_YEAR, m + 1, Math.ceil(getDaysInMonth(REFERENCE_YEAR, m + 1) / 2)) - 1;
    for (let cell = 0; cell < n; cell++) {
      const band = getZonalWindVector(winds, latitudes[cell], day, daysInYear, landFraction[cell], axialTilt);
      const zonal = { u: band.u + monsoonU[cell * 12 + m], v: band.v + monsoonV[cell * 12 + m] };
      let factor = staticFactor[cell];
      const shelter = kmPerUnit > 0 ? findUpwindObstacle(cell, zonal.u, zonal.v) : null;
      if (shelter) {
        factor *= WIND_LEE_FACTOR;
        flags[cell * 12 + m] = WIND_FLAG_LEE | (shelter.foehn ? WIND_FLAG_FOEHN : 0);
      }
      u[cell * 12 + m] = zonal.u * factor;
      v[cell * 12 + m] = zonal.v * factor;
    }
  }

  const diurnal = buildDiurnal();
  const result: CellWindClimate = {
    key,
    u,
    v,
    flags,
    landFraction,
    exposure,
    monsoonU,
    monsoonV,
    monsoonConfidence,
    ...diurnal
  };
  cache.set(world, result);
  return result;

  function buildMonsoon(): void {
    const width = grid.cellsX;
    const height = grid.cellsY;
    const radius = Math.max(1, Math.round(MONSOON_BLUR_RADIUS_KM / spacingKm / 1.5));
    // Edges that cut through unknown territory (not a pole or a wrapped global seam).
    const { latN = 90, latT = 180, lonT = 360 } = world.mapCoordinates;
    const unknownTop = latN < 89.999;
    const unknownBottom = latN - latT > -89.999;
    const unknownSides = lonT < 359.999;
    for (let cell = 0; cell < n; cell++) {
      const x = cell % width;
      const y = Math.floor(cell / width);
      let edgeKm = Infinity;
      if (unknownSides) edgeKm = Math.min(edgeKm, (x + 0.5) * spacingKm, (width - x - 0.5) * spacingKm);
      if (unknownTop) edgeKm = Math.min(edgeKm, (y + 0.5) * spacingKm);
      if (unknownBottom) edgeKm = Math.min(edgeKm, (height - y - 0.5) * spacingKm);
      monsoonConfidence[cell] = Math.min(1, edgeKm / MONSOON_BLUR_RADIUS_KM);
    }
    const month = new Float32Array(n);
    for (let m = 0; m < 12; m++) {
      for (let cell = 0; cell < n; cell++) month[cell] = seasonal[cell * 12 + m];
      const smooth = boxBlur(month, width, height, radius);
      for (let cell = 0; cell < n; cell++) {
        const x = cell % width;
        const y = Math.floor(cell / width);
        const xl = Math.max(0, x - 1);
        const xr = Math.min(width - 1, x + 1);
        const yt = Math.max(0, y - 1);
        const yb = Math.min(height - 1, y + 1);
        const gradEast = xr > xl ? (smooth[y * width + xr] - smooth[y * width + xl]) / ((xr - xl) * spacingKm) : 0;
        // Screen rows grow southward, so north is the row above.
        const gradNorth = yb > yt ? (smooth[yt * width + x] - smooth[yb * width + x]) / ((yb - yt) * spacingKm) : 0;
        const monsoon = getMonsoonVector(gradEast, gradNorth, latitudes[cell], monsoonConfidence[cell]);
        monsoonU[cell * 12 + m] = monsoon.u;
        monsoonV[cell * 12 + m] = monsoon.v;
      }
    }
  }

  function buildDiurnal() {
    const isOcean = (cell: number) => !land[cell] && grid.features?.[grid.cells.f?.[cell]]?.type === "ocean";
    // Multi-source BFS from open-ocean cells inland, carrying the nearest sea cell (§5.5 sea→land direction).
    const coastDistanceKm = new Float32Array(n).fill(Number.NaN);
    const breezeDirDeg = new Float32Array(n);
    if (kmPerUnit > 0 && grid.cells.f) {
      const source = new Int32Array(n).fill(-1);
      let frontier: number[] = [];
      for (let cell = 0; cell < n; cell++) if (isOcean(cell)) source[cell] = cell;
      for (let cell = 0; cell < n; cell++)
        if (land[cell] && (neighbors[cell] ?? []).some(other => source[other] === other)) frontier.push(cell);
      const reach = SEA_BREEZE_REACH_KM * 1.5;
      for (const cell of frontier) source[cell] = nearestSea(cell);
      while (frontier.length) {
        const next: number[] = [];
        for (const cell of frontier) {
          const sea = source[cell];
          const dx = (points[cell][0] - points[sea][0]) * kmPerUnit;
          const dyNorth = -(points[cell][1] - points[sea][1]) * kmPerUnit;
          const distance = Math.max(0, Math.hypot(dx, dyNorth) - spacingKm / 2);
          if (distance > reach) continue;
          coastDistanceKm[cell] = distance;
          breezeDirDeg[cell] = ((Math.atan2(dx, dyNorth) * 180) / Math.PI + 360) % 360;
          for (const other of neighbors[cell] ?? []) {
            if (!land[other] || source[other] >= 0) continue;
            source[other] = sea;
            next.push(other);
          }
        }
        frontier = next;
      }
      function nearestSea(cell: number): number {
        let best = -1;
        let bestDistance = Infinity;
        for (const other of neighbors[cell] ?? []) {
          if (!isOcean(other)) continue;
          const d = Math.hypot(points[other][0] - points[cell][0], points[other][1] - points[cell][1]);
          if (d < bestDistance) {
            bestDistance = d;
            best = other;
          }
        }
        return best;
      }
    }

    const slopeAmp = new Float32Array(n);
    const upslopeDirDeg = new Float32Array(n);
    if (kmPerUnit > 0 && grid.cells.c && world.graphHeight > 0) {
      const aspect = computeWorldTerrainAspect(world, exponent);
      for (let cell = 0; cell < n; cell++) {
        if (!land[cell]) continue;
        const relief = Math.tan((aspect.slopeDeg[cell] * Math.PI) / 180) * HILLSIDE_LENGTH_M;
        slopeAmp[cell] = getSlopeWindAmplitude(relief, aspect.dominance[cell]);
        upslopeDirDeg[cell] = (aspect.aspectDeg[cell] + 180) % 360;
      }
    }

    const mixAmp = new Float32Array(n * 12);
    const breezeAmp = new Float32Array(n * 12);
    const slopeNightFactor = new Float32Array(n * 12);
    for (let cell = 0; cell < n; cell++) {
      const isLand = land[cell] === 1;
      const mm = precipitationProxyToMillimeters(grid.cells.prec?.[cell] ?? 0);
      const dryness = 1 - Math.min(1, Math.max(0, (Number.isFinite(mm) ? mm : 0) / 1500));
      const amplitude = seasonalAmplitude[cell] || 1;
      for (let m = 0; m < 12; m++) {
        const index = cell * 12 + m;
        const summer = 0.5 + (0.5 * seasonal[index]) / amplitude;
        mixAmp[index] = getMixingAmplitude(isLand, summer, dryness, latitudes[cell]);
        breezeAmp[index] = Number.isNaN(coastDistanceKm[cell])
          ? 0
          : getSeaBreezeAmplitude(coastDistanceKm[cell], summer, Math.hypot(u[index], v[index]));
        // Winter-night drainage winds are stronger on high ground (§5.5).
        slopeNightFactor[index] = 1 + 0.5 * (1 - summer) * Math.min(1, meters[cell] / 1500);
      }
    }
    return { mixAmp, breezeAmp, slopeNightFactor, breezeDirDeg, slopeAmp, upslopeDirDeg, coastDistanceKm };
  }

  /**
   * Walks upwind cell by cell (like the precipitation model's passWind) for up to
   * WIND_LEE_SEARCH_KM and reports the highest obstacle above this cell.
   */
  function findUpwindObstacle(start: number, wu: number, wv: number): { foehn: boolean } | null {
    const speed = Math.hypot(wu, wv);
    if (speed < 1e-6) return null;
    // Upwind in screen coordinates (y grows southward).
    const dirX = -wu / speed;
    const dirY = wv / speed;
    const base = meters[start];
    let cell = start;
    let travelled = 0;
    let highest = -Infinity;
    let firstStepHigher = false;
    for (let step = 0; step < 64 && travelled < WIND_LEE_SEARCH_KM; step++) {
      const [x0, y0] = points[cell];
      let best = -1;
      let bestDot = 0.5;
      let bestLength = 0;
      for (const other of neighbors[cell] ?? []) {
        const dx = points[other][0] - x0;
        const dy = points[other][1] - y0;
        const length = Math.hypot(dx, dy);
        if (!length) continue;
        const dot = (dx * dirX + dy * dirY) / length;
        if (dot > bestDot) {
          bestDot = dot;
          best = other;
          bestLength = length;
        }
      }
      if (best < 0) break;
      travelled += bestLength * kmPerUnit;
      if (travelled > WIND_LEE_SEARCH_KM) break;
      if (step === 0) firstStepHigher = meters[best] > base;
      highest = Math.max(highest, meters[best]);
      cell = best;
    }
    const obstacle = highest - base;
    if (!(obstacle >= WIND_LEE_OBSTACLE_M)) return null;
    return { foehn: obstacle >= WIND_FOEHN_OBSTACLE_M && firstStepHigher };
  }
}

export interface CellWindReading {
  readonly u: number;
  readonly v: number;
  readonly speed: number;
  readonly leeSide: boolean;
  readonly foehnProne: boolean;
}

function isCell(world: WorldContext, gridCellId: number): boolean {
  const n = world.grid?.cells?.i?.length ?? 0;
  return n > 0 && Number.isInteger(gridCellId) && gridCellId >= 0 && gridCellId < n;
}

function monthIndexOf(month: number): number {
  return (((Math.round(month) - 1) % 12) + 12) % 12;
}

// Readers take an already-validated climate: ensureCellWindClimate hashes the heightmap, so each
// public entry point validates the cache once rather than once per hourly sample.
function readMean(c: CellWindClimate, cell: number, month: number): CellWindReading {
  const index = cell * 12 + monthIndexOf(month);
  const u = c.u[index];
  const v = c.v[index];
  return {
    u,
    v,
    speed: Math.hypot(u, v),
    leeSide: (c.flags[index] & WIND_FLAG_LEE) !== 0,
    foehnProne: (c.flags[index] & WIND_FLAG_FOEHN) !== 0
  };
}

function readDiurnal(c: CellWindClimate, cell: number, month: number): DiurnalWindParameters {
  const index = cell * 12 + monthIndexOf(month);
  return {
    mixAmp: c.mixAmp[index],
    breezeAmp: c.breezeAmp[index],
    breezeDirDeg: c.breezeDirDeg[cell],
    slopeAmp: c.slopeAmp[cell],
    upslopeDirDeg: c.upslopeDirDeg[cell],
    slopeNightFactor: c.slopeNightFactor[index]
  };
}

/** `month` is 1-based, matching SimulationContext.currentMonth. */
export function getCellWind(world: WorldContext, gridCellId: number, month: number): CellWindReading | null {
  return isCell(world, gridCellId) ? readMean(ensureCellWindClimate(world), gridCellId, month) : null;
}

/** §5.5 diurnal parameters for a cell and 1-based month. */
export function getCellDiurnalParameters(
  world: WorldContext,
  gridCellId: number,
  month: number
): DiurnalWindParameters | null {
  return isCell(world, gridCellId) ? readDiurnal(ensureCellWindClimate(world), gridCellId, month) : null;
}

/** Wind at a local solar `hour` (0–24) of a 1-based month: display-only, the simulation has no clock. */
export function getCellHourlyWind(world: WorldContext, gridCellId: number, month: number, hour: number) {
  if (!isCell(world, gridCellId)) return null;
  const c = ensureCellWindClimate(world);
  const w = getHourlyWindVector(readMean(c, gridCellId, month), readDiurnal(c, gridCellId, month), hour);
  return { u: w.u, v: w.v, speed: Math.hypot(w.u, w.v) };
}

/** Daily mean/max, calm share and windmill working share for a cell on a day of a 1-based month. */
export function getDailyWindStats(world: WorldContext, gridCellId: number, month: number): DailyWindStats | null {
  if (!isCell(world, gridCellId)) return null;
  const c = ensureCellWindClimate(world);
  return getDailyWindStatsFromParameters(readMean(c, gridCellId, month), readDiurnal(c, gridCellId, month));
}

/** One month (or the year) of an 8-sector wind rose. Sectors are N, NE, … NW, by direction blown FROM. */
export interface WindRoseEntry {
  /** Share of hours (0–1) per sector, excluding calm hours; sums to 1 − calmFraction. */
  readonly frequency: number[];
  /** Mean hourly speed (m/s) per sector; 0 where the sector never occurs. */
  readonly meanSpeed: number[];
  readonly calmFraction: number;
}

export interface CellWindRose {
  readonly sectors: readonly string[];
  readonly monthly: WindRoseEntry[];
  readonly annual: WindRoseEntry;
  /**
   * Bearing the wind blows TOWARD (0 = north, clockwise) of the year's cube-of-speed-weighted mean
   * hourly vector: the direction carrying most wind power, which is what a mill turns to face.
   */
  readonly prevailingTowardDeg: number;
}

const ROSE_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Monthly 8-sector rose from the 24 hourly winds of each month (§5.8 CE descriptor). */
export function getCellWindRose(world: WorldContext, gridCellId: number): CellWindRose | null {
  if (!isCell(world, gridCellId)) return null;
  const c = ensureCellWindClimate(world);
  const monthly: WindRoseEntry[] = [];
  const yearCount = new Array(8).fill(0);
  const yearSpeed = new Array(8).fill(0);
  let yearCalm = 0;
  let powerU = 0;
  let powerV = 0;
  for (let month = 1; month <= 12; month++) {
    const count = new Array(8).fill(0);
    const speedSum = new Array(8).fill(0);
    let calm = 0;
    const mean = readMean(c, gridCellId, month);
    const diurnal = readDiurnal(c, gridCellId, month);
    for (let hour = 0; hour < 24; hour++) {
      const vector = getHourlyWindVector(mean, diurnal, hour + 0.5);
      const wind = { ...vector, speed: Math.hypot(vector.u, vector.v) };
      if (wind.speed < WIND_CALM_SPEED) {
        calm++;
        continue;
      }
      const from = windVectorToFromDeg(wind.u, wind.v);
      const sector = Math.round(from / 45) % 8;
      count[sector]++;
      speedSum[sector] += wind.speed;
      const weight = wind.speed * wind.speed;
      powerU += wind.u * weight;
      powerV += wind.v * weight;
    }
    for (let s = 0; s < 8; s++) {
      yearCount[s] += count[s];
      yearSpeed[s] += speedSum[s];
    }
    yearCalm += calm;
    monthly.push(roseEntry(count, speedSum, calm, 24));
  }
  return {
    sectors: ROSE_SECTORS,
    monthly,
    annual: roseEntry(yearCount, yearSpeed, yearCalm, 24 * 12),
    prevailingTowardDeg: Math.round(windVectorToTowardDeg(powerU, powerV)) % 360
  };
}

function roseEntry(count: number[], speedSum: number[], calm: number, total: number): WindRoseEntry {
  const round = (x: number, d: number) => Math.round(x * pow(10, d)) / pow(10, d);
  return {
    frequency: count.map(c => round(c / total, 3)),
    meanSpeed: count.map((c, s) => (c ? round(speedSum[s] / c, 1) : 0)),
    calmFraction: round(calm / total, 3)
  };
}
