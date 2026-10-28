import type { ForestPlan } from "../types/contracts/forest";
import type { CityDocument, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import { polygonReserved } from "./bastionedTown/reserve";
import type { DistrictFabric } from "./blockInfill.types";
import { curtainSegments, glacisOutworks, STANDARD_GLACIS_METERS } from "./defenseClearance";
import { FixedRoadReservation } from "./fixedRoadReservation";
import { type ForestPart, forestRegions } from "./forestGeometry";
import { forestLandCover } from "./forestLandCover";
import { polygonArea } from "./geom";
import { landmarkReservationHits } from "./landmarks";
import { convexInfillParts } from "./lotGeometry";
import { facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import { bounds, corridor, intersectConvex, PlotIndex, subtractConvex } from "./parcelGeometry";
import { approachBands } from "./suburbanLanduse";
import { classifyTownWater } from "./townWater";

/** Uses already-built housing/reservations; never calls buildBlockFabric or creates trees. */
export function buildForestPlan(document: CityDocument, fabric: DistrictFabric): ForestPlan {
  const selected = forestLandCover(document);
  const fixedFarms = fabric.farms.filter(farm =>
    (farm.sourceFaceIds ?? [farm.faceId]).some(id => document.mesh.faces[id]?.properties.locked)
  );
  const plan: ForestPlan = {
    regions: [],
    forestFaceIds: [...selected],
    areaM2: 0,
    protectedFarmCount: fixedFarms.length,
    protectedFarmAreaM2: fixedFarms.reduce((sum, farm) => sum + Math.abs(polygonArea(farm.polygon)), 0)
  };
  if (!selected.size) return plan;
  const index = new PlotIndex<Point[]>();
  const reserve = (polygon: Point[]) => {
    for (const part of convexInfillParts(polygon)) index.add(part, bounds(part));
  };
  const line = (points: Point[], width: number) => {
    for (let i = 1; i < points.length; i++) reserve(corridor(points[i - 1], points[i], width, width / 2));
  };
  for (const part of classifyTownWater(document).parts) reserve(part.polygon);
  for (const polygon of document.regionalSurface?.unknown ?? []) reserve(polygon);
  for (const area of document.waterAreas ?? []) reserve(area.polygon);
  for (const farm of fixedFarms) reserve(farm.polygon);
  for (const building of fabric.buildings) reserve(building.polygon);
  for (const space of fabric.openSpaces ?? []) reserve(space.polygon);
  for (const park of fabric.parks ?? []) for (const polygon of park.lawnPolygons) reserve(polygon);
  for (const cemetery of document.cemeteries ?? []) reserve(cemetery.boundary);
  for (const mill of fabric.watermills?.mills ?? []) reserve(mill.millhousePolygon);
  for (const polygon of fabric.aerialLandmarks ? aerialLandmarkFootprints(fabric.aerialLandmarks) : [])
    reserve(polygon);
  for (const space of fabric.harbor?.spaces ?? []) reserve(space.polygon);
  for (const pier of fabric.harbor?.piers ?? []) reserve(pier.polygon);
  for (const part of new MoatReservation(document).parts) reserve(part.polygon);
  const fixedRoads = new FixedRoadReservation(document);
  for (const polygon of fixedRoads.polygons) reserve(polygon);
  for (const group of document.featureGroups)
    if (group.kind === "road")
      for (const ref of group.segments) {
        const edge = document.mesh.edges[ref.edgeId];
        if (edge)
          line(
            [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point],
            group.style.widthMeters + 4
          );
      }
  for (const road of document.frameRoads ?? []) for (const piece of road.pieces) line(piece.points, 10);
  for (const crossing of document.riverConnections ?? []) {
    line(crossing.townRoad, 10);
    line(crossing.farRoad, 10);
  }
  for (const lane of fabric.lanes)
    if (!lane.kind || document.mesh.faces[lane.faceId]?.properties.locked) line(lane.points, lane.widthMeters + 4);
  const bands = approachBands(document);
  const clearance = Math.max(STANDARD_GLACIS_METERS, ...bands.map(band => band.clearance));
  for (const wall of curtainSegments(document)) line(wall, clearance * 2);
  for (const outwork of glacisOutworks(document, fabric.aerialLandmarks?.barbicans ?? [], bands))
    for (const points of outwork.lines) line(points, outwork.clearance * 2);
  const parts: ForestPart[] = [];
  const half = document.frame.extentMeters / 2;
  const frame: Point[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half]
  ];
  for (const faceId of selected)
    for (const source of convexInfillParts(facePoints(document.mesh, document.mesh.faces[faceId]))) {
      let pieces = [intersectConvex(source, frame)].filter(p => p.length >= 3);
      for (const cut of index.query(bounds(source))) {
        pieces = pieces.flatMap(piece => subtractConvex(piece, cut, 0.001));
        if (!pieces.length) break;
      }
      for (const polygon of pieces) {
        // Keep complex landmark and bastion reservations conservative until their exact clips are available.
        if (landmarkReservationHits(document, polygon) || polygonReserved(document.bastionedTown, polygon)) continue;
        parts.push({ faceId, polygon });
      }
    }
  plan.regions = forestRegions(parts);
  plan.areaM2 = plan.regions.reduce((sum, region) => sum + region.areaM2, 0);
  return plan;
}
