import { castleWallIds } from "./fortifications";
import { nearestOnPolyline } from "./gen/geom";
import { clone, edgeBetween, insertEdgeVertex } from "./mesh";
import type { CityDocument, EdgeRef, Id } from "./types";
import { dryRuns, lineHitsWater, waterPolygons } from "./waterGeometry";

/** A surveyed bank may cross the middle of a coarse mesh edge. Keep the dry
 * curtain up to that bank, with real shared vertices for editing and routing. */
export function clipSurveyedRiverWalls(source: CityDocument): CityDocument {
  if (!source.importedFixedCrossings) return source;
  let next = clone(source);
  const water = waterPolygons(next);
  const castles = castleWallIds(next);
  const groups = next.featureGroups.filter(
    g => g.kind === "wall" && !g.locked && g.id.startsWith("gc:") && !castles.has(g.id)
  );
  const edges = new Set(groups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
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
  return next;
}
