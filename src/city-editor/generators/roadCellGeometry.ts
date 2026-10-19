import type { Point } from "../types/document";
import { MIN_HOUSE_SPAN_METERS } from "./houseFootprint";

/** Match the road-side clearance used when deriving local housing fabric. */
const FRONTAGE_CLEARANCE_METERS = 0.35;

export function roadCellHousingWidth(firstRoadWidth: number, secondRoadWidth: number): number {
  return (firstRoadWidth + secondRoadWidth) / 2 + 2 * FRONTAGE_CLEARANCE_METERS + MIN_HOUSE_SPAN_METERS;
}

/** A supporting strip containing the entire polygon. For a narrow or tiny
 * cell this bounds the width available to any building, regardless of area. */
export function minimumCellWidth(points: Point[]): number {
  if (points.length < 3) return 0;
  let width = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const offsets = points.map(p => (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]);
    width = Math.min(width, Math.max(...offsets) - Math.min(...offsets));
  }
  return Number.isFinite(width) ? width : 0;
}

/** Area per half-perimeter detects bent slivers whose enclosing strip is wide.
 * Used only together with opposing road frontage, never as an area-only cutoff. */
export function roadCellEffectiveWidth(points: Point[]): number {
  let twiceArea = 0,
    perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    twiceArea += a[0] * b[1] - a[1] * b[0];
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const enclosingWidth = minimumCellWidth(points);
  const diameter = Math.max(0, ...points.flatMap(a => points.map(b => Math.hypot(b[0] - a[0], b[1] - a[1]))));
  return diameter >= 3 * enclosingWidth
    ? Math.min(enclosingWidth, Math.abs(twiceArea) / (perimeter || 1))
    : enclosingWidth;
}
