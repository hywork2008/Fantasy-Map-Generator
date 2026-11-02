import type { Point } from "../../types/primitives";
import type { FieldGrid } from "../terrainField/sample";

export interface PlanRay {
  /** Plan X, plan Y, and height. */
  origin: [number, number, number];
  /** Does not need to be a unit vector. */
  direction: [number, number, number];
}

export interface GroundHit {
  point: Point;
  elevation: number;
  /** Distance along the normalised direction. */
  distance: number;
}

const ROOT_EPSILON = 1e-9;

function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return [];
    return [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  const sign = b < 0 ? -1 : 1;
  const q = -0.5 * (b + sign * root);
  const first = q / a;
  const second = q === 0 ? first : c / q;
  return first === second ? [first] : [first, second];
}

function clipSlab(origin: number, direction: number, min: number, max: number, interval: [number, number]): boolean {
  if (Math.abs(direction) < 1e-12) return origin >= min && origin <= max;
  let near = (min - origin) / direction;
  let far = (max - origin) / direction;
  if (near > far) {
    const swap = near;
    near = far;
    far = swap;
  }
  if (near > interval[0]) interval[0] = near;
  if (far < interval[1]) interval[1] = far;
  return interval[0] <= interval[1];
}

/**
 * First hit of a ray on a bilinear height lattice.
 * Cells are walked with a grid DDA. Each cell solves the ray against its patch.
 */
export function heightFieldRaycast(
  grid: FieldGrid,
  values: ArrayLike<number>,
  ray: PlanRay,
  maxDistance: number
): GroundHit | null {
  const length = Math.hypot(ray.direction[0], ray.direction[1], ray.direction[2]);
  if (!(length > 0) || !(maxDistance > 0)) return null;
  const dx = ray.direction[0] / length;
  const dy = ray.direction[1] / length;
  const dz = ray.direction[2] / length;
  const spacing = grid.sampleMeters;
  const maxX = grid.origin[0] + (grid.columns - 1) * spacing;
  const maxY = grid.origin[1] + (grid.rows - 1) * spacing;
  const interval: [number, number] = [0, maxDistance];
  if (!clipSlab(ray.origin[0], dx, grid.origin[0], maxX, interval)) return null;
  if (!clipSlab(ray.origin[1], dy, grid.origin[1], maxY, interval)) return null;

  const nudge = spacing * 1e-7;
  let distance = interval[0];
  let x = ray.origin[0] + dx * distance;
  let y = ray.origin[1] + dy * distance;
  if (x >= maxX) x -= nudge;
  if (y >= maxY) y -= nudge;
  if (x <= grid.origin[0]) x += nudge;
  if (y <= grid.origin[1]) y += nudge;

  let column = Math.floor((x - grid.origin[0]) / spacing);
  let row = Math.floor((y - grid.origin[1]) / spacing);
  column = Math.max(0, Math.min(grid.columns - 2, column));
  row = Math.max(0, Math.min(grid.rows - 2, row));

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const deltaX = stepX === 0 ? Infinity : Math.abs(spacing / dx);
  const deltaY = stepY === 0 ? Infinity : Math.abs(spacing / dy);
  const boundaryDistance = (value: number, axisOrigin: number, step: number, direction: number) => {
    if (step === 0) return Infinity;
    const scaled = (value - axisOrigin) / spacing;
    const boundaryIndex = step > 0 ? Math.floor(scaled) + 1 : Math.ceil(scaled - 1e-12);
    return (axisOrigin + boundaryIndex * spacing - value) / direction;
  };
  let maxStepX = distance + boundaryDistance(x, grid.origin[0], stepX, dx);
  let maxStepY = distance + boundaryDistance(y, grid.origin[1], stepY, dy);
  const limit = grid.columns + grid.rows + 2;

  for (let step = 0; step < limit && distance <= interval[1]; step++) {
    const exit = Math.min(maxStepX, maxStepY, interval[1]);
    const hit = patchHit(grid, values, column, row, ray.origin, dx, dy, dz, distance, exit);
    if (hit) return hit;
    if (exit >= interval[1] - 1e-9) return null;
    if (maxStepX < maxStepY) {
      column += stepX;
      distance = maxStepX;
      maxStepX += deltaX;
    } else {
      row += stepY;
      distance = maxStepY;
      maxStepY += deltaY;
    }
    if (column < 0 || row < 0 || column > grid.columns - 2 || row > grid.rows - 2) return null;
  }
  return null;
}

function patchHit(
  grid: FieldGrid,
  values: ArrayLike<number>,
  column: number,
  row: number,
  origin: [number, number, number],
  dx: number,
  dy: number,
  dz: number,
  enter: number,
  exit: number
): GroundHit | null {
  const spacing = grid.sampleMeters;
  const x0 = grid.origin[0] + column * spacing;
  const y0 = grid.origin[1] + row * spacing;
  const index = row * grid.columns + column;
  const h00 = values[index];
  const h10 = values[index + 1];
  const h01 = values[index + grid.columns];
  const h11 = values[index + grid.columns + 1];
  const alongX = h10 - h00;
  const alongY = h01 - h00;
  const cross = h00 - h10 - h01 + h11;
  const u0 = (origin[0] - x0) / spacing;
  const v0 = (origin[1] - y0) / spacing;
  const pu = dx / spacing;
  const pv = dy / spacing;
  const constant = h00 + alongX * u0 + alongY * v0 + cross * u0 * v0;
  const linear = alongX * pu + alongY * pv + cross * (u0 * pv + v0 * pu);
  const square = cross * pu * pv;
  // elevation(t) = constant + linear t + square t² equals originUp + dz t.
  const roots = solveQuadratic(-square, dz - linear, origin[2] - constant);
  let best: number | undefined;
  for (const root of roots) {
    if (root < enter - 1e-5 || root > exit + 1e-5) continue;
    const u = u0 + pu * root;
    const v = v0 + pv * root;
    if (u < -1e-3 || v < -1e-3 || u > 1 + 1e-3 || v > 1 + 1e-3) continue;
    if (best === undefined || root < best) best = root;
  }
  if (best === undefined || best < -ROOT_EPSILON) return null;
  const distance = Math.max(0, best);
  const point: Point = [origin[0] + dx * distance, origin[1] + dy * distance];
  return { point, elevation: origin[2] + dz * distance, distance };
}
