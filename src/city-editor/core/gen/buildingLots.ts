import { circuitRing, polygonOverlaps, reservedCastleFaces } from "../fortifications";
// MIT, independently implemented from the reference city's output geometry.
import { facePoints, indexMeshEdges } from "../mesh";
import type { CityDocument, Face, Id, Point } from "../types";
import { buildBlockFabric } from "./blockInfill";
import { orientedRectPolylineDistance, polygonHitsTempleYard, templeRectForElement } from "./civicPlacement";
import { COASTAL_BUILDING_SETBACK_METERS, coastalBandOverlap, oceanShoreSegments } from "./coastalSuitability";
import { relieveGatePlazaBuildings } from "./gatePlazaBuildings";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { civicYardMeters } from "./housing";
import { rebuildLandmarkHousing } from "./landmarkIntegration";
import { clipBlockWithRivers, clipHalfPlane, insetConvexKernel, longestFrame, type RiverMargin } from "./lotGeometry";
import { makeRng } from "./prng";

export { insetConvexKernel } from "./lotGeometry";

export interface BuildingLot {
  faceId: Id;
  polygon: Point[];
  landmark: boolean;
  id?: Id;
  parcelId?: Id;
  archetype?: import("./parcelTypes").ParcelArchetype;
  role?: "main" | "wing" | "store" | "workshop" | "stable" | "shed";
  uses?: Array<"residential" | "retail" | "storage" | "craft">;
  storeys?: number;
}

/** Buildings are derived from the edited mesh, never a second source of street
 * geometry. Per-face random streams keep unrelated edits from shuffling lots. */
export function buildCityBuildings(document: CityDocument): BuildingLot[] {
  if (
    document.buildingPattern === "medieval" ||
    document.fabric?.version === 5 ||
    document.gridKind === "evolution" ||
    document.layout === "circulade" ||
    document.layout === "bram" ||
    document.layout === "classic"
  )
    return buildBlockFabric(document).buildings;
  const edgeIndex = indexMeshEdges(document.mesh);
  const clearance = new Map<Id, number>();
  const rivers: RiverMargin[] = [];
  for (const group of document.featureGroups) {
    if (group.kind === "river") {
      const pts = group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
      if (pts.length >= 2) {
        rivers.push({
          points: pts,
          margin: group.style.widthMeters / 2 + 3,
          halfWidth: group.style.widthMeters / 2
        });
      }
    }
    const edgeIds =
      group.kind === "river"
        ? group.vertices.slice(1).flatMap((id, i) => {
            const edge = edgeIndex.between(group.vertices[i], id);
            return edge ? [edge.id] : [];
          })
        : group.segments.map(s => s.edgeId);
    for (const id of edgeIds) clearance.set(id, Math.max(clearance.get(id) ?? 0, group.style.widthMeters / 2 + 3));
  }
  const lots: BuildingLot[] = [];
  for (const face of Object.values(document.mesh.faces)) lots.push(...buildFaceLots(document, face, clearance, rivers));
  return rebuildLandmarkHousing(
    document,
    relieveGatePlazaBuildings(
      document,
      lots.filter(lot => !buildingHitsCivicLandmark(document, lot.polygon))
    )
  );
}

export function buildingHitsCivicLandmark(document: CityDocument, polygon: Point[]): boolean {
  if (
    (document.defenseCircuits ?? [])
      .filter(c => c.scope === "castle")
      .some(c => polygonOverlaps(polygon, circuitRing(document, c)))
  )
    return true;
  if ((document.cemeteries ?? []).some(c => polygonOverlaps(polygon, c.boundary))) return true;
  const yard = civicYardMeters(document.frame.extentMeters);
  for (const element of document.elements) {
    if (element.kind === "temple" && element.point) {
      const rect = templeRectForElement(
        element.point,
        element.sizeMeters,
        element.rotation,
        document.frame.extentMeters
      );
      if (polygonHitsTempleYard(polygon, rect, Math.max(2, yard * 0.25))) return true;
    }
  }
  return false;
}

