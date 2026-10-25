// Offset and hit tests for a bastioned trace. Vertex count stays with the source ring.
import type { Point } from "../../types/primitives";
import { add, dist, signedArea, sub, unit } from "../generation/skeleton/vector";
import { pointInPolygon, segmentSegmentHit } from "../geom";

export const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
/** The mesh adapter may bind a trace corner to a nearby existing vertex. */
export const FORTRESS_WALL_BIND_METERS = 3;

export function ringCentroid(ring: Point[]): Point {
  const sum = ring.reduce<Point>((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

/** Right of travel. For a counter-clockwise ring this points outward. */
export function edgeOutward(a: Point, b: Point): Point {
  return unit([b[1] - a[1], -(b[0] - a[0])]);
}

function lineIntersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denom;
  return add(a, r, t);
}

/** Non-adjacent edges meet. Touching a shared vertex of neighbouring edges does not count. */
export function ringSelfIntersects(ring: Point[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const hit = segmentSegmentHit(a, b, ring[j], ring[(j + 1) % n]);
      if (hit && hit.t > 1e-4 && hit.t < 1 - 1e-4) return true;
    }
  }
  return false;
}

/**
 * Offset a counter-clockwise ring. Positive distance is outward.
 * A miter longer than 4× the offset becomes one clamped vertex so the ring
 * keeps a 1:1 vertex correspondence. A reversed or self-crossing result is rejected.
 */
export function offsetRing(ring: Point[], distance: number): Point[] | null {
  if (ring.length < 3 || !(signedArea(ring) > 0) || !Number.isFinite(distance)) return null;
  const n = ring.length;
  const out: Point[] = [];
  const limit = Math.abs(distance) * 4;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];
    const n0 = edgeOutward(prev, curr);
    const n1 = edgeOutward(curr, next);
    const hit = lineIntersect(
      add(prev, n0, distance),
      add(curr, n0, distance),
      add(curr, n1, distance),
      add(next, n1, distance)
    );
    const bis = add(n0, n1);
    const bisLen = Math.hypot(bis[0], bis[1]);
    const clamped =
      bisLen < 1e-6
        ? add(curr, n0, distance)
        : add(curr, unit(bis), Math.sign(distance || 1) * Math.min(Math.abs(distance) * (2 / bisLen), limit));
    const vertex = !hit || dist(curr, hit) > limit ? clamped : hit;
    if (!vertex.every(Number.isFinite)) return null;
    out.push(vertex);
  }
  if (!(signedArea(out) > 0) || ringSelfIntersects(out)) return null;
  return out;
}

/** Move each vertex toward `center` by `distance`, keeping the same vertex count. */
export function insetToward(ring: Point[], center: Point, distance: number): Point[] | null {
  if (!(distance > 0)) return ring.map(p => [p[0], p[1]] as Point);
  const out: Point[] = [];
  for (const p of ring) {
    const d = sub(p, center);
    const len = Math.hypot(d[0], d[1]);
    if (len <= distance + 0.25) return null;
    const scale = (len - distance) / len;
    out.push([center[0] + d[0] * scale, center[1] + d[1] * scale]);
  }
  if (!(signedArea(out) > 0) || ringSelfIntersects(out)) return null;
  return out;
}

/** Inward offset, then a radial inset when the miter cannot keep a simple ring. */
export function insetRing(ring: Point[], center: Point, distance: number): Point[] | null {
  return offsetRing(ring, -distance) ?? insetToward(ring, center, distance);
}

export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const hit = segmentSegmentHit(a0, a1, b[j], b[(j + 1) % b.length]);
      if (hit && hit.t > 1e-3 && hit.t < 1 - 1e-3) return true;
    }
  }
  return false;
}

/** The open segment enters `ring`, ignoring a graze at an endpoint. */
export function segmentEntersRing(a: Point, b: Point, ring: Point[]): boolean {
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pointInPolygon(mid, ring)) return true;
  for (let i = 0; i < ring.length; i++) {
    const hit = segmentSegmentHit(a, b, ring[i], ring[(i + 1) % ring.length]);
    if (hit && hit.t > 0.02 && hit.t < 0.98) return true;
  }
  return false;
}

export function pathEntersRing(path: Point[], ring: Point[]): boolean {
  for (let i = 1; i < path.length; i++) if (segmentEntersRing(path[i - 1], path[i], ring)) return true;
  return false;
}

export function pointInRings(point: Point, rings: Point[][]): boolean {
  return rings.some(ring => pointInPolygon(point, ring));
}

export function finitePoint(point: Point): boolean {
  return Array.isArray(point) && point.length === 2 && point.every(n => typeof n === "number" && Number.isFinite(n));
}

export function finiteRing(ring: Point[], min = 3): boolean {
  return Array.isArray(ring) && ring.length >= min && ring.every(finitePoint);
}
