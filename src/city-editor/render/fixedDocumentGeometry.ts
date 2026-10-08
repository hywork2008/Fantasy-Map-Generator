import { footprintTouchesWater } from "../../services/riverPhysicalGeometry";
import {
  FIXED_SITE_CROSSING_BUDGETS,
  type FixedBurgCrossings,
  validFixedBurgCrossings
} from "../../utils/fixedBurgCrossings";
import { requiredSiteExtent } from "../../utils/requiredSiteBounds";
import type { CityDocument, Point } from "../core/types";
import { drawFixedBurgCrossings } from "./fixedBurgCrossings";

export function fixedDocumentGeometry(doc: CityDocument): FixedBurgCrossings | null {
  const payload = doc.importedFixedCrossings;
  if (payload?.schemaVersion === 3 || payload?.schemaVersion === 4) {
    const b = payload.coverageBounds,
      half = doc.frame.extentMeters / 2;
    if (!b || b.minX > -half || b.minY > -half || b.maxX < half || b.maxY < half) return null;
  }
  return payload &&
    validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS) &&
    Number.isFinite(doc.frame.extentMeters) &&
    doc.frame.extentMeters > 0 &&
    requiredSiteExtent(payload.requiredBounds) <= doc.frame.extentMeters
    ? payload
    : null;
}
/** Conservative whole-stroke test. Expanded end squares also cover round joins. */
export function fixedRoadIsDry(points: readonly Point[], width: number, payload: FixedBurgCrossings): boolean {
  if (!Number.isFinite(width) || width <= 0 || points.length < 2) return false;
  const half = width / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    if (!Number.isFinite(length)) return false;
    if (!length) continue;
    const t = [dx / length, dy / length],
      n = [-t[1], t[0]];
    const corners = [
      [-half, -half],
      [-half, half],
      [length + half, half],
      [length + half, -half]
    ].map(([x, y]) => [a[0] + t[0] * x + n[0] * y, a[1] + t[1] * x + n[1] * y] as Point);
    if (
      corners.some(p => p.some(v => !Number.isFinite(v))) ||
      [...payload.rivers, ...(payload.obstacles ?? [])].some(r => footprintTouchesWater(corners, r))
    )
      return false;
  }
  return true;
}
export function fixedDocumentLayers(payload: FixedBurgCrossings): { water: SVGGElement; crossings: SVGGElement } {
  const ns = "http://www.w3.org/2000/svg";
  const source = document.createElementNS(ns, "g"),
    water = document.createElementNS(ns, "g"),
    crossings = document.createElementNS(ns, "g");
  drawFixedBurgCrossings(source, payload, FIXED_SITE_CROSSING_BUDGETS);
  for (const path of Array.from(source.children))
    (path.hasAttribute("data-river-id") ? water : crossings).appendChild(path);
  water.setAttribute("class", "ce-fixed-river-water");
  crossings.setAttribute("class", "ce-fixed-crossings");
  for (const group of [water, crossings]) {
    group.setAttribute("transform", "scale(1,-1)");
    group.setAttribute("pointer-events", "none");
  }
  return { water, crossings };
}
