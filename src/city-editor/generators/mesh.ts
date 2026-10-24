import type { CityDocument, Edge, EdgeRef, Face, FeatureGroup, Id, Mesh, Point, WaterKind } from "../types/document";
import type { Cell } from "../types/geometry";
import { refreshCastleLayouts } from "./castleLayout";
import { reservedCastleFaces, validateFortifications } from "./fortifications";
import { scaleFortSite, validateFortSite } from "./fortSiteGeometry";
import { isSimplePolygon, segmentsIntersect } from "./geom";
import { probed } from "./meshOpProbe";
import { refreshRiverCorridors } from "./terrainField/corridor";
import { validateTerrainLayer } from "./terrainValidation";

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
    // Vertex merging can shrink a clipped rim sliver below the area that
    // validate() accepts (Biarom: 0.97 m² at the frame), failing every attempt.
    if (Math.abs(area(ids.map(id => vertices[id].point))) < 1) continue;
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
  const used = new Set(Object.values(edges).flatMap(edge => [edge.a, edge.b]));
  for (const id of Object.keys(vertices)) if (!used.has(id)) delete vertices[id];
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

interface EdgeIndex {
  byEnds: Map<string, Edge>;
  byVertex: Map<Id, Edge[]>;
}

/** Endpoint indexes by `mesh.edges` object. Clones get a new edges object, so a
 * copy never reads its source's index. In-place edits that add, delete or
 * rewire edges call `meshEdgesChanged`; tests compare cached answers with a
 * full scan, so a missed call fails loudly. */
const edgeIndexes = new WeakMap<Mesh["edges"], EdgeIndex>();

/** Tests check every cached answer on small meshes and a sample on large ones,
 * whose full scans would otherwise make the check quadratic. */
let indexChecks = 0;
function checkEdgeIndex(mesh: Mesh): boolean {
  if (!FREEZE_SHARED) return false;
  return (edgeIndexes.get(mesh.edges)?.byEnds.size ?? 0) < 2000 || ++indexChecks % 64 === 0;
}

export function meshEdgesChanged(mesh: Mesh): void {
  edgeIndexes.delete(mesh.edges);
}

function edgeIndex(mesh: Mesh): EdgeIndex {
  let index = edgeIndexes.get(mesh.edges);
  if (index) return index;
  const byEnds = new Map<string, Edge>();
  const byVertex = new Map<Id, Edge[]>();
  for (const id in mesh.edges) {
    const edge = mesh.edges[id];
    const key = edgeKey(edge.a, edge.b);
    if (!byEnds.has(key)) byEnds.set(key, edge);
    for (const vertexId of edge.a === edge.b ? [edge.a] : [edge.a, edge.b]) {
      const edges = byVertex.get(vertexId);
      if (edges) edges.push(edge);
      else byVertex.set(vertexId, [edge]);
    }
  }
  index = { byEnds, byVertex };
  edgeIndexes.set(mesh.edges, index);
  return index;
}

/** A topology snapshot: the maps are replaced, never edited, when the mesh changes. */
export function indexMeshEdges(mesh: Mesh) {
  const { byEnds, byVertex } = edgeIndex(mesh);
  return {
    between: (a: Id, b: Id): Edge | null => byEnds.get(edgeKey(a, b)) ?? null,
    incident: (id: Id): readonly Edge[] => byVertex.get(id) ?? []
  };
}

export function edgeBetween(mesh: Mesh, a: Id, b: Id): Edge | null {
  const edge = edgeIndex(mesh).byEnds.get(edgeKey(a, b)) ?? null;
  if (checkEdgeIndex(mesh) && edge !== scanEdgeBetween(mesh, a, b))
    throw new Error(`Stale edge index: ${a}-${b}; call meshEdgesChanged after editing edges`);
  return edge;
}

