import type { Cell } from "../../city-generator/core/types";
import type { CityDocument, Edge, EdgeRef, Face, FeatureGroup, Id, Mesh, Point, WaterKind } from "./types";

/** Voronoi clipping can leave sub-metre sliver corners along the frame. Merge
 * them before assigning IDs so every face shares the same cleaned topology. */
const VERTEX_MERGE_METERS = 1;

export function meshFromCells(cells: Cell[]): Mesh {
  const vertices: Mesh["vertices"] = {};
  const edges: Mesh["edges"] = {};
  const faces: Mesh["faces"] = {};
  const vertexBins = new Map<string, Id[]>();
  const edgeByEnds = new Map<string, Id>();
  let vertexNo = 0;
  let edgeNo = 0;

  const getVertex = (point: Point): Id => {
    const gx = Math.floor(point[0] / VERTEX_MERGE_METERS);
    const gy = Math.floor(point[1] / VERTEX_MERGE_METERS);
    for (let y = gy - 1; y <= gy + 1; y++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        for (const id of vertexBins.get(`${x},${y}`) ?? []) {
          const existing = vertices[id];
          if (distance(existing.point, point) < VERTEX_MERGE_METERS) return id;
        }
      }
    }
    const id = `v${vertexNo++}`;
    vertices[id] = { id, point: [point[0], point[1]], locked: false };
    const key = `${gx},${gy}`;
    vertexBins.set(key, [...(vertexBins.get(key) ?? []), id]);
    return id;
  };

  for (const cell of cells) {
    const ids = removeConsecutiveDuplicates(cell.polygon.map(getVertex));
    if (ids.length < 3 || new Set(ids).size < 3) continue;
    const faceId = `f${cell.id}`;
    const boundary: EdgeRef[] = [];
    for (let i = 0; i < ids.length; i++) {
      const from = ids[i];
      const to = ids[(i + 1) % ids.length];
      const key = edgeKey(from, to);
      let edgeId = edgeByEnds.get(key);
      if (!edgeId) {
        edgeId = `e${edgeNo++}`;
        edgeByEnds.set(key, edgeId);
        const forward = from < to;
        edges[edgeId] = {
          id: edgeId,
          a: forward ? from : to,
          b: forward ? to : from,
          leftFace: null,
          rightFace: null,
          locked: false
        };
      }
      const edge = edges[edgeId];
      const forward = edge.a === from && edge.b === to;
      if (forward) edge.leftFace = faceId;
      else edge.rightFace = faceId;
      boundary.push({ edgeId, forward });
    }
    faces[faceId] = {
      id: faceId,
      boundary,
      site: [cell.site[0], cell.site[1]],
      properties: { elevation: 1, water: "land", ward: null, buildable: true, locked: false }
    };
  }
  return { vertices, edges, faces };
}

export function faceVertices(mesh: Mesh, face: Face): Id[] {
  return face.boundary.map(ref => {
    const edge = mesh.edges[ref.edgeId];
    return ref.forward ? edge.a : edge.b;
  });
}

export function facePoints(mesh: Mesh, face: Face): Point[] {
  return faceVertices(mesh, face).map(id => mesh.vertices[id].point);
}

export function edgePoints(mesh: Mesh, edge: Edge): [Point, Point] {
  return [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point];
}

export function edgeBetween(mesh: Mesh, a: Id, b: Id): Edge | null {
  for (const edge of Object.values(mesh.edges))
    if ((edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)) return edge;
  return null;
}

export function edgeRefFor(mesh: Mesh, edgeId: Id, from: Id): EdgeRef | null {
  const edge = mesh.edges[edgeId];
  if (!edge) return null;
  if (edge.a === from) return { edgeId, forward: true };
  if (edge.b === from) return { edgeId, forward: false };
  return null;
}

export function edgeEnd(mesh: Mesh, ref: EdgeRef): Id {
  const edge = mesh.edges[ref.edgeId];
  return ref.forward ? edge.b : edge.a;
}

export function incidentFaces(mesh: Mesh, vertexId: Id): Face[] {
  return Object.values(mesh.faces).filter(face => faceVertices(mesh, face).includes(vertexId));
}

