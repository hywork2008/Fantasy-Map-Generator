import type { Cell } from "../../city-generator/core/types";
import type { CityDocument, Edge, EdgeRef, Face, Id, Mesh, Point, WaterKind } from "./types";

const QUANTUM = 0.001;

export function meshFromCells(cells: Cell[]): Mesh {
  const vertices: Mesh["vertices"] = {};
  const edges: Mesh["edges"] = {};
  const faces: Mesh["faces"] = {};
  const vertexByPoint = new Map<string, Id>();
  const edgeByEnds = new Map<string, Id>();
  let vertexNo = 0;
  let edgeNo = 0;

  const getVertex = (point: Point): Id => {
    const key = pointKey(point);
    const existing = vertexByPoint.get(key);
    if (existing) return existing;
    const id = `v${vertexNo++}`;
    vertexByPoint.set(key, id);
    vertices[id] = { id, point: [point[0], point[1]], locked: false };
    return id;
  };

  for (const cell of cells) {
    const ids = cell.polygon.map(getVertex);
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

/** Merge two neighboring faces, unless their shared edge carries a feature. */
export function mergeFaces(document: CityDocument, keepFaceId: Id, removeFaceId: Id): CityDocument | null {
  if (keepFaceId === removeFaceId) return null;
  const next = clone(document);
  const keep = next.mesh.faces[keepFaceId];
  const remove = next.mesh.faces[removeFaceId];
  if (!keep || !remove || keep.properties.locked || remove.properties.locked) return null;
  const shared = keep.boundary.map(ref => ref.edgeId).filter(id => remove.boundary.some(ref => ref.edgeId === id));
  if (shared.length !== 1 || featureUsesEdge(next, shared[0])) return null;

  const keepIndex = keep.boundary.findIndex(ref => ref.edgeId === shared[0]);
  const removeIndex = remove.boundary.findIndex(ref => ref.edgeId === shared[0]);
  keep.boundary = [
    ...boundarySpan(keep.boundary, (keepIndex + 1) % keep.boundary.length, keepIndex),
    ...boundarySpan(remove.boundary, (removeIndex + 1) % remove.boundary.length, removeIndex)
  ];
  delete next.mesh.edges[shared[0]];
  delete next.mesh.faces[removeFaceId];
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
  return errors;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

function pointKey(p: Point): string {
  return `${Math.round(p[0] / QUANTUM)},${Math.round(p[1] / QUANTUM)}`;
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

function nextNumericId<T>(records: Record<Id, T>, prefix: string): Id {
  let n = 0;
  while (records[`${prefix}${n}`]) n++;
  return `${prefix}${n}`;
}

function featureUsesEdge(document: CityDocument, edgeId: Id): boolean {
  return document.featureGroups.some(group => {
    if (group.kind !== "river") return group.segments.some(segment => segment.edgeId === edgeId);
    for (let i = 1; i < group.vertices.length; i++)
      if (edgeBetween(document.mesh, group.vertices[i - 1], group.vertices[i])?.id === edgeId) return true;
    return false;
  });
}