function scanEdgeBetween(mesh: Mesh, a: Id, b: Id): Edge | null {
  const edges = mesh.edges;
  for (const id in edges) {
    const edge = edges[id];
    if ((edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)) return edge;
  }
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

export function incidentEdges(mesh: Mesh, vertexId: Id): Edge[] {
  const result = [...(edgeIndex(mesh).byVertex.get(vertexId) ?? [])];
  if (checkEdgeIndex(mesh)) {
    const scanned = Object.values(mesh.edges).filter(edge => edge.a === vertexId || edge.b === vertexId);
    if (scanned.length !== result.length || scanned.some((edge, i) => edge !== result[i]))
      throw new Error(`Stale edge index at ${vertexId}; call meshEdgesChanged after editing edges`);
  }
  return result;
}

export function incidentFaces(mesh: Mesh, vertexId: Id): Face[] {
  const result: Face[] = [];
  const { edges, faces } = mesh;
  for (const id in faces) {
    const face = faces[id];
    for (const ref of face.boundary) {
      const edge = edges[ref.edgeId];
      if ((ref.forward ? edge.a : edge.b) === vertexId) {
        result.push(face);
        break;
      }
    }
  }
  return result;
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

function canSplitFace(document: CityDocument, faceId: Id, a: Id, b: Id): boolean {
  const face = document.mesh.faces[faceId];
  if (
    !face ||
    face.properties.locked ||
    a === b ||
    document.defenseCircuits?.some(c => c.locked && c.areaFaceIds.includes(faceId))
  )
    return false;
  const vertices = faceVertices(document.mesh, face);
  const ia = vertices.indexOf(a);
  const ib = vertices.indexOf(b);
  return !(ia < 0 || ib < 0 || areAdjacent(vertices.length, ia, ib) || edgeBetween(document.mesh, a, b));
}

/**
 * Divide a face along a diagonal between two existing, non-adjacent vertices.
 * The original face keeps its id; the second half receives a new face id.
 */
export function splitFace(document: CityDocument, faceId: Id, a: Id, b: Id): CityDocument | null {
  if (!canSplitFace(document, faceId, a, b)) return null;
  const next = clone(document);
  if (!splitCheckedFace(next, faceId, a, b)) return null;
  return validate(next).length ? null : next;
}

/**
 * `splitFace` on a document the caller owns, without `validate`. Returns the
 * new face id. On null the document may be half edited and must be dropped.
 */
export function splitFaceInPlace(next: CityDocument, faceId: Id, a: Id, b: Id): Id | null {
  return canSplitFace(next, faceId, a, b) ? splitCheckedFace(next, faceId, a, b) : null;
}

function splitCheckedFace(next: CityDocument, faceId: Id, a: Id, b: Id): Id | null {
  const face = next.mesh.faces[faceId];
  // A diagonal of a concave cell can run outside it; checked below against the parent.
  const parent = facePoints(next.mesh, face);
  const vertices = faceVertices(next.mesh, face);
  const ia = vertices.indexOf(a);
  const ib = vertices.indexOf(b);

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
  meshEdgesChanged(next.mesh);
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
  const district = next.fabric?.districts.find(d => d.faceIds.includes(faceId));
  if (district) district.faceIds.push(newFaceId);
  for (const circuit of next.defenseCircuits ?? [])
    if (circuit.areaFaceIds.includes(faceId)) circuit.areaFaceIds.push(newFaceId);
  rebuildFaceSides(next.mesh);
  // The two halves must be simple, keep the parent's orientation and exactly
  // tile its area.
  if (isSimplePolygon(parent)) {
    const parentArea = area(parent);
    const halves = [face, next.mesh.faces[newFaceId]].map(f => facePoints(next.mesh, f));
    const halfAreas = halves.map(area);
    if (
      halves.some(points => !isSimplePolygon(points)) ||
      halfAreas.some(a => Math.sign(a) !== Math.sign(parentArea)) ||
      Math.abs(halfAreas[0] + halfAreas[1] - parentArea) > Math.abs(parentArea) * 1e-6 + 1e-6
    )
      return null;
  }
  return newFaceId;
}

/**
 * Many `splitFace` calls on one private copy, each applied in place (giant-city
 * plan E2). Equivalent to chaining `splitFace`: the session exists only for a
 * valid document without castles, where a split can break nothing but the new
 * edge and the two halves, so those are checked before the copy is touched and
 * a rejected split leaves it unchanged. Edge sides, the edge index and the next
 * free ids are updated for the split alone. Returns null when that does not hold.
 */
export function createFaceSplitSession(source: CityDocument) {
  if (source.castles?.length || validate(source).length) return null;
  const document = clone(source);
  const { mesh } = document;
  const skeleton = document.fabric?.generation?.algorithm === "skeleton-city-v1";
  // Only additions happen here, so every id below the last one handed out stays taken.
  const nextIds = { e: 0, f: 0 };
  const freshId = (records: Record<Id, unknown>, prefix: "e" | "f"): Id => {
    let n = nextIds[prefix];
    while (records[`${prefix}${n}`]) n++;
    nextIds[prefix] = n + 1;
    return `${prefix}${n}`;
  };
  return {
    document,
    /** The new face id, or null (copy unchanged) where `splitFace` would refuse. */
    split(faceId: Id, a: Id, b: Id): Id | null {
      if (!canSplitFace(document, faceId, a, b)) return null;
      const face = mesh.faces[faceId];
      const parent = facePoints(mesh, face);
      const vertices = faceVertices(mesh, face);
      const ia = vertices.indexOf(a);
      const ib = vertices.indexOf(b);
      const fromA = boundarySpan(face.boundary, ia, ib);
      const fromB = boundarySpan(face.boundary, ib, ia);
      const corners = (refs: EdgeRef[]) =>
        refs.map(ref => mesh.vertices[ref.forward ? mesh.edges[ref.edgeId].a : mesh.edges[ref.edgeId].b].point);
      // facePoints of the halves: each run, then the diagonal's start (b, then a).
      const halves = [
        [...corners(fromA), mesh.vertices[b].point],
        [...corners(fromB), mesh.vertices[a].point]
      ];
      if (distance(mesh.vertices[a].point, mesh.vertices[b].point) < (skeleton ? 1e-5 : 1)) return null;
      if (isSimplePolygon(parent)) {
        const parentArea = area(parent);
        const halfAreas = halves.map(area);
        if (
          halves.some(points => !isSimplePolygon(points)) ||
          halfAreas.some(value => Math.sign(value) !== Math.sign(parentArea)) ||
          Math.abs(halfAreas[0] + halfAreas[1] - parentArea) > Math.abs(parentArea) * 1e-6 + 1e-6
        )
          return null;
      }
      const minArea = skeleton && !face.properties.buildable ? 1e-8 : 1;
      if (halves.some(points => points.length < 3 || Math.abs(area(points)) < minArea)) return null;

      const edgeId = freshId(mesh.edges, "e");
      const forward = a < b;
      const edge: Edge = {
        id: edgeId,
        a: forward ? a : b,
        b: forward ? b : a,
        leftFace: null,
        rightFace: null,
        locked: false
      };
      mesh.edges[edgeId] = edge;
      indexAddedEdge(mesh, edge);
      const newFaceId = freshId(mesh.faces, "f");
      const closeA: EdgeRef = { edgeId, forward: edge.a === b };
      const closeB: EdgeRef = { edgeId, forward: edge.a === a };
      face.boundary = [...fromA, closeA];
      mesh.faces[newFaceId] = {
        id: newFaceId,
        boundary: [...fromB, closeB],
        site: face.site ? [face.site[0], face.site[1]] : undefined,
        properties: clone(face.properties)
      };
      const district = document.fabric?.districts.find(d => d.faceIds.includes(faceId));
      if (district) district.faceIds.push(newFaceId);
      for (const circuit of document.defenseCircuits ?? [])
        if (circuit.areaFaceIds.includes(faceId)) circuit.areaFaceIds.push(newFaceId);
      // What rebuildFaceSides would change: b's run now bounds the new face.
      for (const [id, refs] of [
        [faceId, face.boundary],
        [newFaceId, mesh.faces[newFaceId].boundary]
      ] as const)
        for (const ref of refs) {
          if (ref.forward) mesh.edges[ref.edgeId].leftFace = id;
          else mesh.edges[ref.edgeId].rightFace = id;
        }
      return newFaceId;
    }
  };
}

/** Add an edge to the cached endpoint index, as a rebuild would place it (last). */
function indexAddedEdge(mesh: Mesh, edge: Edge): void {
  const index = edgeIndexes.get(mesh.edges);
  if (!index) return;
  const key = edgeKey(edge.a, edge.b);
  if (!index.byEnds.has(key)) index.byEnds.set(key, edge);
  for (const id of edge.a === edge.b ? [edge.a] : [edge.a, edge.b]) {
    const edges = index.byVertex.get(id);
    if (edges) edges.push(edge);
    else index.byVertex.set(id, [edge]);
  }
}

/** Merge two neighboring faces, unless a shared edge carries a feature. */
export function mergeFaces(document: CityDocument, keepFaceId: Id, removeFaceId: Id): CityDocument | null {
  if (
    keepFaceId === removeFaceId ||
    document.castles?.some(
      castle => castle.locked && castle.siteFaceIds?.some(id => id === keepFaceId || id === removeFaceId)
    ) ||
    (document.defenseCircuits ?? []).some(
      c => c.areaFaceIds.includes(keepFaceId) !== c.areaFaceIds.includes(removeFaceId)
    )
  )
    return null;
  {
    const keep = document.mesh.faces[keepFaceId];
    const remove = document.mesh.faces[removeFaceId];
    if (!keep || !remove || keep.properties.locked || remove.properties.locked) return null;
    const shared = keep.boundary.map(ref => ref.edgeId).filter(id => remove.boundary.some(ref => ref.edgeId === id));
    if (!shared.length || shared.some(edgeId => featureUsesEdge(document, edgeId))) return null;
  }
  const next = clone(document);
  const keep = next.mesh.faces[keepFaceId];
  const remove = next.mesh.faces[removeFaceId];
  const shared = keep.boundary.map(ref => ref.edgeId).filter(id => remove.boundary.some(ref => ref.edgeId === id));

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
  meshEdgesChanged(next.mesh);
  delete next.mesh.faces[removeFaceId];
  removeOrphanVertices(next);
  for (const element of next.elements) {
    element.faceIds = [...new Set(element.faceIds.map(id => (id === removeFaceId ? keepFaceId : id)))];
  }
  if (next.fabric) {
    const owner =
      next.fabric.districts.find(d => d.faceIds.includes(keepFaceId)) ??
      next.fabric.districts.find(d => d.faceIds.includes(removeFaceId));
    for (const district of next.fabric.districts)
      district.faceIds = district.faceIds.filter(id => id !== removeFaceId && id !== keepFaceId);
    if (owner) owner.faceIds.push(keepFaceId);
    next.fabric.districts = next.fabric.districts.filter(d => d.faceIds.length);
  }
  for (const circuit of next.defenseCircuits ?? [])
    circuit.areaFaceIds = [...new Set(circuit.areaFaceIds.map(id => (id === removeFaceId ? keepFaceId : id)))];
  for (const castle of next.castles ?? []) {
    if (castle.siteFaceIds)
      castle.siteFaceIds = [...new Set(castle.siteFaceIds.map(id => (id === removeFaceId ? keepFaceId : id)))];
    if (castle.motteFaceId === removeFaceId) castle.motteFaceId = keepFaceId;
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
  const current = document.mesh.faces[faceId];
  if (current?.properties.locked || (water !== "land" && reservedCastleFaces(document).has(faceId))) return document;
  // Re-applying the same water class (and its forced sea-level elevation) is a
  // no-op; return the original so the caller can skip a history snapshot.
  if (current && current.properties.water === water && (water === "land" || current.properties.elevation === 0)) {
    return document;
  }
  const next = clone(document);
  const face = next.mesh.faces[faceId];
  if (face) {
    face.properties.water = water;
    if (water !== "land") {
      face.properties.elevation = 0;
      face.properties.depth ??= 3;
    } else delete face.properties.depth;
  }
  return next;
}

export function setFaceDepth(document: CityDocument, faceId: Id, depth: number): CityDocument {
  const face = document.mesh.faces[faceId];
  if (
    !face ||
    face.properties.locked ||
    face.properties.water === "land" ||
    !Number.isFinite(depth) ||
    depth < 0 ||
    face.properties.depth === depth
  )
    return document;
  const next = clone(document);
  next.mesh.faces[faceId].properties.depth = depth;
  return next;
}

export function setFaceElevation(document: CityDocument, faceId: Id, elevation: number): CityDocument {
  if (
    !Number.isFinite(elevation) ||
    document.mesh.faces[faceId]?.properties.locked ||
    (elevation <= 0 && reservedCastleFaces(document).has(faceId))
  )
    return document;
  const next = clone(document);
  const face = next.mesh.faces[faceId];
  if (!face) return next;
  face.properties.elevation = elevation;
  face.properties.water = elevation <= 0 ? "sea" : "land";
  if (elevation <= 0) face.properties.depth ??= 3;
  else delete face.properties.depth;
  return next;
}

export function protectedVertex(document: CityDocument, id: Id): boolean {
  const edges = incidentEdges(document.mesh, id);
  return (
    !!document.mesh.vertices[id]?.locked ||
    (document.castles ?? []).some(
      c =>
        c.locked &&
        (c.siteFaceIds ?? document.defenseCircuits?.find(d => d.id === c.circuitId)?.areaFaceIds)?.some(fid =>
          faceVertices(document.mesh, document.mesh.faces[fid]).includes(id)
        )
    ) ||
    incidentFaces(document.mesh, id).some(f => f.properties.locked) ||
    edges.some(e => e.locked || document.featureGroups.some(g => g.locked && groupUsesEdge(document, g, e.id)))
  );
}

export function moveVertex(
  document: CityDocument,
  vertexId: Id,
  point: Point,
  allowExistingErrors = false
): CityDocument | null {
  return moveVertices(document, new Map([[vertexId, point]]), allowExistingErrors);
}

/** Cheap rejection before moveVertices copies a document. Reuse only while the
 * topology stays fixed; read coordinates and validity from the current document
 * on every trial. A passing trial still needs the full move/validation path. */
export function createVertexMovePreflight(document: CityDocument) {
  const edgesByVertex = new Map<Id, Edge[]>();
  const facesByVertex = new Map<Id, Array<{ face: Face; ids: Id[] }>>();
  for (const edge of Object.values(document.mesh.edges)) {
    for (const id of [edge.a, edge.b]) {
      const edges = edgesByVertex.get(id) ?? [];
      edges.push(edge);
      edgesByVertex.set(id, edges);
    }
  }
  for (const face of Object.values(document.mesh.faces)) {
    const ring = { face, ids: faceVertices(document.mesh, face) };
    for (const id of ring.ids) {
      const faces = facesByVertex.get(id) ?? [];
      faces.push(ring);
      facesByVertex.set(id, faces);
    }
  }
  return (current: CityDocument, targets: ReadonlyMap<Id, Point>): boolean => {
    const half = current.frame.extentMeters / 2;
    const point = (id: Id) => targets.get(id) ?? current.mesh.vertices[id].point;
    const edges = new Set<Edge>();
    const faces = new Set<{ face: Face; ids: Id[] }>();
    for (const [id, target] of targets) {
      if (
        !current.mesh.vertices[id] ||
        !target.every(Number.isFinite) ||
        Math.abs(target[0]) > half ||
        Math.abs(target[1]) > half
      )
        return false;
      for (const edge of edgesByVertex.get(id) ?? []) edges.add(edge);
      for (const face of facesByVertex.get(id) ?? []) faces.add(face);
    }
    const skeleton = current.fabric?.generation?.algorithm === "skeleton-city-v1";
    for (const edge of edges) if (distance(point(edge.a), point(edge.b)) < (skeleton ? 1e-5 : 1)) return false;
    for (const { face, ids } of faces) {
      const next = ids.map(point);
      const nextArea = area(next);
      if (next.length < 3 || Math.abs(nextArea) < (skeleton && !face.properties.buildable ? 1e-8 : 1)) return false;
      const previous = ids.map(id => current.mesh.vertices[id].point);
      if (isSimplePolygon(previous) && (!isSimplePolygon(next) || Math.sign(nextArea) !== Math.sign(area(previous))))
        return false;
    }
    return true;
  };
}

/**
 * Many vertex moves on one private copy, each applied in place and undone when
 * rejected (giant-city plan E2). Equivalent to chaining `moveVertices`: the
 * session exists only for a valid document without castles, where a move that
 * keeps the topology can break nothing but the cells and edges at the moved
 * vertices; those are checked locally (`createVertexMovePreflight` plus an edge
 * grid for crossings). Returns null when that does not hold.
 */
export function createVertexMoveSession(source: CityDocument) {
  if (source.castles?.length || validate(source).length) return null;
  const document = clone(source);
  const { mesh } = document;
  const preflight = createVertexMovePreflight(document);
  const grid = new EdgeGrid(mesh);
  return {
    document,
    /** Apply `points`; keep them when `accept` (run on the moved document) agrees. */
    tryMove(points: ReadonlyMap<Id, Point>, accept: () => boolean): boolean {
      const half = document.frame.extentMeters / 2;
      for (const [id, point] of points) {
        if (!mesh.vertices[id] || protectedVertex(document, id)) return false;
        if (!point.every(Number.isFinite) || Math.abs(point[0]) > half || Math.abs(point[1]) > half) return false;
      }
      if (!preflight(document, points)) return false;
      const before = new Map<Id, Point>();
      for (const id of points.keys()) before.set(id, mesh.vertices[id].point);
      const moved = new Set(points.keys());
      const edges = new Set<Edge>();
      for (const id of moved) for (const edge of incidentEdges(mesh, id)) edges.add(edge);
      const old = (id: Id) => before.get(id) ?? mesh.vertices[id].point;
      const now = (id: Id) => points.get(id) ?? mesh.vertices[id].point;
      // Same tests as movedGeometryErrors: box overlap, then a new crossing.
      const newCrossing = (edge: Edge, other: Edge): boolean => {
        if (other === edge || [other.a, other.b].some(id => id === edge.a || id === edge.b)) return false;
        const box = segmentBox(now(edge.a), now(edge.b));
        const otherBox = segmentBox(now(other.a), now(other.b));
        if (box[0] > otherBox[2] || otherBox[0] > box[2] || box[1] > otherBox[3] || otherBox[1] > box[3]) return false;
        if (!segmentsIntersect(now(edge.a), now(edge.b), now(other.a), now(other.b))) return false;
        return !segmentsIntersect(old(edge.a), old(edge.b), old(other.a), old(other.b));
      };
      for (const edge of edges) {
        // The grid holds unmoved edges where they are; moved pairs are tested directly.
        for (const other of grid.near(segmentBox(now(edge.a), now(edge.b))))
          if (!edges.has(other) && newCrossing(edge, other)) return false;
        for (const other of edges) if (newCrossing(edge, other)) return false;
      }
      for (const [id, point] of points) mesh.vertices[id].point = [point[0], point[1]];
      if (accept()) {
        for (const edge of edges) grid.update(edge);
        return true;
      }
      for (const [id, point] of before) mesh.vertices[id].point = point;
      return false;
    }
  };
}

/** Uniform grid of edge boxes; a box query returns every edge whose box it may touch. */
class EdgeGrid {
  private cells = new Map<string, Set<Edge>>();
  private keys = new Map<Edge, string[]>();
  private size: number;
  constructor(private mesh: Mesh) {
    const edges = Object.values(mesh.edges);
    let total = 0;
    for (const edge of edges) total += distance(mesh.vertices[edge.a].point, mesh.vertices[edge.b].point);
    this.size = Math.max(1, (total / Math.max(1, edges.length)) * 2);
    for (const edge of edges) this.update(edge);
  }
  private cellKeys(box: [number, number, number, number]): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(box[0] / this.size); x <= Math.floor(box[2] / this.size); x++)
      for (let y = Math.floor(box[1] / this.size); y <= Math.floor(box[3] / this.size); y++) keys.push(`${x},${y}`);
    return keys;
  }
  update(edge: Edge): void {
    for (const key of this.keys.get(edge) ?? []) this.cells.get(key)?.delete(edge);
    const { vertices } = this.mesh;
    const keys = this.cellKeys(segmentBox(vertices[edge.a].point, vertices[edge.b].point));
    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) cell.add(edge);
      else this.cells.set(key, new Set([edge]));
    }
    this.keys.set(edge, keys);
  }
  near(box: [number, number, number, number]): Set<Edge> {
    const result = new Set<Edge>();
    for (const key of this.cellKeys(box)) for (const edge of this.cells.get(key) ?? []) result.add(edge);
    return result;
  }
}

