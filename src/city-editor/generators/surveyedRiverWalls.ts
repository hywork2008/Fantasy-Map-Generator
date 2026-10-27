import type { CityDocument, EdgeRef, Id, Point } from "../types/document";
import { oceanShoreSegments } from "./coastalSuitability";
import { finishOpenEstuaryCurtain } from "./estuaryWallContinuity";
import { castleWallIds } from "./fortifications";
import { nearestOnPolyline } from "./geom";
import { clone, edgeBetween, insertEdgeVertex } from "./mesh";
import { dryRuns, lineHitsWater, waterPolygons } from "./waterGeometry";

/** A surveyed bank may cross the middle of a coarse mesh edge. Keep the dry
 * curtain up to that bank, with real shared vertices for editing and routing. */
export function clipSurveyedRiverWalls(source: CityDocument, openWaterfront = false): CityDocument {
  if (!source.importedFixedCrossings) return source;
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
  return next;
}
