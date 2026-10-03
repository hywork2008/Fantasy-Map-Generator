import type { CorridorPiece } from "../services/approachCorridorGeometry";
import type { RiverPoint } from "../services/riverGeometry";
import { getConstrainedNetworkCrossings, type NetworkEnvironment, type NetworkNode } from "./constrainedLandNetwork";
import { isRegisteredLandConnectionSnapshot, type LandConnectionSnapshot } from "./landConnectionAdoption";
import type { ProvisionalRiverCrossing } from "./riverCrossingCandidates";

export interface RegisteredRouteSection {
  kind: "land" | "approach" | "bridge";
  facilityId?: number;
  pieces: readonly CorridorPiece[];
}
export interface RegisteredLandRouteSections {
  schemaVersion: 1;
  coordinateUnit: "metres";
  revision: number;
  roadWidthMeters: number;
  nodes: readonly NetworkNode[];
  crossings: readonly ProvisionalRiverCrossing[];
  connections: readonly {
    id: number;
    from: number;
    to: number;
    bidirectional: boolean;
    distanceMeters: number;
    sections: readonly RegisteredRouteSection[];
  }[];
}
const same = (a: RiverPoint, b: RiverPoint) => a[0] === b[0] && a[1] === b[1];
const line = (start: RiverPoint, end: RiverPoint): CorridorPiece => ({
  kind: "line",
  start,
  end,
  lengthMeters: Math.hypot(end[0] - start[0], end[1] - start[1])
});
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Renderer/CE handoff data in physical metres: fixed corridor pieces and deck
 * D→D, no smoothing, cell snapping, bridge discovery or coordinate conversion.
 * Session provenance/current validation is mandatory. Serialization is only a
 * data preview; loading it does not recover a registered/validated network.
 */
export function exportRegisteredLandRouteSections(
  snapshot: LandConnectionSnapshot,
  current: {
    environment: NetworkEnvironment;
    nodePointAt: (id: number) => RiverPoint | null;
  }
): { sections: RegisteredLandRouteSections } | { reason: string } {
  if (!isRegisteredLandConnectionSnapshot(snapshot)) return { reason: "unregistered-snapshot" };
  if (
    typeof current.nodePointAt !== "function" ||
    snapshot.network.nodes.some(n => {
      const p = current.nodePointAt(n.id);
      return !p || !same(p, n.point);
    })
  )
    return { reason: "changed-nodes" };
  const resolved = getConstrainedNetworkCrossings(snapshot.network, current.environment);
  if (!("crossings" in resolved)) return resolved;
  const crossings = new Map(resolved.crossings.map(c => [c.id, c]));
  const reversible = new Set(snapshot.network.edges.filter(e => e.reverse).map(e => e.id));
  const connections: RegisteredLandRouteSections["connections"][number][] = [];
  for (const edge of snapshot.network.edges.filter(e => !e.reverse)) {
    let sections: RegisteredRouteSection[];
    if (!edge.crossing) sections = [{ kind: "land", pieces: edge.pieces }];
    else {
      const crossing = crossings.get(edge.crossing.facilityId);
      if (!crossing) return { reason: "missing-crossing" };
      const index = edge.pieces.findIndex(
        p => p.kind === "line" && same(p.start, crossing.approachA) && same(p.end, crossing.approachB)
      );
      if (index < 1 || index >= edge.pieces.length - 1) return { reason: "invalid-bridge-section" };
      sections = [
        { kind: "approach", facilityId: crossing.id, pieces: edge.pieces.slice(0, index) },
        { kind: "approach", facilityId: crossing.id, pieces: [line(crossing.approachA, crossing.deckA)] },
        { kind: "bridge", facilityId: crossing.id, pieces: [line(crossing.deckA, crossing.deckB)] },
        { kind: "approach", facilityId: crossing.id, pieces: [line(crossing.deckB, crossing.approachB)] },
        { kind: "approach", facilityId: crossing.id, pieces: edge.pieces.slice(index + 1) }
      ];
    }
    const distance = sections.reduce((sum, s) => sum + s.pieces.reduce((length, p) => length + p.lengthMeters, 0), 0);
    if (
      !Number.isFinite(distance) ||
      Math.abs(distance - edge.distanceMeters) > 1e-8 * Math.max(1, edge.distanceMeters)
    )
      return { reason: "invalid-distance" };
    connections.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      bidirectional: reversible.has(edge.id),
      distanceMeters: edge.distanceMeters,
      sections
    });
  }
  return {
    sections: freeze(
      structuredClone({
        schemaVersion: 1 as const,
        coordinateUnit: "metres" as const,
        revision: snapshot.revision,
        roadWidthMeters: snapshot.network.roadWidthMeters,
        nodes: snapshot.network.nodes,
        crossings: resolved.crossings,
        connections
      })
    )
  };
}
