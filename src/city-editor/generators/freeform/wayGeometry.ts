import type { Point } from "../../types/primitives";
import { nearestOnPolyline, pointInPolygon, polylineLength } from "../geom";

/** Samples ignored at each end of a way, so a spur may leave a plot or meet a landing. */
export const WAY_END_CLEARANCE_METERS = 1.6;

export function pointAlong(line: readonly Point[], distance: number): Point {
  if (!line.length) return [0, 0];
  if (line.length === 1 || distance <= 0) return [line[0][0], line[0][1]];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + span >= distance - 1e-9 || i === line.length - 1) {
      const t = span > 1e-9 ? Math.max(0, Math.min(1, (distance - walked) / span)) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += span;
  }
  const last = line[line.length - 1];
  return [last[0], last[1]];
}

/** Stations every `spacing` metres, plus the real end when it is not already on a station. */
export function stationsAlong(line: readonly Point[], spacing: number): { point: Point; distance: number }[] | null {
  if (line.length < 2 || !(spacing > 0)) return null;
  const total = polylineLength(line as Point[]);
  if (total < 1e-3) return null;
  const stations = [{ point: [line[0][0], line[0][1]] as Point, distance: 0 }];
  for (let target = spacing; target < total - 1e-4; target += spacing)
    stations.push({ point: pointAlong(line, target), distance: target });
  const end = line[line.length - 1];
  const last = stations[stations.length - 1];
  if (total - last.distance <= 1e-4) stations[stations.length - 1] = { point: [end[0], end[1]], distance: total };
  else stations.push({ point: [end[0], end[1]], distance: total });
  return stations;
}

/** Open polyline between two distances, including both ends. */
export function slicePolyline(line: readonly Point[], from: number, to: number): Point[] {
  if (line.length < 2 || to - from < 1e-4) return [];
  const points: Point[] = [pointAlong(line, from)];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const next = walked + span;
    if (next > from + 1e-6 && next < to - 1e-6) points.push([b[0], b[1]]);
    walked = next;
  }
  points.push(pointAlong(line, to));
  return points;
}

/** Strip around a polyline. The ring is closed by the caller as a polygon. */
export function offsetStrip(line: readonly Point[], halfWidth: number): Point[] {
  if (line.length < 2 || !(halfWidth > 0)) return [];
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    left.push([line[i][0] - ty * halfWidth, line[i][1] + tx * halfWidth]);
    right.push([line[i][0] + ty * halfWidth, line[i][1] - tx * halfWidth]);
  }
  return [...left, ...right.reverse()];
}

/** True when the way, except its ends, covers `polygon`. */
export function wayCoversRing(line: readonly Point[], widthMeters: number, polygon: readonly Point[]): boolean {
  if (line.length < 2 || polygon.length < 3) return false;
  const ring = polygon as Point[];
  const total = polylineLength(line as Point[]);
  const half = widthMeters / 2;
  for (let distance = WAY_END_CLEARANCE_METERS; distance <= total - WAY_END_CLEARANCE_METERS; distance += 0.5) {
    if (pointInPolygon(pointAlong(line, distance), ring)) return true;
  }
  for (const vertex of ring) {
    const hit = nearestOnPolyline(vertex, line as Point[]);
    if (hit.dist > half) continue;
    let along = 0;
    for (let i = 0; i < hit.segIndex; i++)
      along += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
    const a = line[hit.segIndex];
    const b = line[hit.segIndex + 1];
    along += hit.t * Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (along >= WAY_END_CLEARANCE_METERS && along <= total - WAY_END_CLEARANCE_METERS) return true;
  }
  return false;
}

/** Distance from a point to a segment, and whether the foot is interior. */
export function distanceToSegment(point: Point, a: Point, b: Point): { distance: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq)) : 0;
  return { t, distance: Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t) };
}

export { polylineLength };