/** Apply a coordinated displacement atomically; intermediate cell shapes
 * need not be valid while several shared corners move together. */
export function moveVertices(
  document: CityDocument,
  points: ReadonlyMap<Id, Point>,
  allowExistingErrors = false
): CityDocument | null {
  return probed("moveVertices", () => moveVerticesUnprobed(document, points, allowExistingErrors));
}

function moveVerticesUnprobed(
  document: CityDocument,
  points: ReadonlyMap<Id, Point>,
  allowExistingErrors: boolean
): CityDocument | null {
  const half = document.frame.extentMeters / 2;
  for (const [id, point] of points) {
    if (!document.mesh.vertices[id] || protectedVertex(document, id)) return null;
    if (!point.every(Number.isFinite) || Math.abs(point[0]) > half || Math.abs(point[1]) > half) return null;
  }
  const next = clone(document);
  for (const [id, point] of points) next.mesh.vertices[id].point = [point[0], point[1]];
  if (!probed("refreshCastleLayouts", () => refreshCastleLayouts(next))) return null;
  // Moved-geometry errors are new by construction, so they are never excused
  // by allowExistingErrors.
  if (movedGeometryErrors(document, next, points.keys()).length) return null;
  const errors = validate(next);
  if (!errors.length) {
    refreshRiverCorridors(next);
    return next;
  }
  if (!allowExistingErrors) return null;
  const existing = new Set(validate(document));
  if (!errors.every(error => existing.has(error))) return null;
  refreshRiverCorridors(next);
  return next;
}

