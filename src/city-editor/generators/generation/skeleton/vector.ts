// Small vector helpers for the skeleton. Pure, explicit inputs only.

import type { Point } from "../../../types/geometry";
import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "../../geom";

export const unit = (v: Point): Point => {
  const length = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / length, v[1] / length];
};
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Point, b: Point, scale = 1): Point => [a[0] + b[0] * scale, a[1] + b[1] * scale];
export const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Smallest positive ray parameter at which `origin + t·dir` meets a ring edge, or Infinity. */
export function rayRingHit(origin: Point, dir: Point, ring: Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const denom = dir[0] * ey - dir[1] * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const ox = a[0] - origin[0];
    const oy = a[1] - origin[1];
    const t = (ox * ey - oy * ex) / denom;
    const u = (ox * dir[1] - oy * dir[0]) / denom;
    if (t > 1e-9 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

/** Where a square frame [-half, half]² is first left by a ray from `p` along `dir`. */
export function exitSquare(p: Point, dir: Point, half: number): Point {
  let t = Number.POSITIVE_INFINITY;
  for (const axis of [0, 1] as const) {
    if (Math.abs(dir[axis]) < 1e-12) continue;
    const bound = dir[axis] > 0 ? half : -half;
    t = Math.min(t, (bound - p[axis]) / dir[axis]);
  }
  return [p[0] + dir[0] * Math.max(0, t), p[1] + dir[1] * Math.max(0, t)];
}

/** Position along the square's perimeter, counter-clockwise from (half, -half). */
function perimeterPosition(p: Point, half: number): number {
  const side = 2 * half;
  const [x, y] = p;
  const dRight = Math.abs(x - half);
  const dTop = Math.abs(y - half);
  const dLeft = Math.abs(x + half);
  const dBottom = Math.abs(y + half);
  const min = Math.min(dRight, dTop, dLeft, dBottom);
  if (min === dRight) return y + half;
  if (min === dTop) return side + (half - x);
  if (min === dLeft) return 2 * side + (half - y);
  return 3 * side + (x + half);
}

const CORNERS = (half: number): Point[] => [
  [half, half],
  [-half, half],
  [-half, -half],
  [half, -half]
];
const CORNER_POSITIONS = (half: number) => [2, 4, 6, 8].map(k => k * half);

/** Frame corners met while walking counter-clockwise (`ccw`) or clockwise from `from` to `to`. */
function frameWalk(from: number, to: number, half: number, ccw: boolean): Point[] {
  const perimeter = 8 * half;
  const corners = CORNERS(half);
  const positions = CORNER_POSITIONS(half);
  const span = ccw ? (to - from + perimeter) % perimeter : (from - to + perimeter) % perimeter;
  const out: { d: number; p: Point }[] = [];
  positions.forEach((position, i) => {
    const d = ccw ? (position - from + perimeter) % perimeter : (from - position + perimeter) % perimeter;
    if (d > 1e-9 && d < span) out.push({ d, p: corners[i] });
  });
  return out.sort((a, b) => a.d - b.d).map(item => item.p);
}

/**
 * Close an open coast corridor into a water polygon inside the square frame of
 * half size `half`. The corridor ends are extended to the frame along their end
 * segments; the frame side is chosen by the water azimuth vector `water`
 * (unit, local frame): the side most of the corridor's water-facing normals point into.
 */
export function closeCorridor(corridor: Point[], water: Point, half: number): Point[] | null {
  if (corridor.length < 2) return null;
  const line = corridor.map(p => [p[0], p[1]] as Point);
  const first = line[0];
  const last = line[line.length - 1];
  const start = exitSquare(first, unit(sub(first, line[1])), half);
  const end = exitSquare(last, unit(sub(last, line[line.length - 2])), half);
  const path = [start, ...line, end];
  const from = perimeterPosition(end, half);
  const to = perimeterPosition(start, half);
  const candidates = [true, false].map(ccw => [...path, ...frameWalk(from, to, half, ccw)]);
  const votes = candidates.map(() => 0);
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const tangent = unit(sub(b, a));
    let normal: Point = [-tangent[1], tangent[0]];
    if (normal[0] * water[0] + normal[1] * water[1] < 0) normal = [-normal[0], -normal[1]];
    const probe = add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], normal, 1);
    candidates.forEach((ring, k) => {
      if (pointInPolygon(probe, ring)) votes[k]++;
    });
  }
  return votes[0] >= votes[1] ? candidates[0] : candidates[1];
}

/** Every crossing of the polyline `a` with the polyline `b`, in order along `a`. */
export function polylineCrossings(
  a: Point[],
  b: Point[],
  closedA = false
): { point: Point; aIndex: number; aT: number; bIndex: number }[] {
  const hits: { point: Point; aIndex: number; aT: number; bIndex: number }[] = [];
  const segments = closedA ? a.length : a.length - 1;
  for (let i = 0; i < segments; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j + 1 < b.length; j++) {
      const hit = segmentSegmentHit(p, q, b[j], b[j + 1]);
      if (hit) hits.push({ point: hit.point, aIndex: i, aT: hit.t, bIndex: j });
    }
  }
  return hits.sort((x, y) => x.aIndex - y.aIndex || x.aT - y.aT);
}

/** Unit tangent of a polyline at its segment `index`. */
export function tangentAt(line: Point[], index: number): Point {
  const i = Math.max(0, Math.min(index, line.length - 2));
  return unit(sub(line[i + 1], line[i]));
}

/** Distance from `p` to an open polyline. */
export function distanceToPolyline(p: Point, line: Point[]): number {
  return line.length >= 2 ? nearestOnPolyline(p, line).dist : Number.POSITIVE_INFINITY;
}

/** Angle in degrees between two undirected lines. */
export function lineAngleDegrees(a: Point, b: Point): number {
  const ua = unit(a);
  const ub = unit(b);
  const cos = Math.min(1, Math.abs(ua[0] * ub[0] + ua[1] * ub[1]));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Signed area > 0 for a counter-clockwise ring. */
export function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return sum / 2;
}

/** Resample a closed ring so no edge is longer than `step`; existing vertices are kept. */
export function densifyRing(ring: Point[], step: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const pieces = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < pieces; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces]);
  }
  return out;
}

/** Ring of a river band: the centreline offset by ±halfWidth. */
export function bandRing(line: Point[], halfWidth: number): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < line.length; i++) {
    const before = line[Math.max(0, i - 1)];
    const after = line[Math.min(line.length - 1, i + 1)];
    const t = unit(sub(after, before));
    const n: Point = [-t[1], t[0]];
    left.push(add(line[i], n, halfWidth));
    right.push(add(line[i], n, -halfWidth));
  }
  return [...left, ...right.reverse()];
}
