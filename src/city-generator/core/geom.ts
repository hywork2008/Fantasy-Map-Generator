// Small 2D polygon helpers. No external deps.

import type { Point } from "./types";

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Signed area (positive when the ring is counter-clockwise). */
export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return a / 2;
}

/** Area-weighted centroid. Falls back to the vertex mean for degenerate rings. */
export function polygonCentroid(poly: Point[]): Point {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    twiceArea += cross;
    cx += (poly[j][0] + poly[i][0]) * cross;
    cy += (poly[j][1] + poly[i][1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const mean = poly.reduce<Point>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [mean[0] / poly.length, mean[1] / poly.length];
  }
  const f = 1 / (3 * twiceArea);
  return [cx * f, cy * f];
}

/** Sutherland–Hodgman clip of a convex-ish polygon against an axis-aligned rect. */
export function clipPolygonToRect(poly: Point[], rect: Rect): Point[] {
  const edges: ((p: Point) => boolean)[] = [
    p => p[0] >= rect.minX,
    p => p[0] <= rect.maxX,
    p => p[1] >= rect.minY,
    p => p[1] <= rect.maxY
  ];
  const intersect: ((a: Point, b: Point) => Point)[] = [
    (a, b) => lerpX(a, b, rect.minX),
    (a, b) => lerpX(a, b, rect.maxX),
    (a, b) => lerpY(a, b, rect.minY),
    (a, b) => lerpY(a, b, rect.maxY)
  ];

  let out = poly;
  for (let e = 0; e < 4 && out.length > 0; e++) {
    const inside = edges[e];
    const clip = intersect[e];
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(clip(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(clip(prev, cur));
      }
    }
  }
  return out;
}

/** True when any vertex sits on a rect edge (within eps) — the "on border" test. */
export function polygonTouchesRectEdge(poly: Point[], rect: Rect, eps = 1e-6): boolean {
  return poly.some(
    p =>
      Math.abs(p[0] - rect.minX) < eps ||
      Math.abs(p[0] - rect.maxX) < eps ||
      Math.abs(p[1] - rect.minY) < eps ||
      Math.abs(p[1] - rect.maxY) < eps
  );
}

function lerpX(a: Point, b: Point, x: number): Point {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}

function lerpY(a: Point, b: Point, y: number): Point {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

// --- vectors & polylines -----------------------------------------------------

/** Compass azimuth (0 = north, 90 = east, clockwise) → unit vector in the local
 * frame (+X east, +Y north). */
export function azimuthToVec(deg: number): Point {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

/** Compass azimuth of a local-frame vector. */
export function vecToAzimuth(x: number, y: number): number {
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** Smallest unsigned difference between two compass azimuths, degrees. */
export function azimuthDelta(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export interface PolylineHit {
  /** Closest point on the polyline. */
  point: Point;
  /** Index of the segment [i, i+1] the closest point lies on. */
  segIndex: number;
  /** Fraction along that segment, [0, 1]. */
  t: number;
  /** Distance from the query point to `point`. */
  dist: number;
}

/** Closest approach of `p` to an open polyline. */
export function nearestOnPolyline(p: Point, poly: Point[]): PolylineHit {
  let best: PolylineHit = { point: poly[0], segIndex: 0, t: 0, dist: Number.POSITIVE_INFINITY };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq);
    const q: Point = [a[0] + dx * t, a[1] + dy * t];
    const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (dist < best.dist) best = { point: q, segIndex: i, t, dist };
  }
  return best;
}

/** Unit downstream tangent of the polyline at segment `segIndex`. */
export function polylineTangent(poly: Point[], segIndex: number): Point {
  const a = poly[Math.min(segIndex, poly.length - 2)];
  const b = poly[Math.min(segIndex + 1, poly.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

/** Signed side of `p` relative to the polyline's downstream flow: > 0 = left. */
export function sideOfPolyline(p: Point, poly: Point[]): number {
  const hit = nearestOnPolyline(p, poly);
  const t = polylineTangent(poly, hit.segIndex);
  return t[0] * (p[1] - hit.point[1]) - t[1] * (p[0] - hit.point[0]);
}

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b2, b1, a1);
  const d2 = cross(b2, b1, a2);
  const d3 = cross(a2, a1, b1);
  const d4 = cross(a2, a1, b2);
  return (d1 > 0 !== d2 > 0 || d1 === 0 || d2 === 0) && (d3 > 0 !== d4 > 0 || d3 === 0 || d4 === 0);
}

/** True when segment a-b crosses any segment of the polyline. */
export function polylineCrossesSegment(poly: Point[], a: Point, b: Point): boolean {
  for (let i = 0; i < poly.length - 1; i++) {
    if (segmentsIntersect(a, b, poly[i], poly[i + 1])) return true;
  }
  return false;
}

export function polylineLength(poly: Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length - 1; i++) sum += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
  return sum;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
