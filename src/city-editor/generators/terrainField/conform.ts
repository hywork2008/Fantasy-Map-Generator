import type { Point } from "../../types/primitives";
import type { TerrainField, TerrainFieldPart } from "../../types/terrain";
import { pointInPolygon } from "../geom";
import { applyParts } from "./parts";
import { fieldGrid, fieldIndex, fieldPoint, sampleGrid } from "./sample";

const SHORE_BAND_METERS = 16;

export interface WaterRing {
  polygon: Point[];
  elevation: number;
}

export interface RiverCarve {
  points: Point[];
  widthMeters: number;
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
}

function ringDistance(point: Point, ring: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, segmentDistance(point, ring[i], ring[(i + 1) % ring.length]));
  return best;
}

function bounds(ring: readonly Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return { minX, minY, maxX, maxY };
}

/** Inside a water ring the ground is below the water; outside it stays above. The shore band eases down to the water. */
export function conformWater(field: TerrainField, rings: readonly WaterRing[]): void {
  if (!rings.length) return;
  const boxes = rings.map(ring => bounds(ring.polygon));
  const values = field.elevationsMeters;
  for (let row = 0; row < field.rows; row++)
    for (let column = 0; column < field.columns; column++) {
      const point = fieldPoint(field, column, row);
      let inside: WaterRing | undefined;
      let nearest = Infinity;
      let nearestRing: WaterRing | undefined;
      for (let i = 0; i < rings.length; i++) {
        const box = boxes[i];
        if (
          point[0] < box.minX - SHORE_BAND_METERS ||
          point[0] > box.maxX + SHORE_BAND_METERS ||
          point[1] < box.minY - SHORE_BAND_METERS ||
          point[1] > box.maxY + SHORE_BAND_METERS
        )
          continue;
        const distance = ringDistance(point, rings[i].polygon);
        if (distance < nearest) {
          nearest = distance;
          nearestRing = rings[i];
        }
        if (!inside && distance <= field.sampleMeters && pointInPolygon(point, rings[i].polygon)) inside = rings[i];
      }
      // A point well inside has a large distance to the ring, so test containment when the box hits.
      if (!inside)
        for (let i = 0; i < rings.length; i++) {
          const box = boxes[i];
          if (point[0] < box.minX || point[0] > box.maxX || point[1] < box.minY || point[1] > box.maxY) continue;
          if (pointInPolygon(point, rings[i].polygon)) {
            inside = rings[i];
            break;
          }
        }
      const index = fieldIndex(field, column, row);
      if (inside) {
        values[index] = Math.min(values[index], inside.elevation - 0.8);
        continue;
      }
      if (!nearestRing || nearest > SHORE_BAND_METERS) continue;
      const shore = nearestRing.elevation + 0.35;
      const blended = shore + (values[index] - shore) * (nearest / SHORE_BAND_METERS);
      values[index] = Math.max(shore, Math.min(values[index], blended));
    }
}

function polylineSamples(points: readonly Point[], step: number): Point[] {
  if (points.length < 2) return [...points];
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.ceil(length / step));
    for (let s = 1; s <= count; s++) out.push([a[0] + ((b[0] - a[0]) * s) / count, a[1] + ((b[1] - a[1]) * s) / count]);
  }
  return out;
}

/** Carve a valley that keeps falling from the first point to the last. */
export function carveRivers(field: TerrainField, rivers: readonly RiverCarve[]): void {
  const values = field.elevationsMeters;
  for (const river of rivers) {
    if (river.points.length < 2) continue;
    const samples = polylineSamples(river.points, field.sampleMeters);
    const depth = Math.max(1.4, river.widthMeters * 0.1);
    const bed: number[] = [];
    let height = sampleGrid(field, values, samples[0]) - depth;
    bed.push(height);
    for (let i = 1; i < samples.length; i++) {
      const run = Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
      const ground = sampleGrid(field, values, samples[i]) - depth;
      height = Math.min(ground, height - Math.max(0.05, run * 0.002));
      bed.push(height);
    }
    const reach = river.widthMeters / 2 + 6;
    for (let i = 0; i < samples.length; i++) {
      const point = samples[i];
      const column0 = Math.max(0, Math.floor((point[0] - reach - field.origin[0]) / field.sampleMeters));
      const column1 = Math.min(field.columns - 1, Math.ceil((point[0] + reach - field.origin[0]) / field.sampleMeters));
      const row0 = Math.max(0, Math.floor((point[1] - reach - field.origin[1]) / field.sampleMeters));
      const row1 = Math.min(field.rows - 1, Math.ceil((point[1] + reach - field.origin[1]) / field.sampleMeters));
      for (let row = row0; row <= row1; row++)
        for (let column = column0; column <= column1; column++) {
          const at = fieldPoint(field, column, row);
          const distance = Math.hypot(at[0] - point[0], at[1] - point[1]);
          if (distance > reach) continue;
          const index = fieldIndex(field, column, row);
          const half = Math.max(river.widthMeters / 2, field.sampleMeters);
          if (distance <= half) values[index] = Math.min(values[index], bed[i]);
          else {
            const t = (distance - half) / Math.max(1e-6, reach - half);
            values[index] = Math.min(values[index], bed[i] * (1 - t) + values[index] * t);
          }
        }
    }
  }
}

export interface CoarseHeightfield {
  origin: Point;
  spacingMeters: number;
  columns: number;
  rows: number;
  elevationsMeters: number[];
}

/** Low-frequency error of `field` against a coarse lattice: fine neighbourhood mean minus the coarse value. */
export function lowFrequencyError(field: TerrainField, coarse: CoarseHeightfield): number[] {
  const error = new Array<number>(coarse.columns * coarse.rows);
  const reach = coarse.spacingMeters / 2;
  for (let row = 0; row < coarse.rows; row++)
    for (let column = 0; column < coarse.columns; column++) {
      const origin = coarse.origin;
      const point: Point = [origin[0] + column * coarse.spacingMeters, origin[1] + row * coarse.spacingMeters];
      const column0 = Math.max(0, Math.floor((point[0] - reach - field.origin[0]) / field.sampleMeters));
      const column1 = Math.min(field.columns - 1, Math.ceil((point[0] + reach - field.origin[0]) / field.sampleMeters));
      const row0 = Math.max(0, Math.floor((point[1] - reach - field.origin[1]) / field.sampleMeters));
      const row1 = Math.min(field.rows - 1, Math.ceil((point[1] + reach - field.origin[1]) / field.sampleMeters));
      let sum = 0;
      let count = 0;
      for (let y = row0; y <= row1; y++)
        for (let x = column0; x <= column1; x++) {
          sum += field.elevationsMeters[fieldIndex(field, x, y)];
          count++;
        }
      const coarseValue = coarse.elevationsMeters[row * coarse.columns + column] ?? 0;
      error[row * coarse.columns + column] = (count ? sum / count : coarseValue) - coarseValue;
    }
  return error;
}

/** Grid produced by parts alone, before water and rivers. */
export function fieldFromParts(
  extentMeters: number,
  sampleMeters: number,
  parts: readonly TerrainFieldPart[]
): TerrainField {
  const grid = fieldGrid(extentMeters, sampleMeters);
  const elevationsMeters = new Float32Array(grid.columns * grid.rows);
  applyParts(grid, elevationsMeters, parts);
  return { ...grid, elevationsMeters };
}
