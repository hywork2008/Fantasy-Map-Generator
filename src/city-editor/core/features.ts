import { clone, edgeBetween, edgeEnd, edgeRefFor, faceVertices, validate, vertexTouchesWater } from "./mesh";
import type { CityDocument, EdgeFeatureGroup, ElementKind, FeatureGroup, Id, Mesh, RiverGroup } from "./types";

export function createGroup(document: CityDocument, kind: FeatureGroup["kind"]): CityDocument {
  const next = clone(document);
  const number = next.featureGroups.filter(group => group.kind === kind).length + 1;
  const group =
    kind === "river"
      ? ({
          id: nextId(next, "river"),
          kind,
          name: `River #${number}`,
          vertices: [],
          source: null,
          mouth: null,
          style: { widthMeters: 18, color: "#3979a8" },
          locked: false
        } satisfies RiverGroup)
      : ({
          id: nextId(next, kind),
          kind,
          name: `${edgeGroupLabel(kind)} #${number}`,
          segments: [],
          style: edgeGroupStyle(kind),
          locked: false
        } satisfies EdgeFeatureGroup);
  next.featureGroups.push(group);
  return next;
}

export function appendEdge(document: CityDocument, groupId: Id, edgeId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  const edge = next.mesh.edges[edgeId];
  if (!group || !edge || group.kind === "river" || group.locked) return null;
  if (group.segments.some(segment => segment.edgeId === edgeId)) return next;
  if (group.segments.length === 0) group.segments.push({ edgeId, forward: true });
  else {
    const end = edgeEnd(next.mesh, group.segments[group.segments.length - 1]);
    const ref = edgeRefFor(next.mesh, edgeId, end);
    if (ref) group.segments.push(ref);
    else {
      const first = group.segments[0];
      const edgeAtStart = next.mesh.edges[first.edgeId];
      const start = first.forward ? edgeAtStart.a : edgeAtStart.b;
      const before = edgeRefFor(next.mesh, edgeId, start);
      if (!before) return null;
      group.segments.unshift({ edgeId: before.edgeId, forward: !before.forward });
    }
  }
  return next;
}

export function appendRiverVertex(document: CityDocument, groupId: Id, vertexId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  if (group?.kind !== "river" || group.locked || !next.mesh.vertices[vertexId]) return null;
  const last = group.vertices.at(-1);
  if (last && !edgeBetween(next.mesh, last, vertexId)) return null;
  if (last === vertexId) return next;
  group.vertices.push(vertexId);
  group.source ??= { vertexId, kind: "spring" };
  if (group.vertices.length >= 2 && vertexTouchesWater(next.mesh, vertexId)) group.mouth = { vertexId, kind: "water" };
  return next;
}

export function finishRiver(document: CityDocument, groupId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  if (group?.kind !== "river" || group.vertices.length < 2) return null;
  const vertexId = group.vertices[group.vertices.length - 1];
  if (vertexTouchesWater(next.mesh, vertexId)) group.mouth = { vertexId, kind: "water" };
  else {
    const p = next.mesh.vertices[vertexId].point;
    const half = next.frame.extentMeters / 2;
    if (Math.abs(Math.abs(p[0]) - half) > 0.01 && Math.abs(Math.abs(p[1]) - half) > 0.01) return null;
    group.mouth = { vertexId, kind: "mapBoundary" };
  }
  return next;
}

export function addElement(document: CityDocument, kind: ElementKind, faceId: Id): CityDocument {
  const next = clone(document);
  if (!next.mesh.faces[faceId]) return next;
  next.elements.push({ id: nextId(next, kind), kind, faceIds: [faceId], locked: true });
  return next;
}

export function removeGroup(document: CityDocument, groupId: Id): CityDocument {
  const next = clone(document);
  next.featureGroups = next.featureGroups.filter(group => group.id !== groupId);
  return next;
}

/** Return the ordered mesh vertices used by a route group. */
export function featureGroupVertices(document: CityDocument, group: FeatureGroup): Id[] {
  if (group.kind === "river") return [...group.vertices];
  if (!group.segments.length) return [];
  const first = group.segments[0];
  const edge = document.mesh.edges[first.edgeId];
  if (!edge) return [];
  return [first.forward ? edge.a : edge.b, ...group.segments.map(segment => edgeEnd(document.mesh, segment))];
}

