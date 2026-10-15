/**
 * Per-grid-cell monthly mean surface wind (docs/plan/wind-aspect-climate-variability.md §5, W1):
 * season-shifted band wind with boundary blending, then surface roughness, exposure and lee
 * shelter. Runtime-only derived values: nothing here is saved, and generation outputs
 * (temp / prec / ocean currents) are never read back or rewritten.
 *
 * Terrain scans (land fraction, exposure) run once per geography; only the band wind and the
 * upwind lee walk depend on the month, and all 12 months are built together and cached.
 */

import type { WorldContext } from "../context/worldContext";
import { getEarthCoordinatesAtMapPoint } from "../data/earthConfig";
import { useOptionsState } from "../store/optionsState";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { getDayOfYear, getDaysInMonth } from "../utils/seasonUtils";
import {
  getExposureFactor,
  getZonalWindVector,
  WIND_FOEHN_OBSTACLE_M,
  WIND_LEE_FACTOR,
  WIND_LEE_OBSTACLE_M,
  WIND_LEE_SEARCH_KM,
  WIND_ROUGHNESS_COAST,
  WIND_ROUGHNESS_LAND
} from "../utils/windClimate";

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
    options.winds,
    options.axialTilt,
    distanceScale,
    exponent
  ]);
}

/** Box mean over a row-major raster, separable, repeated twice (≈ triangular kernel). O(n). */
function boxBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return values.slice();
  let source = values;
  for (let pass = 0; pass < 2; pass++) {
    const horizontal = new Float32Array(source.length);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let k = Math.max(0, x - radius); k <= Math.min(width - 1, x + radius); k++) {
          sum += source[row + k];
          count++;
        }
        horizontal[row + x] = sum / count;
      }
    }
    const vertical = new Float32Array(source.length);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0;
        let count = 0;
        for (let k = Math.max(0, y - radius); k <= Math.min(height - 1, y + radius); k++) {
          sum += horizontal[k * width + x];
          count++;
        }
        vertical[y * width + x] = sum / count;
      }
    }
    source = vertical;
  }
  return source;
}

function latitudeOf(world: WorldContext, cell: number): number {
  const coordinates = getEarthCoordinatesAtMapPoint(world, world.grid.points[cell]);
  if (coordinates) return coordinates.latitude;
  const { latN = 0, latT = 0 } = world.mapCoordinates;
  return latN - (world.grid.points[cell][1] / world.graphHeight) * latT;
}

export function ensureCellWindClimate(world: WorldContext): CellWindClimate {
  const exponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
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

  const u = new Float32Array(n * 12);
  const v = new Float32Array(n * 12);
  const flags = new Uint8Array(n * 12);
  const daysInYear = 365;
  for (let m = 0; m < 12; m++) {
    const day = getDayOfYear(REFERENCE_YEAR, m + 1, Math.ceil(getDaysInMonth(REFERENCE_YEAR, m + 1) / 2)) - 1;
    for (let cell = 0; cell < n; cell++) {
      const zonal = getZonalWindVector(winds, latitudes[cell], day, daysInYear, landFraction[cell], axialTilt);
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

  const result: CellWindClimate = { key, u, v, flags, landFraction, exposure };
  cache.set(world, result);
  return result;

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

/** `month` is 1-based, matching SimulationContext.currentMonth. */
export function getCellWind(world: WorldContext, gridCellId: number, month: number): CellWindReading | null {
  const n = world.grid?.cells?.i?.length ?? 0;
  if (!n || !Number.isInteger(gridCellId) || gridCellId < 0 || gridCellId >= n) return null;
  const climate = ensureCellWindClimate(world);
  const index = gridCellId * 12 + ((((Math.round(month) - 1) % 12) + 12) % 12);
  const u = climate.u[index];
  const v = climate.v[index];
  return {
    u,
    v,
    speed: Math.hypot(u, v),
    leeSide: (climate.flags[index] & WIND_FLAG_LEE) !== 0,
    foehnProne: (climate.flags[index] & WIND_FLAG_FOEHN) !== 0
  };
}
