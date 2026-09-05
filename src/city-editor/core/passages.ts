// 4-way passages (gates / bridges) for generated routes.
//
// River, road and wall must not share an edge (Phase G7). They MAY share a
// vertex when that vertex has >= 4 incident edges and the two kinds use
// opposite (diagonal) pairs — a gate or a bridge. When they meet at a vertex
// of degree < 4, raise the degree by merging the nearest neighbour on the
// barrier, or by splitting an incident cell, then thread the road through.

import { appendEdge, featureGroupVertices, groupUsesEdge } from "./features";
import { edgeBetween, faceVertices, incidentEdges, incidentFaces, mergeVertices, splitFace } from "./mesh";
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

/** A barrier occupies two edges at a 4-way (or richer) vertex, leaving two
 *  others for a road to pass through. Opposite pairing is preferred but not
 *  required — merge can leave irregular angles. */
export function vertexHasKindPassage(document: CityDocument, vertexId: Id, kind: BarrierKind): boolean {
  const ordered = orderedIncidentEdges(document, vertexId);
  if (ordered.length < 4) return false;
  const barrier = kindEdgeIds(document, kind);
  const used = ordered.filter(edge => barrier.has(edge.id));
  return used.length >= 2 && ordered.length - used.length >= 2;
}

/** Non-barrier incident edges; prefers an opposite pair when one exists. */
export function throughEdgesAt(document: CityDocument, vertexId: Id, barrier: BarrierKind): Edge[] {
  const ordered = orderedIncidentEdges(document, vertexId);
  const banned = kindEdgeIds(document, barrier);
  const free = ordered.filter(edge => !banned.has(edge.id));
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (edgesAreOpposite(ordered, free[i].id, free[j].id)) return [free[i], free[j]];
    }
  }
  return free.slice(0, 2);
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
    const degree = incidentEdges(next.mesh, vertexId).length;
    if (degree < 4) {
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
    break;
  }
  return next === document ? null : next;
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