export function vertexTouchesWater(mesh: Mesh, vertexId: Id): boolean {
  return incidentFaces(mesh, vertexId).some(face => face.properties.water !== "land");
}

/** Face ids sharing a real mesh edge with `faceId`. */
export function faceNeighbors(mesh: Mesh, faceId: Id): Id[] {
  const face = mesh.faces[faceId];
  if (!face) return [];
  const neighbors = new Set<Id>();
  for (const ref of face.boundary) {
    const edge = mesh.edges[ref.edgeId];
    const other = edge.leftFace === faceId ? edge.rightFace : edge.leftFace;
    if (other) neighbors.add(other);
  }
  return [...neighbors];
}

/**
 * Divide a face along a diagonal between two existing, non-adjacent vertices.
 * The original face keeps its id; the second half receives a new face id.
 */
export function splitFace(document: CityDocument, faceId: Id, a: Id, b: Id): CityDocument | null {
  const next = clone(document);
  const face = next.mesh.faces[faceId];
  if (!face || face.properties.locked || a === b) return null;
  const vertices = faceVertices(next.mesh, face);
  const ia = vertices.indexOf(a);
  const ib = vertices.indexOf(b);
  if (ia < 0 || ib < 0 || areAdjacent(vertices.length, ia, ib) || edgeBetween(next.mesh, a, b)) return null;

  const edgeId = nextNumericId(next.mesh.edges, "e");
  const forward = a < b;
  next.mesh.edges[edgeId] = {
    id: edgeId,
    a: forward ? a : b,
    b: forward ? b : a,
    leftFace: null,
    rightFace: null,
    locked: false
  };
  const newFaceId = nextNumericId(next.mesh.faces, "f");
  const fromA = boundarySpan(face.boundary, ia, ib);
  const fromB = boundarySpan(face.boundary, ib, ia);
  const closeA = edgeRefFor(next.mesh, edgeId, b);
  const closeB = edgeRefFor(next.mesh, edgeId, a);
  if (!closeA || !closeB) return null;

  face.boundary = [...fromA, closeA];
  next.mesh.faces[newFaceId] = {
    id: newFaceId,
    boundary: [...fromB, closeB],
    site: face.site ? [face.site[0], face.site[1]] : undefined,
    properties: clone(face.properties)
  };
  rebuildFaceSides(next.mesh);
  return validate(next).length ? null : next;
}

/** Merge two neighboring faces, unless a shared edge carries a feature. */
export function mergeFaces(document: CityDocument, keepFaceId: Id, removeFaceId: Id): CityDocument | null {
  if (keepFaceId === removeFaceId) return null;
  const next = clone(document);
  const keep = next.mesh.faces[keepFaceId];
  const remove = next.mesh.faces[removeFaceId];
  if (!keep || !remove || keep.properties.locked || remove.properties.locked) return null;
  const shared = keep.boundary.map(ref => ref.edgeId).filter(id => remove.boundary.some(ref => ref.edgeId === id));
  if (!shared.length || shared.some(edgeId => featureUsesEdge(next, edgeId))) return null;

  // A merged face can touch another face along two or more edges. Removing
  // every shared edge and re-linking the remaining directed edges gives the
  // exterior boundary of their union, allowing consecutive merges.
  const sharedEdges = new Set(shared);
  const boundary = orderBoundary(
    next.mesh,
    [...keep.boundary, ...remove.boundary].filter(ref => !sharedEdges.has(ref.edgeId))
  );
  if (!boundary) return null;
  keep.boundary = boundary;
  for (const edgeId of sharedEdges) delete next.mesh.edges[edgeId];
  delete next.mesh.faces[removeFaceId];
  removeOrphanVertices(next);
  for (const element of next.elements) {
    element.faceIds = [...new Set(element.faceIds.map(id => (id === removeFaceId ? keepFaceId : id)))];
  }
  rebuildFaceSides(next.mesh);
  return validate(next).length ? null : next;
}

/** Re-derive edge side references after a structural mesh edit. */
export function rebuildFaceSides(mesh: Mesh): void {
  for (const edge of Object.values(mesh.edges)) {
    edge.leftFace = null;
    edge.rightFace = null;
  }
  for (const face of Object.values(mesh.faces)) {
    for (const ref of face.boundary) {
      const edge = mesh.edges[ref.edgeId];
      if (ref.forward) edge.leftFace = face.id;
      else edge.rightFace = face.id;
    }
  }
}

