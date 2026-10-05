import type { Point } from "../types";
import { nearestOnPolyline, polygonArea } from "./geom";

const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Convex pieces of a simple polygon. Seams stay inside the original outline. */
export function convexInfillParts(polygon: Point[]): Point[][] {
  return infillParts(polygon, true);
}

/** Water reservations need triangles, not the expensive maximal-piece merge. */
export function triangularInfillParts(polygon: Point[]): Point[][] {
  return infillParts(polygon, false);
}

function infillParts(polygon: Point[], merge: boolean): Point[][] {
  const sign = -Math.sign(polygonArea(polygon));
  if (!sign || polygon.length < 3) return [];
  const convex = (ids: number[]) =>
    ids.every(
      (v, i) =>
        sign * cross(polygon[ids[(i + ids.length - 1) % ids.length]], polygon[v], polygon[ids[(i + 1) % ids.length]]) >=
        -1e-7
    );
  const remaining = polygon.map((_, i) => i);
  if (convex(remaining)) return [polygon];
  const pieces: number[][] = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((b, i) => {
      const a = remaining[(i + remaining.length - 1) % remaining.length],
        c = remaining[(i + 1) % remaining.length];
      if (sign * cross(polygon[a], polygon[b], polygon[c]) <= 1e-7) return false;
      return !remaining.some(
        v =>
          v !== a &&
          v !== b &&
          v !== c &&
          sign * cross(polygon[a], polygon[b], polygon[v]) >= -1e-7 &&
          sign * cross(polygon[b], polygon[c], polygon[v]) >= -1e-7 &&
          sign * cross(polygon[c], polygon[a], polygon[v]) >= -1e-7
      );
    });
    if (ear < 0) return [];
    pieces.push([
      remaining[(ear + remaining.length - 1) % remaining.length],
      remaining[ear],
      remaining[(ear + 1) % remaining.length]
    ]);
    remaining.splice(ear, 1);
  }
  pieces.push(remaining);
  for (let changed = merge; changed; ) {
    changed = false;
    outer: for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++) {
        const edges = [...pieces[i], ...pieces[j]];
        if (new Set(edges).size !== edges.length - 2) continue;
        const directed = [pieces[i], pieces[j]].flatMap(ids => ids.map((a, k) => [a, ids[(k + 1) % ids.length]]));
        const border = directed.filter(([a, b]) => !directed.some(([c, d]) => a === d && b === c));
        if (!border.length) continue;
        const ring = [border[0][0]];
        while (ring.length < border.length) {
          const edge = border.find(([a]) => a === ring.at(-1));
          if (!edge || ring.includes(edge[1])) break;
          ring.push(edge[1]);
        }
        if (ring.length !== border.length || !convex(ring)) continue;
        pieces[i] = ring;
        pieces.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  return pieces.map(ids => ids.map(i => polygon[i]));
}

/** Intersect inward offset half-planes. The result remains inside even a
 * concave edited face; an empty/narrow kernel simply receives no buildings. */
export function insetConvexKernel(poly: Point[], distances: number[]): Point[] {
  const sign = -Math.sign(polygonArea(poly));
  if (!sign || poly.length < 3) return [];
  const xs = poly.map(p => p[0]);
  const ys = poly.map(p => p[1]);
  let result: Point[] = [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
    [Math.min(...xs), Math.max(...ys)]
  ];
  for (let i = 0; i < poly.length && result.length >= 3; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const normal: Point = [(sign * (b[1] - a[1])) / length, (sign * (a[0] - b[0])) / length];
    result = clipHalfPlane(result, normal, a[0] * normal[0] + a[1] * normal[1] - distances[i]);
  }
  return result;
}

export function clipHalfPlane(poly: Point[], normal: Point, offset: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = a[0] * normal[0] + a[1] * normal[1] - offset;
    const db = b[0] * normal[0] + b[1] * normal[1] - offset;
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

/** Align lots with the longest boundary, then cut along the longer dimension. */
export function longestFrame(poly: Point[]): { axis: Point; min: number; max: number; across: number } {
  let axis: Point = [1, 0];
  let longest = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) {
      longest = length;
      axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    }
  }
  const bounds = (n: Point) => {
    const values = poly.map(p => p[0] * n[0] + p[1] * n[1]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [min, max] = bounds(axis);
  const normal: Point = [-axis[1], axis[0]];
  const [lo, hi] = bounds(normal);
  if (hi - lo > max - min) return { axis: normal, min: lo, max: hi, across: max - min };
  return { axis, min, max, across: hi - lo };
}

export interface RiverMargin {
  points: Point[];
  margin: number;
  halfWidth: number;
}

export function clipBlockWithRivers(block: Point[], polygon: Point[], center: Point, rivers: RiverMargin[]): Point[] {
  let current = block;
  for (const river of rivers) {
    const pts = river.points;
    const rMargin = river.margin;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const d1 = nearestOnPolyline(p1, polygon).dist;
      const d2 = nearestOnPolyline(p2, polygon).dist;
      if (Math.min(d1, d2) > rMargin + 30) continue;

      const nx = -dy / len;
      const ny = dx / len;
      let side = (center[0] - p1[0]) * nx + (center[1] - p1[1]) * ny;
      if (Math.abs(side) < 1e-4) {
        for (const pt of polygon) {
          side = (pt[0] - p1[0]) * nx + (pt[1] - p1[1]) * ny;
          if (Math.abs(side) >= 1e-4) break;
        }
      }
      const sign = side >= 0 ? 1 : -1;
      const norm: Point = [-sign * nx, -sign * ny];
      const off = -sign * (p1[0] * nx + p1[1] * ny) - rMargin;
      current = clipHalfPlane(current, norm, off);
      if (current.length < 3) return [];
    }
  }
  return current;
}
