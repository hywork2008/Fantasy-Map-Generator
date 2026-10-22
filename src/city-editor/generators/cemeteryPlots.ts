import type { CemeteryPart, CemeteryPlan, Point } from "../types/document";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";
import { bounds } from "./parcelGeometry";

/** Legacy SVG burial plots, shared with 3D. Index includes skipped cells to preserve slab variation. */
export function cemeteryPlots(
  cemetery: CemeteryPlan,
  part: CemeteryPart
): { point: Point; index: number; slab: boolean }[] {
  const [minX, minY, maxX, maxY] = bounds(part.footprint);
  const calvary = cemetery.parts.find(p => p.role === "calvary");
  const center = calvary ? polygonCentroid(calvary.footprint) : null;
  const plots: { point: Point; index: number; slab: boolean }[] = [];
  let index = 0;
  for (let x = minX + 1.2; x <= maxX - 1.2; x += 2.2) {
    for (let y = minY + 1; y <= maxY - 1; y += 2.4) {
      index++;
      const point: Point = [x, y];
      if (!pointInPolygon(point, part.footprint)) continue;
      if (cemetery.accesses.some(a => nearestOnPolyline(point, a.points).dist < (a.widthMeters ?? 1.8) / 2 + 0.45))
        continue;
      if (center && Math.hypot(x - center[0], y - center[1]) < 2) continue;
      if (cemetery.trees.some(t => Math.hypot(x - t[0], y - t[1]) < 2.2)) continue;
      plots.push({ point, index, slab: index % 3 !== 0 });
    }
  }
  return plots;
}