/**
 * Collapse an edge by keeping one endpoint and reattaching the other endpoint's
 * incident edges. Faces and feature references are rebuilt around the survivor.
 */
export function mergeVertices(document: CityDocument, keepVertexId: Id, removeVertexId: Id): CityDocument | null {
  if (
    keepVertexId === removeVertexId ||
    protectedVertex(document, keepVertexId) ||
    protectedVertex(document, removeVertexId)
  )
    return null;
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
    if (gate.wallEdgeIds) gate.wallEdgeIds = gate.wallEdgeIds.map(id => edgeReplacements.get(id) ?? id) as [Id, Id];
    if (gateVertices.has(gate.vertexId)) return false;
    gateVertices.add(gate.vertexId);
    return true;
  });

  for (const circuit of next.defenseCircuits ?? [])
    for (const barrier of circuit.naturalBarriers)
      barrier.segments = barrier.segments
        .filter(r => r.edgeId !== joiningEdge.id)
        .map(r => ({ ...r, edgeId: edgeReplacements.get(r.edgeId) ?? r.edgeId }));
  delete next.mesh.vertices[removeVertexId];
  rebuildFaceSides(next.mesh);
  if (!refreshCastleLayouts(next)) return null;
  refreshRiverCorridors(next);
  return validate(next).length ? null : next;
}

