import type { CityDocument, EdgeFeatureGroup, EdgeRef, Id, Point } from "../types/document";
import { oceanShoreSegments } from "./coastalSuitability";
import { finishOpenEstuaryCurtain } from "./estuaryWallContinuity";
import { castleWallIds } from "./fortifications";
import { nearestOnPolyline } from "./geom";
import { clone, edgeBetween, insertEdgeVertex } from "./mesh";
import { extendRiverBankCurtain } from "./riverBankCurtain";
import { dryRuns, lineHitsWater, waterPolygons } from "./waterGeometry";

/** A surveyed bank may cross the middle of a coarse mesh edge. Keep the dry
 * curtain up to that bank, with real shared vertices for editing and routing. */
export function clipSurveyedRiverWalls(source: CityDocument, openWaterfront = false): CityDocument {
  if (!source.importedFixedCrossings) return extendRiverBankCurtain(clone(source));
  let next = clone(source);
  const water = waterPolygons(next);
  const castles = castleWallIds(next);
  const groups = next.featureGroups.filter(
    g => g.kind === "wall" && !g.locked && g.id.startsWith("gc:") && !castles.has(g.id)
  );
  const edges = new Set(groups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
  const banks: [Point, Point][] = openWaterfront
    ? [
        ...[...next.importedFixedCrossings!.rivers, ...(next.importedFixedCrossings!.obstacles ?? [])]
          .flatMap(body => body.rings)
          .flatMap(ring => ring.map((a, i): [Point, Point] => [[...a], [...ring[(i + 1) % ring.length]]])),
        ...oceanShoreSegments(next)
      ]
    : [];
  const shoreFacing = (a: Point, b: Point): boolean => {
    if (!banks.length) return false;
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const direction = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(...direction);
    let closest = Infinity,
      parallel = 0;
    for (const [u, v] of banks) {
      const gap = nearestOnPolyline(middle, [u, v]).dist;
      if (gap >= closest) continue;
      closest = gap;
      const tangent = [v[0] - u[0], v[1] - u[1]];
      parallel =
        Math.abs(direction[0] * tangent[0] + direction[1] * tangent[1]) /
        Math.max(1e-8, length * Math.hypot(...tangent));
    }
    // A curtain may still end transversely at the bank. Only the shoreline
    // arcs are open; inland defenses, castles and explicit seawalls remain.
    return closest <= 24 && parallel >= Math.SQRT1_2;
  };
  const blocked = new Set<Id>();
  for (const id of edges) {
    const edge = next.mesh.edges[id];
    const a = next.mesh.vertices[edge.a].point;
    const b = next.mesh.vertices[edge.b].point;
    if (!lineHitsWater([a, b], water)) continue;
    const cuts = dryRuns([a, b], water)
      .flatMap(run => [run[0], run.at(-1)!])
      .map(point => nearestOnPolyline(point, [a, b]).t)
      .filter(t => t > 1e-7 && t < 1 - 1e-7);
    const pieces = new Set([id]);
    let end = 1;
    for (const t of [...new Set(cuts)].sort((a, b) => b - a)) {
      const previousEnd = next.mesh.edges[id].b;
      const inserted = insertEdgeVertex(next, id, t / end);
      if (!inserted) continue;
      next = inserted.document;
      pieces.add(edgeBetween(next.mesh, inserted.vertexId, previousEnd)!.id);
      end = t;
    }
    for (const piece of pieces) {
      const e = next.mesh.edges[piece];
      if (lineHitsWater([next.mesh.vertices[e.a].point, next.mesh.vertices[e.b].point], water)) blocked.add(piece);
    }
  }
  if (openWaterfront)
    for (const group of next.featureGroups) {
      if (group.kind !== "wall" || !groups.some(g => g.id === group.id)) continue;
      for (const ref of group.segments) {
        const edge = next.mesh.edges[ref.edgeId];
        if (shoreFacing(next.mesh.vertices[edge.a].point, next.mesh.vertices[edge.b].point)) blocked.add(edge.id);
      }
    }
  next.featureGroups = next.featureGroups.flatMap(group => {
    if (!groups.some(g => g.id === group.id) || group.kind !== "wall") return [group];
    const runs: EdgeRef[][] = [[]];
    for (const ref of group.segments) {
      if (blocked.has(ref.edgeId)) {
        if (runs.at(-1)!.length) runs.push([]);
      } else runs.at(-1)!.push(ref);
    }
    return runs
      .filter(run => run.length)
      .map((segments, i) => ({ ...group, id: i ? `${group.id}:bank-${i}` : group.id, segments }));
  });
  if (openWaterfront) finishOpenEstuaryCurtain(next, water);
  next = extendRiverBankCurtain(next);
  removeRiverBankRemnants(next);
  return next;
}

/** A detached curtain lying on one surveyed bank adds no landward defence.
 * Keep the main landward curtain and remove only bank-to-bank remnants whose
 * entire centreline stays in the mesh bank setback of the same river shore. */
function removeRiverBankRemnants(document: CityDocument): void {
  const rings = (document.importedFixedCrossings?.rivers ?? []).flatMap(r => r.rings);
  if (!rings.length) return;
  const castles = castleWallIds(document);
  const groups = document.featureGroups.filter(
    (g): g is EdgeFeatureGroup => g.kind === "wall" && !g.locked && g.id.startsWith("gc:wall-") && !castles.has(g.id)
  );
  const refs = groups.flatMap(g => g.segments);
  const incident = new Map<Id, Id[]>();
  for (const ref of refs) {
    const edge = document.mesh.edges[ref.edgeId];
    for (const id of [edge.a, edge.b]) incident.set(id, [...(incident.get(id) ?? []), edge.id]);
  }
  const pending = new Set(refs.map(ref => ref.edgeId));
  const components: Id[][] = [];
  while (pending.size) {
    const first = pending.values().next().value!;
    pending.delete(first);
    const edges = [first];
    for (const id of edges) {
      const edge = document.mesh.edges[id];
      for (const vertex of [edge.a, edge.b])
        for (const adjacent of incident.get(vertex) ?? []) if (pending.delete(adjacent)) edges.push(adjacent);
    }
    components.push(edges);
  }
  if (components.length < 2) return;
  const removable = new Set<Id>();
  for (const edges of components) {
    const vertices = new Set(
      edges.flatMap(id => {
        const edge = document.mesh.edges[id];
        return [edge.a, edge.b];
      })
    );
    const ends = [...vertices].filter(id => incident.get(id)!.length === 1);
    if (ends.length !== 2 || [...vertices].some(id => incident.get(id)!.length > 2)) continue;
    if ([...vertices].some(id => document.mesh.vertices[id].locked || document.gates.some(g => g.vertexId === id)))
      continue;
    const edgeIds = new Set(edges);
    const width = Math.min(
      ...groups.filter(g => g.segments.some(ref => edgeIds.has(ref.edgeId))).map(g => g.style.widthMeters)
    );
    // Before final smoothing, a coarse mesh corner can sit slightly inland
    // from the surveyed shore. This is at most one third of an editing cell.
    const setback = Math.max(width / 2, document.frame.blockSizeMeters / 3);
    const onBank = rings.some(ring => {
      const shore = [...ring, ring[0]].map(p => [p[0], p[1]] as [number, number]);
      if (ends.some(id => nearestOnPolyline(document.mesh.vertices[id].point, shore).dist > 0.05)) return false;
      return edges.every(id => {
        const edge = document.mesh.edges[id];
        const a = document.mesh.vertices[edge.a].point;
        const b = document.mesh.vertices[edge.b].point;
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.1, width / 2)));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          if (nearestOnPolyline([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], shore).dist > setback)
            return false;
        }
        return true;
      });
    });
    if (onBank) for (const id of edges) removable.add(id);
  }
  // A river alone must never replace every landward wall.
  if (!removable.size || removable.size === refs.length) return;
  const generated = new Set(groups.map(g => g.id));
  document.featureGroups = document.featureGroups.flatMap(g => {
    if (g.kind !== "wall" || !generated.has(g.id)) return [g];
    const segments = g.segments.filter(ref => !removable.has(ref.edgeId));
    return segments.length ? [{ ...g, segments }] : [];
  });
}
