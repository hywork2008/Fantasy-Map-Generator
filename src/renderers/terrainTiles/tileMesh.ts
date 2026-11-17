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
  /**
   * Recolour a vertex before shading (map colours, dimming outside chosen prefectures):
   * world x/z, whether it is land, and the RGB triple at `colors[offset..offset+2]`.
   */
  adjustColor?: (x: number, z: number, land: boolean, colors: Float32Array, offset: number) => void;
  /** Reshape land heights (valleys along FMG rivers): world x/z and DEM meters in, meters out. */
  adjustMeters?: (x: number, z: number, meters: number) => number;
  /** Land colouring by height (and slope); defaults to the Japan palette. */
  palette?: TilePalette;
  /** Ground distance between samples in meters, for slopes (`palette.rock`). */
  stepMeters?: number;
}

/** Height ramp [meters, r, g, b] and optional bare rock on steep slopes. */
export interface TilePalette {
  ramp: readonly (readonly [number, number, number, number])[];
  /** Slopes from `fromDeg` blend into `color`, fully at `toDeg`. */
  rock?: { color: readonly [number, number, number]; fromDeg: number; toDeg: number };
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

/** Japan: green lowland, brown mountains, grey and white only on the highest summits. */
export const JAPAN_TILE_PALETTE: TilePalette = { ramp: RAMP };

/**
 * Alps: forest and meadow green up to about 2,000 m, scree and rock to 3,000 m, snow and ice above;
 * steep slopes (cliffs, horns) are bare rock whatever their height.
 */
export const ALPINE_TILE_PALETTE: TilePalette = {
  ramp: [
    [0, 0.36, 0.52, 0.3],
    [800, 0.4, 0.55, 0.32],
    [1800, 0.32, 0.45, 0.27],
    [2300, 0.55, 0.54, 0.4],
    [2800, 0.58, 0.56, 0.52],
    [3300, 0.93, 0.94, 0.96]
  ],
  rock: { color: [0.5, 0.47, 0.43], fromDeg: 28, toDeg: 42 }
};

export function tileLandColor(meters: number, ramp: TilePalette["ramp"] = RAMP): [number, number, number] {
  if (meters <= ramp[0][0]) return [ramp[0][1], ramp[0][2], ramp[0][3]];
  for (let i = 1; i < ramp.length; i++) {
    const [m1, r1, g1, b1] = ramp[i];
    if (meters <= m1) {
      const [m0, r0, g0, b0] = ramp[i - 1];
      const t = (meters - m0) / (m1 - m0);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
    }
  }
  const last = ramp[ramp.length - 1];
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
  const ramp = input.palette?.ramp ?? RAMP;
  for (let j = 0; j < stored; j++)
    for (let i = 0; i < stored; i++) {
      const k = j * stored + i;
      const raw = input.data[k];
      const x = input.originX + (i - b) * input.stepX;
      const z = input.originZ + (j - b) * input.stepZ;
      const dem = raw === input.nodata ? 0 : raw * input.unitMeters;
      const land = dem > LAND_METERS;
      // Valleys only lower land; they never reach below the land threshold.
      const meters = land && input.adjustMeters ? Math.max(LAND_METERS, input.adjustMeters(x, z, dem)) : dem;
      padPositions[k * 3] = x;
      padPositions[k * 3 + 1] = Math.max(0, meters) * input.worldYPerMeter;
      padPositions[k * 3 + 2] = z;
      const color = land ? tileLandColor(meters, ramp) : WATER;
      padColors[k * 3] = color[0];
      padColors[k * 3 + 1] = color[1];
      padColors[k * 3 + 2] = color[2];
      input.adjustColor?.(padPositions[k * 3], padPositions[k * 3 + 2], land, padColors, k * 3);
    }
  const rock = input.palette?.rock;
  if (rock && input.stepMeters && input.stepMeters > 0 && input.worldYPerMeter > 0) {
    // Slope from the heights as drawn (valleys included), central differences inside the stored grid.
    const step = input.stepMeters;
    const tanFrom = Math.tan((rock.fromDeg * Math.PI) / 180);
    const tanTo = Math.tan((rock.toDeg * Math.PI) / 180);
    const h = (i: number, j: number) => padPositions[(j * stored + i) * 3 + 1] / input.worldYPerMeter;
    for (let j = 0; j < stored; j++)
      for (let i = 0; i < stored; i++) {
        const k = j * stored + i;
        if (!(h(i, j) > LAND_METERS)) continue;
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(stored - 1, i + 1);
        const j0 = Math.max(0, j - 1);
        const j1 = Math.min(stored - 1, j + 1);
        const gx = (h(i1, j) - h(i0, j)) / ((i1 - i0) * step);
        const gy = (h(i, j1) - h(i, j0)) / ((j1 - j0) * step);
        const t = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - tanFrom) / (tanTo - tanFrom)));
        if (t <= 0) continue;
        const w = t * t * (3 - 2 * t);
        for (let c = 0; c < 3; c++) padColors[k * 3 + c] = padColors[k * 3 + c] * (1 - w) + rock.color[c] * w;
      }
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
