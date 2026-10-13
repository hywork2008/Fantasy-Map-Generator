import type { CityDocument, Id } from "../types/document";
import { boundaryEdges, boundaryRings, castleWallIds, townCircuits } from "./fortifications";
import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "./geom";
import { kindEdgeIds, townCenter, vertexHasCrossing } from "./passages";
import { riverWallPassagePath } from "./riverWallPassage";
import { lineHitsWater, waterPolygons } from "./waterGeometry";

export interface TownDefenseClosureReport {
  ok: boolean;
  circuitId: Id;
  undefendedLengthMeters: number;
  riverOpeningLengthMeters: number;
  disconnectedEnds: number;
  invasionPaths: number;
  waterGates: number;
  unreachableGates: Id[];
  issues: string[];
}

/** Additional defence audit: a natural `opening`/`waterfront` is not a closed
 * curtain. Inspect a ring against its immediate exterior, even if another wall
 * prevents access from the map frame. Gates are evaluated in their closed state. */
export function auditTownDefenseClosure(
  document: CityDocument,
  circuitId: Id,
  requireRoads = false
): TownDefenseClosureReport {
  const circuit = townCircuits(document).find(c => c.id === circuitId);
  const report: TownDefenseClosureReport = {
    ok: true,
    circuitId,
    undefendedLengthMeters: 0,
    riverOpeningLengthMeters: 0,
    disconnectedEnds: 0,
    invasionPaths: 0,
    waterGates: 0,
    unreachableGates: [],
    issues: []
  };
  if (!circuit) return { ...report, ok: false, issues: [`Missing town circuit ${circuitId}`] };
  if (circuit.state === "razed") return report;
  const mesh = document.mesh;
  const boundary = boundaryEdges(mesh, circuit.areaFaceIds);
  const castleGroups = castleWallIds(document);
  const castleEdges = new Set(
    document.featureGroups.flatMap(g =>
      g.kind === "wall" && castleGroups.has(g.id) ? g.segments.map(r => r.edgeId) : []
    )
  );
  const rings = boundaryRings(mesh, boundary).sort((a, b) => b.length - a.length);
  // An enclosed castle is excluded from the town's face membership. Its
  // protected hole is not a disconnected town or a breach in the outer rim.
  if (!rings.length || rings.slice(1).some(ring => !ring.every(ref => castleEdges.has(ref.edgeId))))
    report.issues.push("Defence boundary is disconnected or has an unprotected hole");
  const groups = document.featureGroups.filter(
    g => g.kind === "wall" && (circuit.wallGroupIds.includes(g.id) || castleGroups.has(g.id))
  );
  const covered = new Set(groups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
  const passages = new Set(groups.flatMap(g => (g.kind === "wall" ? (g.riverPassages ?? []) : [])));
  const rivers = kindEdgeIds(document, "river");
  const riverVertices = new Set([...rivers].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
  const inside = new Set(circuit.areaFaceIds);
  const missing = new Set<Id>();
  const degree = new Map<Id, number>();
  const physicalWater = waterPolygons(document);
  const gratePaths = groups.flatMap(g =>
    g.kind === "wall"
      ? (g.riverPassages ?? []).flatMap(id => {
          const path = riverWallPassagePath(document, g, id);
          return path ? [path] : [];
        })
      : []
  );
  for (const ref of boundary) {
    const edge = mesh.edges[ref.edgeId];
    if (!covered.has(edge.id)) {
      missing.add(edge.id);
      const a = mesh.vertices[edge.a].point,
        b = mesh.vertices[edge.b].point;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      report.undefendedLengthMeters += length;
      if (
        rivers.has(edge.id) ||
        riverVertices.has(edge.a) ||
        riverVertices.has(edge.b) ||
        lineHitsWater([a, b], physicalWater)
      )
        report.riverOpeningLengthMeters += length;
      report.issues.push(`Unprotected boundary ${edge.id}`);
      continue;
    }
    for (const id of [edge.a, edge.b]) degree.set(id, (degree.get(id) ?? 0) + 1);
    const a = mesh.vertices[edge.a].point,
      b = mesh.vertices[edge.b].point;
    if (lineHitsWater([a, b], physicalWater)) {
      const cuts = [
        0,
        1,
        ...physicalWater.flatMap(polygon =>
          polygon.flatMap((p, i) => {
            const hit = segmentSegmentHit(a, b, p, polygon[(i + 1) % polygon.length]);
            return hit ? [hit.t] : [];
          })
        )
      ].sort((x, y) => x - y);
      for (let i = 1; i < cuts.length; i++) {
        if (cuts[i] - cuts[i - 1] < 1e-9) continue;
        const at = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const midpoint = at((cuts[i] + cuts[i - 1]) / 2);
        if (
          physicalWater.some(p => pointInPolygon(midpoint, p)) &&
          !gratePaths.some(path =>
            [at(cuts[i - 1]), midpoint, at(cuts[i])].every(p => nearestOnPolyline(p, path).dist < 1e-5)
          )
        ) {
          report.issues.push(`Submerged curtain has no full-width water gate ${edge.id}`);
          break;
        }
      }
    }
    for (const riverId of rivers) {
      const river = mesh.edges[riverId];
      const shared = [edge.a, edge.b].filter(id => id === river.a || id === river.b);
      const hit = segmentSegmentHit(
        mesh.vertices[edge.a].point,
        mesh.vertices[edge.b].point,
        mesh.vertices[river.a].point,
        mesh.vertices[river.b].point
      );
      if (rivers.has(edge.id) || (hit && !shared.length))
        report.issues.push(`Unsecured river crossing ${edge.id}/${riverId}`);
      for (const id of shared)
        if (!passages.has(id) || !vertexHasCrossing(document, id, "wall", "river"))
          report.issues.push(`Unsecured river contact ${id}`);
    }
  }
  report.disconnectedEnds = [...degree.values()].filter(n => n !== 2).length;
  if (report.disconnectedEnds) report.issues.push(`${report.disconnectedEnds} disconnected wall ends`);
  report.waterGates = [...passages].filter(
    id => degree.has(id) && vertexHasCrossing(document, id, "wall", "river")
  ).length;
  for (const id of passages) {
    if (!degree.has(id)) continue;
    if (!groups.some(g => g.kind === "wall" && g.riverPassages?.includes(id) && riverWallPassagePath(document, g, id)))
      report.issues.push(`Water gate does not reach both banks ${id}`);
  }
  // A dry face on the immediate exterior is an attacker seed. Flooding may
  // cross only uncovered dry edges. This includes bank-side gaps rather than
  // treating the river itself as an impassable replacement for a missing wall.
  const exterior = new Set<Id>();
  for (const ref of boundary) {
    const edge = mesh.edges[ref.edgeId];
    const id = inside.has(edge.leftFace ?? "") ? edge.rightFace : edge.leftFace;
    if (id && mesh.faces[id]?.properties.water === "land") exterior.add(id);
    if (missing.has(edge.id) && !id) report.invasionPaths++;
  }
  const seen = new Set(exterior),
    pending = [...exterior];
  for (let at = 0; at < pending.length; at++) {
    for (const ref of mesh.faces[pending[at]].boundary) {
      if (covered.has(ref.edgeId) || rivers.has(ref.edgeId)) continue;
      const edge = mesh.edges[ref.edgeId];
      const other = edge.leftFace === pending[at] ? edge.rightFace : edge.leftFace;
      if (!other || seen.has(other) || mesh.faces[other]?.properties.water !== "land") continue;
      seen.add(other);
      if (inside.has(other)) report.invasionPaths++;
      else pending.push(other);
    }
  }
  if (report.invasionPaths) report.issues.push(`${report.invasionPaths} land entries with gates closed`);
  if (requireRoads) {
    const roadEdges = kindEdgeIds(document, "road");
    const graph = new Map<Id, Id[]>();
    for (const id of roadEdges) {
      const e = mesh.edges[id];
      graph.set(e.a, [...(graph.get(e.a) ?? []), e.b]);
      graph.set(e.b, [...(graph.get(e.b) ?? []), e.a]);
    }
    const center = townCenter(document),
      oldTown = new Set(townCircuits(document)[0]?.areaFaceIds ?? []);
    const oldVertices = new Set<Id>();
    for (const e of Object.values(mesh.edges))
      if ([e.leftFace, e.rightFace].some(f => f && oldTown.has(f))) {
        oldVertices.add(e.a);
        oldVertices.add(e.b);
      }
    const candidates = [...graph.keys()].filter(id => oldVertices.has(id));
    candidates.sort(
      (a, b) =>
        Math.hypot(mesh.vertices[a].point[0] - center[0], mesh.vertices[a].point[1] - center[1]) -
        Math.hypot(mesh.vertices[b].point[0] - center[0], mesh.vertices[b].point[1] - center[1])
    );
    // Streets deliberately end on different square corners rather than draw
    // road edges through the plaza. All dry corners of that reserved public
    // space are valid destinations; they need not share a rendered road edge.
    const plazaFaces = new Set(document.elements.find(e => e.kind === "plaza")?.faceIds ?? []);
    const plazaVertices = new Set<Id>();
    for (const e of Object.values(mesh.edges))
      if ([e.leftFace, e.rightFace].some(f => f && plazaFaces.has(f))) {
        plazaVertices.add(e.a);
        plazaVertices.add(e.b);
      }
    const destinations = candidates.filter(id => plazaVertices.has(id));
    const reached = new Set<Id>(),
      pending = destinations.length ? destinations : candidates.length ? [candidates[0]] : [];
    for (const id of pending) {
      if (reached.has(id)) continue;
      reached.add(id);
      for (const other of graph.get(id) ?? []) if (!reached.has(other)) pending.push(other);
    }
    const outerId = townCircuits(document).at(-1)?.id;
    report.unreachableGates = document.gates
      .filter(g => !g.ownerCastleId && (g.circuitId ?? outerId) === circuitId && !reached.has(g.vertexId))
      .map(g => g.id);
    for (const id of report.unreachableGates) report.issues.push(`Gate has no road to the town centre ${id}`);
  }
  report.issues = [...new Set(report.issues)];
  report.ok = !report.issues.length;
  return report;
}
