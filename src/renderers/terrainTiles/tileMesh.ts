/**
 * Ground mesh of one terrain tile (docs/plan/japan-terrain-tiles.md). Pure arrays, no three.js.
 * The grid includes both edges; a skirt hangs below the edge so neighbours on another level
 * do not show cracks.
 */
import { applyHillshade } from "../campaignMesh";

export interface TileMeshInput {
  /** (samples + 2·border)² heights, row-major from the north-west corner. */
  data: Int16Array;
  /** Extra samples stored on every side, used only for shading. */
  border?: number;
  samples: number;
  unitMeters: number;
  nodata: number;
  /** World position of the north-west sample and the world step per sample. */
  originX: number;
  originZ: number;
  stepX: number;
  stepZ: number;
  /** World units per meter of height (exaggeration included). */
  worldYPerMeter: number;
  /** Skirt depth below the edge, in meters. */
  skirtMeters: number;
  hillshade?: boolean;
}

export interface TileMeshArrays {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
}

/** DEM above this is land, as in the local terrain coast. */
const LAND_METERS = 0.5;
export const TILE_WATER_COLOR: readonly [number, number, number] = [0.2, 0.38, 0.55];
const WATER = TILE_WATER_COLOR;
const RAMP: readonly (readonly [number, number, number, number])[] = [
  [0, 0.36, 0.52, 0.3],
  [400, 0.5, 0.58, 0.34],
  [1200, 0.56, 0.48, 0.33],
  [2200, 0.6, 0.56, 0.52],
  [3200, 0.93, 0.93, 0.93]
];

export function tileLandColor(meters: number): [number, number, number] {
  if (meters <= RAMP[0][0]) return [RAMP[0][1], RAMP[0][2], RAMP[0][3]];
  for (let i = 1; i < RAMP.length; i++) {
    const [m1, r1, g1, b1] = RAMP[i];
    if (meters <= m1) {
      const [m0, r0, g0, b0] = RAMP[i - 1];
      const t = (meters - m0) / (m1 - m0);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
    }
  }
  const last = RAMP[RAMP.length - 1];
  return [last[1], last[2], last[3]];
}

/** Perimeter sample indexes, clockwise from the north-west corner, each corner once. */
function perimeter(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) out.push(i);
  for (let j = 0; j < n - 1; j++) out.push(j * n + n - 1);
  for (let i = n - 1; i > 0; i--) out.push((n - 1) * n + i);
  for (let j = n - 1; j > 0; j--) out.push(j * n);
  return out;
}

export function buildTileMesh(input: TileMeshInput): TileMeshArrays {
  const n = input.samples;
  const grid = n * n;
  const ring = perimeter(n);
  const vertexCount = grid + ring.length;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  // The stored grid may carry `border` extra samples per side: shade with them, then drop them.
  const b = Math.max(0, input.border ?? 0);
  const stored = n + 2 * b;
  const padPositions = b ? new Float32Array(stored * stored * 3) : positions;
  const padColors = b ? new Float32Array(stored * stored * 3) : colors;
  for (let j = 0; j < stored; j++)
    for (let i = 0; i < stored; i++) {
      const k = j * stored + i;
      const raw = input.data[k];
      const meters = raw === input.nodata ? 0 : raw * input.unitMeters;
      const land = meters > LAND_METERS;
      padPositions[k * 3] = input.originX + (i - b) * input.stepX;
      padPositions[k * 3 + 1] = Math.max(0, meters) * input.worldYPerMeter;
      padPositions[k * 3 + 2] = input.originZ + (j - b) * input.stepZ;
      const color = land ? tileLandColor(meters) : WATER;
      padColors[k * 3] = color[0];
      padColors[k * 3 + 1] = color[1];
      padColors[k * 3 + 2] = color[2];
    }
  if (input.hillshade !== false)
    applyHillshade(
      padPositions.subarray(0, stored * stored * 3),
      padColors.subarray(0, stored * stored * 3),
      stored,
      stored
    );
  if (b)
    for (let j = 0; j < n; j++) {
      const from = ((j + b) * stored + b) * 3;
      positions.set(padPositions.subarray(from, from + n * 3), j * n * 3);
      colors.set(padColors.subarray(from, from + n * 3), j * n * 3);
    }
  const drop = input.skirtMeters * input.worldYPerMeter;
  ring.forEach((k, r) => {
    const v = (grid + r) * 3;
    positions[v] = positions[k * 3];
    positions[v + 1] = positions[k * 3 + 1] - drop;
    positions[v + 2] = positions[k * 3 + 2];
    colors[v] = colors[k * 3] * 0.7;
    colors[v + 1] = colors[k * 3 + 1] * 0.7;
    colors[v + 2] = colors[k * 3 + 2] * 0.7;
  });

  const triangles = (n - 1) * (n - 1) * 2 + ring.length * 2;
  const indices = vertexCount <= 65535 ? new Uint16Array(triangles * 3) : new Uint32Array(triangles * 3);
  let t = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], t);
      t += 6;
    }
  for (let r = 0; r < ring.length; r++) {
    const top0 = ring[r];
    const top1 = ring[(r + 1) % ring.length];
    const low0 = grid + r;
    const low1 = grid + ((r + 1) % ring.length);
    indices.set([top0, top1, low0, top1, low1, low0], t);
    t += 6;
  }
  return { positions, colors, indices, vertexCount };
}
