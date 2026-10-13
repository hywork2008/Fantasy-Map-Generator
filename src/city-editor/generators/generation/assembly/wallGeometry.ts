import { splitDryWallRuns } from "../../../core/gen/plausibility";
import type { EdgeRef, Id, Mesh, Point } from "../../../core/types";
import type { MeshBorderLoop } from "../../../types/generation";

/** A plaza-outline vertex, so gate→plaza streets meet the square instead of cutting through it. */

/** Keep the longest contiguous run whose `edgeId`s are not in `banned`. */
export function longestUnbannedRun(segments: EdgeRef[], banned: Set<Id>): EdgeRef[] {
  if (banned.size === 0) return segments;
  let best: EdgeRef[] = [];
  let current: EdgeRef[] = [];
  for (const segment of segments) {
    if (banned.has(segment.edgeId)) {
      if (current.length > best.length) best = current;
      current = [];
    } else current.push(segment);
  }
  return current.length > best.length ? current : best;
}

/**
 * One sea-wall gap, centred on the shore edge nearest the harbour. Grows along
 * neighbouring sea edges only until the gap is wide enough for a boat (~16 m).
 */
export function seaOpeningEdgeIds(
  mesh: Mesh,
  loops: MeshBorderLoop[],
  waterPolygon: Point[] | null,
  anchor: Point | null
): Set<Id> {
  const open = new Set<Id>();
  interface SeaEdge {
    id: Id;
    mid: Point;
    length: number;
  }
  const seaEdges: SeaEdge[] = [];
  for (const loop of loops) {
    const runs =
      waterPolygon && waterPolygon.length >= 3
        ? splitDryWallRuns(loop.points, loop.segments, waterPolygon)
        : [loop.segments];
    for (const run of runs) {
      for (const segment of run) {
        const edge = mesh.edges[segment.edgeId];
        if (!edge) continue;
        const waters = [edge.leftFace, edge.rightFace]
          .filter((id): id is Id => !!id)
          .map(id => mesh.faces[id]?.properties.water);
        if (!waters.includes("sea") || !waters.includes("land")) continue;
        const a = mesh.vertices[edge.a]?.point;
        const b = mesh.vertices[edge.b]?.point;
        if (!a || !b) continue;
        seaEdges.push({
          id: segment.edgeId,
          mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          length: Math.hypot(b[0] - a[0], b[1] - a[1])
        });
      }
    }
  }
  if (!seaEdges.length) return open;
  const target = anchor ?? [0, 0];
  const distanceTo = (edge: SeaEdge) => Math.hypot(edge.mid[0] - target[0], edge.mid[1] - target[1]);
  seaEdges.sort((a, b) => distanceTo(a) - distanceTo(b) || a.id.localeCompare(b.id));
  const seed = seaEdges[0];
  const byId = new Map(seaEdges.map(edge => [edge.id, edge]));
  const atVertex = new Map<Id, Id[]>();
  for (const seaEdge of seaEdges) {
    const edge = mesh.edges[seaEdge.id];
    for (const vertexId of [edge.a, edge.b]) {
      const list = atVertex.get(vertexId) ?? [];
      list.push(seaEdge.id);
      atVertex.set(vertexId, list);
    }
  }
  const MIN_GAP = 16;
  open.add(seed.id);
  let length = seed.length;
  while (length < MIN_GAP) {
    const frontier: Id[] = [];
    for (const id of open) {
      const edge = mesh.edges[id];
      for (const vertexId of [edge.a, edge.b]) {
        for (const next of atVertex.get(vertexId) ?? []) {
          if (!open.has(next)) frontier.push(next);
        }
      }
    }
    const next = [...new Set(frontier)].sort(
      (a, b) => distanceTo(byId.get(a)!) - distanceTo(byId.get(b)!) || a.localeCompare(b)
    )[0];
    if (!next) break;
    open.add(next);
    length += byId.get(next)!.length;
  }
  return open;
}

export function unbannedRuns(segments: EdgeRef[], banned: Set<Id>): EdgeRef[][] {
  const runs: EdgeRef[][] = [];
  let current: EdgeRef[] = [];
  for (const segment of segments) {
    if (banned.has(segment.edgeId)) {
      if (current.length) runs.push(current);
      current = [];
    } else current.push(segment);
  }
  if (current.length) runs.push(current);
  return runs;
}
