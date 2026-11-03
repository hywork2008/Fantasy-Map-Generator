import { planAxes, planBox, planBoxCorners } from "../../buildings/placementContract";
import { placementFootprint } from "../../buildings/placementModels";
import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { polygonOverlaps } from "./fortifications";
import { nearestOnPolyline, polygonCentroid } from "./geom";
import { type MarketPlacementResult, placeMarketInArea } from "./marketPlacement";

export const MARKET_HALL_IDS = ["medieval-town-hall", "covered-market-hall", "cloth-guild-hall"];
export interface DesignatedMarket {
  id: string;
  setting: "street" | "hall-front" | "freeform";
  center: Point;
  widthMeters: number;
  depthMeters: number;
  rotationDegrees: number;
  hallId?: string;
}

/** Explicit survey rectangle, aligned to plan +X at zero degrees. No land is demolished or levelled here. */
export function marketRectangle(input: DesignatedMarket): Point[] | null {
  if (
    !input.id ||
    !input.center.every(Number.isFinite) ||
    ![input.widthMeters, input.depthMeters, input.rotationDegrees].every(Number.isFinite) ||
    input.widthMeters < 12 ||
    input.depthMeters < 12 ||
    input.widthMeters > 120 ||
    input.depthMeters > 120
  )
    return null;
  return planBoxCorners(
    planBox(
      input.center,
      { halfX: input.widthMeters / 2, halfZ: input.depthMeters / 2 },
      (input.rotationDegrees * Math.PI) / 180
    )
  );
}

export function placeDesignatedMarket(document: CityDocument, input: DesignatedMarket): MarketPlacementResult {
  const fail = (reason: MarketPlacementResult["reason"]): MarketPlacementResult => ({ document, placed: 0, reason });
  if (!document.terrain?.field) return fail("field");
  if ((document.markets?.length ?? 0) >= 128) return fail("space");
  const boundary = marketRectangle(input);
  const half = document.frame.extentMeters / 2;
  if (!boundary || boundary.some(p => Math.abs(p[0]) > half || Math.abs(p[1]) > half)) return fail("area");
  const marketId = `area-market:${input.setting === "hall-front" ? input.hallId : input.id}`;
  if (document.markets?.some(m => m.id === marketId || polygonOverlaps(m.boundary, boundary))) return fail("existing");
  if (input.setting === "freeform" && !document.freeform) return fail("freeform");
  const fabric = buildBlockFabric(document);
  const streets: Point[][] = [
    ...fabric.lanes.map(l => l.points),
    ...(document.terrain.ways ?? []).filter(w => w.profile === "slope").map(w => w.centerline)
  ];
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      if (edge) streets.push([document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point]);
    }
  }
  const probes = [
    polygonCentroid(boundary),
    ...boundary,
    ...boundary.map((p, i): Point => [(p[0] + boundary[(i + 1) % 4][0]) / 2, (p[1] + boundary[(i + 1) % 4][1]) / 2])
  ];
  const connection = streets
    .filter(s => s.length >= 2)
    .flatMap(s => probes.map(p => nearestOnPolyline(p, s)))
    .filter(hit => hit.dist <= 16)
    .sort((a, b) => a.dist - b.dist)[0];
  if (!connection) return fail("street");
  const access: Point[] = [connection.point];
  const hall = input.setting === "hall-front" ? document.elements.find(e => e.id === input.hallId) : undefined;
  if (input.setting === "hall-front") {
    if (!hall?.point || !hall.objectType || !MARKET_HALL_IDS.includes(hall.objectType)) return fail("hall");
    if (hall.locked) return fail("locked");
    const footprint = placementFootprint(hall.objectType, hall.objectQuality)!;
    const axis = planAxes(hall.rotation ?? 0).axisZ;
    const delta: Point = [input.center[0] - hall.point[0], input.center[1] - hall.point[1]];
    if (delta[0] * axis[0] + delta[1] * axis[1] <= footprint.halfZ || Math.hypot(...delta) > 60) return fail("hall");
    if (
      boundary.some(
        point => (point[0] - hall.point![0]) * axis[0] + (point[1] - hall.point![1]) * axis[1] < footprint.halfZ + 2
      )
    )
      return fail("hall");
    access.push([hall.point[0] + axis[0] * (footprint.halfZ + 3), hall.point[1] + axis[1] * (footprint.halfZ + 3)]);
  }
  return placeMarketInArea(
    document,
    {
      anchor: hall ?? { id: input.id, kind: "plaza", point: input.center, faceIds: [], locked: false },
      boundary,
      setting: input.setting,
      streetAccess: access
    },
    fabric
  );
}

/** Market operations never modify manually placed objects or the pose/quality of a locked stall. */
export function setMarketActivity(
  document: CityDocument,
  id: string,
  activity: "market-day" | "closed"
): CityDocument | null {
  const market = document.markets?.find(m => m.id === id);
  if (!market) return null;
  const owned = new Set(market.stallElementIds);
  return {
    ...document,
    markets: document.markets!.map(m => (m.id === id ? { ...m, activity } : m)),
    elements: document.elements.map(e => (owned.has(e.id) && !e.locked ? { ...e, objectMarketActivity: activity } : e))
  };
}
