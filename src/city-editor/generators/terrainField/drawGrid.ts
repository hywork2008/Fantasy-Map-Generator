import type { Point } from "../../types/primitives";
import type { TerrainGrid } from "../../types/terrain";
import { CHUNK_VERTEX_COUNT, defaultRenderSpacing, type RenderSpacing } from "./constants";
import { fieldGrid, fieldIndex, fieldPoint } from "./sample";

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
  indices: Uint32Array;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorAt(slope: number, out: [number, number, number]): void {
  const t = Math.max(0, Math.min(1, (slope - 0.7) / 0.3));
  out[0] = lerp(LAND_COLOR[0], ROCK_COLOR[0], t);
  out[1] = lerp(LAND_COLOR[1], ROCK_COLOR[1], t);
  out[2] = lerp(LAND_COLOR[2], ROCK_COLOR[2], t);
}

/**
 * Chunked ground. Outer chunks step across the draw grid when `suburbFactor` is greater than 1.
 * Each chunk grows a short skirt so a coarser neighbour cannot open a crack.
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
  const skirt = 1.5;
  const topCount = width * height;
  const positions = new Float32Array((topCount + (width + height) * 2) * 3);
  const colors = new Float32Array((topCount + (width + height) * 2) * 3);
  const tint: [number, number, number] = [0, 0, 0];
  const write = (vertex: number, column: number, row: number, drop: number) => {
    const point = fieldPoint(grid, column, row);
    const elevation = grid.elevationsMeters[fieldIndex(grid, column, row)] - drop;
    // Plan +y is north. three.js Z is -planY, matching planVertex.
    positions[vertex * 3] = point[0];
    positions[vertex * 3 + 1] = elevation;
    positions[vertex * 3 + 2] = -point[1];
    colorAt(slopeAt(point), tint);
    colors[vertex * 3] = tint[0];
    colors[vertex * 3 + 1] = tint[1];
    colors[vertex * 3 + 2] = tint[2];
  };
  let vertex = 0;
  for (const row of rows) for (const column of columns) write(vertex++, column, row, 0);
  const indices: number[] = [];
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x;
      indices.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
    }
  const skirtStart = vertex;
  const edge: Array<[number, number]> = [];
  for (let x = 0; x < width; x++) edge.push([x, 0]);
  for (let y = 1; y < height; y++) edge.push([width - 1, y]);
  for (let x = width - 2; x >= 0; x--) edge.push([x, height - 1]);
  for (let y = height - 2; y > 0; y--) edge.push([0, y]);
  for (const [x, y] of edge) write(vertex++, columns[x], rows[y], skirt);
  for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    const topA = edge[i][1] * width + edge[i][0];
    const topB = edge[next][1] * width + edge[next][0];
    const lowA = skirtStart + i;
    const lowB = skirtStart + next;
    indices.push(topA, lowA, topB, topB, lowA, lowB);
  }
  return { positions, colors, indices: Uint32Array.from(indices) };
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