export function setFaceWater(document: CityDocument, faceId: Id, water: WaterKind): CityDocument {
  const next = clone(document);
  const face = next.mesh.faces[faceId];
  if (face) {
    face.properties.water = water;
    if (water !== "land") face.properties.elevation = 0;
  }
  return next;
}

export function setFaceElevation(document: CityDocument, faceId: Id, elevation: number): CityDocument {
  if (!Number.isFinite(elevation)) return document;
  const next = clone(document);
  const face = next.mesh.faces[faceId];
  if (!face) return next;
  face.properties.elevation = elevation;
  face.properties.water = elevation <= 0 ? "sea" : "land";
  return next;
}

export function moveVertex(document: CityDocument, vertexId: Id, point: Point): CityDocument | null {
  const next = clone(document);
  const vertex = next.mesh.vertices[vertexId];
  if (!vertex || vertex.locked) return null;
  const half = next.frame.extentMeters / 2;
  if (Math.abs(point[0]) > half || Math.abs(point[1]) > half) return null;
  vertex.point = point;
  return validate(next).length ? null : next;
}

/**
 * Collapse an edge by keeping one endpoint and reattaching the other endpoint's
 * incident edges. Faces and feature references are rebuilt around the survivor.
 */
export function mergeVertices(document: CityDocument, keepVertexId: Id, removeVertexId: Id): CityDocument | null {
  if (keepVertexId === removeVertexId) return null;
  const joiningEdge = edgeBetween(document.mesh, keepVertexId, removeVertexId);
  if (!joiningEdge) return null;
  if (document.featureGroups.some(group => group.locked && groupUsesEdge(document, group, joiningEdge.id))) return null;
  const keepVertex = document.mesh.vertices[keepVertexId];
  const removeVertex = document.mesh.vertices[removeVertexId];
  if (!keepVertex || !removeVertex || keepVertex.locked || removeVertex.locked) return null;

  const next = clone(document);
  const faceVertexIds = new Map<Id, Id[]>();
  for (const face of Object.values(next.mesh.faces)) {
    const vertices = removeConsecutiveDuplicates(
      faceVertices(next.mesh, face).map(vertexId => (vertexId === removeVertexId ? keepVertexId : vertexId))
    );
    // Collapsing an edge must not leave a degenerate or self-touching cell.
    if (vertices.length < 3 || new Set(vertices).size !== vertices.length) return null;
    faceVertexIds.set(face.id, vertices);
  }

  const edges: Mesh["edges"] = {};
  const edgeByEndpoints = new Map<string, Id>();
  const edgeReplacements = new Map<Id, Id>();
  for (const edge of Object.values(next.mesh.edges)) {
    if (edge.id === joiningEdge.id) continue;
    const a = edge.a === removeVertexId ? keepVertexId : edge.a;
    const b = edge.b === removeVertexId ? keepVertexId : edge.b;
    if (a === b) continue;
    const key = edgeKey(a, b);
    const existingId = edgeByEndpoints.get(key);
    if (existingId) {
      edgeReplacements.set(edge.id, existingId);
      edges[existingId].locked ||= edge.locked;
      continue;
    }
    edgeByEndpoints.set(key, edge.id);
    edgeReplacements.set(edge.id, edge.id);
    edges[edge.id] = { ...edge, a, b, leftFace: null, rightFace: null };
  }
  next.mesh.edges = edges;

  for (const face of Object.values(next.mesh.faces)) {
    const vertices = faceVertexIds.get(face.id);
    if (!vertices) return null;
    const boundary: EdgeRef[] = [];
    for (let index = 0; index < vertices.length; index++) {
      const start = vertices[index];
      const end = vertices[(index + 1) % vertices.length];
      if (!start || !end) return null;
      const edgeId = edgeByEndpoints.get(edgeKey(start, end));
      const edge = edgeId ? edges[edgeId] : null;
      if (!edge || !edgeId) return null;
      boundary.push({ edgeId, forward: edge.a === start && edge.b === end });
    }
    face.boundary = boundary;
  }

  const groups: FeatureGroup[] = [];
  for (const group of next.featureGroups) {
    if (group.kind === "river") {
      group.vertices = removeConsecutiveDuplicates(
        group.vertices.map(vertexId => (vertexId === removeVertexId ? keepVertexId : vertexId))
      );
      if (group.source?.vertexId === removeVertexId) group.source.vertexId = keepVertexId;
      if (group.mouth?.vertexId === removeVertexId) group.mouth.vertexId = keepVertexId;
      groups.push(group);
      continue;
    }
    const usedJoiningEdge = group.segments.some(segment => segment.edgeId === joiningEdge.id);
    const segments: EdgeRef[] = [];
    for (const segment of group.segments) {
      // The collapsed edge becomes a zero-length route segment. Dropping it
      // keeps the adjacent route edges contiguous through the surviving vertex.
      if (segment.edgeId === joiningEdge.id) continue;
      const previousEdge = document.mesh.edges[segment.edgeId];
      const edgeId = edgeReplacements.get(segment.edgeId);
      const edge = edgeId ? edges[edgeId] : null;
      if (!previousEdge || !edge || !edgeId) return null;
      const start = segment.forward ? previousEdge.a : previousEdge.b;
      const remappedStart = start === removeVertexId ? keepVertexId : start;
      segments.push({ edgeId, forward: edge.a === remappedStart });
    }
    group.segments = segments;
    if (segments.length || !usedJoiningEdge) groups.push(group);
  }
  next.featureGroups = groups;
  const gateVertices = new Set<Id>();
  next.gates = (next.gates ?? []).filter(gate => {
    if (gate.vertexId === removeVertexId) gate.vertexId = keepVertexId;
    if (gateVertices.has(gate.vertexId)) return false;
    gateVertices.add(gate.vertexId);
    return true;
  });

  delete next.mesh.vertices[removeVertexId];
  rebuildFaceSides(next.mesh);
  return validate(next).length ? null : next;
}