/**
 * Collapse short mesh edges touched by a circular brush. The retained vertex
 * moves to the edge midpoint before the next candidate is considered, matching
 * TownGenerator's junction cleanup while preserving City Editor route and gate
 * references through {@link mergeVertices}.
 */
export function optimizeJunctions(
  document: CityDocument,
  center: Point,
  radiusMeters: number,
  maxEdgeLengthMeters = 8
): CityDocument | null {
  if (radiusMeters < 0 || maxEdgeLengthMeters <= 0) return null;
  let next = document;
  let changed = false;
  const skippedEdgeIds = new Set<Id>();

  // One collapse can expose another small junction. Re-scan until the brush
  // contains no eligible short edge, just as the generator cleans each patch
  // after every vertex replacement.
  while (true) {
    const candidate = Object.values(next.mesh.edges)
      .filter(edge => {
        const a = next.mesh.vertices[edge.a];
        const b = next.mesh.vertices[edge.b];
        return (
          !!a &&
          !!b &&
          !skippedEdgeIds.has(edge.id) &&
          !a.locked &&
          !b.locked &&
          distance(a.point, b.point) < maxEdgeLengthMeters &&
          pointToSegmentDistance(center, a.point, b.point) <= radiusMeters
        );
      })
      .sort((a, b) => {
        const aStart = next.mesh.vertices[a.a];
        const aEnd = next.mesh.vertices[a.b];
        const bStart = next.mesh.vertices[b.a];
        const bEnd = next.mesh.vertices[b.b];
        return distance(aStart!.point, aEnd!.point) - distance(bStart!.point, bEnd!.point);
      })[0];
    if (!candidate) break;

    const a = next.mesh.vertices[candidate.a];
    const b = next.mesh.vertices[candidate.b];
    if (!a || !b) break;
    const midpoint: Point = [(a.point[0] + b.point[0]) / 2, (a.point[1] + b.point[1]) / 2];
    const merged = mergeVertices(next, candidate.a, candidate.b);
    if (!merged) {
      // An edge can be structurally protected by its adjacent cells or a
      // locked route. Do not retry it in this brush stroke.
      skippedEdgeIds.add(candidate.id);
      continue;
    }
    const positioned = moveVertex(merged, candidate.a, midpoint);
    if (!positioned) {
      // Keep the valid topological merge even if centering it would invalidate
      // a neighboring face; this is safer than retaining the sliver edge.
      next = merged;
    } else {
      next = positioned;
    }
    changed = true;
  }

  if (!changed) return null;
  return next;
}

