import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "./gen/geom";
import { convexInfillParts } from "./gen/lotGeometry";
import { bounds, boundsOverlap, intersectConvex, plotArea } from "./gen/parcelGeometry";
import type { CityDocument, Point } from "./types";

/** The imported water boundary is independent of editing-cell resolution. */
export function waterPolygons(document: CityDocument): Point[][] {
  return (document.waterAreas ?? []).map(area => area.polygon);
}

function interior(point: Point, polygon: Point[]): boolean {
  return pointInPolygon(point, polygon) && nearestOnPolyline(point, [...polygon, polygon[0]]).dist > 1e-6;
}

/** Split at every bank intersection, including narrow channels and concave bends.
 * Boundary-only contact stays dry. */
export function dryRuns(line: Point[], polygons: readonly Point[][]): Point[][] {
  if (line.length < 2) return [];
  const runs: Point[][] = [];
  let current: Point[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const cuts = [0, 1];
    for (const polygon of polygons)
      for (let j = 0; j < polygon.length; j++) {
        const hit = segmentSegmentHit(a, b, polygon[j], polygon[(j + 1) % polygon.length]);
        if (hit) cuts.push(hit.t);
      }
    const sorted = [...new Set(cuts)].sort((x, y) => x - y);
    for (let j = 1; j < sorted.length; j++) {
      const start = sorted[j - 1],
        end = sorted[j];
      if (end - start < 1e-9) continue;
      if (polygons.some(polygon => interior(at((start + end) / 2), polygon))) {
        flush();
        continue;
      }
      if (!current.length) current.push(at(start));
      current.push(at(end));
    }
  }
  flush();
  return runs;
}

export function lineHitsWater(line: Point[], polygons: readonly Point[][]): boolean {
  if (!polygons.length || line.length < 2) return false;
  const length = (runs: Point[][]) =>
    runs.reduce(
      (sum, run) => sum + run.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - run[i][0], p[1] - run[i][1]), 0),
      0
    );
  return length(dryRuns(line, polygons)) < length([line]) - 1e-5;
}

const parts = new WeakMap<Point[], Point[][]>();
function convexParts(polygon: Point[]): Point[][] {
  let value = parts.get(polygon);
  if (!value) {
    value = convexInfillParts(polygon);
    parts.set(polygon, value);
  }
  return value;
}

export function polygonHitsWater(polygon: Point[], polygons: readonly Point[][]): boolean {
  const box = bounds(polygon);
  return polygons.some(
    water =>
      boundsOverlap(box, bounds(water)) &&
      convexParts(polygon).some(p => convexParts(water).some(w => plotArea(intersectConvex(p, w)) > 0.001))
  );
}

/** Partial cells remain land; exact polygons reserve their wet portion. */
export function cellInsideWater(polygon: Point[], water: Point[]): boolean {
  const area = plotArea(polygon);
  if (area < 0.001) return false;
  const wetArea = convexParts(polygon).reduce(
    (sum, piece) => sum + convexParts(water).reduce((n, part) => n + plotArea(intersectConvex(piece, part)), 0),
    0
  );
  return wetArea >= area - 0.001;
}
