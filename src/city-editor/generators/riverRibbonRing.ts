import type { Point } from "../types/document";

/** Mitered river ring. Same degenerate cases as structureGeometry's private offsetSide. */
export function riverRibbonRing(centerline: Point[], widthMeters: number): Point[] | null {
  const half = widthMeters / 2;
  const left = offsetSide(centerline, half);
  const right = offsetSide(centerline, -half);
  if (!left || !right || left.length !== right.length || left.length < 2) return null;
  return [...left, ...[...right].reverse()];
}

export function closedLine(points: readonly Point[]): boolean {
  return (
    points.length > 3 &&
    Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 0.05
  );
}

function segmentNormals(points: readonly Point[], closed: boolean): Point[] {
  const count = closed ? points.length : points.length - 1;
  const normals: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    normals.push(length < 1e-6 ? [0, 1] : [-dy / length, dx / length]);
  }
  return normals;
}

/** Left side of the centre line. A short segment or a 180° cusp keeps the run. */
function offsetSide(points: readonly Point[], distance: number): Point[] | null {
  if (points.length < 2 || !(Math.abs(distance) > 0)) return null;
  if (points.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null;
  const closed = closedLine(points);
  const ring = closed ? points.slice(0, -1) : points;
  if (ring.length < 2) return null;
  const normals = segmentNormals(ring, closed);
  const side: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const previous = closed || i > 0 ? normals[(i - 1 + normals.length) % normals.length] : null;
    const next = closed || i < ring.length - 1 ? normals[Math.min(i, normals.length - 1)] : null;
    const a = previous ?? next!;
    const b = next ?? previous!;
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const length = Math.hypot(mx, my);
    if (length < 1e-6) {
      mx = a[0];
      my = a[1];
    } else {
      mx /= length;
      my /= length;
    }
    const denom = mx * b[0] + my * b[1];
    const scale = Math.abs(denom) < 0.25 ? distance / 0.25 : distance / denom;
    const clamped = Math.max(-Math.abs(distance) * 4, Math.min(Math.abs(distance) * 4, scale));
    side.push([ring[i][0] + mx * clamped, ring[i][1] + my * clamped]);
  }
  return side;
}
