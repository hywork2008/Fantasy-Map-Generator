import type { Point } from "../../types/primitives";
import type { TerrainFieldPart } from "../../types/terrain";
import { type FieldGrid, fieldIndex, fieldPoint, sampleGrid } from "./sample";

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 101);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return norm ? sum / norm : 0;
}

function falloff(distance: number, radius: number): number {
  if (distance >= radius || radius <= 0) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

function distanceToPolyline(point: Point, line: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t));
  }
  return best;
}

function cragHeight(part: Extract<TerrainFieldPart, { kind: "crag" }>, point: Point): number {
  const dx = point[0] - part.center[0];
  const dy = point[1] - part.center[1];
  let distance = Math.hypot(dx, dy);
  if (part.wobble && distance > 1e-6) {
    const angle = Math.atan2(dy, dx);
    distance /= 1 + part.wobble * Math.sin(angle * 3 + part.center[0] * 0.01);
  }
  const lip = part.topRadiusMeters;
  const outer = lip + part.cliffRunMeters;
  if (distance >= outer) return 0;
  if (distance <= lip) {
    const t = lip > 0 ? distance / lip : 0;
    return part.heightMeters * (1 - 0.03 * t * t);
  }
  const t = (distance - lip) / part.cliffRunMeters;
  return part.heightMeters * 0.97 * (1 - t);
}

function spurHeight(part: Extract<TerrainFieldPart, { kind: "spur" }>, point: Point): number {
  const dx = part.tip[0] - part.root[0];
  const dy = part.tip[1] - part.root[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const along = (point[0] - part.root[0]) * ux + (point[1] - part.root[1]) * uy;
  const across = (point[0] - part.root[0]) * -uy + (point[1] - part.root[1]) * ux;
  const half = part.topWidthMeters / 2;
  // The plateau side of the root falls gently. The spur and its other edges are cliffs.
  if (along <= 0 && Math.abs(across) >= half) {
    const back = -along;
    if (back >= part.gentleRunMeters) return part.heightMeters;
    return part.heightMeters * (back / Math.max(part.gentleRunMeters, 1e-6));
  }
  const past = along < 0 ? -along : along > length ? along - length : 0;
  const radial = Math.hypot(Math.max(0, Math.abs(across) - half), past);
  if (radial >= part.cliffRunMeters) return 0;
  if (radial <= 0) return part.heightMeters;
  return part.heightMeters * (1 - radial / part.cliffRunMeters);
}

function scarpHeight(part: Extract<TerrainFieldPart, { kind: "scarp" }>, point: Point): number {
  const length = Math.hypot(part.downhill[0], part.downhill[1]) || 1;
  const ux = part.downhill[0] / length;
  const uy = part.downhill[1] / length;
  const along = (point[0] - part.origin[0]) * ux + (point[1] - part.origin[1]) * uy;
  if (along >= part.cliffRunMeters) return 0;
  if (along >= 0) return part.heightMeters * (1 - along / Math.max(part.cliffRunMeters, 1e-6));
  const back = -along;
  if (back >= part.gentleRunMeters) return part.heightMeters;
  // Stay high on the plateau; the gentle run only eases the back edge.
  return part.heightMeters * (0.85 + 0.15 * (back / Math.max(part.gentleRunMeters, 1e-6)));
}

function addCoarse(
  grid: FieldGrid,
  values: Float32Array,
  part: Extract<TerrainFieldPart, { kind: "coarse" | "correct" }>,
  sign: number
): void {
  const coarse = {
    origin: part.origin,
    sampleMeters: part.spacingMeters,
    columns: part.columns,
    rows: part.rows
  };
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++) {
      const point = fieldPoint(grid, column, row);
      values[fieldIndex(grid, column, row)] += sign * sampleGrid(coarse, part.elevationsMeters, point);
    }
}

function smooth(grid: FieldGrid, values: Float32Array, radiusMeters: number): void {
  const radius = Math.max(1, Math.round(radiusMeters / grid.sampleMeters));
  const copy = Float32Array.from(values);
  const blur = (source: ArrayLike<number>, target: Float32Array, horizontal: boolean) => {
    for (let row = 0; row < grid.rows; row++)
      for (let column = 0; column < grid.columns; column++) {
        let sum = 0;
        let count = 0;
        for (let delta = -radius; delta <= radius; delta++) {
          const c = horizontal ? column + delta : column;
          const r = horizontal ? row : row + delta;
          if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
          sum += source[r * grid.columns + c];
          count++;
        }
        target[row * grid.columns + column] = count ? sum / count : source[row * grid.columns + column];
      }
  };
  const mid = new Float32Array(values.length);
  blur(copy, mid, true);
  blur(mid, values, false);
}

/** Add every part, in order, onto `values`. */
export function applyParts(grid: FieldGrid, values: Float32Array, parts: readonly TerrainFieldPart[]): void {
  for (const part of parts) {
    if (part.kind === "smooth") {
      smooth(grid, values, part.radiusMeters);
      continue;
    }
    if (part.kind === "coarse") {
      addCoarse(grid, values, part, 1);
      continue;
    }
    if (part.kind === "correct") {
      addCoarse(grid, values, part, -1);
      continue;
    }
    for (let row = 0; row < grid.rows; row++)
      for (let column = 0; column < grid.columns; column++) {
        const point = fieldPoint(grid, column, row);
        const index = fieldIndex(grid, column, row);
        switch (part.kind) {
          case "offset":
            values[index] += part.meters;
            break;
          case "hill":
            values[index] +=
              part.heightMeters *
              falloff(Math.hypot(point[0] - part.center[0], point[1] - part.center[1]), part.radiusMeters);
            break;
          case "range":
            values[index] += part.heightMeters * falloff(distanceToPolyline(point, part.points), part.radiusMeters);
            break;
          case "trough":
            values[index] -= part.depthMeters * falloff(distanceToPolyline(point, part.points), part.radiusMeters);
            break;
          case "pit":
            values[index] -=
              part.depthMeters *
              falloff(Math.hypot(point[0] - part.center[0], point[1] - part.center[1]), part.radiusMeters);
            break;
          case "crag":
            values[index] += cragHeight(part, point);
            break;
          case "spur":
            values[index] += spurHeight(part, point);
            break;
          case "scarp":
            values[index] += scarpHeight(part, point);
            break;
          case "noise": {
            const octaves = part.octaves ?? 4;
            const wave = Math.max(part.wavelengthMeters, grid.sampleMeters);
            values[index] += part.amplitudeMeters * (fbm(point[0] / wave, point[1] / wave, part.seed, octaves) * 2 - 1);
            break;
          }
          case "mask": {
            const half = ((grid.columns - 1) * grid.sampleMeters) / 2;
            const edge = Math.max(Math.abs(point[0]) / half, Math.abs(point[1]) / half);
            const inner = part.inner ?? 0.82;
            if (edge > inner) {
              const t = (edge - inner) / Math.max(1e-6, 1 - inner);
              values[index] -= part.dropMeters * t * t;
            }
            break;
          }
          default:
            break;
        }
      }
  }
}