export function scaleDocument(document: CityDocument, factor: number): CityDocument | null {
  if (!Number.isFinite(factor) || factor <= 0) return null;
  const next = clone(document);
  for (const vertex of Object.values(next.mesh.vertices))
    vertex.point = [vertex.point[0] * factor, vertex.point[1] * factor];
  for (const face of Object.values(next.mesh.faces))
    if (face.site) face.site = [face.site[0] * factor, face.site[1] * factor];
  for (const group of next.featureGroups) group.style.widthMeters *= factor;
  next.frame.extentMeters *= factor;
  next.frame.cityRadiusMeters *= factor;
  next.frame.blockSizeMeters *= factor;
  return validate(next).length ? null : next;
}

export function validate(document: CityDocument): string[] {
  const errors: string[] = [];
  const { mesh } = document;
  for (const edge of Object.values(mesh.edges)) {
    if (!mesh.vertices[edge.a] || !mesh.vertices[edge.b]) errors.push(`Missing endpoint on ${edge.id}`);
    else if (distance(mesh.vertices[edge.a].point, mesh.vertices[edge.b].point) < 1)
      errors.push(`Edge ${edge.id} is too short`);
  }
  for (const face of Object.values(mesh.faces)) {
    const points = facePoints(mesh, face);
    if (points.length < 3 || Math.abs(area(points)) < 1) errors.push(`Face ${face.id} has no area`);
  }
  for (const group of document.featureGroups) {
    if (group.kind === "river") {
      if (group.vertices.length >= 2) {
        for (let i = 1; i < group.vertices.length; i++)
          if (!edgeBetween(mesh, group.vertices[i - 1], group.vertices[i]))
            errors.push(`River ${group.name} leaves mesh`);
      }
      if (group.mouth?.kind === "water" && !vertexTouchesWater(mesh, group.mouth.vertexId))
        errors.push(`River ${group.name} mouth is not on water`);
    } else {
      for (let i = 1; i < group.segments.length; i++) {
        if (
          edgeEnd(mesh, group.segments[i - 1]) !==
          (group.segments[i].forward ? mesh.edges[group.segments[i].edgeId].a : mesh.edges[group.segments[i].edgeId].b)
        ) {
          errors.push(`${group.name} is not contiguous`);
        }
      }
    }
  }
  for (const gate of document.gates ?? []) {
    if (!mesh.vertices[gate.vertexId]) errors.push(`Gate ${gate.id} has no vertex`);
    else if (!gateHasWall(document, gate.vertexId)) errors.push(`Gate ${gate.id} is not on a wall`);
  }
  return errors;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

function edgeKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function area(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function areAdjacent(length: number, a: number, b: number): boolean {
  return (a + 1) % length === b || (b + 1) % length === a;
}

/** Directed boundary span from start (inclusive) to end (exclusive), wrapping. */
function boundarySpan(boundary: EdgeRef[], start: number, end: number): EdgeRef[] {
  const result: EdgeRef[] = [];
  for (let cursor = start; cursor !== end; cursor = (cursor + 1) % boundary.length) result.push(boundary[cursor]);
  return result;
}

/** Order a collection of directed edges into one closed face boundary. */
function orderBoundary(mesh: Mesh, boundary: EdgeRef[]): EdgeRef[] | null {
  if (!boundary.length) return null;
  const byStart = new Map<Id, EdgeRef>();
  for (const ref of boundary) {
    const edge = mesh.edges[ref.edgeId];
    if (!edge) return null;
    const start = ref.forward ? edge.a : edge.b;
    if (byStart.has(start)) return null;
    byStart.set(start, ref);
  }

  const ordered = [boundary[0]];
  const first = mesh.edges[boundary[0].edgeId];
  if (!first) return null;
  const firstStart = boundary[0].forward ? first.a : first.b;
  while (ordered.length < boundary.length) {
    const last = ordered.at(-1);
    if (!last) return null;
    const next = byStart.get(edgeEnd(mesh, last));
    if (!next || ordered.includes(next)) return null;
    ordered.push(next);
  }
  return edgeEnd(mesh, ordered.at(-1) as EdgeRef) === firstStart ? ordered : null;
}

/** Remove vertices whose incident edges were all removed during a face merge. */
function removeOrphanVertices(document: CityDocument): void {
  const { mesh } = document;
  const used = new Set<Id>();
  for (const edge of Object.values(mesh.edges)) {
    used.add(edge.a);
    used.add(edge.b);
  }
  // A one-vertex river has no edge yet, but still needs its selected endpoint
  // kept intact so the user can continue drawing it after the merge.
  for (const group of document.featureGroups) {
    if (group.kind !== "river") continue;
    for (const vertexId of group.vertices) used.add(vertexId);
    if (group.source) used.add(group.source.vertexId);
    if (group.mouth) used.add(group.mouth.vertexId);
  }
  for (const gate of document.gates ?? []) used.add(gate.vertexId);
  for (const vertexId of Object.keys(mesh.vertices)) {
    if (!used.has(vertexId)) delete mesh.vertices[vertexId];
  }
}

function nextNumericId<T>(records: Record<Id, T>, prefix: string): Id {
  let n = 0;
  while (records[`${prefix}${n}`]) n++;
  return `${prefix}${n}`;
}

function featureUsesEdge(document: CityDocument, edgeId: Id): boolean {
  return document.featureGroups.some(group => groupUsesEdge(document, group, edgeId));
}

function gateHasWall(document: CityDocument, vertexId: Id): boolean {
  return document.featureGroups.some(
    group =>
      group.kind === "wall" &&
      group.segments.some(segment => {
        const edge = document.mesh.edges[segment.edgeId];
        return edge?.a === vertexId || edge?.b === vertexId;
      })
  );
}

function groupUsesEdge(document: CityDocument, group: FeatureGroup, edgeId: Id): boolean {
  if (group.kind !== "river") return group.segments.some(segment => segment.edgeId === edgeId);
  for (let index = 1; index < group.vertices.length; index++)
    if (edgeBetween(document.mesh, group.vertices[index - 1], group.vertices[index])?.id === edgeId) return true;
  return false;
}

function removeConsecutiveDuplicates(ids: Id[]): Id[] {
  const result = ids.filter((id, index) => index === 0 || id !== ids[index - 1]);
  if (result.length > 1 && result[0] === result[result.length - 1]) result.pop();
  return result;
}
