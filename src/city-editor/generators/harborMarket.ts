import type { CityDocument, Point } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { buildCityBuildings } from "./buildingLots";
import { assignBuildingMassing } from "./buildingMassing";
import { convexHull, nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { harborLandFace } from "./harborLand";
import { clipHalfPlane, convexInfillParts, insetConvexKernel } from "./lotGeometry";
import { marketHarborReservations } from "./marketHarborReservations";
import { type MarketPlacementResult, placeMarketInArea } from "./marketPlacement";
import { facePoints } from "./mesh";
import { bounds, boundsOverlap, subtractConvex } from "./parcelGeometry";

/** A quay or a navigable pier is required; a coastline or an unserved marker is insufficient. */
export function placeHarborMarket(document: CityDocument, harborId?: string): MarketPlacementResult {
  const fail = (reason: MarketPlacementResult["reason"]): MarketPlacementResult => ({ document, placed: 0, reason });
  if (document.freeform) return fail("freeform");
  if ((document.markets?.length ?? 0) >= 128) return fail("space");
  const anchor = document.elements
    .filter(item => item.kind === "harbor" && (!harborId || item.id === harborId))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!anchor) return fail("harbor");
  if (anchor.locked) return fail("locked");
  if (document.markets?.some(market => market.anchorElementId === anchor.id)) return fail("existing");
  if (!document.terrain?.field) return fail("field");
  const fabric = buildBlockFabric(document);
  const harbor = fabric.harbor;
  if (!harbor) return fail("harbor");
  const owners = new Set(anchor.faceIds.filter(id => harborLandFace(document, id)));
  const roots: Array<{ point: Point; inward: Point; faceId: string; river: boolean }> = [];
  for (const pier of harbor.piers) {
    if (!pier.landFaceId || !owners.has(pier.landFaceId) || !pier.start || !pier.end) continue;
    const dx = pier.start[0] - pier.end[0],
      dy = pier.start[1] - pier.end[1];
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) continue;
    const river = !!pier.riverId;
    if (document.waterAccess && !document.waterAccess.port?.[river ? "river" : "sea"]) continue;
    if ((anchor.harborKind === "river" && !river) || (anchor.harborKind === "sea" && river)) continue;
    roots.push({ point: pier.start, inward: [dx / length, dy / length], faceId: pier.landFaceId, river });
  }
  for (const quay of harbor.cargoQuays ?? []) {
    if (
      !owners.has(quay.landFaceId) ||
      anchor.harborKind === "river" ||
      (document.waterAccess && !document.waterAccess.port?.sea)
    )
      continue;
    roots.push({
      point: quay.axis,
      inward: [-quay.outward[0], -quay.outward[1]],
      faceId: quay.landFaceId,
      river: false
    });
  }
  if (!roots.length) return fail("harbor");
  const freight = marketHarborReservations(document, fabric);
  const blocked = [
    ...freight.areas,
    ...assignBuildingMassing(document, [...fabric.buildings, ...buildCityBuildings(document)]).map(
      building => building.polygon
    ),
    ...(document.markets ?? []).map(market => market.boundary)
  ];
  const streets: Point[][] = fabric.lanes.map(lane => lane.points);
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      if (edge) streets.push([document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point]);
    }
  }
  for (const way of document.terrain.ways ?? []) streets.push(way.centerline);
  const candidates: Array<{
    boundary: Point[];
    river: boolean;
    entry: Point;
    area: number;
    distance: number;
    faceId: string;
  }> = [];
  for (const root of roots) {
    const face = document.mesh.faces[root.faceId];
    const rear = facePoints(document.mesh, face);
    // Stay behind the quay and its eight-metre handling strip, never on the pier apron.
    let pieces = convexInfillParts(
      clipHalfPlane(
        rear,
        [-root.inward[0], -root.inward[1]],
        -(root.point[0] * root.inward[0] + root.point[1] * root.inward[1] + 12)
      )
    );
    for (const obstacle of blocked) {
      const parts = convexInfillParts(convexHull(obstacle));
      for (const part of parts)
        pieces = pieces.flatMap(piece =>
          boundsOverlap(bounds(piece), bounds(part)) ? subtractConvex(piece, part, 40) : [piece]
        );
      if (pieces.length > 128) {
        pieces = [];
        break;
      }
    }
    for (const piece of pieces) {
      const boundary = insetConvexKernel(
        piece,
        piece.map(() => 2.2)
      );
      const area = Math.abs(polygonArea(boundary));
      if (boundary.length < 3 || area < 180) continue;
      const center = polygonCentroid(boundary);
      const distance = Math.hypot(center[0] - root.point[0], center[1] - root.point[1]);
      if (distance > 100) continue;
      const probes = [
        center,
        ...boundary,
        ...boundary.map(
          (point, i): Point => [
            (point[0] + boundary[(i + 1) % boundary.length][0]) / 2,
            (point[1] + boundary[(i + 1) % boundary.length][1]) / 2
          ]
        )
      ];
      const connection = streets
        .filter(line => line.length >= 2)
        .flatMap(line => probes.map(point => nearestOnPolyline(point, line)))
        .filter(hit => hit.dist <= 24)
        .sort(
          (a, b) =>
            a.dist - b.dist ||
            Math.hypot(a.point[0] - center[0], a.point[1] - center[1]) -
              Math.hypot(b.point[0] - center[0], b.point[1] - center[1])
        )[0];
      if (!connection) continue;
      const key = JSON.stringify(boundary);
      if (candidates.some(candidate => JSON.stringify(candidate.boundary) === key)) continue;
      candidates.push({ boundary, river: root.river, entry: connection.point, area, distance, faceId: root.faceId });
    }
  }
  candidates.sort((a, b) => b.area - a.area || a.distance - b.distance);
  for (const candidate of candidates.slice(0, 12)) {
    const result = placeMarketInArea(
      document,
      {
        anchor,
        boundary: candidate.boundary,
        setting: candidate.river ? "river-port" : "sea-port",
        streetAccess: [candidate.entry],
        harborFaceId: candidate.faceId
      },
      fabric
    );
    if (result.placed) return result;
  }
  return fail("space");
}