export function scaleDocument(document: CityDocument, factor: number): CityDocument | null {
  if (!Number.isFinite(factor) || factor <= 0) return null;
  if (factor === 1) return document;
  const next = clone(document);
  if (next.fortSite) scaleFortSite(next.fortSite, factor);
  for (const vertex of Object.values(next.mesh.vertices))
    vertex.point = [vertex.point[0] * factor, vertex.point[1] * factor];
  for (const face of Object.values(next.mesh.faces))
    if (face.site) face.site = [face.site[0] * factor, face.site[1] * factor];
  for (const group of next.featureGroups) group.style.widthMeters *= factor;
  for (const castle of next.castles ?? []) {
    const scale = (p: Point): Point => [p[0] * factor, p[1] * factor];
    castle.courtyards = castle.courtyards.map(r => r.map(scale));
    for (const part of castle.parts) {
      part.footprint = part.footprint.map(scale);
      part.entrances = part.entrances.map(scale);
    }
    for (const access of castle.accesses) {
      access.points = access.points.map(scale);
      access.widthMeters *= factor;
    }
  }
  for (const gate of next.gates) if (gate.passageWidthMeters) gate.passageWidthMeters *= factor;
  for (const element of next.elements) {
    if (element.point) element.point = [element.point[0] * factor, element.point[1] * factor];
    if (element.sizeMeters) element.sizeMeters *= factor;
  }
  next.frame.extentMeters *= factor;
  next.frame.cityRadiusMeters *= factor;
  next.frame.blockSizeMeters *= factor;
  if (next.frame.settlementExtentMeters !== undefined) next.frame.settlementExtentMeters *= factor;
  return validate(next).length ? null : next;
}

/** Insert a collinear vertex while preserving directed face and feature paths. */
export function insertEdgeVertex(
  document: CityDocument,
  edgeId: Id,
  fraction: number
): { document: CityDocument; vertexId: Id } | null {
  if (!canInsertEdgeVertex(document, edgeId, fraction)) return null;
  const next = clone(document);
  const vertexId = insertEdgeVertexUnchecked(next, edgeId, fraction);
  return validate(next).length ? null : { document: next, vertexId };
}

/**
 * `insertEdgeVertex` on a document the caller owns, without `validate`.
 * Returns the new vertex id, or null without editing.
 */
export function insertEdgeVertexInPlace(document: CityDocument, edgeId: Id, fraction: number): Id | null {
  return canInsertEdgeVertex(document, edgeId, fraction) ? insertEdgeVertexUnchecked(document, edgeId, fraction) : null;
}

