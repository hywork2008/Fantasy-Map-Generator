import type { CityDocument, Point } from "../types/document";
import type { RuralFieldProfiler } from "../utils/ruralFieldProfiler";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import type { DistrictFabric } from "./blockInfill.types";
import { COASTAL_ARABLE_SETBACK_METERS, coastalBandOverlap, oceanShoreSegments } from "./coastalSuitability";
import { curtainSegments, glacisOutworks, polygonClearsGlacis } from "./defenseClearance";
import { FixedRoadReservation } from "./fixedRoadReservation";
import { forestLandCover } from "./forestLandCover";
import { hasForestState } from "./forestSettings";
import { circuitRing } from "./fortifications";
import { polygonArea } from "./geom";
import { landmarkReservationHits } from "./landmarks";
import { clipHalfPlane, convexInfillParts, triangularInfillParts } from "./lotGeometry";
import { facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import { bounds, intersectConvex, PlotIndex, corridor as roadBand } from "./parcelGeometry";
import { ruralRiverDividers } from "./ruralFieldBanks";
import { planDetailedRuralFields } from "./ruralFieldDetails";
import { planRuralFields } from "./ruralFieldPlan";
import { ruralFieldSystem } from "./ruralFieldProfile";
import { ruralSuitability } from "./ruralSuitability";
import { approachBands } from "./suburbanLanduse";
import { classifyTownWater } from "./townWater";
import { documentWaterTest } from "./waterGeometry";

/** The common post-housing farm pass also serves radial and ring layouts. */
export function applyRuralFields(
  document: CityDocument,
  fabric: DistrictFabric,
  profiler?: RuralFieldProfiler
): DistrictFabric {
  const fixedFarms = fabric.farms.filter(farm =>
    (farm.sourceFaceIds ?? [farm.faceId]).some(id => document.mesh.faces[id]?.properties.locked)
  );
  const forestActive = hasForestState(document);
  const retainedLanes = fabric.lanes.filter(
    lane => !lane.kind || (forestActive && document.mesh.faces[lane.faceId]?.properties.locked)
  );
  if (document.ruralFieldSettings?.mode === "off" || document.ruralFieldSettings?.coveragePercent === 0)
    return { ...fabric, farms: fixedFarms, lanes: retainedLanes, ruralFields: undefined };
  const timing = profiler?.stages("generation");
  timing?.next("terrain-and-land");
  const protectedFaces = new Set(document.elements.flatMap(element => element.faceIds));
  const forestFaces = forestLandCover(document);
  const suitability = document.ruralFieldVersion === 2 ? ruralSuitability(document) : undefined;
  let unsuitableArea = 0;
  let land = Object.values(document.mesh.faces)
    .filter(
      face =>
        face.properties.water === "land" &&
        face.properties.ward === "farm" &&
        !forestFaces.has(face.id) &&
        !face.properties.locked &&
        !protectedFaces.has(face.id)
    )
    .map(face => ({ faceId: face.id, polygon: facePoints(document.mesh, face) }))
    .filter(face => {
      if (!suitability) return true;
      if (suitability.accepts(face.faceId)) {
        for (const part of convexInfillParts(face.polygon)) unsuitableArea += suitability.steepArea(part);
        return true;
      }
      unsuitableArea += Math.abs(polygonArea(face.polygon));
      return false;
    });
  const settings = document.ruralFieldSettings;
  if (document.ruralFieldVersion === 2 && settings) {
    const radius = document.frame.cityRadiusMeters * 1.7;
    const circle: Point[] = Array.from({ length: 32 }, (_, i) => [
      radius * Math.cos((i * Math.PI) / 16),
      radius * Math.sin((i * Math.PI) / 16)
    ]);
    const normal: Point | undefined =
      settings.direction === "north"
        ? [0, -1]
        : settings.direction === "south"
          ? [0, 1]
          : settings.direction === "east"
            ? [-1, 0]
            : settings.direction === "west"
              ? [1, 0]
              : undefined;
    land = land.flatMap(face =>
      convexInfillParts(face.polygon).flatMap(part => {
        let polygon = settings.range === "near-city" ? intersectConvex(part, circle) : part;
        if (normal) polygon = clipHalfPlane(polygon, normal, 0);
        return polygon.length >= 3 ? [{ faceId: face.faceId, polygon }] : [];
      })
    );
  }
  const targetArea =
    settings?.coveragePercent === undefined
      ? undefined
      : (land.reduce((sum, face) => sum + Math.abs(polygonArea(face.polygon)), 0) * settings.coveragePercent) / 100;
  timing?.next("roads-and-reservations");
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
    ...(document.regionalSurface?.unknown ?? []),
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
  const wet = new PlotIndex<Point[]>();
  for (const part of classifyTownWater(document).parts)
    for (const triangle of triangularInfillParts(part.polygon)) wet.add(triangle, bounds(triangle));
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
  timing?.next("layout");
  const blocked = (polygon: Point[]) =>
    wet.query(bounds(polygon)).some(part => Math.abs(polygonArea(intersectConvex(polygon, part))) > 0.001) ||
    water(polygon) ||
    fixedRoads.hitsPolygon(polygon) ||
    landmarkReservationHits(document, polygon) ||
    moat.hitsPolygon(polygon) ||
    coastalBandOverlap(polygon, shore, COASTAL_ARABLE_SETBACK_METERS) ||
    !polygonClearsGlacis(polygon, defence) ||
    !!suitability?.steep(polygon) ||
    index.query(bounds(polygon)).some(part => Math.abs(polygonArea(intersectConvex(polygon, part))) > 0.001);
  const input = {
    seed: document.generationSeed ?? document.fabric?.seed ?? "rural-fields",
    land,
    roads,
    period: document.historicalPeriod,
    riverDividers: ruralRiverDividers(document),
    areaBudgetM2:
      targetArea === undefined
        ? document.farmlandAreaHectares === undefined
          ? undefined
          : Math.max(0, document.farmlandAreaHectares * 10000 - fixedArea)
        : Math.max(
            0,
            Math.min(
              targetArea,
              document.farmlandAreaHectares === undefined ? Infinity : document.farmlandAreaHectares * 10000 - fixedArea
            )
          ),
    blocked: profiler?.wrap("blocked", blocked) ?? blocked
  };
  const box = bounds(Object.values(document.mesh.vertices).map(vertex => vertex.point));
  const frame: Point[] = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]]
  ];
  const plan =
    document.ruralFieldVersion === 2
      ? planDetailedRuralFields({
          ...input,
          profiler,
          system: ruralFieldSystem(
            document.historicalPeriod,
            document.civilization?.tradition,
            document.ruralFieldSettings
          ),
          settings: { gardenRadiusMeters: document.frame.cityRadiusMeters * 1.08, ...document.ruralFieldSettings },
          unsuitableAreaM2: unsuitableArea,
          visibleFrame: frame
        })
      : planRuralFields(input);
  timing?.next("assemble-result");
  if (profiler)
    Object.assign(profiler.counts, {
      landFaces: land.length,
      reservationPolygons: reservations.length,
      farms: plan.farms.length,
      rows: plan.farms.reduce((n, f) => n + f.rows.length, 0),
      rowPoints: plan.farms.reduce((n, f) => n + f.rows.reduce((m, row) => m + row.length, 0), 0),
      lanes: plan.lanes.length
    });
  timing?.end();
  return {
    ...fabric,
    farms: [...fixedFarms, ...plan.farms],
    lanes: [...retainedLanes, ...plan.lanes],
    ruralFields: {
      ...plan.diagnostics,
      suitabilitySource: suitability?.source,
      requestedAreaM2: input.areaBudgetM2 === undefined ? undefined : input.areaBudgetM2 + fixedArea,
      fixedAreaM2: fixedArea,
      cultivatedAreaM2: plan.diagnostics.cultivatedAreaM2 + fixedArea,
      overBudgetAreaM2:
        document.farmlandAreaHectares === undefined
          ? 0
          : Math.max(0, fixedArea - document.farmlandAreaHectares * 10_000)
    }
  };
}
