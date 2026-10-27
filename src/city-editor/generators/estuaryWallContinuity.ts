import FlatQueue from "flatqueue";
import type { CityDocument, EdgeRef, Id, Point } from "../types/document";
import { oceanShoreSegments } from "./coastalSuitability";
import { castleWallIds } from "./fortifications";
import { lineHitsWater } from "./waterGeometry";

type Segment = [Point, Point];

function distanceToSegment(p: Point, [a, b]: Segment): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const squared = dx * dx + dy * dy;
  const t = squared ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Remove disconnected waterfront remnants and connect the surviving outer curtain to the sea.
 * Called on the private assembly document before gates and circuits are registered. */
export function finishOpenEstuaryCurtain(document: CityDocument, water: Point[][]): void {
  const mesh = document.mesh;
  const castles = castleWallIds(document);
  const groups = document.featureGroups.filter(
    group => group.kind === "wall" && !group.locked && group.id.startsWith("gc:wall-") && !castles.has(group.id)
  );
  const edgeIds = new Set(
    groups.flatMap(group => (group.kind === "wall" ? group.segments.map(ref => ref.edgeId) : []))
  );
  if (!edgeIds.size) return;
  const coast = oceanShoreSegments(document);
  const fixed = document.importedFixedCrossings;
  const banks: Segment[] = [
    ...coast,
    ...[...(fixed?.rivers ?? []), ...(fixed?.obstacles ?? [])].flatMap(body =>
      body.rings.flatMap(ring => ring.map((a, i): Segment => [[...a], [...ring[(i + 1) % ring.length]]]))
    )
  ];
  if (!banks.length || !coast.length) return;
  const adjacency = new Map<Id, Id[]>();
  for (const id of edgeIds) {
    const edge = mesh.edges[id];
    if (!edge) continue;
    for (const vertex of [edge.a, edge.b]) {
      const list = adjacency.get(vertex) ?? [];
      list.push(id);
      adjacency.set(vertex, list);
    }
  }
  const pending = new Set(edgeIds);
  const components: { edges: Id[]; vertices: Set<Id>; length: number }[] = [];
  while (pending.size) {
    const first = pending.values().next().value as Id;
    pending.delete(first);
    const edges = [first],
      vertices = new Set<Id>();
    let length = 0;
    for (let i = 0; i < edges.length; i++) {
      const edge = mesh.edges[edges[i]];
      if (!edge) continue;
      length += Math.hypot(
        mesh.vertices[edge.a].point[0] - mesh.vertices[edge.b].point[0],
        mesh.vertices[edge.a].point[1] - mesh.vertices[edge.b].point[1]
      );
      for (const vertex of [edge.a, edge.b]) {
        vertices.add(vertex);
        for (const adjacent of adjacency.get(vertex) ?? []) if (pending.delete(adjacent)) edges.push(adjacent);
      }
    }
    components.push({ edges, vertices, length });
  }
  components.sort((a, b) => b.length - a.length || a.edges[0].localeCompare(b.edges[0]));
  const main = components[0];
  const setback = Math.max(100, document.frame.blockSizeMeters * 2);
  const nearWater = (id: Id) => banks.some(bank => distanceToSegment(mesh.vertices[id].point, bank) <= setback);
  const remove = new Set(
    components
      .slice(1)
      .filter(c => c.length < main.length * 0.5 && [...c.vertices].every(nearWater))
      .flatMap(c => c.edges)
  );
  const groupIds = new Set(groups.map(group => group.id));
  document.featureGroups = document.featureGroups.flatMap(group => {
    if (group.kind !== "wall" || !groupIds.has(group.id)) return [group];
    const runs: EdgeRef[][] = [[]];
    for (const ref of group.segments) {
      if (remove.has(ref.edgeId)) {
        if (runs.at(-1)!.length) runs.push([]);
      } else runs.at(-1)!.push(ref);
    }
    return runs
      .filter(run => run.length)
      .map((segments, i) => ({ ...group, id: i ? `${group.id}:shore-${i}` : group.id, segments }));
  });

  const coastVertices = new Set<Id>();
  const oceanFaces = new Set(document.coastalOceanFaceIds ?? []);
  const forbiddenEdges = new Set(
    document.featureGroups.flatMap(group => (group.kind === "river" ? [] : group.segments.map(ref => ref.edgeId)))
  );
  const forbiddenVertices = new Set(document.gates.map(gate => gate.vertexId));
  const graph = new Map<Id, { to: Id; id: Id; length: number }[]>();
  for (const edge of Object.values(mesh.edges)) {
    const faces = [edge.leftFace, edge.rightFace].flatMap(id => (id && mesh.faces[id] ? [mesh.faces[id]] : []));
    const hasSea = faces.some(face => face.properties.water === "sea");
    if (
      faces.some(face => oceanFaces.has(face.id) && face.properties.water === "sea") &&
      faces.some(face => face.properties.water === "land")
    ) {
      coastVertices.add(edge.a);
      coastVertices.add(edge.b);
    }
    if (edge.locked || forbiddenEdges.has(edge.id) || hasSea || faces.some(face => face.properties.locked)) continue;
    const a = mesh.vertices[edge.a],
      b = mesh.vertices[edge.b];
    if (!a || !b || a.locked || b.locked) continue;
    const length = Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]);
    for (const [from, to] of [
      [edge.a, edge.b],
      [edge.b, edge.a]
    ]) {
      const links = graph.get(from) ?? [];
      links.push({ to, id: edge.id, length });
      graph.set(from, links);
    }
  }
  const maxDistance = Math.max(100, document.frame.blockSizeMeters * 3);
  const endpoints = [...main.vertices].filter(id => (adjacency.get(id)?.length ?? 0) === 1);
  for (const start of endpoints) {
    if (coastVertices.has(start) || forbiddenVertices.has(start)) continue;
    const point = mesh.vertices[start].point;
    const coastGap = Math.min(...coast.map(segment => distanceToSegment(point, segment)));
    const riverGap = Math.min(...banks.slice(coast.length).map(segment => distanceToSegment(point, segment)));
    if (coastGap > maxDistance || coastGap >= riverGap) continue;
    const open = new FlatQueue<Id>();
    const costs = new Map<Id, number>([[start, 0]]);
    const previous = new Map<Id, { from: Id; edge: Id }>();
    const visited = new Set<Id>();
    open.push(start, 0);
    let destination: Id | undefined;
    while (open.length) {
      const id = open.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (coastVertices.has(id)) {
        destination = id;
        break;
      }
      const cost = costs.get(id)!;
      for (const link of graph.get(id) ?? []) {
        const candidate = cost + link.length;
        if (
          candidate > maxDistance ||
          forbiddenEdges.has(link.id) ||
          candidate >= (costs.get(link.to) ?? Infinity) ||
          forbiddenVertices.has(link.to) ||
          (main.vertices.has(link.to) && link.to !== start)
        )
          continue;
        if (lineHitsWater([mesh.vertices[id].point, mesh.vertices[link.to].point], water)) continue;
        costs.set(link.to, candidate);
        previous.set(link.to, { from: id, edge: link.id });
        open.push(link.to, candidate);
      }
    }
    if (!destination) continue;
    const path: EdgeRef[] = [];
    for (let id = destination; id !== start; ) {
      const step = previous.get(id)!;
      const edge = mesh.edges[step.edge];
      path.unshift({ edgeId: edge.id, forward: edge.a === step.from });
      id = step.from;
    }
    const owner = document.featureGroups.find(
      group =>
        group.kind === "wall" &&
        !group.locked &&
        group.id.startsWith("gc:wall-") &&
        !castles.has(group.id) &&
        group.segments.length > 0 &&
        [group.segments[0], group.segments.at(-1)!].some(ref => {
          const edge = mesh.edges[ref.edgeId];
          return edge.a === start || edge.b === start;
        })
    );
    if (owner?.kind !== "wall" || !path.length) continue;
    const last = owner.segments.at(-1)!;
    const lastEdge = mesh.edges[last.edgeId];
    if ((last.forward ? lastEdge.b : lastEdge.a) === start) owner.segments.push(...path);
    else owner.segments.unshift(...path.reverse().map(ref => ({ edgeId: ref.edgeId, forward: !ref.forward })));
    for (const ref of path) forbiddenEdges.add(ref.edgeId);
  }
}
