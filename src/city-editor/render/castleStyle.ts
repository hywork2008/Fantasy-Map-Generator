import { featureGroupVertices } from "../core/features";
import { boundaryEdges, boundaryRings, castleWallIds } from "../core/fortifications";
import { nearestOnPolyline } from "../core/gen/geom";
import { faceVertices } from "../core/mesh";
import type { CityDocument, CityGate, Id, Point } from "../core/types";
import { resolveCastleStyle } from "./castlePatterns";
export function isNewStyleCastleWall(document: CityDocument, wallGroupId: string): boolean {
  if (!castleWallIds(document).has(wallGroupId)) return false;
  const castle = document.castles?.find(c => {
    const circuit = document.defenseCircuits?.find(d => d.id === c.circuitId);
    return circuit?.wallGroupIds.includes(wallGroupId);
  });
  if (!castle) return false;
  const profile = resolveCastleStyle(document, castle);
  return profile.style !== "classic";
}

export function isNewStyleCastleCircuit(document: CityDocument, circuitId: Id): boolean {
  const castle = document.castles?.find(c => c.circuitId === circuitId);
  if (!castle) return false;
  const profile = resolveCastleStyle(document, castle);
  return profile.style !== "classic";
}

export function isNewStyleCastleGate(document: CityDocument, gate: CityGate): boolean {
  if (!document.castles?.length) return false;

  for (const castle of document.castles) {
    const profile = resolveCastleStyle(document, castle);
    if (profile.style === "classic") continue;

    // 1. Direct owner castle ID or prefix in gate ID
    if (gate.ownerCastleId && String(gate.ownerCastleId) === String(castle.id)) {
      return true;
    }
    if (typeof gate.id === "string" && gate.id.startsWith(String(castle.id))) {
      return true;
    }

    // 2. Defense circuit association
    const circuit = document.defenseCircuits?.find(
      c =>
        String(c.id) === String(castle.circuitId) ||
        (c.scope === "castle" && String(c.ownerCastleId ?? "") === String(castle.id))
    );
    if (circuit) {
      // 2a. Boundary vertices of the castle defense circuit
      const boundary = boundaryEdges(document.mesh, circuit.areaFaceIds);
      const boundaryVertexIds = new Set<Id>();
      for (const ref of boundary) {
        const edge = document.mesh.edges[ref.edgeId];
        if (edge) {
          boundaryVertexIds.add(edge.a);
          boundaryVertexIds.add(edge.b);
        }
      }
      if (boundaryVertexIds.has(gate.vertexId)) {
        return true;
      }

      // 2b. Any face vertices within the circuit's area faces
      for (const faceId of circuit.areaFaceIds) {
        const face = document.mesh.faces[faceId];
        if (face && faceVertices(document.mesh, face).includes(gate.vertexId)) {
          return true;
        }
      }

      // 2c. Wall groups belonging to this circuit
      const circuitWallIds = new Set(circuit.wallGroupIds);
      const connectedWalls = document.featureGroups.filter(
        g => g.kind === "wall" && featureGroupVertices(document, g).some(v => String(v) === String(gate.vertexId))
      );
      if (connectedWalls.some(w => circuitWallIds.has(w.id))) {
        return true;
      }
    }

    // 3. Wall connected to gate is a new-style castle wall
    const connectedWalls = document.featureGroups.filter(
      g => g.kind === "wall" && featureGroupVertices(document, g).some(v => String(v) === String(gate.vertexId))
    );
    if (connectedWalls.some(w => isNewStyleCastleWall(document, w.id))) {
      return true;
    }

    // 4. Spatial / Geometric check: gate point is on or immediately adjacent to castle precinct
    const gatePoint = document.mesh.vertices[gate.vertexId]?.point;
    if (gatePoint) {
      if (circuit && circuit.areaFaceIds.length > 0) {
        const rings = boundaryRings(document.mesh, boundaryEdges(document.mesh, circuit.areaFaceIds));
        for (const ringRefs of rings) {
          const ringPts = ringRefs
            .map(ref => {
              const e = document.mesh.edges[ref.edgeId];
              return document.mesh.vertices[ref.forward ? e.a : e.b]?.point;
            })
            .filter((p): p is Point => !!p);
          if (ringPts.length >= 3) {
            const hit = nearestOnPolyline(gatePoint, [...ringPts, ringPts[0]]);
            if (hit.dist < 8.0) {
              return true;
            }
          }
        }
      }
      // Also check against castle courtyards
      for (const court of castle.courtyards ?? []) {
        if (court.length >= 3) {
          const hit = nearestOnPolyline(gatePoint, [...court, court[0]]);
          if (hit.dist < 8.0) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