function canInsertEdgeVertex(document: CityDocument, edgeId: Id, fraction: number): boolean {
  const edge = document.mesh.edges[edgeId];
  if (
    !edge ||
    edge.locked ||
    !Number.isFinite(fraction) ||
    fraction <= 0 ||
    fraction >= 1 ||
    [edge.leftFace, edge.rightFace].some(id => id && document.mesh.faces[id].properties.locked) ||
    document.featureGroups.some(group => group.locked && groupUsesEdge(document, group, edgeId))
  )
    return false;
  const a = document.mesh.vertices[edge.a].point;
  const b = document.mesh.vertices[edge.b].point;
  return distance(a, b) * Math.min(fraction, 1 - fraction) >= 1;
}

function insertEdgeVertexUnchecked(next: CityDocument, edgeId: Id, fraction: number): Id {
  const edge = { ...next.mesh.edges[edgeId] };
  const a = next.mesh.vertices[edge.a].point;
  const b = next.mesh.vertices[edge.b].point;
  const vertexId = nextNumericId(next.mesh.vertices, "v");
  const newEdgeId = nextNumericId(next.mesh.edges, "e");
  next.mesh.vertices[vertexId] = {
    id: vertexId,
    point: [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction],
    locked: false
  };
  next.mesh.edges[edgeId].b = vertexId;
  next.mesh.edges[newEdgeId] = { ...edge, id: newEdgeId, a: vertexId };
  meshEdgesChanged(next.mesh);
  const expand = (ref: EdgeRef): EdgeRef[] =>
    ref.edgeId !== edgeId
      ? [ref]
      : ref.forward
        ? [
            { edgeId, forward: true },
            { edgeId: newEdgeId, forward: true }
          ]
        : [
            { edgeId: newEdgeId, forward: false },
            { edgeId, forward: false }
          ];
  for (const face of Object.values(next.mesh.faces)) face.boundary = face.boundary.flatMap(expand);
  for (const group of next.featureGroups) {
    if (group.kind !== "river") group.segments = group.segments.flatMap(expand);
    else
      group.vertices = group.vertices.flatMap((id, i, ids) =>
        i + 1 < ids.length && ((id === edge.a && ids[i + 1] === edge.b) || (id === edge.b && ids[i + 1] === edge.a))
          ? [id, vertexId]
          : [id]
      );
  }
  for (const circuit of next.defenseCircuits ?? [])
    for (const barrier of circuit.naturalBarriers) barrier.segments = barrier.segments.flatMap(expand);
  for (const gate of next.gates)
    if (gate.wallEdgeIds?.includes(edgeId) && gate.vertexId === edge.b)
      gate.wallEdgeIds = gate.wallEdgeIds.map(id => (id === edgeId ? newEdgeId : id)) as [Id, Id];
  return vertexId;
}

export function validate(document: CityDocument): string[] {
  return probed("validate", () => validateUnprobed(document));
}

