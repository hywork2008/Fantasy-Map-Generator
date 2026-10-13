import type { CityDocument, Id, Point } from "../types/document";
import { castleWallIds } from "./fortifications";
import { nearestOnPolyline, segmentSegmentHit } from "./geom";
import { clone, insertEdgeVertex } from "./mesh";
import { frameRoadWidthMeters } from "./roadTraffic";

function regionalRoadPaths(document: CityDocument): Point[][] {
  return (document.frameRoads ?? []).flatMap(leg =>
    leg.pieces.filter(piece => piece.kind === "road").map(piece => piece.points)
  );
}

function regionalRoadSegments(document: CityDocument): { a: Point; b: Point; width: number }[] {
  return (document.frameRoads ?? []).flatMap(leg =>
    leg.pieces
      .filter(piece => piece.kind === "road")
      .flatMap(piece =>
        piece.points.slice(1).map((b, i) => ({
          a: piece.points[i],
          b,
          width: frameRoadWidthMeters(document, leg.sourceIndex, leg.routeId)
        }))
      )
  );
}

/** The imported highway is independent of the mesh. It must actually pass
 * between the two curtain arms, rather than merely touch or follow the wall. */
export function regionalRoadThroughGate(document: CityDocument, vertexId: Id): Point[] {
  const point = document.mesh.vertices[vertexId]?.point;
  if (!point) return [];
  const wallIds = new Set(
    document.featureGroups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : []))
  );
  const wallArms = Object.values(document.mesh.edges)
    .filter(e => wallIds.has(e.id) && (e.a === vertexId || e.b === vertexId))
    .map(e => document.mesh.vertices[e.a === vertexId ? e.b : e.a].point);
  if (wallArms.length !== 2) return [];
  for (const path of regionalRoadPaths(document)) {
    const roads: Point[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (nearestOnPolyline(point, [a, b]).dist > 1e-5) continue;
      for (const p of [a, b])
        if (Math.hypot(p[0] - point[0], p[1] - point[1]) > 1e-5 && !roads.includes(p)) roads.push(p);
    }
    if (roads.length !== 2) continue;
    const arms = [...wallArms.map(p => ({ p, kind: "wall" })), ...roads.map(p => ({ p, kind: "road" }))]
      .map(arm => ({ ...arm, angle: Math.atan2(arm.p[1] - point[1], arm.p[0] - point[0]) }))
      .sort((a, b) => a.angle - b.angle);
    if (
      arms.every(
        (arm, i) =>
          arm.kind !== arms[(i + 1) % 4].kind && Math.abs(Math.sin(arm.angle - arms[(i + 1) % 4].angle)) > 1e-7
      )
    )
      return roads;
  }
  return [];
}

/** Cut real curtain vertices at surveyed highway intersections. Road and
 * bridge coordinates stay unchanged; a gate opens the physical wall there. */
export function installRegionalRoadGates(source: CityDocument): CityDocument {
  if (!source.frameRoads?.length) return source;
  let next = source;
  const castles = castleWallIds(next);
  const segments = regionalRoadSegments(next);
  for (const { a, b, width: renderedWidth } of segments) {
    const wallIds = new Set(
      next.featureGroups.flatMap(g =>
        g.kind === "wall" && !g.locked && g.id.startsWith("gc:") && !castles.has(g.id)
          ? g.segments.map(r => r.edgeId)
          : []
      )
    );
    for (const id of wallIds) {
      const edge = next.mesh.edges[id];
      const p = next.mesh.vertices[edge.a].point;
      const q = next.mesh.vertices[edge.b].point;
      const hit = segmentSegmentHit(p, q, a, b);
      if (!hit) continue;
      let vertexId = hit.t < 1e-7 ? edge.a : hit.t > 1 - 1e-7 ? edge.b : undefined;
      const before = next;
      if (!vertexId) {
        const inserted = insertEdgeVertex(next, id, hit.t);
        if (!inserted) continue;
        next = inserted.document;
        vertexId = inserted.vertexId;
      }
      const roads = regionalRoadThroughGate(next, vertexId);
      if (!roads.length) {
        next = before;
        continue;
      }
      if (next.gates.some(g => g.vertexId === vertexId)) continue;
      if (next === source) next = clone(next);
      const width = Math.max(renderedWidth, next.importedFixedCrossings?.roadWidthMeters ?? 5);
      const wallLength = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const origin = next.mesh.vertices[vertexId].point;
      const sine = Math.min(
        ...roads.map(
          road =>
            Math.abs((road[0] - origin[0]) * (q[1] - p[1]) - (road[1] - origin[1]) * (q[0] - p[0])) /
            (Math.hypot(road[0] - origin[0], road[1] - origin[1]) * wallLength)
        )
      );
      next.gates.push({
        id: `gc:regional-gate-${vertexId}`,
        vertexId,
        role: "town",
        locked: false,
        passageWidthMeters: (width + 2.2) / sine
      });
    }
  }
  // Mesh cloning copies frame roads separately. Rebind existing exact joins
  // so the exterior arm and its town street still share the same point.
  if (next !== source) {
    const points = new Map(Object.values(next.mesh.vertices).map(v => [`${v.point[0]},${v.point[1]}`, v.point]));
    for (const leg of next.frameRoads ?? [])
      for (const piece of leg.pieces)
        piece.points = piece.points.map(point => points.get(`${point[0]},${point[1]}`) ?? point);
  }
  return next;
}
