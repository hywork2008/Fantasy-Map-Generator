import { townCircuits, townGates } from "../../../core/fortifications";
import { incidentEdges } from "../../../core/mesh";
import type { CityDocument, Id } from "../../../core/types";

/**
 * Double walls: streets may enter the old town only through its gates. A wall
 * vertex that already had four arms (from earlier passages or splits) would
 * otherwise let a street cross the curtain there, so ban the arms that lead
 * from a non-gate old-town wall vertex into the old town.
 */
export function oldTownNonGateEntries(document: CityDocument): Set<Id> {
  const circuits = townCircuits(document);
  if (circuits.length < 2) return new Set();
  const inner = circuits[0];
  const inside = new Set(inner.areaFaceIds);
  const wall = new Set(
    document.featureGroups.flatMap(group =>
      group.kind === "wall" && inner.wallGroupIds.includes(group.id) ? group.segments.map(ref => ref.edgeId) : []
    )
  );
  const gates = new Set(townGates(document, inner.id).map(gate => gate.vertexId));
  const vertices = new Set([...wall].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  const entries = new Set<Id>();
  for (const vertexId of vertices) {
    if (gates.has(vertexId)) continue;
    for (const edge of incidentEdges(document.mesh, vertexId))
      if (!wall.has(edge.id) && [edge.leftFace, edge.rightFace].every(id => id && inside.has(id))) entries.add(edge.id);
  }
  return entries;
}
