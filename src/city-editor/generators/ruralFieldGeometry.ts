import type { Point } from "../types/document";
import { chord } from "./fieldChord";
import { convexInfillParts } from "./lotGeometry";
import { bounds } from "./parcelGeometry";

const rotate = ([x, y]: Point, angle: number): Point => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle)
];
/** Parallel sampled curves clipped one straight segment at a time. Unlike a
 * longest chord across a concavity, a row can never jump a notch or a hole. */
export function curvedRows(polygon: Point[], angle: number, spacing: number, bend: number): Point[][] {
  const local = polygon.map(p => rotate(p, -angle));
  const [x0, y0, x1, y1] = bounds(local);
  const parts = convexInfillParts(local);
  const rows: Point[][] = [];
  for (let y = y0 + spacing; y < y1 - bend - 1; y += spacing) {
    const points = Array.from({ length: 13 }, (_, i): Point => {
      const t = i / 12;
      return [x0 + 1 + (x1 - x0 - 2) * t, y + bend * Math.sin(Math.PI * t) ** 2];
    });
    let current: Point[] = [];
    for (let i = 1; i < points.length; i++) {
      const segments = parts
        .flatMap(part => {
          const clipped = clipSegment(points[i - 1], points[i], part);
          return clipped ? [clipped] : [];
        })
        .sort((a, b) => a[0][0] - b[0][0]);
      for (const segment of segments) {
        const end = current.at(-1);
        if (end && Math.hypot(end[0] - segment[0][0], end[1] - segment[0][1]) < 1e-5) current.push(segment[1]);
        else {
          if (current.length > 1) rows.push(current.map(p => rotate(p, angle)));
          current = segment;
        }
      }
    }
    if (current.length > 1) rows.push(current.map(p => rotate(p, angle)));
  }
  return rows;
}
function clipSegment(a: Point, b: Point, polygon: Point[]): Point[] | null {
  // A thin segment is intersected parametrically against convex boundaries.
  const direction: Point = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(...direction);
  if (length < 1e-6) return null;
  const normal: Point = [-direction[1] / length, direction[0] / length];
  const hit = chord(polygon, normal, a[0] * normal[0] + a[1] * normal[1]);
  if (!hit) return null;
  const t = (p: Point) => ((p[0] - a[0]) * direction[0] + (p[1] - a[1]) * direction[1]) / (length * length);
  const lo = Math.max(0, Math.min(...hit.map(t))),
    hi = Math.min(1, Math.max(...hit.map(t)));
  return hi - lo > 1e-7
    ? [
        [a[0] + direction[0] * lo, a[1] + direction[1] * lo],
        [a[0] + direction[0] * hi, a[1] + direction[1] * hi]
      ]
    : null;
}
export function clipLines(lines: Point[][], frame?: Point[]): Point[][] {
  if (!frame) return lines;
  return lines.flatMap(line =>
    line.slice(1).flatMap((b, i) => {
      const clipped = clipSegment(line[i], b, frame);
      return clipped ? [clipped] : [];
    })
  );
}
export function gatedBoundary(polygon: Point[], entrance: Point, gap: number): Point[][] {
  const nearest = polygon
    .map((a, i) => ({ i, hit: nearestOnSegment(entrance, a, polygon[(i + 1) % polygon.length]) }))
    .sort((a, b) => a.hit.dist - b.hit.dist)[0];
  return polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (i !== nearest.i) return [[a, b]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lo = Math.max(0, nearest.hit.t - gap / 2 / length),
      hi = Math.min(1, nearest.hit.t + gap / 2 / length);
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return [...(lo > 0 ? [[a, at(lo)]] : []), ...(hi < 1 ? [[at(hi), b]] : [])];
  });
}
export function nearestOnSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return { t, dist: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) };
}