/** Whether an edge is currently part of a route group. */
export function groupUsesEdge(document: CityDocument, group: FeatureGroup, edgeId: Id): boolean {
  if (group.kind !== "river") return group.segments.some(segment => segment.edgeId === edgeId);
  return group.vertices.some((vertexId, index) => {
    if (index === 0) return false;
    return edgeBetween(document.mesh, group.vertices[index - 1], vertexId)?.id === edgeId;
  });
}

/**
 * Move a route control vertex to another mesh vertex. The affected adjoining
 * edges are replaced by shortest available mesh paths, keeping the route
 * contiguous without changing unrelated parts of the group.
 */
export function rerouteGroupVertex(
  document: CityDocument,
  groupId: Id,
  fromVertexId: Id,
  toVertexId: Id
): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  if (!group || group.locked || !next.mesh.vertices[toVertexId]) return null;
  const vertices = featureGroupVertices(next, group);
  if (!vertices.includes(fromVertexId) || vertices.includes(toVertexId)) return null;
  const rerouted = rerouteVertices(next.mesh, vertices, fromVertexId, toVertexId);
  if (!rerouted) return null;

  if (group.kind === "river") {
    group.vertices = rerouted;
    if (group.source?.vertexId === fromVertexId) group.source.vertexId = toVertexId;
    if (group.mouth?.vertexId === fromVertexId)
      group.mouth = vertexTouchesWater(next.mesh, toVertexId) ? { vertexId: toVertexId, kind: "water" } : null;
  } else {
    const segments = edgeRefsForVertices(next.mesh, rerouted);
    if (!segments) return null;
    group.segments = segments;
  }
  return validate(next).length ? null : next;
}

/** The route part grabbed while pushing a wall, road, or river across a cell. */
export interface FaceRouteAnchor {
  edgeId?: Id;
  vertexId?: Id;
}

/** A lightweight, local description of one route span pushed across a face. */
export interface FaceRoutePreview {
  group: FeatureGroup;
  /** The replacement boundary only; use this for a focused visual preview. */
  replacementVertices: Id[];
}

/**
 * Replace the portion of a route that follows a face boundary with the other
 * side of that same face. This is the operation behind dragging a wall edge
 * through a cell: no geometry moves, only mesh-edge ownership changes.
 */
export function rerouteGroupAcrossFace(
  document: CityDocument,
  groupId: Id,
  faceId: Id,
  anchor: FaceRouteAnchor
): CityDocument | null {
  const preview = previewGroupAcrossFace(document, groupId, faceId, anchor);
  if (!preview) return null;
  const next = clone(document);
  const index = next.featureGroups.findIndex(candidate => candidate.id === groupId);
  if (index < 0) return null;
  next.featureGroups[index] = preview;
  return validate(next).length ? null : next;
}

/**
 * Produce only the changed feature group for an interactive preview. It does
 * not clone or validate the document, so callers can safely use it on hover.
 */
export function previewGroupAcrossFace(
  document: CityDocument,
  groupId: Id,
  faceId: Id,
  anchor: FaceRouteAnchor
): FeatureGroup | null {
  return previewRouteAcrossFace(document, groupId, faceId, anchor)?.group ?? null;
}

/** Calculate a group preview together with just the boundary span that changes. */
export function previewRouteAcrossFace(
  document: CityDocument,
  groupId: Id,
  faceId: Id,
  anchor: FaceRouteAnchor
): FaceRoutePreview | null {
  const group = document.featureGroups.find(candidate => candidate.id === groupId);
  const face = document.mesh.faces[faceId];
  if (!group || !face || group.locked) return null;

  const vertices = featureGroupVertices(document, group);
  const routeEdges = groupEdgeIds(document, group);
  if (vertices.length !== routeEdges.length + 1) return null;
  const faceEdges = new Set(face.boundary.map(ref => ref.edgeId));
  const index = anchoredFaceEdgeIndex(vertices, routeEdges, faceEdges, anchor);
  if (index < 0) return null;

  let start = index;
  let end = index;
  while (start > 0 && faceEdges.has(routeEdges[start - 1])) start--;
  while (end + 1 < routeEdges.length && faceEdges.has(routeEdges[end + 1])) end++;

  const current = vertices.slice(start, end + 2);
  const replacement = oppositeFacePath(document.mesh, faceId, current, new Set(routeEdges.slice(start, end + 1)));
  if (!replacement || replacement.length < 2) return null;
  const rerouted = [...vertices.slice(0, start), ...replacement, ...vertices.slice(end + 2)];

  const preview = clone(group);
  if (preview.kind === "river") preview.vertices = rerouted;
  else {
    const segments = edgeRefsForVertices(document.mesh, rerouted);
    if (!segments) return null;
    preview.segments = segments;
  }
  return { group: preview, replacementVertices: replacement };
}

