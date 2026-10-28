import FlatQueue from "flatqueue";
import type { CityDocument, EdgeRef, Id, Point } from "../types/document";
import { castleWallIds } from "./fortifications";
import { nearestOnPolyline } from "./geom";
import { edgeBetween, insertEdgeVertex } from "./mesh";
import { dryRuns, lineHitsWater, waterPolygons } from "./waterGeometry";

/** Extend generated open curtain ends along dry mesh edges to the physical river bank. */
export function extendRiverBankCurtain(document: CityDocument): CityDocument {
  const rivers = (document.waterAreas ?? []).filter(area => area.kind === "river").map(area => area.polygon);
  if (!rivers.length) return document;
  let next = document;
  const water = waterPolygons(next);
  const castles = castleWallIds(next);
  const walls = next.featureGroups.filter(
    g => g.kind === "wall" && !g.locked && g.id.startsWith("gc:wall-") && !castles.has(g.id)
  );
  const wallEdges = new Set(walls.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
  const degree = new Map<Id, number>();
  for (const id of wallEdges) {
    const edge = next.mesh.edges[id];
    for (const vertex of [edge.a, edge.b]) degree.set(vertex, (degree.get(vertex) ?? 0) + 1);
  }
  const endpoints = [...degree].filter(([, n]) => n === 1).map(([id]) => id);
  const limit = Math.max(150, next.frame.blockSizeMeters * 5);
  for (const start of endpoints) {
    const startPoint = next.mesh.vertices[start]?.point;
    if (!startPoint || next.mesh.vertices[start].locked || next.gates.some(g => g.vertexId === start)) continue;
    const gap = Math.min(...rivers.map(ring => nearestOnPolyline(startPoint, [...ring, ring[0]]).dist));
    if (gap < 0.05 || gap > limit) continue;
    const forbidden = new Set(
      next.featureGroups.flatMap(g => (g.kind === "river" ? [] : g.segments.map(r => r.edgeId)))
    );
    const graph = new Map<Id, Id[]>();
    for (const edge of Object.values(next.mesh.edges)) {
      if (
        edge.locked ||
        forbidden.has(edge.id) ||
        next.mesh.vertices[edge.a].locked ||
        next.mesh.vertices[edge.b].locked
      )
        continue;
      const faces = [edge.leftFace, edge.rightFace].flatMap(id =>
        id && next.mesh.faces[id] ? [next.mesh.faces[id]] : []
      );
      if (faces.some(face => face.properties.locked)) continue;
      // An outer curtain must not replace a street between two town blocks.
      if (faces.length === 2 && faces.every(face => face.properties.settlement === "core")) continue;
      for (const id of [edge.a, edge.b]) graph.set(id, [...(graph.get(id) ?? []), edge.id]);
    }
    const queue = new FlatQueue<Id>();
    queue.push(start, 0);
    const costs = new Map<Id, number>([[start, 0]]);
    const previous = new Map<Id, { from: Id; edge: Id }>();
    let target: { from: Id; edge: Id; point: Point; cost: number } | undefined;
    while (queue.length) {
      const id = queue.pop()!,
        cost = costs.get(id)!;
      if (target && cost >= target.cost) break;
      for (const edgeId of graph.get(id) ?? []) {
        const edge = next.mesh.edges[edgeId],
          other = edge.a === id ? edge.b : edge.a;
        if (degree.has(other) || next.gates.some(g => g.vertexId === other)) continue;
        const a = next.mesh.vertices[id].point,
          b = next.mesh.vertices[other].point;
        const runs = dryRuns([a, b], water);
        const first = runs[0];
        if (!first || Math.hypot(first[0][0] - a[0], first[0][1] - a[1]) > 0.01) continue;
        const end = first.at(-1)!;
        const distance = Math.hypot(end[0] - a[0], end[1] - a[1]);
        const total = cost + distance;
        if (total > limit) continue;
        const bankGap = Math.min(...rivers.map(ring => nearestOnPolyline(end, [...ring, ring[0]]).dist));
        if (bankGap < 0.05 && (!target || total < target.cost))
          target = { from: id, edge: edgeId, point: end, cost: total };
        if (Math.hypot(end[0] - b[0], end[1] - b[1]) > 0.01 || lineHitsWater([a, b], water)) continue;
        if (total < (costs.get(other) ?? Infinity)) {
          costs.set(other, total);
          previous.set(other, { from: id, edge: edgeId });
          queue.push(other, total);
        }
      }
    }
    if (!target) continue;
    const edge = next.mesh.edges[target.edge];
    const a = next.mesh.vertices[edge.a].point,
      b = next.mesh.vertices[edge.b].point;
    const t = nearestOnPolyline(target.point, [a, b]).t;
    let endId = t < 1e-7 ? edge.a : t > 1 - 1e-7 ? edge.b : undefined;
    if (!endId) {
      const inserted = insertEdgeVertex(next, edge.id, t);
      if (!inserted) continue;
      next = inserted.document;
      endId = inserted.vertexId;
    }
    const terminal = edgeBetween(next.mesh, target.from, endId);
    if (!terminal) continue;
    const path: EdgeRef[] = [{ edgeId: terminal.id, forward: terminal.a === target.from }];
    for (let id = target.from; id !== start; ) {
      const step = previous.get(id)!;
      const e = next.mesh.edges[step.edge];
      path.unshift({ edgeId: e.id, forward: e.a === step.from });
      id = step.from;
    }
    const owner = next.featureGroups.find(
      g =>
        g.kind === "wall" &&
        !g.locked &&
        walls.some(w => w.id === g.id) &&
        g.segments.some(ref => {
          const e = next.mesh.edges[ref.edgeId];
          return e.a === start || e.b === start;
        })
    );
    if (owner?.kind !== "wall") continue;
    const last = owner.segments.at(-1)!;
    const lastEdge = next.mesh.edges[last.edgeId];
    if ((last.forward ? lastEdge.b : lastEdge.a) === start) owner.segments.push(...path);
    else owner.segments.unshift(...path.reverse().map(ref => ({ edgeId: ref.edgeId, forward: !ref.forward })));
    for (const ref of path) {
      const e = next.mesh.edges[ref.edgeId];
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
  }
  return next;
}
