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
