// Whole-plan edits only. Ordinary tools may not move the main line or build on reserved ground.
import type { CityDocument, Point } from "../../types/document";
import { GEN_PREFIX } from "../generation/constants";
import { polygonReserved } from "./reserve";

function roadEdgeIds(document: CityDocument): Set<string> {
  return new Set(
    document.featureGroups.flatMap(group => (group.kind === "road" ? group.segments.map(ref => ref.edgeId) : []))
  );
}

function distToSegment(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length));
  return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
}

function nearAccess(document: CityDocument, point: Point): boolean {
  const plan = document.bastionedTown;
  if (!plan) return false;
  for (const access of plan.accesses) {
    const path = [...access.landBefore, ...access.bridge, ...access.landAfter];
    const limit = access.widthMeters / 2 + 1;
    for (let i = 1; i < path.length; i++) if (distToSegment(point, path[i - 1], path[i]) <= limit) return true;
  }
  return false;
}

function facePointsOf(document: CityDocument, faceId: string): Point[] {
  const face = document.mesh.faces[faceId];
  if (!face) return [];
  return face.boundary.map(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    return document.mesh.vertices[ref.forward ? edge.a : edge.b].point;
  });
}

/** True when the edit must be refused. Removing the plan is allowed only as a whole. */
export function bastionedEditRejection(before: CityDocument, after: CityDocument): boolean {
  const plan = before.bastionedTown;
  if (!plan) return false;
  const circuit = before.defenseCircuits?.find(item => item.id === plan.circuitId);
  const wallIds = new Set(circuit?.wallGroupIds ?? []);
  if (!after.bastionedTown) {
    if (after.featureGroups.some(group => wallIds.has(group.id))) return true;
    if (after.gates.some(gate => gate.circuitId === plan.circuitId)) return true;
    if (before.castles?.some(castle => castle.id === `${GEN_PREFIX}castle-0`)) {
      if (!after.castles?.some(castle => castle.id === `${GEN_PREFIX}castle-0`)) return true;
    }
    return false;
  }
  if (JSON.stringify(before.bastionedTown) !== JSON.stringify(after.bastionedTown)) return true;
  const signature = (document: CityDocument) =>
    document.featureGroups
      .filter(group => wallIds.has(group.id) && group.kind === "wall")
      .map(group =>
        group.kind === "wall"
          ? group.segments
              .map(ref => {
                const edge = document.mesh.edges[ref.edgeId];
                return `${ref.edgeId}:${ref.forward}:${document.mesh.vertices[edge?.a]?.point}:${document.mesh.vertices[edge?.b]?.point}:${group.locked}`;
              })
              .join(",")
          : ""
      )
      .join("|");
  if (signature(before) !== signature(after)) return true;
  const gates = (document: CityDocument) =>
    document.gates
      .filter(gate => gate.circuitId === plan.circuitId)
      .map(gate => `${gate.id}:${gate.vertexId}`)
      .sort()
      .join("|");
  if (gates(before) !== gates(after)) return true;
  const roads = new Set(
    after.featureGroups.flatMap(group => (group.kind === "road" && group.segments.length ? [group.id] : []))
  );
  if (plan.accesses.some(access => access.roadId && !roads.has(access.roadId))) return true;
  for (const face of Object.values(after.mesh.faces)) {
    const previous = before.mesh.faces[face.id];
    if (previous?.properties.buildable || !face.properties.buildable) continue;
    if (polygonReserved(plan, facePointsOf(after, face.id))) return true;
  }
  const previousRoads = roadEdgeIds(before);
  for (const group of after.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      if (previousRoads.has(ref.edgeId)) continue;
      const edge = after.mesh.edges[ref.edgeId];
      if (!edge) continue;
      const a = after.mesh.vertices[edge.a]?.point;
      const b = after.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (polygonReserved(plan, [mid, a, b]) && !nearAccess(before, mid)) return true;
    }
  }
  return false;
}

/** Drop the town defense and keep the town, including a detached citadel. */
export function removeBastionedTown(document: CityDocument): CityDocument {
  const next = structuredClone(document);
  const plan = next.bastionedTown;
  if (!plan) return next;
  const circuit = next.defenseCircuits?.find(item => item.id === plan.circuitId);
  const wallIds = new Set(circuit?.wallGroupIds ?? []);
  next.featureGroups = next.featureGroups.filter(group => !wallIds.has(group.id));
  next.gates = next.gates.filter(gate => gate.circuitId !== plan.circuitId);
  next.defenseCircuits = (next.defenseCircuits ?? []).filter(item => item.id !== plan.circuitId);
  delete next.bastionedTown;
  if (!(next.defenseCircuits ?? []).some(item => item.scope === "town")) {
    for (const face of Object.values(next.mesh.faces)) delete face.properties.wallRing;
  }
  next.version = next.sceneRegions ? 4 : next.landmarks?.length || next.landmarkAssets?.length ? 3 : 2;
  return next;
}
