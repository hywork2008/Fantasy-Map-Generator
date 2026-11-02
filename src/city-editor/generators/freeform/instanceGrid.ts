import type { Point } from "../../types/primitives";

/** One instanced mesh per model per cell, so distant cells can be left undrawn. */
export const INSTANCE_CELL_METERS = 128;

export function instanceCell(point: Point, cellMeters = INSTANCE_CELL_METERS): [number, number] {
  return [Math.floor(point[0] / cellMeters), Math.floor(point[1] / cellMeters)];
}

export function instanceCellKey(point: Point, cellMeters = INSTANCE_CELL_METERS): string {
  const [column, row] = instanceCell(point, cellMeters);
  return `${column}:${row}`;
}
