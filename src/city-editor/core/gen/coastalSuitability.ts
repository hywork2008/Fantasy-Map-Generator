import type { CityDocument, Point } from "../types";
import { polygonArea } from "./geom";
import { convexInfillParts } from "./lotGeometry";
import { bounds, boundsOverlap, corridor, intersectConvex, subtractConvex } from "./parcelGeometry";

/** A landscape buffer, in world metres. This is not a model of flood height. */
export const COASTAL_ARABLE_SETBACK_METERS = 60;
export const COASTAL_BUILDING_SETBACK_METERS = 20;

/** Only edges shared by generated ocean and land count as saltwater shoreline. */
export function oceanShoreSegments(document: CityDocument): [Point, Point][] {
  const ocean = new Set(document.coastalOceanFaceIds ?? []);
  if (!ocean.size) return [];
  const segments: [Point, Point][] = [];
  for (const edge of Object.values(document.mesh.edges)) {
    const left = document.mesh.faces[edge.leftFace ?? ""];
    const right = document.mesh.faces[edge.rightFace ?? ""];
    if (!left || !right) continue;
    const isShore =
      (ocean.has(left.id) && left.properties.water === "sea" && right.properties.water === "land") ||
      (ocean.has(right.id) && right.properties.water === "sea" && left.properties.water === "land");
    if (isShore) segments.push([document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point]);
  }
  return segments;
}

/** Preserve the cultivable interior of a convex plot, including split pieces. */
export function cultivableParts(
  polygon: Point[],
  shore: [Point, Point][],
  setback = COASTAL_ARABLE_SETBACK_METERS
): Point[][] {
  let parts = [polygon];
  for (const [a, b] of shore) {
    const band = corridor(a, b, setback * 2, setback);
    if (!band.length) continue;
    const box = bounds(band);
    parts = parts.flatMap(part => (boundsOverlap(bounds(part), box) ? subtractConvex(part, band, 150) : [part]));
    if (!parts.length) break;
  }
  return parts.filter(part => Math.abs(polygonArea(part)) >= 150);
}

export function coastalBandOverlap(polygon: Point[], shore: [Point, Point][], setback: number): boolean {
  const parts = convexInfillParts(polygon);
  for (const [a, b] of shore) {
    const band = corridor(a, b, setback * 2, setback);
    if (!band.length) continue;
    const box = bounds(band);
    if (
      parts.some(part => boundsOverlap(bounds(part), box) && Math.abs(polygonArea(intersectConvex(part, band))) > 0.01)
    )
      return true;
  }
  return false;
}

/** Clip existing furrows, preserving their orientation and garden/open-field style. */
export function clipRowsToConvex(rows: Point[][], polygon: Point[]): Point[][] {
  const sign = -Math.sign(polygonArea(polygon));
  if (!sign) return [];
  return rows.flatMap(row =>
    row.slice(1).flatMap((end, i) => {
      const start = row[i];
      let lo = 0,
        hi = 1;
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % polygon.length];
        const cross = (p: Point) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
        const c0 = cross(start),
          c1 = cross(end),
          delta = c1 - c0;
        if (Math.abs(delta) < 1e-9) {
          if (c0 < -1e-8) return [];
          continue;
        }
        const t = -c0 / delta;
        if (delta > 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
        if (lo >= hi - 1e-8) return [];
      }
      const point = (t: number): Point => [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
      return [[point(lo), point(hi)]];
    })
  );
}
