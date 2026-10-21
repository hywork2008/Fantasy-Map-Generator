import type { CityDocument, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import type { DistrictFabric } from "./blockInfill.types";
import { COASTAL_ARABLE_SETBACK_METERS, coastalBandOverlap, oceanShoreSegments } from "./coastalSuitability";
import { curtainSegments, glacisOutworks, polygonClearsGlacis } from "./defenseClearance";
import { FixedRoadReservation } from "./fixedRoadReservation";
import { circuitRing } from "./fortifications";
import { polygonArea } from "./geom";
import { landmarkReservationHits } from "./landmarks";
import { convexInfillParts } from "./lotGeometry";
import { facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import { bounds, intersectConvex, PlotIndex, corridor as roadBand } from "./parcelGeometry";
import { planRuralFields } from "./ruralFieldPlan";
import { approachBands } from "./suburbanLanduse";
import { documentWaterTest } from "./waterGeometry";

/** The common post-housing farm pass also serves radial and ring layouts. */
export function applyRuralFields(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const fixedFarms = fabric.farms.filter(farm =>
    (farm.sourceFaceIds ?? [farm.faceId]).some(id => document.mesh.faces[id]?.properties.locked)
  );
  const protectedFaces = new Set(document.elements.flatMap(element => element.faceIds));
  const land = Object.values(document.mesh.faces)
    .filter(
      face =>
        face.properties.water === "land" &&
        face.properties.ward === "farm" &&
        !face.properties.locked &&
        !protectedFaces.has(face.id)
    )
    .map(face => ({ faceId: face.id, polygon: facePoints(document.mesh, face) }));
  const roads = document.featureGroups.flatMap(group =>
    group.kind === "road"
      ? group.segments.flatMap(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          return edge
            ? [
                {
                  points: [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point],
                  widthMeters: group.style.widthMeters
                }
              ]
            : [];
        })
      : []
  );
  roads.push(
    ...(document.frameRoads ?? []).flatMap(road => road.pieces.map(piece => ({ points: piece.points, widthMeters: 6 })))
  );
  roads.push(
    ...(document.riverConnections ?? []).flatMap(connection =>
      [connection.townRoad, connection.farRoad].map(points => ({ points, widthMeters: 6 }))
    )
  );
  const reservations = [
    ...fabric.buildings.map(building => building.polygon),
    ...(fabric.watermills?.mills ?? []).map(mill => mill.millhousePolygon),
    ...fabric.lanes
      .filter(lane => !lane.kind)
      .flatMap(lane => lane.points.slice(1).map((b, i) => ({ a: lane.points[i], b, width: lane.widthMeters })))
      .map(line => roadBand(line.a, line.b, line.width)),
    ...fixedFarms.map(farm => farm.polygon),
    ...(fabric.openSpaces ?? []).map(space => space.polygon),
    ...(fabric.parks ?? []).flatMap(park => park.lawnPolygons),
    ...(fabric.harbor?.spaces ?? []).map(space => space.polygon),
    ...(fabric.harbor?.piers ?? []).map(pier => pier.polygon),
    ...(document.defenseCircuits ?? [])
      .filter(circuit => circuit.scope === "castle")
      .map(circuit => circuitRing(document, circuit)),
    ...(fabric.aerialLandmarks ? aerialLandmarkFootprints(fabric.aerialLandmarks) : [])
  ];
  // An explicitly locked edge or vertex is a field boundary, even when both
  // of its incident faces are otherwise available countryside.
  for (const edge of Object.values(document.mesh.edges)) {
    if (edge.locked || document.mesh.vertices[edge.a].locked || document.mesh.vertices[edge.b].locked)
      reservations.push(roadBand(document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point, 1));
  }
  const index = new PlotIndex<Point[]>();
  for (const polygon of reservations) for (const part of convexInfillParts(polygon)) index.add(part, bounds(part));
  const water = documentWaterTest(document);
  const fixedRoads = new FixedRoadReservation(document);
  const moat = new MoatReservation(document);
  const shore = oceanShoreSegments(document);
  const walls = curtainSegments(document);
  const bands = approachBands(document);
  const defence = {
    active: walls.length > 0,
    walls,
    bands,
    outworks: glacisOutworks(document, fabric.aerialLandmarks?.barbicans ?? [], bands)
  };
  const fixedArea = fixedFarms.reduce((sum, farm) => sum + Math.abs(polygonArea(farm.polygon)), 0);
  const plan = planRuralFields({
    seed: document.generationSeed ?? document.fabric?.seed ?? "rural-fields",
    land,
    roads,
    period: document.historicalPeriod,
    areaBudgetM2:
      document.farmlandAreaHectares === undefined
        ? undefined
        : Math.max(0, document.farmlandAreaHectares * 10_000 - fixedArea),
    blocked: polygon =>
      water(polygon) ||
      fixedRoads.hitsPolygon(polygon) ||
      landmarkReservationHits(document, polygon) ||
      moat.hitsPolygon(polygon) ||
      coastalBandOverlap(polygon, shore, COASTAL_ARABLE_SETBACK_METERS) ||
      !polygonClearsGlacis(polygon, defence) ||
      index.query(bounds(polygon)).some(part => Math.abs(polygonArea(intersectConvex(polygon, part))) > 0.001)
  });
  return {
    ...fabric,
    farms: [...fixedFarms, ...plan.farms],
    lanes: [...fabric.lanes.filter(lane => !lane.kind), ...plan.lanes],
    ruralFields: {
      ...plan.diagnostics,
      requestedAreaM2: document.farmlandAreaHectares === undefined ? undefined : document.farmlandAreaHectares * 10_000,
      fixedAreaM2: fixedArea,
      cultivatedAreaM2: plan.diagnostics.cultivatedAreaM2 + fixedArea,
      overBudgetAreaM2:
        document.farmlandAreaHectares === undefined
          ? 0
          : Math.max(0, fixedArea - document.farmlandAreaHectares * 10_000)
    }
  };
}
