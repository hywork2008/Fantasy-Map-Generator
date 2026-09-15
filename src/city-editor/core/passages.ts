// 4-way passages (gates / bridges) for generated routes.
//
// River, road and wall must not share an edge (Phase G7). They MAY share a
// vertex when that vertex has >= 4 incident edges and the two kinds use
// opposite (diagonal) pairs — a gate or a bridge. When they meet at a vertex
// of degree < 4, raise the degree by merging the nearest neighbour on the
// barrier, or by splitting an incident cell, then thread the road through.

import { appendEdge, featureGroupVertices, groupUsesEdge } from "./features";
import {
  clone,
  edgeBetween,
  faceVertices,
  incidentEdges,
  incidentFaces,
  mergeVertices,
  moveVertex,
  splitFace
} from "./mesh";
import type { CityDocument, Edge, FeatureGroup, Id } from "./types";

export type BarrierKind = Extract<FeatureGroup["kind"], "wall" | "river">;

/** Angular order of edges around a vertex, CCW from +X. */
export function orderedIncidentEdges(document: CityDocument, vertexId: Id): Edge[] {
  const vertex = document.mesh.vertices[vertexId];
  if (!vertex) return [];
  return incidentEdges(document.mesh, vertexId)
    .map(edge => {
      const other = document.mesh.vertices[edge.a === vertexId ? edge.b : edge.a];
      return {
        edge,
        angle: other ? Math.atan2(other.point[1] - vertex.point[1], other.point[0] - vertex.point[0]) : 0
      };
    })
    .sort((a, b) => a.angle - b.angle || a.edge.id.localeCompare(b.edge.id))
    .map(item => item.edge);
}

/** Two edges at a vertex are opposite when they are not adjacent in angular order. */
export function edgesAreOpposite(ordered: Edge[], a: Id, b: Id): boolean {
  const ia = ordered.findIndex(edge => edge.id === a);
  const ib = ordered.findIndex(edge => edge.id === b);
  if (ia < 0 || ib < 0 || ordered.length < 4) return false;
  const gap = Math.abs(ia - ib);
  return gap > 1 && gap < ordered.length - 1;
}

export function kindEdgeIds(document: CityDocument, kind: FeatureGroup["kind"]): Set<Id> {
  const ids = new Set<Id>();
  for (const group of document.featureGroups) {
    if (group.kind !== kind) continue;
    if (group.kind === "river") {
      for (let i = 1; i < group.vertices.length; i++) {
        const edge = edgeBetween(document.mesh, group.vertices[i - 1], group.vertices[i]);
        if (edge) ids.add(edge.id);
      }
    } else {
      for (const segment of group.segments) ids.add(segment.edgeId);
    }
  }
  return ids;
}

/** A barrier and its two passage arms alternate around a 4-way (or richer) vertex. */
export function vertexHasKindPassage(document: CityDocument, vertexId: Id, kind: BarrierKind): boolean {
  return throughEdgesAt(document, vertexId, kind).length === 2;
}

/** The four selected rays must alternate A, B, A, B around the junction.
 * Merely having four edges (or two individually non-adjacent pairs) is insufficient. */
export function alternatingPairs(ordered: Edge[], a: Id[], b: Id[]): boolean {
  if (a.length !== 2 || b.length !== 2 || new Set([...a, ...b]).size !== 4) return false;
  const rays = ordered.filter(e => a.includes(e.id) || b.includes(e.id));
  return rays.length === 4 && rays.every((e, i) => a.includes(e.id) !== a.includes(rays[(i + 1) % 4].id));
}

export function vertexHasCrossing(
  document: CityDocument,
  vertexId: Id,
  first: BarrierKind,
  second: FeatureGroup["kind"]
): boolean {
  const ordered = orderedIncidentEdges(document, vertexId);
  const aIds = kindEdgeIds(document, first);
  const bIds = kindEdgeIds(document, second);
  const a = ordered.filter(e => aIds.has(e.id)).map(e => e.id);
  const b = ordered.filter(e => bIds.has(e.id)).map(e => e.id);
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      if (alternatingPairs(ordered, a, [b[i], b[j]])) return true;
    }
  return false;
}

/** One non-barrier arm on each side; no same-side fallback is permitted. */
export function throughEdgesAt(document: CityDocument, vertexId: Id, barrier: BarrierKind): Edge[] {
  const ordered = orderedIncidentEdges(document, vertexId);
  const banned = kindEdgeIds(document, barrier);
  const used = ordered.filter(edge => banned.has(edge.id)).map(edge => edge.id);
  const free = ordered.filter(edge => !banned.has(edge.id));
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (alternatingPairs(ordered, used, [free[i].id, free[j].id])) return [free[i], free[j]];
    }
  }
  return [];
}

