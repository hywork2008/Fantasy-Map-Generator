import FlatQueue from "flatqueue";
import type { CityDocument, EdgeRef, Id, Point } from "../types/document";
import { normalizeGeneratedRoadOwnership } from "./generatedRoadOwnership";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { roadPathVertices } from "./roadNetwork";

const automaticRoad = (g: CityDocument["featureGroups"][number], preserved: ReadonlySet<Id>) =>
  g.kind === "road" &&
  /^gc:(road|street|riverRoad|ring-road)-/.test(g.id) &&
  g.roadRole !== "approach" &&
  !g.locked &&
  !g.sourceRoad &&
  !g.beyond &&
  !g.crossing &&
  !preserved.has(g.id);

/** Remove short, close bypasses between two existing junctions. Interior
 * junctions, facilities, fixed roads and ordinary city-block loops survive. */
function pruneRoadDetours(source: CityDocument, preserved: ReadonlySet<Id> = new Set()): CityDocument {
  const mesh = source.mesh;
  const adjacency = new Map<Id, Map<Id, number>>();
  const widths = new Map<Id, Map<Id, number>>();
  const incident = new Map<Id, Set<Id>>();
  const protectedVertices = new Set(source.gates.map(g => g.vertexId));
  const protectedFaces = new Set(source.elements.flatMap(e => e.faceIds));
  const automatic = (g: CityDocument["featureGroups"][number]) => automaticRoad(g, preserved);
  for (const g of source.featureGroups) {
    if (g.kind === "river") {
      for (const id of g.vertices) protectedVertices.add(id);
      continue;
    }
    for (const ref of g.segments) {
      const e = mesh.edges[ref.edgeId];
      if (g.kind !== "road" || !automatic(g)) protectedVertices.add(e.a).add(e.b);
      if (g.kind !== "road") continue;
      for (const id of [e.a, e.b]) {
        if (!incident.has(id)) incident.set(id, new Set());
        incident.get(id)!.add(e.id);
      }
    }
  }
  const add = (refs: EdgeRef[], width: number) => {
    for (const ref of refs) {
      const e = mesh.edges[ref.edgeId],
        a = mesh.vertices[e.a].point,
        b = mesh.vertices[e.b].point;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const [from, to] of [
        [e.a, e.b],
        [e.b, e.a]
      ]) {
        if (!adjacency.has(from)) adjacency.set(from, new Map());
        adjacency.get(from)!.set(to, length);
        if (!widths.has(from)) widths.set(from, new Map());
        widths.get(from)!.set(to, Math.max(width, widths.get(from)!.get(to) ?? 0));
      }
    }
  };
  const path = (start: Id, end: Id, limit: number, width: number): Id[] | null => {
    const distances = new Map<Id, number>([[start, 0]]),
      previous = new Map<Id, Id>(),
      queue = new FlatQueue<Id>();
    queue.push(start, 0);
    while (queue.length) {
      const distance = queue.peekValue()!,
        id = queue.pop()!;
      if (distance !== distances.get(id)) continue;
      if (id === end) {
        const result = [end];
        for (let at = end; at !== start; ) {
          at = previous.get(at)!;
          result.push(at);
        }
        return result.reverse();
      }
      for (const [to, length] of adjacency.get(id) ?? []) {
        if ((widths.get(id)?.get(to) ?? 0) < width) continue;
        const next = distance + length;
        if (next > limit || next >= (distances.get(to) ?? Infinity)) continue;
        distances.set(to, next);
        previous.set(to, id);
        queue.push(to, next);
      }
    }
    return null;
  };
  const points = (ids: Id[]) => ids.map(id => mesh.vertices[id].point);
  const block = Math.min(60, source.frame.blockSizeMeters);
  let changed = false;
  const groups: CityDocument["featureGroups"] = [];
  for (const group of source.featureGroups) {
    if (group.kind !== "road") {
      groups.push(group);
      continue;
    }
    if (!automatic(group)) {
      groups.push(group);
      add(group.segments, group.style.widthMeters ?? 0);
      continue;
    }
    const nodes = roadPathVertices(mesh, group.segments),
      removed = new Set<number>();
    let start = -1;
    for (let end = 0; end < nodes.length; end++) {
      if (!adjacency.has(nodes[end])) continue;
      if (start >= 0 && end > start + 1) {
        const ids = nodes.slice(start, end + 1),
          line = points(ids);
        const length = line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);
        const refs = group.segments.slice(start, end);
        const cumulative = [0];
        for (let i = 1; i < line.length; i++)
          cumulative.push(cumulative[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
        let keepPrefix = 0,
          keepSuffix = ids.length - 1;
        let middleJunction = false;
        for (let i = 1; i < ids.length - 1; i++) {
          if ((incident.get(ids[i])?.size ?? 0) === 2) continue;
          if (cumulative[i] <= length * 0.25) keepPrefix = i;
          else if (cumulative[i] >= length * 0.75) keepSuffix = Math.min(keepSuffix, i);
          else middleJunction = true;
        }
        const blocked =
          middleJunction ||
          ids.slice(1, -1).some(id => protectedVertices.has(id) || mesh.vertices[id].locked) ||
          refs.some(r => {
            const e = mesh.edges[r.edgeId];
            return e.locked || [e.leftFace, e.rightFace].some(id => id && protectedFaces.has(id));
          });
        const alternative =
          !blocked && ids[0] !== ids.at(-1) && length <= 3 * block
            ? path(ids[0], ids.at(-1)!, 1.25 * length, group.style.widthMeters ?? 0)
            : null;
        if (alternative) {
          const other = points(alternative);
          const close = (a: Point[], b: Point[]) =>
            a
              .slice(1)
              .every((p, i) =>
                [a[i], [(p[0] + a[i][0]) / 2, (p[1] + a[i][1]) / 2] as Point, p].every(
                  q => nearestOnPolyline(q, b).dist <= block * 0.3
                )
              );
          const ring = [...line, ...other.slice(1, -1).reverse()];
          const reservedInside = Object.values(mesh.faces).some(
            f =>
              (protectedFaces.has(f.id) || !f.properties.buildable || f.properties.water !== "land") &&
              pointInPolygon(polygonCentroid(facePoints(mesh, f)), ring)
          );
          if (close(line, other) && close(other, line) && isSimplePolygon(ring, 1e-6) && !reservedInside) {
            for (let i = start + keepPrefix; i < start + keepSuffix; i++) removed.add(i);
          }
        }
      }
      start = end;
    }
    const segments = group.segments.filter((_, i) => !removed.has(i));
    changed ||= removed.size > 0;
    groups.push(removed.size ? { ...group, segments } : group);
    add(segments, group.style.widthMeters ?? 0);
  }
  if (!changed) return source;
  const result = { ...source, featureGroups: groups };
  normalizeGeneratedRoadOwnership(result, preserved);
  return result;
}

