import { SpatialBoundsIndex } from "../../services/spatialBoundsIndex";
import type { CityDocument, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import type { DistrictFabric } from "./blockInfill.types";
import type { BuildingLot } from "./buildingLots.types";
import { buildingHitsCivicLandmark } from "./civicClearance";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { landmarkReservationHits } from "./landmarks";
import { facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import { NearbyPolylineIndex } from "./nearbyPolylineIndex";
import { buildVacantTreeCandidates, type ParkTreeCanopy } from "./parkFabric";
import { waterPolygons } from "./waterGeometry";

/** Actual canopy extent, including every lobe. Buildings and water reserve the full canopy. */
export function treeCanopyRadius(tree: ParkTreeCanopy): number {
  return Math.max(tree.radius, ...tree.subCircles.map(lobe => Math.hypot(...lobe.offset) + lobe.radius));
}

function closed(points: Point[]): Point[] {
  return points.length ? [...points, points[0]] : [];
}

/** Derived from final buildings, so vacant spaces follow edits without changing the city. */
export function buildVacantLotTrees(
  document: CityDocument,
  lots: BuildingLot[],
  fabric: DistrictFabric | null,
  seed: string
): ParkTreeCanopy[] {
  const polygons = [
    ...lots.map(lot => lot.polygon),
    ...(fabric?.farms ?? []).map(farm => farm.polygon),
    ...(fabric?.openSpaces ?? [])
      .filter(space => !["backyard", "formal-garden", "courtyard"].includes(space.kind))
      .map(space => space.polygon),
    ...(fabric?.aerialLandmarks ? aerialLandmarkFootprints(fabric.aerialLandmarks) : []),
    ...(fabric?.watermills?.mills ?? []).map(mill => mill.millhousePolygon),
    ...(document.castles ?? []).flatMap(castle => castle.parts.map(part => part.footprint)),
    ...(document.cemeteries ?? []).map(cemetery => cemetery.boundary),
    ...waterPolygons(document)
  ].filter(polygon => polygon.length >= 3);
  const obstacles = new SpatialBoundsIndex(polygons, polygon => ({
    minX: Math.min(...polygon.map(p => p[0])),
    minY: Math.min(...polygon.map(p => p[1])),
    maxX: Math.max(...polygon.map(p => p[0])),
    maxY: Math.max(...polygon.map(p => p[1]))
  }));
  const routes = [
    ...(fabric?.lanes ?? []).map(lane => ({ points: lane.points, width: lane.widthMeters, canopyOverlap: true })),
    ...document.featureGroups.flatMap(group => {
      if (group.kind === "river") {
        return [
          {
            points: group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p),
            width: group.style.widthMeters ?? 4,
            canopyOverlap: false
          }
        ];
      }
      if (group.kind !== "road" && group.kind !== "wall") return [];
      return group.segments.flatMap(ref => {
        const edge = document.mesh.edges[ref.edgeId];
        const a = edge && document.mesh.vertices[edge.a]?.point;
        const b = edge && document.mesh.vertices[edge.b]?.point;
        return a && b
          ? [
              {
                points: [a, b],
                width: (group.style.widthMeters ?? 4) + (group.kind === "road" ? 1.4 : 0),
                canopyOverlap: group.kind === "road"
              }
            ]
          : [];
      });
    })
  ];
  const routeIndex = new NearbyPolylineIndex(routes);
  const maxHalfWidth = routes.reduce((width, route) => Math.max(width, route.width / 2), 0);
  const moats = new MoatReservation(document);
  const outlines = new Map(
    Object.values(document.mesh.faces).map(face => [face.id, closed(facePoints(document.mesh, face))])
  );
  return buildVacantTreeCandidates(document, seed, (tree, faceId) => {
    const [x, y] = tree.center;
    const radius = treeCanopyRadius(tree) + 1;
    const outline = outlines.get(faceId)!;
    if (!pointInPolygon(tree.center, outline) || nearestOnPolyline(tree.center, outline).dist < 0.6) return false;
    if (
      obstacles
        .query({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius })
        .some(
          polygon =>
            pointInPolygon(tree.center, polygon) || nearestOnPolyline(tree.center, closed(polygon)).dist < radius
        )
    )
      return false;
    // Keep stems outside the full road or lane width; only foliage may overhang the pavement.
    if (
      routeIndex
        .query(tree.center, radius + maxHalfWidth)
        .some(
          route =>
            nearestOnPolyline(tree.center, route.points).dist < route.width / 2 + (route.canopyOverlap ? 0.4 : radius)
        )
    )
      return false;
    const box: Point[] = [
      [x - radius, y - radius],
      [x + radius, y - radius],
      [x + radius, y + radius],
      [x - radius, y + radius]
    ];
    if (moats.hitsPolygon(box) || landmarkReservationHits(document, box) || buildingHitsCivicLandmark(document, box))
      return false;
    return true;
  }).map(candidate => candidate.tree);
}
