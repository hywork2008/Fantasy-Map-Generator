import {
  clone,
  edgeBetween,
  edgeEnd,
  edgeRefFor,
  facePoints,
  faceVertices,
  mergeVertices,
  validate,
  vertexTouchesWater
} from "./mesh";
import type { CityDocument, EdgeFeatureGroup, EdgeRef, Face, FeatureGroup, Id, Mesh, Point, RiverGroup } from "./types";

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

/**
 * Add closed Wall groups along every boundary of the edge-connected Ward
 * component containing `faceId`. Faces with the same Ward elsewhere in the
 * map are deliberately left alone.
 */
export function encloseWardComponentWithWalls(document: CityDocument, faceId: Id): CityDocument | null {
  const source = document.mesh.faces[faceId];
  const ward = source?.properties.ward;
  if (!source || !ward) return null;

  const component = connectedWardFaces(document, faceId, ward);
  const boundary = Object.values(document.mesh.faces)
    .filter(face => component.has(face.id))
    .flatMap(face =>
      face.boundary.filter(ref => {
        const edge = document.mesh.edges[ref.edgeId];
        const otherFaceId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
        return !otherFaceId || !component.has(otherFaceId);
      })
    );
  const loops = orderedBoundaryLoops(document.mesh, boundary);
  if (!loops?.length) return null;

  const next = clone(document);
  const firstNumber = next.featureGroups.filter(group => group.kind === "wall").length + 1;
  for (const [index, segments] of loops.entries()) {
    next.featureGroups.push({
      id: nextId(next, "wall"),
      kind: "wall",
      name: `Wall #${firstNumber + index}`,
      segments,
      style: edgeGroupStyle("wall"),
      locked: false
    });
  }
  return next;
}

/**
 * Enclose the mesh cells nearest a dragged circle with a closed Wall route.
 * Cell centres inside the circle form the enclosed component, so the resulting
 * wall follows real mesh edges instead of cutting through city blocks.
 */
