import type { Point } from "../../types/primitives";
import type { TerrainGrid } from "../../types/terrain";
import { CHUNK_VERTEX_COUNT, defaultRenderSpacing, type RenderSpacing, ROCK_SLOPE } from "./constants";
import { fieldGrid, fieldIndex, fieldPoint, sampleGrid } from "./sample";

const LAND_COLOR: [number, number, number] = [0.835, 0.812, 0.749];
const ROCK_COLOR: [number, number, number] = [0.541, 0.51, 0.455];

export function resolveRenderSpacing(extentMeters: number, preference: number | "auto" | null): RenderSpacing {
  if (preference === 1 || preference === 2 || preference === 4 || preference === 8) return preference;
  return defaultRenderSpacing(extentMeters);
}

/** Sample local `heightAt` onto the draw lattice. The renderer adds the shared ground offset. */
export function buildDrawGrid(
  extentMeters: number,
  spacing: RenderSpacing,
  heightAt: (point: Point) => number
): TerrainGrid {
  const grid = fieldGrid(extentMeters, spacing);
  const elevationsMeters = new Float32Array(grid.columns * grid.rows);
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++)
      elevationsMeters[fieldIndex(grid, column, row)] = heightAt(fieldPoint(grid, column, row));
  return { ...grid, elevationsMeters };
}

