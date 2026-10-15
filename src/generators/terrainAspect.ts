/**
 * Per-grid-cell slope aspect and its temperature effect
 * (docs/plan/wind-aspect-climate-variability.md §3.2–3.4).
 *
 * A grid cell is tens of km across, so it cannot resolve one hillside. Three quantities are
 * kept apart:
 * - aspect: downhill direction of a least-squares plane through the neighbours (which flank
 *   of the massif the cell sits on);
 * - effective slope: steepness implied by the local relief over a representative hillside
 *   length, since the cell-scale gradient of a mountain range is only a few degrees;
 * - dominance: how one-sided the neighbourhood is (1 on a uniform flank, ~0 on a ridge or
 *   summit that contains both faces), weighting the offset.
 * Low hills get small offsets through small relief, not through an elevation cut-off.
 */

import { heightToMeters } from "../utils/height";
import { getAnnualMeanOfMonthlyC, getMonthlySlopeTemperatureOffsetsC } from "../utils/slopeInsolation";

/** Representative hillside horizontal length used to turn relief into slope. Uncalibrated. */
export const HILLSIDE_LENGTH_M = 5000;
export const MAX_EFFECTIVE_SLOPE_DEG = 35;
const MIN_RELIEF_M = 1;
const LAND_HEIGHT = 20;

export interface TerrainAspectInput {
  readonly points: ArrayLike<readonly [number, number] | number[]>;
  readonly neighbors: ArrayLike<ArrayLike<number>>;
  readonly heights: ArrayLike<number>;
  /** Map units → km. Non-positive or non-finite disables the effect. */
  readonly kmPerUnit: number;
  readonly heightExponent: number;
  readonly latitudeOf: (cell: number) => number;
  readonly axialTiltDeg: number;
}

export interface TerrainAspectResult {
  readonly aspectDeg: Float32Array;
  readonly slopeDeg: Float32Array;
  readonly dominance: Float32Array;
  /** Month-major per cell: index cell * 12 + month. Already weighted by dominance. */
  readonly monthlyOffsetC: Float32Array;
  readonly annualOffsetC: Float32Array;
}

export function computeTerrainAspect(input: TerrainAspectInput): TerrainAspectResult {
  const { points, neighbors, heights, kmPerUnit, heightExponent, latitudeOf, axialTiltDeg } = input;
  const n = heights.length;
  const aspectDeg = new Float32Array(n);
  const slopeDeg = new Float32Array(n);
  const dominance = new Float32Array(n);
  const monthlyOffsetC = new Float32Array(n * 12);
  const annualOffsetC = new Float32Array(n);
  if (!(kmPerUnit > 0) || !Number.isFinite(kmPerUnit))
    return { aspectDeg, slopeDeg, dominance, monthlyOffsetC, annualOffsetC };

  const meters = (cell: number) => heightToMeters(heights[cell] ?? 0, heightExponent);

  for (let cell = 0; cell < n; cell++) {
    if ((heights[cell] ?? 0) < LAND_HEIGHT) continue;
    const around = neighbors[cell];
    if (!around || around.length < 2) continue;
    const [x0, y0] = points[cell];
    const z0 = meters(cell);
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    let sxz = 0;
    let syz = 0;
    let spacing = 0;
    let low = z0;
    let high = z0;
    for (let k = 0; k < around.length; k++) {
      const other = around[k];
      const [x1, y1] = points[other];
      const dx = (x1 - x0) * kmPerUnit;
      const dy = -(y1 - y0) * kmPerUnit; // screen y grows southward
      const z = meters(other);
      const dz = z - z0;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
      sxz += dx * dz;
      syz += dy * dz;
      spacing += Math.hypot(dx, dy);
      if (z < low) low = z;
      if (z > high) high = z;
    }
    const relief = high - low;
    const det = sxx * syy - sxy * sxy;
    if (relief < MIN_RELIEF_M || !(Math.abs(det) > 1e-9)) continue;
    // Gradient in m/km toward east (gx) and north (gy).
    const gx = (syy * sxz - sxy * syz) / det;
    const gy = (sxx * syz - sxy * sxz) / det;
    const gradient = Math.hypot(gx, gy);
    if (!(gradient > 0)) continue;
    spacing /= around.length;

    const aspect = (Math.atan2(-gx, -gy) * 180) / Math.PI;
    aspectDeg[cell] = (aspect + 360) % 360;
    slopeDeg[cell] = Math.min(MAX_EFFECTIVE_SLOPE_DEG, (Math.atan(relief / HILLSIDE_LENGTH_M) * 180) / Math.PI);
    dominance[cell] = Math.min(1, (gradient * 2 * spacing) / relief);

    const offsets = getMonthlySlopeTemperatureOffsetsC(latitudeOf(cell), slopeDeg[cell], aspectDeg[cell], axialTiltDeg);
    for (let m = 0; m < 12; m++) monthlyOffsetC[cell * 12 + m] = offsets[m] * dominance[cell];
    annualOffsetC[cell] = getAnnualMeanOfMonthlyC(monthlyOffsetC.subarray(cell * 12, cell * 12 + 12));
  }
  return { aspectDeg, slopeDeg, dominance, monthlyOffsetC, annualOffsetC };
}

/** Subset of WorldContext this module reads; kept structural so tests can pass plain fixtures. */
export interface TerrainAspectWorld {
  readonly graphHeight: number;
  readonly distanceScale?: number;
  readonly mapCoordinates: { readonly latN?: number; readonly latT?: number };
  readonly options: { readonly axialTilt?: number };
  readonly grid: {
    readonly points: ArrayLike<readonly [number, number] | number[]>;
    readonly cells: { readonly c?: ArrayLike<ArrayLike<number>>; readonly h?: ArrayLike<number> };
  };
}

export function computeWorldTerrainAspect(world: TerrainAspectWorld, heightExponent: number): TerrainAspectResult {
  const { grid, mapCoordinates, graphHeight } = world;
  const latN = mapCoordinates.latN ?? 0;
  const latT = mapCoordinates.latT ?? 0;
  return computeTerrainAspect({
    points: grid.points,
    neighbors: grid.cells.c ?? [],
    heights: grid.cells.h ?? [],
    kmPerUnit: world.distanceScale ?? 0,
    heightExponent,
    latitudeOf: cell => latN - (grid.points[cell][1] / graphHeight) * latT,
    axialTiltDeg: world.options.axialTilt ?? 23.5
  });
}