export function encloseCircleWithWalls(
  document: CityDocument,
  center: Point,
  radiusMeters: number
): CityDocument | null {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) return null;
  const faces = Object.values(document.mesh.faces);
  if (!faces.length) return null;

  const centreOf = (face: Face): Point => {
    const points = facePoints(document.mesh, face);
    const sum = points.reduce<[number, number]>((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
  };
  const distanceToCenter = (face: Face): number => {
    const point = centreOf(face);
    return Math.hypot(point[0] - center[0], point[1] - center[1]);
  };
  const nearest = faces.reduce((best, face) => (distanceToCenter(face) < distanceToCenter(best) ? face : best));
  const selected = new Set(faces.filter(face => distanceToCenter(face) <= radiusMeters).map(face => face.id));
  selected.add(nearest.id);

  // Keep only the connected region under the dragged circle that contains its
  // centre. This guarantees that its exposed mesh boundary is a closed loop.
  const component = new Set<Id>([nearest.id]);
  const pending = [nearest.id];
  while (pending.length) {
    const faceId = pending.pop() as Id;
    const face = document.mesh.faces[faceId];
    for (const ref of face.boundary) {
      const edge = document.mesh.edges[ref.edgeId];
      const otherId = edge.leftFace === faceId ? edge.rightFace : edge.leftFace;
      if (!otherId || !selected.has(otherId) || component.has(otherId)) continue;
      component.add(otherId);
      pending.push(otherId);
    }
  }

  const boundary = [...component].flatMap(faceId => {
    const face = document.mesh.faces[faceId];
    return face.boundary.filter(ref => {
      const edge = document.mesh.edges[ref.edgeId];
      const otherId = edge.leftFace === faceId ? edge.rightFace : edge.leftFace;
      return !otherId || !component.has(otherId);
    });
  });
  const loops = orderedBoundaryLoops(document.mesh, boundary);
  if (!loops?.length) return null;

  const next = clone(document);
  const firstNumber = next.featureGroups.filter(group => group.kind === "wall").length + 1;
  for (const [index, segments] of loops.entries()) {
    next.featureGroups.push({
      id: nextId(next, "wall"),
      kind: "wall",
      name: `Wall #${firstNumber + index}`,
      segments,
      style: edgeGroupStyle("wall"),
      locked: false
    });
  }
  return next;
}

export function appendEdge(document: CityDocument, groupId: Id, edgeId: Id): CityDocument | null {
  const next = clone(document);
  const group = next.featureGroups.find(candidate => candidate.id === groupId);
  const edge = next.mesh.edges[edgeId];
  if (!group || !edge || group.kind === "river" || group.locked) return null;
  // Re-adding an edge the group already has is a no-op; hand back the original
  // document so the caller can skip the history snapshot.
  if (group.segments.some(segment => segment.edgeId === edgeId)) return document;
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

/** Add or remove a gate at a vertex shared by at least one wall segment. */
export function toggleGate(document: CityDocument, vertexId: Id): CityDocument | null {
  if (!document.mesh.vertices[vertexId] || !vertexHasWall(document, vertexId)) return null;
  const next = clone(document);
  if (!next.gates) next.gates = [];
  const gates = next.gates;
  const index = gates.findIndex(gate => gate.vertexId === vertexId);
  if (index >= 0) gates.splice(index, 1);
  else gates.push({ id: nextId(next, "gate"), vertexId, locked: false });
  return next;
}

export function vertexHasWall(document: CityDocument, vertexId: Id): boolean {
  return document.featureGroups.some(
    group =>
      group.kind === "wall" &&
      group.segments.some(segment => {
        const edge = document.mesh.edges[segment.edgeId];
        return edge?.a === vertexId || edge?.b === vertexId;
      })
  );
}

export interface GateOpeningCandidate {
  /** The Wall edge to collapse, turning two wall vertices into a four-way gate. */
  edgeId: Id;
  vertexId: Id;
}

/**
 * Return neighboring Wall vertices that have a non-wall branch of their own.
 * Collapsing the Wall edge between them combines the inside and outside
 * branches into a road through the gate, while retaining both wall runs.
 */
export function gateOpeningCandidates(document: CityDocument, gateVertexId: Id): GateOpeningCandidate[] {
  if (!vertexHasWall(document, gateVertexId)) return [];
  const wallEdges = wallEdgeIds(document);
  return Object.values(document.mesh.edges)
    .filter(edge => wallEdges.has(edge.id) && (edge.a === gateVertexId || edge.b === gateVertexId))
    .map(edge => ({ edgeId: edge.id, vertexId: edge.a === gateVertexId ? edge.b : edge.a }))
    .filter(candidate => {
      const incident = Object.values(document.mesh.edges).filter(
        edge => edge.a === candidate.vertexId || edge.b === candidate.vertexId
      );
      return (
        incident.filter(edge => wallEdges.has(edge.id)).length >= 2 && incident.some(edge => !wallEdges.has(edge.id))
      );
    })
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

/**
 * Collapse the chosen Wall edge, add a through-road on the two remaining non-wall
 * branches, then place the gate on the retained wall vertex.
 */
export function placeGateOpening(document: CityDocument, gateVertexId: Id, candidateVertexId: Id): CityDocument | null {
  const candidate = gateOpeningCandidates(document, gateVertexId).find(item => item.vertexId === candidateVertexId);
  if (!candidate) return null;
  const merged = mergeVertices(document, gateVertexId, candidate.vertexId);
  if (!merged) return null;
  const wallEdges = wallEdgeIds(merged);
  const roadEdges = Object.values(merged.mesh.edges)
    .filter(edge => !wallEdges.has(edge.id) && (edge.a === gateVertexId || edge.b === gateVertexId))
    .map(edge => edge.id);
  if (roadEdges.length !== 2) return null;

  let next = createGroup(merged, "road");
  const roadId = next.featureGroups.at(-1)?.id;
  if (!roadId) return null;
  for (const edgeId of roadEdges) {
    const appended = appendEdge(next, roadId, edgeId);
    if (!appended) return null;
    next = appended;
  }
  return toggleGate(next, gateVertexId);
}

export function removeGroup(document: CityDocument, groupId: Id): CityDocument {
  const next = clone(document);
  const removed = next.featureGroups.find(group => group.id === groupId);
  next.featureGroups = next.featureGroups.filter(group => group.id !== groupId);
  if (removed?.kind === "wall") pruneGatesWithoutWalls(next);
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

export type GroupSmoothingMode = "safe" | "includeSharedAndLoops";

/** Smooth every unlocked River, Road, and Wall group in the selected mode. */
export function smoothFeatureGroups(
  document: CityDocument,
  mode: GroupSmoothingMode = "safe",
  iterations = 2
): CityDocument | null {
  return smoothGroups(
    document,
    document.featureGroups.map(group => group.id),
    mode,
    iterations
  );
}

/**
 * Smooth one group, including closed walls and its shared vertices. Moving a
 * shared mesh vertex also moves any unlocked routes which use that vertex.
 */
export function smoothFeatureGroup(document: CityDocument, groupId: Id, iterations = 2): CityDocument | null {
  return smoothGroups(document, [groupId], "includeSharedAndLoops", iterations);
}

function smoothGroups(
  document: CityDocument,
  groupIds: Id[],
  mode: GroupSmoothingMode,
  iterations: number
): CityDocument | null {
  const targets = new Set(groupIds);
  const runs = document.featureGroups
    .filter(
      group =>
        targets.has(group.id) &&
        !group.locked &&
        (group.kind === "river" || group.kind === "road" || group.kind === "wall")
    )
    .map(group => {
      const rawVertices = featureGroupVertices(document, group);
      const closed = rawVertices.length >= 4 && rawVertices[0] === rawVertices.at(-1);
      return { group, vertices: closed ? rawVertices.slice(0, -1) : rawVertices, closed };
    })
    .filter(run => run.vertices.length >= 3 && (mode === "includeSharedAndLoops" || !run.closed));
  if (!runs.length) return null;

  const pinned = pinnedSmoothingVertices(document, runs, mode);
  const targetsByVertex = new Map<Id, { point: Point; count: number }>();
  const maximumShift = document.frame.blockSizeMeters * 0.9;
  for (const { vertices, closed } of runs) {
    const points = vertices.map(vertexId => document.mesh.vertices[vertexId]?.point);
    if (points.some(point => !point)) continue;
    const smoothed = smoothRoutePoints(points as Point[], iterations, closed);
    const start = closed ? 0 : 1;
    const end = closed ? vertices.length : vertices.length - 1;
    for (let index = start; index < end; index++) {
      const vertexId = vertices[index];
      const point = smoothed[index];
      const original = document.mesh.vertices[vertexId]?.point;
      if (
        !original ||
        pinned.has(vertexId) ||
        Math.hypot(point[0] - original[0], point[1] - original[1]) > maximumShift
      )
        continue;
      const previous = targetsByVertex.get(vertexId);
      targetsByVertex.set(
        vertexId,
        previous
          ? { point: [previous.point[0] + point[0], previous.point[1] + point[1]], count: previous.count + 1 }
          : { point: [point[0], point[1]], count: 1 }
      );
    }
  }

  // A route vertex can also be part of nearby, unselected cell edges. Apply as
  // much of the smoothing as the whole mesh accepts, rather than rejecting a
  // useful gentle adjustment because one nearby edge would become too short.
  for (let strength = 1; strength >= 1 / 64; strength /= 2) {
    const next = clone(document);
    let changed = false;
    for (const [vertexId, target] of targetsByVertex) {
      const vertex = next.mesh.vertices[vertexId];
      if (!vertex) continue;
      const desired: Point = [target.point[0] / target.count, target.point[1] / target.count];
      const point: Point = [
        vertex.point[0] + (desired[0] - vertex.point[0]) * strength,
        vertex.point[1] + (desired[1] - vertex.point[1]) * strength
      ];
      if (Math.hypot(point[0] - vertex.point[0], point[1] - vertex.point[1]) < 0.01) continue;
      vertex.point = point;
      changed = true;
    }
    if (changed && !validate(next).length) return next;
  }
  return null;
}

function pinnedSmoothingVertices(
  document: CityDocument,
  runs: Array<{ group: FeatureGroup; vertices: Id[]; closed: boolean }>,
  mode: GroupSmoothingMode
): Set<Id> {
  const pinned = new Set<Id>();
  const uses = new Map<Id, number>();
  const half = document.frame.extentMeters / 2;
  for (const vertex of Object.values(document.mesh.vertices)) {
    if (
      vertex.locked ||
      Math.abs(Math.abs(vertex.point[0]) - half) < 0.001 ||
      Math.abs(Math.abs(vertex.point[1]) - half) < 0.001
    )
      pinned.add(vertex.id);
  }
  for (const group of document.featureGroups) {
    if (!group.locked) continue;
    for (const vertexId of featureGroupVertices(document, group)) pinned.add(vertexId);
  }
  for (const { vertices, closed } of runs) {
    if (!closed) {
      pinned.add(vertices[0]);
      pinned.add(vertices.at(-1) as Id);
    }
    for (const vertexId of new Set(vertices)) uses.set(vertexId, (uses.get(vertexId) ?? 0) + 1);
  }
  if (mode === "safe") for (const [vertexId, count] of uses) if (count > 1) pinned.add(vertexId);
  return pinned;
}

function smoothRoutePoints(points: Point[], iterations: number, closed: boolean): Point[] {
  let smoothed = points.map(point => [point[0], point[1]] as Point);
  for (let pass = 0; pass < iterations; pass++) {
    const next = smoothed.map(point => [point[0], point[1]] as Point);
    const start = closed ? 0 : 1;
    const end = closed ? smoothed.length : smoothed.length - 1;
    for (let index = start; index < end; index++) {
      const previous = smoothed[(index - 1 + smoothed.length) % smoothed.length];
      const following = smoothed[(index + 1) % smoothed.length];
      next[index] = [
        (previous[0] + 2 * smoothed[index][0] + following[0]) / 4,
        (previous[1] + 2 * smoothed[index][1] + following[1]) / 4
      ];
    }
    smoothed = next;
  }
  return smoothed;
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

  const route = rotateClosedRouteAwayFromFace(
    featureGroupVertices(document, group),
    groupEdgeIds(document, group),
    face
  );
  const vertices = route.vertices;
  const routeEdges = route.edgeIds;
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
    if (group.kind === "wall") pruneGatesWithoutWalls(next);
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
  if (group.kind === "wall") pruneGatesWithoutWalls(next);
  return next;
}

/**
 * Remove every unlocked route segment using one of `edgeIds`. This is the
 * multi-edge counterpart to removeEdgeFromGroup(), intended for brush-based
 * editing: each affected route is re-evaluated after a split so every segment
 * under the brush is removed in one document change.
 */
export function removeEdgesFromGroups(document: CityDocument, edgeIds: Iterable<Id>): CityDocument | null {
  let next = document;
  let changed = false;
  for (const edgeId of new Set(edgeIds)) {
    const groupIds = next.featureGroups
      .filter(group => !group.locked && groupUsesEdge(next, group, edgeId))
      .map(group => group.id);
    for (const groupId of groupIds) {
      const updated = removeEdgeFromGroup(next, groupId, edgeId);
      if (!updated) continue;
      next = updated;
      changed = true;
    }
  }
  return changed ? next : null;
}

function nextId(document: CityDocument, prefix: string): Id {
  let n = 1;
  const used = new Set([
    ...document.featureGroups.map(group => group.id),
    ...(document.gates ?? []).map(gate => gate.id),
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

function wallEdgeIds(document: CityDocument): Set<Id> {
  const edgeIds = new Set<Id>();
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    for (const segment of group.segments) edgeIds.add(segment.edgeId);
  }
  return edgeIds;
}

function pruneGatesWithoutWalls(document: CityDocument): void {
  if (!document.gates) return;
  document.gates = document.gates.filter(gate => vertexHasWall(document, gate.vertexId));
}

function connectedWardFaces(
  document: CityDocument,
  startFaceId: Id,
  ward: NonNullable<Face["properties"]["ward"]>
): Set<Id> {
  const component = new Set<Id>([startFaceId]);
  const pending = [startFaceId];
  while (pending.length) {
    const faceId = pending.pop() as Id;
    const face = document.mesh.faces[faceId];
    for (const ref of face.boundary) {
      const edge = document.mesh.edges[ref.edgeId];
      const otherFaceId = edge.leftFace === faceId ? edge.rightFace : edge.leftFace;
      const other = otherFaceId ? document.mesh.faces[otherFaceId] : null;
      if (!other || other.properties.ward !== ward || component.has(other.id)) continue;
      component.add(other.id);
      pending.push(other.id);
    }
  }
  return component;
}

/** Turn directed component-boundary edges into one or more closed routes. */
function orderedBoundaryLoops(mesh: Mesh, boundary: EdgeRef[]): EdgeRef[][] | null {
  const remaining = new Set(boundary);
  const byStart = new Map<Id, EdgeRef[]>();
  for (const ref of boundary) {
    const edge = mesh.edges[ref.edgeId];
    if (!edge) return null;
    const start = ref.forward ? edge.a : edge.b;
    byStart.set(start, [...(byStart.get(start) ?? []), ref]);
  }

  const loops: EdgeRef[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as EdgeRef;
    const firstEdge = mesh.edges[first.edgeId];
    if (!firstEdge) return null;
    const start = first.forward ? firstEdge.a : firstEdge.b;
    const loop = [first];
    remaining.delete(first);
    let end = edgeEnd(mesh, first);
    while (end !== start) {
      const next = byStart.get(end)?.find(ref => remaining.has(ref));
      if (!next) return null;
      loop.push(next);
      remaining.delete(next);
      end = edgeEnd(mesh, next);
    }
    loops.push(loop);
  }
  return loops;
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

/**
 * A wall loop can cross the serialized route's first/last edge boundary. Cut
 * the loop at an edge outside the hovered face so a face-boundary run (for
 * example v23→v22→v21) stays contiguous while it is replaced.
 */
function rotateClosedRouteAwayFromFace(
  vertices: Id[],
  edgeIds: Id[],
  face: { boundary: EdgeRef[] }
): { vertices: Id[]; edgeIds: Id[] } {
  if (vertices[0] !== vertices.at(-1) || !edgeIds.length) return { vertices, edgeIds };
  const faceEdges = new Set(face.boundary.map(ref => ref.edgeId));
  const breakIndex = edgeIds.findIndex(edgeId => !faceEdges.has(edgeId));
  if (breakIndex < 0) return { vertices, edgeIds };
  const start = (breakIndex + 1) % edgeIds.length;
  const cycle = vertices.slice(0, -1);
  const rotated = [...cycle.slice(start), ...cycle.slice(0, start)];
  return {
    vertices: [...rotated, rotated[0]],
    edgeIds: [...edgeIds.slice(start), ...edgeIds.slice(0, start)]
  };
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