export interface TerrainChunkGeometry {
  positions: Float32Array;
  colors: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorAt(slope: number, out: [number, number, number]): void {
  const t = Math.max(0, Math.min(1, (slope - ROCK_SLOPE * 0.9) / (ROCK_SLOPE * 0.2)));
  out[0] = lerp(LAND_COLOR[0], ROCK_COLOR[0], t);
  out[1] = lerp(LAND_COLOR[1], ROCK_COLOR[1], t);
  out[2] = lerp(LAND_COLOR[2], ROCK_COLOR[2], t);
}

/**
 * Chunked ground. Outer chunks step across the draw grid when `suburbFactor` is greater than 1.
 * Boundaries keep the full lattice spacing so neighbouring LODs meet exactly. Only the frame has skirts.
 */
export function terrainChunkGeometry(
  grid: TerrainGrid,
  slopeAt: (point: Point) => number,
  urbanRadiusMeters: number,
  suburbFactor: number
): TerrainChunkGeometry[] {
  const chunks: TerrainChunkGeometry[] = [];
  const span = CHUNK_VERTEX_COUNT - 1;
  for (let row0 = 0; row0 < grid.rows - 1; row0 += span)
    for (let column0 = 0; column0 < grid.columns - 1; column0 += span) {
      const row1 = Math.min(grid.rows - 1, row0 + span);
      const column1 = Math.min(grid.columns - 1, column0 + span);
      const center = fieldPoint(grid, (column0 + column1) / 2, (row0 + row1) / 2);
      const step = Math.hypot(center[0], center[1]) > urbanRadiusMeters * 1.35 ? Math.max(1, suburbFactor) : 1;
      chunks.push(chunkGeometry(grid, slopeAt, column0, row0, column1, row1, step));
    }
  return chunks;
}

function chunkGeometry(
  grid: TerrainGrid,
  slopeAt: (point: Point) => number,
  column0: number,
  row0: number,
  column1: number,
  row1: number,
  step: number
): TerrainChunkGeometry {
  const columns: number[] = [];
  const rows: number[] = [];
  for (let column = column0; column < column1; column += step) columns.push(column);
  if (columns[columns.length - 1] !== column1) columns.push(column1);
  for (let row = row0; row < row1; row += step) rows.push(row);
  if (rows[rows.length - 1] !== row1) rows.push(row1);
  const width = columns.length;
  const height = rows.length;
  const skirt = 3;
  const topCount = width * height;
  const edgeCount = (width + height) * 2 - 4;
  const fineEdgeCount = (column1 - column0 + (row1 - row0)) * 2;
  const positions = new Float32Array((topCount + fineEdgeCount * 5 + edgeCount) * 3);
  const colors = new Float32Array(positions.length);
  const normals = new Float32Array(positions.length);
  const tint: [number, number, number] = [0, 0, 0];
  const heightAt = (column: number, row: number): number =>
    Number.isInteger(column) && Number.isInteger(row)
      ? grid.elevationsMeters[fieldIndex(grid, column, row)]
      : sampleGrid(grid, grid.elevationsMeters, fieldPoint(grid, column, row));
  const write = (vertex: number, column: number, row: number, drop: number, wallNormal?: number[]) => {
    const point = fieldPoint(grid, column, row);
    const elevation = heightAt(column, row) - drop;
    // Plan +y is north. three.js Z is -planY, matching planVertex.
    positions[vertex * 3] = point[0];
    positions[vertex * 3 + 1] = elevation;
    positions[vertex * 3 + 2] = -point[1];
    colorAt(slopeAt(point), tint);
    colors[vertex * 3] = tint[0];
    colors[vertex * 3 + 1] = tint[1];
    colors[vertex * 3 + 2] = tint[2];
    // Sample the shared lattice, independent of chunk boundaries and local LOD.
    const left = Math.max(0, column - 1),
      right = Math.min(grid.columns - 1, column + 1);
    const down = Math.max(0, row - 1),
      up = Math.min(grid.rows - 1, row + 1);
    const dx = (heightAt(right, row) - heightAt(left, row)) / ((right - left) * grid.sampleMeters);
    const dy = (heightAt(column, up) - heightAt(column, down)) / ((up - down) * grid.sampleMeters);
    const normal = wallNormal ?? [-dx, 1, dy];
    const length = Math.hypot(...normal);
    for (let channel = 0; channel < 3; channel++) normals[vertex * 3 + channel] = normal[channel] / length;
  };
  let vertex = 0;
  for (const row of rows) for (const column of columns) write(vertex++, column, row, 0);
  const indices: number[] = [];
  const add = (column: number, row: number): number => {
    const id = vertex++;
    write(id, column, row, 0);
    return id;
  };
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x,
        b = a + 1,
        c = a + width + 1,
        d = a + width;
      if (step === 1 || (x > 0 && x < width - 2 && y > 0 && y < height - 2)) {
        indices.push(a, b, d, b, c, d);
        continue;
      }
      // Refine only the chunk boundary, leaving the interior at its chosen LOD.
      const ring = [a];
      if (y === 0) for (let column = columns[x] + 1; column < columns[x + 1]; column++) ring.push(add(column, rows[y]));
      ring.push(b);
      if (x === width - 2) for (let row = rows[y] + 1; row < rows[y + 1]; row++) ring.push(add(columns[x + 1], row));
      ring.push(c);
      if (y === height - 2)
        for (let column = columns[x + 1] - 1; column > columns[x]; column--) ring.push(add(column, rows[y + 1]));
      ring.push(d);
      if (x === 0) for (let row = rows[y + 1] - 1; row > rows[y]; row--) ring.push(add(columns[x], row));
      if (ring.length === 4) indices.push(a, b, d, b, c, d);
      else {
        const center = add((columns[x] + columns[x + 1]) / 2, (rows[y] + rows[y + 1]) / 2);
        for (let i = 0; i < ring.length; i++) indices.push(center, ring[i], ring[(i + 1) % ring.length]);
      }
    }
  // Internal skirts show through at oblique, distant views. Stitched edges need no hidden walls.
  const skirtEdge = (column: number, row: number, nextColumn: number, nextRow: number) => {
    const a = fieldPoint(grid, column, row),
      b = fieldPoint(grid, nextColumn, nextRow);
    const wallNormal = [b[1] - a[1], 0, b[0] - a[0]];
    const start = vertex;
    write(vertex++, column, row, 0, wallNormal);
    write(vertex++, nextColumn, nextRow, 0, wallNormal);
    write(vertex++, column, row, skirt, wallNormal);
    write(vertex++, nextColumn, nextRow, skirt, wallNormal);
    indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
  };
  if (row0 === 0) for (let column = column0; column < column1; column++) skirtEdge(column, row0, column + 1, row0);
  if (column1 === grid.columns - 1) for (let row = row0; row < row1; row++) skirtEdge(column1, row, column1, row + 1);
  if (row1 === grid.rows - 1)
    for (let column = column1; column > column0; column--) skirtEdge(column, row1, column - 1, row1);
  if (column0 === 0) for (let row = row1; row > row0; row--) skirtEdge(column0, row, column0, row - 1);
  return {
    positions: positions.slice(0, vertex * 3),
    colors: colors.slice(0, vertex * 3),
    normals: normals.slice(0, vertex * 3),
    indices: Uint32Array.from(indices)
  };
}

/** Largest gap between the draw grid's straight edges and `heightAt` at those midpoints. */
export function drawSeamError(grid: TerrainGrid, heightAt: (point: Point) => number): { max: number; p95: number } {
  const errors: number[] = [];
  const stride = Math.max(1, Math.floor(grid.columns / 48));
  for (let row = 0; row < grid.rows - 1; row += stride)
    for (let column = 0; column < grid.columns - 1; column += stride) {
      const a = fieldPoint(grid, column, row);
      const b = fieldPoint(grid, column + 1, row);
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const mesh =
        (grid.elevationsMeters[fieldIndex(grid, column, row)] +
          grid.elevationsMeters[fieldIndex(grid, column + 1, row)]) /
        2;
      errors.push(Math.abs(mesh - heightAt(mid)));
    }
  errors.sort((a, b) => a - b);
  return {
    max: errors[errors.length - 1] ?? 0,
    p95: errors[Math.min(errors.length - 1, Math.floor(errors.length * 0.95))] ?? 0
  };
}
