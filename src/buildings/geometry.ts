import type { Point } from "./record";
import { MIN_VERTEX_SPACING_METERS } from "./record";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function ringArea(ring: readonly Point[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

export function boundsOf(rings: readonly (readonly Point[])[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const ring of rings) {
    for (const point of ring) {
      count += 1;
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  if (!count) return null;
  return { minX, minY, maxX, maxY };
}

export function pointInRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses = a[1] > point[1] !== b[1] > point[1];
    if (!crosses) continue;
    const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (point[0] < x) inside = !inside;
  }
  return inside;
}

function sharesEndpoint(a: Point, b: Point, c: Point, d: Point): boolean {
  const same = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-8;
  return same(a, c) || same(a, d) || same(b, c) || same(b, d);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  if (sharesEndpoint(a, b, c, d)) return false;
  const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const ab = cross(a, b, c) * cross(a, b, d);
  const cd = cross(c, d, a) * cross(c, d, b);
  return ab < 0 && cd < 0;
}

export function ringIsSimple(ring: readonly Point[]): boolean {
  if (ring.length < 3) return false;
  const edges = ring.length;
  for (let i = 0; i < edges; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % edges];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_VERTEX_SPACING_METERS) return false;
    for (let j = i + 1; j < edges; j++) {
      const c = ring[j];
      const d = ring[(j + 1) % edges];
      if (segmentsCross(a, b, c, d)) return false;
    }
  }
  return true;
}

export function holeInside(outer: readonly Point[], hole: readonly Point[]): boolean {
  if (ringArea(hole) >= 0) return false;
  for (const point of hole) {
    if (!pointInRing(point, outer)) return false;
  }
  const edges = outer.length;
  for (let i = 0; i < edges; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % edges];
    for (let j = 0; j < hole.length; j++) {
      if (segmentsCross(a, b, hole[j], hole[(j + 1) % hole.length])) return false;
    }
  }
  return true;
}

export function holesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const point of a) if (pointInRing(point, b)) return true;
  for (const point of b) if (pointInRing(point, a)) return true;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

export function sameRing(a: readonly Point[], b: readonly Point[], tolerance = 0.05): boolean {
  if (a.length !== b.length || a.length < 3) return false;
  for (let shift = 0; shift < a.length; shift++) {
    let matches = true;
    for (let i = 0; i < a.length; i++) {
      const point = a[(i + shift) % a.length];
      if (Math.hypot(point[0] - b[i][0], point[1] - b[i][1]) > tolerance) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function ringPerimeter(ring: readonly Point[]): number {
  let length = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

/** Point at `distance` along the ring, measured from vertex 0. */
export function pointAlong(ring: readonly Point[], distance: number): Point | null {
  if (ring.length < 2 || distance < 0) return null;
  let left = distance;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= span || i === ring.length - 1) {
      const t = span < 1e-9 ? 0 : Math.min(1, left / span);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= span;
  }
  return null;
}
