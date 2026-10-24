import type { Point } from "../../types/primitives";
import type { TerrainField } from "../../types/terrain";

export interface FieldGrid {
  origin: Point;
  sampleMeters: number;
  columns: number;
  rows: number;
}

/** Centered lattice that covers `extentMeters` at a constant spacing. */
export function fieldGrid(extentMeters: number, sampleMeters: number): FieldGrid {
  const columns = Math.max(2, Math.floor(extentMeters / sampleMeters) + 1);
  const span = (columns - 1) * sampleMeters;
  return { origin: [-span / 2, -span / 2], sampleMeters, columns, rows: columns };
}

export function fieldIndex(grid: FieldGrid, column: number, row: number): number {
  return row * grid.columns + column;
}

export function fieldPoint(grid: FieldGrid, column: number, row: number): Point {
  return [grid.origin[0] + column * grid.sampleMeters, grid.origin[1] + row * grid.sampleMeters];
}

/** Bilinear sample. Outside the lattice, the edge value is repeated. */
export function sampleGrid(grid: FieldGrid, values: ArrayLike<number>, point: Point): number {
  const x = (point[0] - grid.origin[0]) / grid.sampleMeters;
  const y = (point[1] - grid.origin[1]) / grid.sampleMeters;
  const x0 = Math.max(0, Math.min(grid.columns - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(grid.rows - 2, Math.floor(y)));
  const tx = Math.max(0, Math.min(1, x - x0));
  const ty = Math.max(0, Math.min(1, y - y0));
  const i = y0 * grid.columns + x0;
  const row = grid.columns;
  return (
    (values[i] * (1 - tx) + values[i + 1] * tx) * (1 - ty) +
    (values[i + row] * (1 - tx) + values[i + row + 1] * tx) * ty
  );
}

export function sampleField(field: TerrainField, point: Point): number {
  return sampleGrid(field, field.elevationsMeters, point);
}

/** Rise/run from central differences on the lattice. */
export function slopeGrid(grid: FieldGrid, values: ArrayLike<number>, point: Point, step = grid.sampleMeters): number {
  const zx =
    (sampleGrid(grid, values, [point[0] + step, point[1]]) - sampleGrid(grid, values, [point[0] - step, point[1]])) /
    (2 * step);
  const zy =
    (sampleGrid(grid, values, [point[0], point[1] + step]) - sampleGrid(grid, values, [point[0], point[1] - step])) /
    (2 * step);
  return Math.hypot(zx, zy);
}

export function slopeField(field: TerrainField, point: Point): number {
  return slopeGrid(field, field.elevationsMeters, point, Math.min(1, field.sampleMeters));
}

export function highestSample(field: TerrainField): { point: Point; elevation: number } {
  let best = -Infinity;
  let index = 0;
  const values = field.elevationsMeters;
  for (let i = 0; i < values.length; i++)
    if (values[i] > best) {
      best = values[i];
      index = i;
    }
  const column = index % field.columns;
  const row = (index - column) / field.columns;
  return { point: fieldPoint(field, column, row), elevation: best };
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
