import type { CityDocument, CityElement, Point } from "../types/document";
import { boundaryEdges, boundaryRings, refPoints } from "./fortifications";
import { isSimplePolygon, polygonArea } from "./geom";
import { convexInfillParts, insetConvexKernel } from "./lotGeometry";
import { type MarketPlacementReason, type MarketPlacementResult, placeMarketInArea } from "./marketPlacement";

export type { MarketPlacementReason, MarketPlacementResult } from "./marketPlacement";

/** One explicit plaza per click. Reloads and redraws never call this planner. */
export function placePlazaMarket(document: CityDocument, plazaId?: string): MarketPlacementResult {
  const fail = (reason: MarketPlacementReason): MarketPlacementResult => ({ document, placed: 0, reason });
  if (document.freeform) return fail("freeform");
  if ((document.markets?.length ?? 0) >= 128) return fail("space");
  const plaza = document.elements
    .filter(item => item.kind === "plaza" && (!plazaId || item.id === plazaId))
    .sort(
      (a, b) => Math.hypot(...(a.point ?? [0, 0])) - Math.hypot(...(b.point ?? [0, 0])) || a.id.localeCompare(b.id)
    )[0];
  if (!plaza) return fail("plaza");
  if (plaza.locked) return fail("locked");
  if (document.markets?.some(market => market.anchorElementId === plaza.id)) return fail("existing");
  if (!document.terrain?.field) return fail("field");
  const boundary = plazaBoundary(document, plaza);
  if (!boundary) return fail("space");
  return placeMarketInArea(document, { anchor: plaza, boundary, setting: "plaza" });
}

/** One convex component: concavities, holes and disconnected plazas never get bridged by a stall. */
function plazaBoundary(document: CityDocument, plaza: CityElement): Point[] | null {
  let parts: Point[][];
  if (plaza.faceIds.length) {
    if (plaza.faceIds.some(id => document.mesh.faces[id]?.properties.water !== "land")) return null;
    const rings = boundaryRings(document.mesh, boundaryEdges(document.mesh, plaza.faceIds));
    if (rings.length !== 1) return null;
    const ring = refPoints(document.mesh, rings[0]);
    if (!isSimplePolygon(ring)) return null;
    parts = convexInfillParts(ring);
  } else {
    if (!plaza.point || !Number.isFinite(plaza.sizeMeters) || !(plaza.sizeMeters! > 0)) return null;
    // Inscribed in the declared diameter; do not guess a default size for a point-only marker.
    parts = [square(plaza.point, plaza.sizeMeters! / (2 * Math.SQRT2))];
  }
  const part = parts.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  if (!part) return null;
  const half = document.frame.extentMeters / 2;
  const boundary = insetConvexKernel(
    part,
    part.map(() => 0.1)
  );
  return boundary.length >= 3 && boundary.every(point => Math.abs(point[0]) <= half && Math.abs(point[1]) <= half)
    ? boundary
    : null;
}

function square(point: Point, half: number): Point[] {
  return [
    [point[0] - half, point[1] - half],
    [point[0] + half, point[1] - half],
    [point[0] + half, point[1] + half],
    [point[0] - half, point[1] + half]
  ];
}