/** Join degree-two continuations for detection, then restore original ownership. */
export function removeRedundantRoadDetours(source: CityDocument, preserved: ReadonlySet<Id> = new Set()): CityDocument {
  const incident = new Map<Id, Set<Id>>();
  for (const g of source.featureGroups) {
    if (g.kind !== "road") continue;
    for (const ref of g.segments) {
      const e = source.mesh.edges[ref.edgeId];
      for (const id of [e.a, e.b]) {
        if (!incident.has(id)) incident.set(id, new Set());
        incident.get(id)!.add(e.id);
      }
    }
  }
  const groups = [...source.featureGroups];
  const consumed = new Set<Id>();
  // Resolve later continuations before considering the earlier trunk.
  for (let i = groups.length - 1; i >= 0; i--) {
    const first = groups[i];
    if (first.kind !== "road" || !automaticRoad(first, preserved) || consumed.has(first.id)) continue;
    let segments = first.segments;
    let extended = true;
    while (extended) {
      extended = false;
      const nodes = roadPathVertices(source.mesh, segments);
      for (let j = i + 1; j < groups.length; j++) {
        const next = groups[j];
        if (
          next.kind !== "road" ||
          !automaticRoad(next, preserved) ||
          consumed.has(next.id) ||
          next.style.widthMeters !== first.style.widthMeters
        )
          continue;
        const other = roadPathVertices(source.mesh, next.segments);
        const shared = new Set(other.filter(id => nodes.includes(id)));
        if (shared.size !== 1) continue;
        const reverse = (refs: EdgeRef[]) => [...refs].reverse().map(r => ({ ...r, forward: !r.forward }));
        let joined: EdgeRef[] | undefined;
        for (const atStart of [false, true]) {
          const junction = atStart ? nodes[0] : nodes.at(-1)!;
          if (incident.get(junction)?.size !== 2) continue;
          if (atStart && other.at(-1) === junction) joined = [...next.segments, ...segments];
          else if (atStart && other[0] === junction) joined = [...reverse(next.segments), ...segments];
          else if (!atStart && other[0] === junction) joined = [...segments, ...next.segments];
          else if (!atStart && other.at(-1) === junction) joined = [...segments, ...reverse(next.segments)];
          if (joined) break;
        }
        if (!joined) continue;
        segments = joined;
        consumed.add(next.id);
        extended = true;
        break;
      }
    }
    groups[i] = { ...first, segments };
  }
  const virtual = { ...source, featureGroups: groups.filter(g => !consumed.has(g.id)) };
  const pruned = pruneRoadDetours(virtual, preserved);
  if (pruned === virtual) return source;
  const retained = new Set(pruned.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(r => r.edgeId) : [])));
  const result = {
    ...source,
    featureGroups: source.featureGroups.map(g =>
      g.kind === "road" && automaticRoad(g, preserved)
        ? { ...g, segments: g.segments.filter(r => retained.has(r.edgeId)) }
        : g
    )
  };
  normalizeGeneratedRoadOwnership(result, preserved);
  return result;
}