/**
 * Raise a meeting vertex to a 4-way passage for `barrier`. Prefers merging the
 * geometrically nearest neighbour that already sits on the barrier; falls back
 * to splitting the largest incident cell along a diagonal from this vertex.
 */
export function openBarrierPassage(document: CityDocument, vertexId: Id, barrier: BarrierKind): CityDocument | null {
  if (!document.mesh.vertices[vertexId]) return null;
  let next = document;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (vertexHasKindPassage(next, vertexId, barrier)) return next === document ? document : next;
    const merged = mergeNearestBarrierNeighbour(next, vertexId, barrier);
    if (merged) {
      next = merged;
      continue;
    }
    const split = splitLargestIncidentFace(next, vertexId);
    if (split) {
      next = split;
      continue;
    }
    break;
  }
  return vertexHasKindPassage(next, vertexId, barrier) ? next : null;
}

/** Collapse the wall/river's shared boundary span into one centred crossing.
 * Both routes retain two opposite arms; their intersection is a real vertex. */
export function joinWallRiverCrossings(document: CityDocument): CityDocument {
  let next = document;
  for (let pass = 0; pass < 64; pass++) {
    const walls = kindEdgeIds(next, "wall");
    const rivers = kindEdgeIds(next, "river");
    const shared = [...walls].filter(id => rivers.has(id));
    let changed = false;
    for (const id of shared) {
      const edge = next.mesh.edges[id];
      const a = next.mesh.vertices[edge.a].point;
      const b = next.mesh.vertices[edge.b].point;
      const merged = mergeVertices(next, edge.a, edge.b);
      if (!merged) continue;
      next = moveVertex(merged, edge.a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) ?? merged;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return next;
}

/** Materialize the two road arms of a bridge, rather than just reserving an
 * unused degree-four river vertex for a later pathfinder. */
export function addBridge(document: CityDocument, vertexId: Id, id: Id): CityDocument | null {
  const through = throughEdgesAt(document, vertexId, "river");
  const walls = kindEdgeIds(document, "wall");
  if (through.length !== 2 || through.some(e => walls.has(e.id))) return null;
  if (
    through.some(e =>
      [e.leftFace, e.rightFace].some(fid => fid && document.mesh.faces[fid].properties.water !== "land")
    )
  )
    return null;
  const next = clone(document);
  const [a, b] = through;
  next.featureGroups.push({
    id,
    kind: "road",
    name: "Bridge",
    locked: false,
    segments: [
      { edgeId: a.id, forward: a.b === vertexId },
      { edgeId: b.id, forward: b.a === vertexId }
    ],
    style: { widthMeters: Math.max(4, document.frame.blockSizeMeters * 0.16), color: "#735238" }
  });
  return next;
}

/** Completed generation must never publish a decorative gate or a disconnected
 * wall/river crossing. Kept separate from legacy-file structural validation. */
export function validGeneratedCrossings(document: CityDocument): boolean {
  for (const gate of document.gates) {
    if (gate.id.startsWith("gc:") && !vertexHasCrossing(document, gate.vertexId, "wall", "road")) return false;
  }
  const walls = kindEdgeIds(document, "wall");
  const rivers = kindEdgeIds(document, "river");
  if ([...walls].some(id => rivers.has(id))) return false;
  const wallVertices = new Set([...walls].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  const riverVertices = new Set([...rivers].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  for (const id of wallVertices)
    if (riverVertices.has(id) && !vertexHasCrossing(document, id, "wall", "river")) return false;
  for (const bridge of document.featureGroups.filter(g => g.id.startsWith("gc:bridge-"))) {
    const vertices = featureGroupVertices(document, bridge);
    if (vertices.length !== 3 || !vertexHasCrossing(document, vertices[1], "river", "road")) return false;
  }
  for (const river of document.featureGroups) {
    if (river.kind !== "river" || !river.id.startsWith("gc:")) continue;
    const dividesTown = river.vertices.slice(1).some((id, i) => {
      const edge = edgeBetween(document.mesh, river.vertices[i], id);
      return (
        edge &&
        [edge.leftFace, edge.rightFace].every(
          fid =>
            fid && document.mesh.faces[fid].properties.water === "land" && document.mesh.faces[fid].properties.buildable
        )
      );
    });
    if (dividesTown && !river.vertices.some(id => vertexHasCrossing(document, id, "river", "road"))) return false;
  }
  return true;
}

/** Open wall passages at every gate, then river bridges at every road–river meeting. */
export function openGeneratedPassages(document: CityDocument): CityDocument {
  let next = document;
  for (const gate of next.gates ?? []) {
    if (!next.mesh.vertices[gate.vertexId]) continue;
    if (vertexHasKindPassage(next, gate.vertexId, "wall")) continue;
    const opened = openBarrierPassage(next, gate.vertexId, "wall");
    if (opened) next = opened;
  }
  for (const vertexId of meetingVertices(next, "road", "river")) {
    if (!next.mesh.vertices[vertexId]) continue;
    if (vertexHasKindPassage(next, vertexId, "river")) continue;
    const opened = openBarrierPassage(next, vertexId, "river");
    if (opened) next = opened;
  }
  return extendRoadsThroughPassages(next);
}

function mergeNearestBarrierNeighbour(document: CityDocument, vertexId: Id, barrier: BarrierKind): CityDocument | null {
  const vertex = document.mesh.vertices[vertexId];
  if (!vertex) return null;
  const barrierEdges = kindEdgeIds(document, barrier);
  let best: Id | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const edge of incidentEdges(document.mesh, vertexId)) {
    if (!barrierEdges.has(edge.id)) continue;
    const otherId = edge.a === vertexId ? edge.b : edge.a;
    const other = document.mesh.vertices[otherId];
    if (!other) continue;
    const dist = Math.hypot(other.point[0] - vertex.point[0], other.point[1] - vertex.point[1]);
    if (dist < bestDist) {
      bestDist = dist;
      best = otherId;
    }
  }
  return best ? mergeVertices(document, vertexId, best) : null;
}

function splitLargestIncidentFace(document: CityDocument, vertexId: Id): CityDocument | null {
  const faces = incidentFaces(document.mesh, vertexId)
    .map(face => ({ face, vertices: faceVertices(document.mesh, face) }))
    .filter(item => item.vertices.includes(vertexId) && item.vertices.length >= 4)
    .sort((a, b) => b.vertices.length - a.vertices.length);
  const origin = document.mesh.vertices[vertexId]?.point;
  if (!origin) return null;
  for (const { face, vertices } of faces) {
    const index = vertices.indexOf(vertexId);
    let best: Id | null = null;
    let bestDist = -1;
    for (let i = 0; i < vertices.length; i++) {
      if (i === index) continue;
      const step = Math.abs(i - index);
      const adjacent = step === 1 || step === vertices.length - 1;
      if (adjacent || edgeBetween(document.mesh, vertexId, vertices[i])) continue;
      const point = document.mesh.vertices[vertices[i]]?.point;
      if (!point) continue;
      const dist = Math.hypot(point[0] - origin[0], point[1] - origin[1]);
      if (dist > bestDist) {
        bestDist = dist;
        best = vertices[i];
      }
    }
    if (!best) continue;
    const split = splitFace(document, face.id, vertexId, best);
    if (split) return split;
  }
  return null;
}

function meetingVertices(document: CityDocument, a: FeatureGroup["kind"], b: FeatureGroup["kind"]): Id[] {
  const ofKind = (kind: FeatureGroup["kind"]): Set<Id> => {
    const ids = new Set<Id>();
    for (const group of document.featureGroups) {
      if (group.kind !== kind) continue;
      for (const vertexId of featureGroupVertices(document, group)) ids.add(vertexId);
    }
    return ids;
  };
  const first = ofKind(a);
  const second = ofKind(b);
  return [...first].filter(id => second.has(id));
}

function extendRoadsThroughPassages(document: CityDocument): CityDocument {
  let next = document;
  const vertices = new Set<Id>();
  for (const gate of next.gates ?? []) vertices.add(gate.vertexId);
  for (const id of meetingVertices(next, "road", "river")) vertices.add(id);
  for (const vertexId of vertices) {
    if (!next.mesh.vertices[vertexId]) continue;
    const barrier: BarrierKind | null = vertexHasKindPassage(next, vertexId, "wall")
      ? "wall"
      : vertexHasKindPassage(next, vertexId, "river")
        ? "river"
        : null;
    if (!barrier) continue;
    const extended = extendRoadThrough(next, vertexId, barrier);
    if (extended) next = extended;
  }
  return next;
}

function extendRoadThrough(document: CityDocument, vertexId: Id, barrier: BarrierKind): CityDocument | null {
  const through = throughEdgesAt(document, vertexId, barrier);
  if (through.length < 1) return null;
  const touching = document.featureGroups.find(
    group => group.kind === "road" && featureGroupVertices(document, group).includes(vertexId)
  );
  if (!touching) return null;
  let next = document;
  const roadId = touching.id;
  let changed = false;
  for (const edge of through) {
    const group = next.featureGroups.find(candidate => candidate.id === roadId);
    if (!group || groupUsesEdge(next, group, edge.id)) continue;
    const appended = appendEdge(next, roadId, edge.id);
    if (appended) {
      next = appended;
      changed = true;
    }
  }
  return changed ? next : null;
}
