import type { Boundary, DungeonDocument, Level, Point } from "./types";

export const EPSILON = 1e-7;
export const snap = (value: number): number => Math.round(value * 4) / 4;
export const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const samePoint = (a: Point, b: Point): boolean => distance(a, b) < EPSILON;
export const cross = (a: Point, b: Point, c: Point): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export function onSegment(point: Point, a: Point, b: Point): boolean {
  return (
    Math.abs(cross(a, b, point)) < EPSILON &&
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  );
}
export function polygonArea(points: Point[]): number {
  return (
    points.reduce((area, p, i) => {
      const q = points[(i + 1) % points.length];
      return area + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
export function pointInPolygon(point: Point, polygon: Point[], includeBoundary = true): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (onSegment(point, a, b)) return includeBoundary;
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}
export function boundaryPoints(level: Level, boundary: Boundary): [Point, Point] {
  return [level.vertices[boundary.a].point, level.vertices[boundary.b].point];
}
export function spacePolygon(level: Level, spaceId: string): Point[] {
  return level.spaces[spaceId].boundaryRefs.map(ref => {
    const edge = level.boundaries[ref.boundaryId];
    return level.vertices[ref.forward ? edge.a : edge.b].point;
  });
}
export function bounds(points: Point[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...points.map(p => p[0])),
    y0: Math.min(...points.map(p => p[1])),
    x1: Math.max(...points.map(p => p[0])),
    y1: Math.max(...points.map(p => p[1]))
  };
}
export function labelPoint(polygon: Point[]): Point {
  const box = bounds(polygon);
  const center: Point = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  if (pointInPolygon(center, polygon, false)) return center;
  // Orthogonal concave spaces: find a genuinely interior point for the label.
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const len = distance(a, b);
    const p: Point = [
      (a[0] + b[0]) / 2 - ((b[1] - a[1]) / len) * 0.25,
      (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * 0.25
    ];
    if (pointInPolygon(p, polygon, false)) return p;
  }
  return center;
}
export function pointAlong(a: Point, b: Point, offset: number): Point {
  const t = offset / distance(a, b);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
export function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  return cross(a, b, c) * cross(a, b, d) < -EPSILON && cross(c, d, a) * cross(c, d, b) < -EPSILON;
}
export function isSimplePolygon(polygon: Point[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (let j = i + 2; j < polygon.length; j++) {
      if (i === 0 && j === polygon.length - 1) continue;
      const c = polygon[j];
      const d = polygon[(j + 1) % polygon.length];
      if (
        properIntersection(a, b, c, d) ||
        onSegment(a, c, d) ||
        onSegment(b, c, d) ||
        onSegment(c, a, b) ||
        onSegment(d, a, b)
      )
        return false;
    }
  }
  return true;
}
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  const aa = bounds(a);
  const bb = bounds(b);
  if (
    Math.min(aa.x1, bb.x1) <= Math.max(aa.x0, bb.x0) + EPSILON ||
    Math.min(aa.y1, bb.y1) <= Math.max(aa.y0, bb.y0) + EPSILON
  )
    return false;
  if (a.some(p => pointInPolygon(p, b, false)) || b.some(p => pointInPolygon(p, a, false))) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j];
      const s = b[(j + 1) % b.length];
      if (properIntersection(p, q, r, s)) return true;
      if (Math.abs(cross(p, q, r)) > EPSILON || Math.abs(cross(p, q, s)) > EPSILON) continue;
      const axis = p[0] === q[0] ? 1 : 0;
      const lo = Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], s[axis]));
      const hi = Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], s[axis]));
      if (hi - lo <= EPSILON) continue;
      const mid: Point = axis === 0 ? [(lo + hi) / 2, p[1]] : [p[0], (lo + hi) / 2];
      const len = distance(p, q);
      const inset: Point = [mid[0] - ((q[1] - p[1]) / len) * 1e-5, mid[1] + ((q[0] - p[0]) / len) * 1e-5];
      if (pointInPolygon(inset, b, false)) return true;
    }
  }
  return false;
}
export function hasLocks(document: DungeonDocument): boolean {
  return document.levels.some(level =>
    [level.spaces, level.boundaries, level.openings, level.fixtures].some(collection =>
      Object.values(collection).some(item => item.locked)
    )
  );
}
