import type { Id, Point } from "../types/document";

export function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + ratio * dx), point[1] - (a[1] + ratio * dy));
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [x, y] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    if (y > point[1] === previousY > point[1]) continue;
    const crossingX = ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (point[0] < crossingX) inside = !inside;
  }
  return inside;
}

export function circleIntersectsPolygon(center: Point, radius: number, polygon: Point[]): boolean {
  if (pointInPolygon(center, polygon)) return true;
  for (let index = 0; index < polygon.length; index++) {
    if (pointToSegmentDistance(center, polygon[index], polygon[(index + 1) % polygon.length]) <= radius) return true;
  }
  return false;
}

export function vertexPairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