/** Remove one selected route edge. Roads/walls split into contiguous groups; a
 * river is trimmed on the upstream side so its direction stays unambiguous. */
export function removeEdgeFromGroup(document: CityDocument, groupId: Id, edgeId: Id): CityDocument | null {
  const next = clone(document);
  const index = next.featureGroups.findIndex(group => group.id === groupId);
  const group = next.featureGroups[index];
  if (!group || group.locked) return null;
  if (group.kind === "river") {
    let segment = -1;
    for (let i = 1; i < group.vertices.length; i++) {
      if (edgeBetween(next.mesh, group.vertices[i - 1], group.vertices[i])?.id === edgeId) {
        segment = i;
        break;
      }
    }
    if (segment < 0) return null;
    group.vertices = group.vertices.slice(0, segment);
    const mouthVertex = group.vertices.at(-1);
    group.mouth =
      mouthVertex && vertexTouchesWater(next.mesh, mouthVertex) ? { vertexId: mouthVertex, kind: "water" } : null;
    if (group.vertices.length < 2) next.featureGroups.splice(index, 1);
    return next;
  }

  const segment = group.segments.findIndex(ref => ref.edgeId === edgeId);
  if (segment < 0) return null;
  const before = group.segments.slice(0, segment);
  const after = group.segments.slice(segment + 1);
  if (!before.length && !after.length) {
    next.featureGroups.splice(index, 1);
    return next;
  }
  group.segments = before.length ? before : after;
  if (before.length && after.length) {
    const kindNumber = next.featureGroups.filter(candidate => candidate.kind === group.kind).length + 1;
    next.featureGroups.push({
      ...clone(group),
      id: nextId(next, group.kind),
      name: `${edgeGroupLabel(group.kind)} #${kindNumber}`,
      segments: after
    });
  }
  return next;
}

function nextId(document: CityDocument, prefix: string): Id {
  let n = 1;
  const used = new Set([
    ...document.featureGroups.map(group => group.id),
    ...document.elements.map(element => element.id)
  ]);
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

function edgeGroupLabel(kind: EdgeFeatureGroup["kind"]): string {
  return { road: "Road", wall: "Wall", plank: "Pier" }[kind];
}

function edgeGroupStyle(kind: EdgeFeatureGroup["kind"]): EdgeFeatureGroup["style"] {
  return {
    road: { widthMeters: 10, color: "#6b5137" },
    wall: { widthMeters: 7, color: "#342a22" },
    plank: { widthMeters: 4, color: "#d8d0c0" }
  }[kind];
}

function rerouteVertices(mesh: Mesh, vertices: Id[], fromVertexId: Id, toVertexId: Id): Id[] | null {
  if (vertices.length < 2) return null;
  if (vertices[0] === vertices.at(-1)) {
    const cycle = vertices.slice(0, -1);
    const index = cycle.indexOf(fromVertexId);
    if (cycle.length < 3 || index < 0) return null;
    const rotated = Array.from({ length: cycle.length + 1 }, (_, offset) => cycle[(index - 1 + offset) % cycle.length]);
    return rerouteOpenVertices(mesh, rotated, fromVertexId, toVertexId);
  }
  return rerouteOpenVertices(mesh, vertices, fromVertexId, toVertexId);
}

function rerouteOpenVertices(mesh: Mesh, vertices: Id[], fromVertexId: Id, toVertexId: Id): Id[] | null {
  const index = vertices.indexOf(fromVertexId);
  if (index < 0) return null;
  const blocked = new Set(vertices);

  if (index === 0) {
    const path = shortestPath(mesh, toVertexId, vertices[1], blocked);
    return path ? [...path, ...vertices.slice(2)] : null;
  }
  if (index === vertices.length - 1) {
    const path = shortestPath(mesh, vertices[index - 1], toVertexId, blocked);
    return path ? [...vertices.slice(0, -1), ...path.slice(1)] : null;
  }

  const before = shortestPath(mesh, vertices[index - 1], toVertexId, blocked);
  if (!before) return null;
  const afterBlocked = new Set([...blocked, ...before.slice(1, -1)]);
  const after = shortestPath(mesh, toVertexId, vertices[index + 1], afterBlocked);
  if (!after) return null;
  return [...vertices.slice(0, index), ...before.slice(1), ...after.slice(1), ...vertices.slice(index + 2)];
}

/** Breadth-first search gives the least number of cell edges and is deterministic by edge id. */
function shortestPath(mesh: Mesh, from: Id, to: Id, blocked: ReadonlySet<Id>): Id[] | null {
  const adjacent = new Map<Id, Id[]>();
  for (const edge of Object.values(mesh.edges)) {
    if (!adjacent.has(edge.a)) adjacent.set(edge.a, []);
    if (!adjacent.has(edge.b)) adjacent.set(edge.b, []);
    adjacent.get(edge.a)?.push(edge.b);
    adjacent.get(edge.b)?.push(edge.a);
  }
  for (const neighbors of adjacent.values()) neighbors.sort();

  const previous = new Map<Id, Id | null>([[from, null]]);
  const queue = [from];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const vertex = queue[cursor];
    if (vertex === to) break;
    for (const neighbor of adjacent.get(vertex) ?? []) {
      if (previous.has(neighbor) || (blocked.has(neighbor) && neighbor !== to)) continue;
      previous.set(neighbor, vertex);
      queue.push(neighbor);
    }
  }
  if (!previous.has(to)) return null;
  const path: Id[] = [];
  for (let cursor: Id | null = to; cursor; cursor = previous.get(cursor) ?? null) path.push(cursor);
  return path.reverse();
}

