// Materialise K6's certified edge chains. No path search or passage deformation.
import type { CityDocument, EdgeRef, Point } from "../../../types/document";
import { registerTownCircuit } from "../../castles";
import { normalizeGeneratedRoadOwnership } from "../../generatedRoadOwnership";
import type { GenerationObserver } from "../../generationDiagnostics";
import { pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { facePoints } from "../../mesh";
import { defaultRoadWidthMeters, townExtentMeters } from "../../settlementExtent";
import { clipSurveyedRiverWalls } from "../../surveyedRiverWalls";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import type { SkeletonPlanData } from "../skeleton/toPlan";
import { applyLandmarks } from "./landmarks";

export function applySkeletonFeatures(
  next: CityDocument,
  plan: Plan & { skeleton: SkeletonPlanData },
  faceIdOf: string[],
  stageStep: number,
  observer?: GenerationObserver,
  attempt = 1
): CityDocument {
  const { lines, inputs, skeleton } = plan.skeleton;
  const mesh = next.mesh;
  // A replacement mesh cannot retain feature references to the previous grid.
  next.gridKind = "evolution";
  const start = (r: EdgeRef) => mesh.edges[r.edgeId][r.forward ? "a" : "b"];
  const end = (r: EdgeRef) => mesh.edges[r.edgeId][r.forward ? "b" : "a"];
  const nearest = (point: Point) =>
    Object.values(mesh.vertices).reduce((best, v) =>
      Math.hypot(v.point[0] - point[0], v.point[1] - point[1]) <
      Math.hypot(best.point[0] - point[0], best.point[1] - point[1])
        ? v
        : best
    ).id;
  if (stageStep >= 2) {
    next.featureGroups = next.featureGroups.filter(g => g.kind !== "river");
    const surveyed = plan.fixedCrossings && plan.fixedCrossings.schemaVersion !== 1;
    // FMG's surveyed water and certified decks own these rivers. A second
    // editable ribbon would infer different tangents from the simplified course.
    (surveyed ? [] : inputs.rivers).forEach((river, i) => {
      const line = lines.find(l => l.id === `river:${river.index}`)!;
      if (!line.edges.length) return;
      next.featureGroups.push({
        id: `${GEN_PREFIX}river-${i}`,
        kind: "river",
        name: `River ${i + 1}`,
        vertices: [start(line.edges[0]), ...line.edges.map(end)],
        source: null,
        mouth: null,
        style: { widthMeters: river.halfWidth * 2, color: "#4f8aad" },
        locked: false
      });
    });
  }
  const wall = lines.find(l => l.id === "wall");
  if (wall && stageStep >= 4) {
    const riverPassages = skeleton.wall!.waterGates.map(g => nearest(g.point));
    const fortress = !!plan.bastionedTown;
    next.featureGroups.push({
      id: `${GEN_PREFIX}wall-0`,
      kind: "wall",
      name: "Town wall",
      segments: wall.edges,
      riverPassages,
      wallMaterial: plan.wallMaterial,
      style: { widthMeters: inputs.wallWidth, color: "#41382e" },
      locked: fortress
    });
    for (const [i, g] of skeleton.gates.entries())
      next.gates.push({
        id: `${GEN_PREFIX}gate-${i}`,
        vertexId: nearest(g.point),
        role: "town",
        locked: fortress,
        ...(fortress ? { circuitId: plan.bastionedTown!.plan.circuitId, passageWidthMeters: 6 } : {})
      });
    const urbanIds = [...plan.urban].map(id => faceIdOf[id]);
    // The rampart is reserved out of the housing set, but it is still inside the town wall.
    const interiorIds = fortress
      ? Object.values(mesh.faces)
          .filter(face => pointInPolygon(polygonCentroid(facePoints(mesh, face)), skeleton.wall!.polygon))
          .map(face => face.id)
      : urbanIds;
    registerTownCircuit(
      next,
      interiorIds.map(id => facePoints(mesh, mesh.faces[id])),
      true,
      interiorIds
    );
  }
  if (stageStep >= 5) {
    for (const route of skeleton.routes.filter(r => !r.dropped)) {
      const chain = lines.find(l => l.id === `road:${route.id}`)!;
      const routeEdges = chain.runs[0] ?? [];
      if (!routeEdges.length) continue;
      const gateVertex = route.gateIndex === null ? null : nearest(skeleton.gates[route.gateIndex].point);
      let cut = gateVertex ? routeEdges.findIndex(ref => start(ref) === gateVertex) : Math.floor(routeEdges.length / 3);
      if (cut < 0) cut = 0;
      const sourceIndex = inputs.roads.find(r => r.id === route.id)?.sourceRoadIndex;
      const imported = sourceIndex === undefined ? undefined : plan.importedRoads?.[sourceIndex];
      for (const [suffix, segments] of [
        [`street-${route.id}`, routeEdges.slice(0, cut)],
        [`road-${route.id}`, routeEdges.slice(cut)]
      ] as const) {
        if (!segments.length || (plan.wardsOnly && suffix.startsWith("street-"))) continue;
        next.featureGroups.push({
          id: `${GEN_PREFIX}${suffix}`,
          kind: "road",
          name: "Road",
          roadRole: suffix.startsWith("road-") ? "approach" : "street",
          segments,
          style: { widthMeters: defaultRoadWidthMeters(townExtentMeters(next.frame)), color: "#9d8a65" },
          locked: false,
          ...(imported && suffix.startsWith("road-")
            ? { sourceRoad: { index: imported.sourceIndex, routeId: imported.routeId } }
            : {})
        });
      }
    }
  }
  if (stageStep >= 4) applyLandmarks(next, mesh, faceIdOf, plan);
  // Tiny constraint faces remain topologically present but never receive buildings.
  for (const face of Object.values(mesh.faces))
    if (Math.abs(polygonArea(facePoints(mesh, face))) < 1) {
      face.properties.buildable = false;
      face.properties.ward = null;
    }
  const before = JSON.stringify(next.mesh);
  const featuresBefore = JSON.stringify(next.featureGroups);
  const clipped = clipSurveyedRiverWalls(structuredClone(next));
  observer?.({
    phase: "skeleton-surveyed-wall-check",
    elapsedMs: 0,
    attempt,
    counts: {
      meshChanged: Number(JSON.stringify(clipped.mesh) !== before),
      featuresChanged: Number(JSON.stringify(clipped.featureGroups) !== featuresBefore)
    }
  });
  // K1 surveyed water is already a boundary; any further clipping is reported.
  const result =
    JSON.stringify(clipped.mesh) === before && JSON.stringify(clipped.featureGroups) === featuresBefore
      ? clipped
      : next;
  if (stageStep >= 5)
    normalizeGeneratedRoadOwnership(result, new Set(skeleton.routes.map(route => `${GEN_PREFIX}road-${route.id}`)));
  return result;
}