export function laneHitsCivicLandmark(document: CityDocument, points: Point[]): boolean {
  for (const element of document.elements) {
    if (element.kind === "temple" && element.point) {
      const rect = templeRectForElement(
        element.point,
        element.sizeMeters,
        element.rotation,
        document.frame.extentMeters
      );
      if (orientedRectPolylineDistance(rect, points) < 1.8) return true;
    }
  }
  return false;
}

function buildFaceLots(
  document: CityDocument,
  face: Face,
  clearance: Map<Id, number>,
  rivers: RiverMargin[]
): BuildingLot[] {
  if (reservedCastleFaces(document).has(face.id)) return [];
  const { water, ward, buildable } = face.properties;
  if (
    water !== "land" ||
    !buildable ||
    !ward ||
    ward === "empty" ||
    ward === "park" ||
    ward === "farm" ||
    ward === "cemetery"
  )
    return [];
  if (document.elements.some(e => (e.kind === "plaza" || e.kind === "temple") && e.faceIds.includes(face.id)))
    return [];
  const polygon = facePoints(document.mesh, face);
  if (polygon.length < 3) return [];
  const setbacks = face.boundary.map(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    const otherId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
    const other = otherId ? document.mesh.faces[otherId] : null;
    return Math.max(3, clearance.get(ref.edgeId) ?? 0, other && other.properties.water !== "land" ? 6 : 0);
  });
  let block = insetConvexKernel(polygon, setbacks);
  if (block.length < 3 || Math.abs(polygonArea(block)) < 65) return [];
  if (rivers.length > 0) {
    block = clipBlockWithRivers(block, polygon, face.site ?? polygonCentroid(polygon), rivers);
    if (block.length < 3 || Math.abs(polygonArea(block)) < 65) return [];
  }
  const rng = makeRng(`lots:${face.id}:${ward}`);
  const landmark = ward === "castle";
  const targetArea = landmark ? 1600 : ward === "merchant" ? 260 : ward === "harbor" ? 300 : 180;
  const result: BuildingLot[] = [];
  const subdivide = (poly: Point[], depth: number): void => {
    const area = Math.abs(polygonArea(poly));
    if (area < 65) return;
    const { axis, min, max, across } = longestFrame(poly);
    const length = max - min;
    if (depth < 10 && area > targetArea * rng.range(1.1, 1.7) && length > 17) {
      const cut = min + length * rng.range(0.42, 0.58);
      // A few wider alleys separate clusters; the remaining lot boundaries
      // leave narrow gaps between neighbouring buildings.
      const gap = depth < 2 && area > 1800 ? 2.6 : 0.85;
      const a = clipHalfPlane(poly, axis, cut - gap / 2);
      const b = clipHalfPlane(poly, [-axis[0], -axis[1]], -cut - gap / 2);
      if (a.length >= 3 && b.length >= 3 && Math.abs(polygonArea(a)) > 60 && Math.abs(polygonArea(b)) > 60) {
        subdivide(a, depth + 1);
        subdivide(b, depth + 1);
        return;
      }
    }
    if (across < 4 || length / across > 5) return;
    const building = insetConvexKernel(
      poly,
      poly.map(() => 0.35)
    );
    if (building.length >= 3) {
      const encroaches = rivers.some(r => building.some(pt => nearestOnPolyline(pt, r.points).dist < r.halfWidth));
      if (!encroaches) {
        result.push({ faceId: face.id, polygon: building, landmark });
      }
    }
  };
  subdivide(block, 0);
  const shore = oceanShoreSegments(document);
  return shore.length
    ? result.filter(
        lot =>
          document.mesh.faces[lot.faceId]?.properties.locked ||
          document.mesh.faces[lot.faceId]?.properties.ward === "harbor" ||
          !coastalBandOverlap(lot.polygon, shore, COASTAL_BUILDING_SETBACK_METERS)
      )
    : result;
}