function edgeRefsForVertices(mesh: Mesh, vertices: Id[]): EdgeFeatureGroup["segments"] | null {
  const segments: EdgeFeatureGroup["segments"] = [];
  for (let index = 1; index < vertices.length; index++) {
    const edge = edgeBetween(mesh, vertices[index - 1], vertices[index]);
    if (!edge) return null;
    const ref = edgeRefFor(mesh, edge.id, vertices[index - 1]);
    if (!ref) return null;
    segments.push(ref);
  }
  return segments;
}

function groupEdgeIds(document: CityDocument, group: FeatureGroup): Id[] {
  if (group.kind !== "river") return group.segments.map(segment => segment.edgeId);
  const edges: Id[] = [];
  for (let index = 1; index < group.vertices.length; index++) {
    const edge = edgeBetween(document.mesh, group.vertices[index - 1], group.vertices[index]);
    if (!edge) return [];
    edges.push(edge.id);
  }
  return edges;
}

function anchoredFaceEdgeIndex(
  vertices: Id[],
  edgeIds: Id[],
  faceEdges: ReadonlySet<Id>,
  anchor: FaceRouteAnchor
): number {
  if (anchor.edgeId) {
    const index = edgeIds.indexOf(anchor.edgeId);
    return index >= 0 && faceEdges.has(anchor.edgeId) ? index : -1;
  }
  if (!anchor.vertexId) return -1;
  return edgeIds.findIndex(
    (edgeId, index) =>
      faceEdges.has(edgeId) && (vertices[index] === anchor.vertexId || vertices[index + 1] === anchor.vertexId)
  );
}

function oppositeFacePath(mesh: Mesh, faceId: Id, current: Id[], currentEdges: ReadonlySet<Id>): Id[] | null {
  const face = mesh.faces[faceId];
  if (!face) return null;
  const boundary = faceVertices(mesh, face);
  const from = boundary.indexOf(current[0]);
  const to = boundary.indexOf(current.at(-1) as Id);
  if (from < 0 || to < 0 || from === to) return null;
  const forward = faceBoundaryPath(boundary, from, to, 1);
  const backward = faceBoundaryPath(boundary, from, to, -1);
  const overlap = (path: Id[]): number => {
    let total = 0;
    for (let index = 1; index < path.length; index++) {
      const edge = edgeBetween(mesh, path[index - 1], path[index]);
      if (edge && currentEdges.has(edge.id)) total++;
    }
    return total;
  };
  const candidate = overlap(forward) <= overlap(backward) ? forward : backward;
  return overlap(candidate) < currentEdges.size ? candidate : null;
}

function faceBoundaryPath(vertices: Id[], from: number, to: number, direction: 1 | -1): Id[] {
  const path = [vertices[from]];
  for (let index = from; index !== to; ) {
    index = (index + direction + vertices.length) % vertices.length;
    path.push(vertices[index]);
  }
  return path;
}
