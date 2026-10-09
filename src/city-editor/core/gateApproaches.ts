import { featureGroupVertices } from "./features";
import { townGates } from "./fortifications";
import { isSimplePolygon, polygonArea, polygonCentroid } from "./gen/geom";
import { edgeBetween, facePoints, faceVertices, incidentFaces, insertEdgeVertex, splitFace } from "./mesh";
import { kindEdgeIds } from "./passages";
import type { CityDocument, Id } from "./types";

/** Connect the dry edges of bank-side cells through their interiors. Routing
 * along the original perimeter alone can strand an entire bank at river
 * vertices, even when neighbouring land cells form a continuous corridor. */
export function connectDryCellInteriors(document: CityDocument): CityDocument {
  let next = document;
  const barriers = new Set([...kindEdgeIds(document, "river"), ...kindEdgeIds(document, "wall")]);
  const barrierVertices = new Set([...barriers].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  const bridgeEdges = new Set(
    document.featureGroups.flatMap(group =>
      group.kind === "road" && group.id.startsWith("gc:bridge-") ? group.segments.map(ref => ref.edgeId) : []
    )
  );
  const midpointOf = new Map<Id, Id>();
  for (const original of Object.values(document.mesh.faces)) {
    if (original.properties.locked || original.properties.water !== "land") continue;
    if (!faceVertices(document.mesh, original).some(id => barrierVertices.has(id))) continue;
    const dryEdges = original.boundary
      .map(ref => document.mesh.edges[ref.edgeId])
      .filter(
        edge =>
          !barriers.has(edge.id) &&
          [edge.leftFace, edge.rightFace].every(id => !id || document.mesh.faces[id].properties.water === "land")
      );
    // Boundary edges joined at an ordinary dry corner already communicate.
    // Split only when the river/wall vertices separate two such runs.
    const remaining = new Set(dryEdges);
    const representatives: typeof dryEdges = [];
    for (const edge of dryEdges) {
      if (!remaining.delete(edge)) continue;
      representatives.push(edge);
      const queue = [edge];
      for (const current of queue) {
        for (const other of remaining) {
          if (![current.a, current.b].some(id => !barrierVertices.has(id) && [other.a, other.b].includes(id))) continue;
          remaining.delete(other);
          queue.push(other);
        }
      }
    }
    if (representatives.length < 2) continue;
    const vertices: Id[] = [];
    for (const edge of representatives) {
      let vertex = midpointOf.get(edge.id);
      if (bridgeEdges.has(edge.id)) {
        vertex = [edge.a, edge.b].find(id => !barrierVertices.has(id));
        if (!vertex) continue;
      }
      if (!vertex) {
        const inserted = insertEdgeVertex(next, edge.id, 0.5);
        if (!inserted) continue;
        next = inserted.document;
        vertex = inserted.vertexId;
        midpointOf.set(edge.id, vertex);
      }
      vertices.push(vertex);
    }
    for (let i = 1; i < vertices.length; i++) {
      const a = vertices[i - 1],
        b = vertices[i];
      if (edgeBetween(next.mesh, a, b)) continue;
      const face = incidentFaces(next.mesh, a).find(f => faceVertices(next.mesh, f).includes(b));
      if (!face) continue;
      const split = splitFace(next, face.id, a, b);
      if (!split) continue;
      const pieces = Object.values(split.mesh.faces).filter(f => f.id === face.id || !next.mesh.faces[f.id]);
      const originalArea = polygonArea(facePoints(next.mesh, face));
      if (
        pieces.some(f => {
          const polygon = facePoints(split.mesh, f);
          const area = polygonArea(polygon);
          return !isSimplePolygon(polygon) || Math.abs(area) < 1 || area * originalArea <= 0;
        })
      )
        continue;
      for (const element of split.elements) {
        if (!element.faceIds.includes(face.id)) continue;
        for (const piece of pieces) if (!element.faceIds.includes(piece.id)) element.faceIds.push(piece.id);
      }
      for (const piece of pieces) piece.site = polygonCentroid(facePoints(split.mesh, piece));
      next = split;
    }
  }
  return next;
}

/** Join a gate to the dry edges of its own cell that the shore cuts off
 * from it. The router bans edges whose road width reaches the water, so a gate
 * arm running along the bank can strand the gate (Odutum). The chord ends at
 * the nearest vertex of such a run. */
export function joinShoreStrandedGates(document: CityDocument, shoreEdges: ReadonlySet<Id>): CityDocument {
  let next = document;
  const fixed = new Set([...kindEdgeIds(document, "river"), ...kindEdgeIds(document, "wall")]);
  const fixedVertices = new Set([...fixed].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  for (const gate of townGates(document)) {
    if (gate.locked) continue;
    for (const face of incidentFaces(next.mesh, gate.vertexId)) {
      if (face.properties.locked || face.properties.water !== "land") continue;
      const dry = face.boundary
        .map(ref => next.mesh.edges[ref.edgeId])
        .filter(edge => !fixed.has(edge.id) && !shoreEdges.has(edge.id));
      // Runs join at ordinary corners, never through the gate or a wall.
      const reached = new Set<Id>([gate.vertexId]);
      const queue = [gate.vertexId];
      for (const vertex of queue)
        for (const edge of dry) {
          if (edge.a !== vertex && edge.b !== vertex) continue;
          const other = edge.a === vertex ? edge.b : edge.a;
          if (reached.has(other)) continue;
          reached.add(other);
          if (!fixedVertices.has(other)) queue.push(other);
        }
      const origin = next.mesh.vertices[gate.vertexId].point;
      const distance = (id: Id) => {
        const point = next.mesh.vertices[id].point;
        return Math.hypot(point[0] - origin[0], point[1] - origin[1]);
      };
      const target = dry
        .flatMap(edge => [edge.a, edge.b])
        .filter(id => !reached.has(id) && !fixedVertices.has(id))
        .sort((a, b) => distance(a) - distance(b))[0];
      if (!target || edgeBetween(next.mesh, gate.vertexId, target)) continue;
      const split = splitFace(next, face.id, gate.vertexId, target);
      if (!split) continue;
      const pieces = Object.values(split.mesh.faces).filter(f => f.id === face.id || !next.mesh.faces[f.id]);
      for (const element of split.elements) {
        if (!element.faceIds.includes(face.id)) continue;
        for (const piece of pieces) if (!element.faceIds.includes(piece.id)) element.faceIds.push(piece.id);
      }
      for (const piece of pieces) piece.site = polygonCentroid(facePoints(split.mesh, piece));
      next = split;
      break;
    }
  }
  return next;
}

/** At the frame, a river has only one visible arm and cannot form a four-way
 * wall crossing. End the two curtain runs just before that mouth instead. */
export function openWallRiverMouths(document: CityDocument): CityDocument {
  let next = document;
  const ends = new Set(
    document.featureGroups.flatMap(group => (group.kind === "river" ? [group.vertices[0], group.vertices.at(-1)!] : []))
  );
  for (const vertex of ends) {
    if (townGates(next).some(g => g.vertexId === vertex && g.locked)) continue;
    const incident = Object.values(next.mesh.edges).filter(edge => edge.a === vertex || edge.b === vertex);
    if (!incident.some(edge => !edge.leftFace || !edge.rightFace)) continue;
    const walls = kindEdgeIds(next, "wall");
    for (const edge of incident.filter(edge => walls.has(edge.id))) {
      if (
        next.featureGroups.some(
          group => group.kind === "wall" && group.locked && group.segments.some(ref => ref.edgeId === edge.id)
        )
      )
        continue;
      const a = next.mesh.vertices[edge.a].point,
        b = next.mesh.vertices[edge.b].point;
      const fraction = Math.min(0.25, 8 / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])));
      const inserted = insertEdgeVertex(next, edge.id, edge.a === vertex ? fraction : 1 - fraction);
      if (!inserted) continue;
      next = inserted.document;
      const removedEdge = edgeBetween(next.mesh, vertex, inserted.vertexId)!.id;
      next.featureGroups = next.featureGroups.flatMap(group => {
        if (group.kind !== "wall" || group.locked) return [group];
        const runs: (typeof group.segments)[] = [[]];
        for (const ref of group.segments) {
          if (ref.edgeId === removedEdge) {
            if (runs.at(-1)!.length) runs.push([]);
          } else runs.at(-1)!.push(ref);
        }
        return runs
          .filter(run => run.length)
          .map((segments, i) => ({ ...group, id: i ? `${group.id}:mouth-${vertex}-${i}` : group.id, segments }));
      });
    }
  }
  return next;
}