function validateUnprobed(document: CityDocument): string[] {
  const errors: string[] = [...validateFortSite(document), ...validateTerrainLayer(document)];
  const { mesh } = document;
  const hasEdge = (a: Id, b: Id): boolean => edgeBetween(mesh, a, b) !== null;
  for (const edge of Object.values(mesh.edges)) {
    if (!mesh.vertices[edge.a] || !mesh.vertices[edge.b]) errors.push(`Missing endpoint on ${edge.id}`);
    else if (
      distance(mesh.vertices[edge.a].point, mesh.vertices[edge.b].point) <
      (document.fabric?.generation?.algorithm === "skeleton-city-v1" ? 1e-5 : 1)
    )
      errors.push(`Edge ${edge.id} is too short`);
  }
  for (const face of Object.values(mesh.faces)) {
    const points = facePoints(mesh, face);
    if (face.properties.depth !== undefined && (!Number.isFinite(face.properties.depth) || face.properties.depth < 0))
      errors.push(`Face ${face.id} has invalid depth`);
    if (
      points.length < 3 ||
      Math.abs(area(points)) <
        (document.fabric?.generation?.algorithm === "skeleton-city-v1" && !face.properties.buildable ? 1e-8 : 1)
    )
      errors.push(`Face ${face.id} has no area`);
  }
  for (const group of document.featureGroups) {
    if (group.kind === "river") {
      if (group.vertices.length >= 2) {
        for (let i = 1; i < group.vertices.length; i++)
          if (!hasEdge(group.vertices[i - 1], group.vertices[i])) errors.push(`River ${group.name} leaves mesh`);
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
    else if (!gate.ownerCastleId && !gateHasWall(document, gate.vertexId))
      errors.push(`Gate ${gate.id} is not on a wall`);
  }
  errors.push(...validateFortifications(document));
  return errors;
}

/**
 * Planarity checks for an edit that moved existing vertices (design.md §5):
 * every cell touching a moved vertex stays simple and keeps its orientation,
 * and no edge at a moved vertex crosses or touches a non-adjacent edge. A cell
 * or edge pair that was already broken in `before` is not held to the rule, so
 * legacy documents remain editable.
 */
export function movedGeometryErrors(before: CityDocument, after: CityDocument, vertexIds: Iterable<Id>): string[] {
  return probed("movedGeometryErrors", () => movedGeometryErrorsUnprobed(before, after, vertexIds));
}

function movedGeometryErrorsUnprobed(before: CityDocument, after: CityDocument, vertexIds: Iterable<Id>): string[] {
  const moved = new Set(vertexIds);
  if (!moved.size) return [];
  const errors: string[] = [];
  for (const face of Object.values(after.mesh.faces)) {
    const ids = faceVertices(after.mesh, face);
    if (!ids.some(id => moved.has(id))) continue;
    const previous = before.mesh.faces[face.id];
    if (!previous) continue;
    const old = facePoints(before.mesh, previous);
    if (!isSimplePolygon(old)) continue;
    const points = ids.map(id => after.mesh.vertices[id].point);
    if (!isSimplePolygon(points)) errors.push(`Face ${face.id} self-intersects`);
    else if (Math.sign(area(points)) !== Math.sign(area(old))) errors.push(`Face ${face.id} is inverted`);
  }
  const edges = Object.values(after.mesh.edges);
  const boxes = edges.map(edge => segmentBox(after.mesh.vertices[edge.a].point, after.mesh.vertices[edge.b].point));
  edges.forEach((edge, i) => {
    if (!moved.has(edge.a) && !moved.has(edge.b)) return;
    const p = after.mesh.vertices[edge.a].point;
    const q = after.mesh.vertices[edge.b].point;
    edges.forEach((other, j) => {
      if (i === j || (j < i && (moved.has(other.a) || moved.has(other.b)))) return;
      if ([other.a, other.b].some(id => id === edge.a || id === edge.b)) return;
      const box = boxes[i];
      const otherBox = boxes[j];
      if (box[0] > otherBox[2] || otherBox[0] > box[2] || box[1] > otherBox[3] || otherBox[1] > box[3]) return;
      if (!segmentsIntersect(p, q, after.mesh.vertices[other.a].point, after.mesh.vertices[other.b].point)) return;
      const wasCrossing =
        before.mesh.edges[edge.id] &&
        before.mesh.edges[other.id] &&
        segmentsIntersect(
          before.mesh.vertices[edge.a].point,
          before.mesh.vertices[edge.b].point,
          before.mesh.vertices[other.a].point,
          before.mesh.vertices[other.b].point
        );
      if (!wasCrossing) errors.push(`Edge ${edge.id} crosses ${other.id}`);
    });
  });
  return errors;
}

function segmentBox(a: Point, b: Point): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** Descriptor payloads and generated snapshots are copy-on-write. Mesh edits replace the property;
 * they do not mutate the surveyed rivers, so clones share that object. */
const SHARED_CITY_FIELDS = [
  "importedFixedCrossings",
  "regionalSurface",
  "regionalWaterAreas",
  "sceneRegions",
  "siteEconomy",
  "civilization",
  "burialProfile",
  "ruralFieldSnapshot",
  "landmarkAssets",
  "riverFlows",
  "waterAccess",
  "biome"
] as const;

/**
 * Mesh edits replace a vertex's `point`, a face's `boundary` and `site`; they
 * never write into them. Clones therefore share those arrays and copy only the
 * records that edits change. Tests freeze the shared arrays so a write fails
 * loudly; frozen arrays are slower, so the app does not.
 */
function cloneMesh(mesh: Mesh): Mesh {
  const vertices: Mesh["vertices"] = {};
  for (const id in mesh.vertices) {
    const vertex = mesh.vertices[id];
    vertices[vertex.id] = { id: vertex.id, point: frozen(vertex.point), locked: vertex.locked };
  }
  const edges: Mesh["edges"] = {};
  for (const id in mesh.edges) {
    const edge = mesh.edges[id];
    edges[edge.id] = {
      id: edge.id,
      a: edge.a,
      b: edge.b,
      leftFace: edge.leftFace,
      rightFace: edge.rightFace,
      locked: edge.locked
    };
  }
  const faces: Mesh["faces"] = {};
  for (const id in mesh.faces) {
    const face = mesh.faces[id];
    faces[face.id] = {
      id: face.id,
      boundary: frozenRefs(face.boundary),
      ...(face.site ? { site: frozen(face.site) } : {}),
      properties: { ...face.properties }
    };
  }
  return { vertices, edges, faces };
}

const FREEZE_SHARED = import.meta.env?.MODE === "test";

function frozen<T extends object>(value: T): T {
  return !FREEZE_SHARED || Object.isFrozen(value) ? value : Object.freeze(value);
}

function frozenRefs(boundary: EdgeRef[]): EdgeRef[] {
  if (!FREEZE_SHARED || Object.isFrozen(boundary)) return boundary;
  for (const ref of boundary) Object.freeze(ref);
  return Object.freeze(boundary) as EdgeRef[];
}

export function clone<T>(value: T): T {
  return probed("clone", () => cloneUnprobed<T>(value));
}

function cloneUnprobed<T>(value: T): T {
  if (!value || typeof value !== "object" || (value as { format?: unknown }).format !== "fmg-city-editor")
    return structuredClone(value);
  const source = value as unknown as CityDocument;
  const shared = new Set<string>(SHARED_CITY_FIELDS);
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (shared.has(key) || key === "mesh" || key === "featureGroups") continue;
    rest[key] = source[key as keyof CityDocument];
  }
  const clonedRest = structuredClone(rest) as Record<string, unknown>;
  const mesh = cloneMesh(source.mesh);
  const groups = structuredClone(source.featureGroups);
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (key === "mesh") copy.mesh = mesh;
    else if (key === "featureGroups") copy.featureGroups = groups;
    else if (shared.has(key)) copy[key] = source[key as keyof CityDocument];
    else copy[key] = clonedRest[key];
  }
  return copy as unknown as T;
}

function edgeKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, a);
  const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return distance(point, [a[0] + ratio * dx, a[1] + ratio * dy]);
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
