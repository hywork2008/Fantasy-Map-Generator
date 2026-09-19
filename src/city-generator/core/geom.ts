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

function onSegment(p: Point, a: Point, b: Point, eps = 1e-9): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - eps &&
    p[0] <= Math.max(a[0], b[0]) + eps &&
    p[1] >= Math.min(a[1], b[1]) - eps &&
    p[1] <= Math.max(a[1], b[1]) + eps
  );
}

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b2, b1, a1);
  const d2 = cross(b2, b1, a2);
  const d3 = cross(a2, a1, b1);
  const d4 = cross(a2, a1, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  const eps = 1e-9;
  if (Math.abs(d1) <= eps && onSegment(a1, b1, b2, eps)) return true;
  if (Math.abs(d2) <= eps && onSegment(a2, b1, b2, eps)) return true;
  if (Math.abs(d3) <= eps && onSegment(b1, a1, a2, eps)) return true;
  if (Math.abs(d4) <= eps && onSegment(b2, a1, a2, eps)) return true;

  return false;
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

/** Even-odd ray cast. `poly` is treated as a closed ring. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// --- hulls & simplification -------------------------------------------------

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeated end
 * point. Returns the input (copied) when it has fewer than 3 distinct points. */
export function convexHull(points: Point[]): Point[] {
  const sorted = points
    .slice()
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
  if (sorted.length < 3) return sorted.map(p => [p[0], p[1]] as Point);

  const half = (src: Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const lower = half(sorted);
  const upper = half(sorted.slice().reverse());
  return lower.concat(upper).map(p => [p[0], p[1]] as Point);
}

/** Douglas–Peucker simplification. `closed` splits the ring at its two most
 * distant vertices, simplifies each arc, and rejoins (never returns < 3). */
export function simplifyPolyline(points: Point[], tolerance: number, closed = false): Point[] {
  if (points.length <= 2) return points.map(p => [p[0], p[1]] as Point);
  if (!closed) return douglasPeucker(points, tolerance);
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const a = douglasPeucker(points.slice(0, far + 1), tolerance);
  const b = douglasPeucker(points.slice(far), tolerance);
  const ring = a.slice(0, -1).concat(b.slice(0, -1));
  return ring.length >= 3 ? ring : points.map(p => [p[0], p[1]] as Point);
}

function douglasPeucker(points: Point[], tol: number): Point[] {
  if (points.length < 3) return points.map(p => [p[0], p[1]] as Point);
  const end = points.length - 1;
  let idx = 0;
  let max = 0;
  for (let i = 1; i < end; i++) {
    const d = perpDistanceToLine(points[i], points[0], points[end]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= tol) {
    return [
      [points[0][0], points[0][1]],
      [points[end][0], points[end][1]]
    ];
  }
  return douglasPeucker(points.slice(0, idx + 1), tol)
    .slice(0, -1)
    .concat(douglasPeucker(points.slice(idx), tol));
}

/** Closed-ring perimeter (last vertex joins the first). */
export function polygonPerimeter(poly: Point[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
  }
  return sum;
}

/** Isoperimetric quotient `4π·area / peri²`. A circle is 1; 0 on a degenerate ring. */
export function polygonCompactness(poly: Point[]): number {
  const peri = polygonPerimeter(poly);
  const area = Math.abs(polygonArea(poly));
  if (peri < 1e-9) return 0;
  return (4 * Math.PI * area) / (peri * peri);
}

/** True when every turn has the same sign (collinear vertices ignored). */
export function polygonIsConvex(poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 1e-12) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** Drop consecutive duplicates and a repeated closing vertex. */
export function cleanRing(poly: Point[], eps = 1e-4): Point[] {
  const out: Point[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > eps) out.push([p[0], p[1]]);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) {
    out.pop();
  }
  return out.length >= 3 ? out : [];
}

/** Unit inward normal of edge `a → b` (the side that contains the centroid). */
export function inwardNormal(a: Point, b: Point, poly: Point[]): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const left: Point = [-dy / len, dx / len];
  const right: Point = [dy / len, -dx / len];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const c = polygonCentroid(poly);
  const vx = c[0] - mid[0];
  const vy = c[1] - mid[1];
  return vx * left[0] + vy * left[1] >= vx * right[0] + vy * right[1] ? left : right;
}

/**
 * Sutherland–Hodgman clip against the half-plane `(p - origin) · normal >= 0`.
 * `normal` points toward the kept side.
 */
export function clipPolygonHalfPlane(poly: Point[], origin: Point, normal: Point): Point[] {
  if (poly.length < 3) return [];
  const inside = (p: Point): boolean => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1] >= -1e-9;
  const hit = (a: Point, b: Point): Point => {
    const da = (a[0] - origin[0]) * normal[0] + (a[1] - origin[1]) * normal[1];
    const db = (b[0] - origin[0]) * normal[0] + (b[1] - origin[1]) * normal[1];
    const t = Math.abs(da - db) < 1e-12 ? 0.5 : da / (da - db);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(hit(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(hit(prev, cur));
    }
  }
  return cleanRing(out);
}

/**
 * Convex inset: clip against each edge's inward-offset half-plane. `dists[i]` is
 * the inset of edge `poly[i] → poly[i+1]`. Collapses to [] when the offsets eat
 * the polygon.
 */
export function shrinkPolygon(poly: Point[], dists: number[]): Point[] {
  if (poly.length < 3) return [];
  let out = poly.map(p => [p[0], p[1]] as Point);
  for (let i = 0; i < poly.length && out.length >= 3; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = Math.max(0, dists[i] ?? dists[0] ?? 0);
    if (d < 1e-9) continue;
    const n = inwardNormal(a, b, poly);
    out = clipPolygonHalfPlane(out, [a[0] + n[0] * d, a[1] + n[1] * d], n);
  }
  const area = Math.abs(polygonArea(out));
  return out.length >= 3 && area > 1e-3 ? out : [];
}

/**
 * Concave-tolerant inset: each vertex slides along the inward angle-bisector to
 * the intersection of the two offset edges. Used when `shrinkPolygon` (half-plane
 * clip) would over-cut a reflex chain.
 */
export function bufferPolygon(poly: Point[], dists: number[]): Point[] {
  if (poly.length < 3) return [];
  const n = poly.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const d0 = Math.max(0, dists[(i - 1 + n) % n] ?? 0);
    const d1 = Math.max(0, dists[i] ?? 0);
    const n0 = inwardNormal(prev, curr, poly);
    const n1 = inwardNormal(curr, next, poly);
    const a1: Point = [prev[0] + n0[0] * d0, prev[1] + n0[1] * d0];
    const a2: Point = [curr[0] + n0[0] * d0, curr[1] + n0[1] * d0];
    const b1: Point = [curr[0] + n1[0] * d1, curr[1] + n1[1] * d1];
    const b2: Point = [next[0] + n1[0] * d1, next[1] + n1[1] * d1];
    // Inward bisector — the safe direction to move `curr` under an inset.
    const bl = Math.hypot(n0[0] + n1[0], n0[1] + n1[1]) || 1;
    const inx = (n0[0] + n1[0]) / bl;
    const iny = (n0[1] + n1[1]) / bl;
    const dm = (d0 + d1) / 2;
    const hit = lineLineIntersection(a1, a2, b1, b2);
    const drift = hit ? Math.hypot(hit[0] - curr[0], hit[1] - curr[1]) : Number.POSITIVE_INFINITY;
    // Accept the exact miter only when it moves INWARD and not absurdly far. A
    // reflex vertex's miter lands on the far side of the original edge; rejecting
    // it there stops the inset polygon bulging back outward.
    const miterInward = !!hit && (hit[0] - curr[0]) * inx + (hit[1] - curr[1]) * iny >= 0;
    if (hit && Number.isFinite(hit[0]) && Number.isFinite(hit[1]) && miterInward && drift <= Math.max(d0, d1) * 4 + 1) {
      out.push(hit);
    } else {
      out.push([curr[0] + inx * dm, curr[1] + iny * dm]);
    }
  }
  const cleaned = cleanRing(out);
  const area = Math.abs(polygonArea(cleaned));
  return cleaned.length >= 3 && area > 1e-3 ? cleaned : [];
}

/** Infinite-line intersection. Null when parallel. */
export function lineLineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  return [a[0] + t * rx, a[1] + t * ry];
}

/**
 * Split `poly` by the line through `point` with `normal` pointing to the "left"
 * piece. `gap` opens a corridor between the two halves (the alley).
 */
export function splitPolygon(poly: Point[], point: Point, normal: Point, gap = 0): [Point[], Point[]] {
  const h = gap / 2;
  const left = clipPolygonHalfPlane(poly, [point[0] + normal[0] * h, point[1] + normal[1] * h], normal);
  const right = clipPolygonHalfPlane(
    poly,
    [point[0] - normal[0] * h, point[1] - normal[1] * h],
    [-normal[0], -normal[1]]
  );
  return [left, right];
}

/** Perpendicular distance from `p` to the infinite line through `a`, `b`. */
export function perpDistanceToLine(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}