/** Replace perimeter detours through unoccupied exterior cells by real mesh chords. */
export function shortcutExteriorRoads(document: CityDocument, planning = false): CityDocument {
  let next = document;
  const protectedVertices = new Set<Id>(
    Object.values(document.mesh.vertices)
      .filter(v => v.locked)
      .map(v => v.id)
  );
  const roadNeighbors = new Map<Id, Set<Id>>();
  for (const group of document.featureGroups) {
    if (group.kind === "river") for (const id of group.vertices) protectedVertices.add(id);
    if (group.kind !== "river" && (group.kind === "wall" || group.locked)) {
      for (const ref of group.segments ?? []) {
        const edge = document.mesh.edges[ref.edgeId];
        protectedVertices.add(edge.a);
        protectedVertices.add(edge.b);
      }
    }
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      for (const [a, b] of [
        [edge.a, edge.b],
        [edge.b, edge.a]
      ]) {
        if (!roadNeighbors.has(a)) roadNeighbors.set(a, new Set());
        roadNeighbors.get(a)!.add(b);
      }
    }
  }
  for (const [id, neighbors] of roadNeighbors) if (neighbors.size > 2) protectedVertices.add(id);
  const occupied = new Set(document.elements.flatMap(element => element.faceIds));
  const enclosed = new Set((document.defenseCircuits ?? []).flatMap(circuit => circuit.areaFaceIds));
  for (const originalGroup of document.featureGroups) {
    if (originalGroup.kind !== "road" || originalGroup.locked || !originalGroup.id.startsWith("gc:road-")) continue;
    let changed = true;
    while (changed) {
      changed = false;
      const group = next.featureGroups.find(g => g.id === originalGroup.id)!;
      if (group.kind !== "road") break;
      const vertices = featureGroupVertices(next, group);
      for (let i = 0; i + 2 < vertices.length && !changed; i++) {
        for (let j = i + 2; j < vertices.length; j++) {
          if (protectedVertices.has(vertices[j - 1])) break;
          const a = vertices[i],
            b = vertices[j];
          if (
            [a, b].some(id => protectedVertices.has(id) && !townGates(next).some(g => g.vertexId === id)) ||
            edgeBetween(next.mesh, a, b)
          )
            continue;
          const face = incidentFaces(next.mesh, a).find(
            f =>
              !f.properties.locked &&
              (!f.properties.buildable || (planning && !document.fabric && f.properties.settlement === "outskirts")) &&
              f.properties.water === "land" &&
              !occupied.has(f.id) &&
              !enclosed.has(f.id) &&
              (planning ||
                f.properties.ward === null ||
                f.properties.ward === "empty" ||
                f.properties.ward === "farm") &&
              faceVertices(next.mesh, f).includes(b) &&
              group.segments.slice(i, j).every(ref => f.boundary.some(boundary => boundary.edgeId === ref.edgeId))
          );
          if (!face) continue;
          const split = splitFace(next, face.id, a, b);
          if (!split) continue;
          const pieces = Object.values(split.mesh.faces).filter(f => f.id === face.id || !next.mesh.faces[f.id]);
          const area = polygonArea(facePoints(next.mesh, face));
          if (
            pieces.some(f => {
              const polygon = facePoints(split.mesh, f);
              return !isSimplePolygon(polygon) || polygonArea(polygon) * area <= 0;
            })
          )
            continue;
          const edge = edgeBetween(split.mesh, a, b)!;
          const updated = split.featureGroups.find(g => g.id === group.id)!;
          if (updated.kind !== "road") continue;
          updated.segments.splice(i, j - i, { edgeId: edge.id, forward: edge.a === a });
          for (const piece of pieces) piece.site = polygonCentroid(facePoints(split.mesh, piece));
          next = split;
          changed = true;
          break;
        }
      }
    }
  }
  return next;
}
