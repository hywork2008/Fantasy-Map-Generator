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
import type { CityDocument, Edge, FeatureGroup, Id, Point } from "./types";

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

/** One non-barrier arm on each side; no same-side fallback is permitted. Prefers the pair closest to a straight 180° line. */
export function throughEdgesAt(document: CityDocument, vertexId: Id, barrier: BarrierKind): Edge[] {
  const ordered = orderedIncidentEdges(document, vertexId);
  const banned = kindEdgeIds(document, barrier);
  const used = ordered.filter(edge => banned.has(edge.id)).map(edge => edge.id);
  const free = ordered.filter(edge => !banned.has(edge.id));
  const origin = document.mesh.vertices[vertexId]?.point;
  let bestPair: [Edge, Edge] | null = null;
  let bestStraightness = 1; // want minimum dot product (closest to -1)

  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (alternatingPairs(ordered, used, [free[i].id, free[j].id])) {
        if (!origin) return [free[i], free[j]];
        const p1 = document.mesh.vertices[free[i].a === vertexId ? free[i].b : free[i].a]?.point;
        const p2 = document.mesh.vertices[free[j].a === vertexId ? free[j].b : free[j].a]?.point;
        if (!p1 || !p2) return [free[i], free[j]];
        const dx1 = p1[0] - origin[0];
        const dy1 = p1[1] - origin[1];
        const dx2 = p2[0] - origin[0];
        const dy2 = p2[1] - origin[1];
        const l1 = Math.hypot(dx1, dy1) || 1;
        const l2 = Math.hypot(dx2, dy2) || 1;
        const dot = (dx1 * dx2 + dy1 * dy2) / (l1 * l2);
        if (dot < bestStraightness) {
          bestStraightness = dot;
          bestPair = [free[i], free[j]];
        }
      }
    }
  }
  return bestPair ? [bestPair[0], bestPair[1]] : [];
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
  return straightenBridge(next, id);
}

function tryMoveVertex(document: CityDocument, vertexId: Id, target: Point): CityDocument {
  const v = document.mesh.vertices[vertexId];
  if (!v || v.locked) return document;
  const start = v.point;
  for (let s = 1.0; s >= 0.125; s /= 2) {
    const candidate: Point = [start[0] + (target[0] - start[0]) * s, start[1] + (target[1] - start[1]) * s];
    const moved = moveVertex(document, vertexId, candidate);
    if (moved) return moved;
  }
  return document;
}

/**
 * Straighten a river bridge and align its crossing to the shortest path
 * (perpendicular to the river), resolving L-shaped or V-shaped bent bridges.
 */
export function straightenBridge(document: CityDocument, bridgeId: Id): CityDocument {
  const bridge = document.featureGroups.find(g => g.id === bridgeId);
  if (bridge?.segments.length !== 2) return document;

  const { mesh } = document;
  const e0 = mesh.edges[bridge.segments[0].edgeId];
  const e1 = mesh.edges[bridge.segments[1].edgeId];
  if (!e0 || !e1) return document;

  const v0 = [e0.a, e0.b];
  const v1 = [e1.a, e1.b];
  const midId = v0.find(id => v1.includes(id));
  if (!midId) return document;

  const aId = v0.find(id => id !== midId);
  const bId = v1.find(id => id !== midId);
  if (!aId || !bId) return document;

  let next = document;
  let A = next.mesh.vertices[aId]?.point;
  let M = next.mesh.vertices[midId]?.point;
  let B = next.mesh.vertices[bId]?.point;
  if (!A || !M || !B) return document;

  // Find local river tangent & normal at M
  const rivers = next.featureGroups.filter(g => g.kind === "river");
  let riverTangent: Point | null = null;
  for (const river of rivers) {
    const idx = river.vertices.indexOf(midId);
    if (idx !== -1) {
      const prevId = river.vertices[Math.max(0, idx - 1)];
      const nextId = river.vertices[Math.min(river.vertices.length - 1, idx + 1)];
      const pPrev = next.mesh.vertices[prevId]?.point;
      const pNext = next.mesh.vertices[nextId]?.point;
      if (pPrev && pNext) {
        const tx = pNext[0] - pPrev[0];
        const ty = pNext[1] - pPrev[1];
        const len = Math.hypot(tx, ty) || 1;
        riverTangent = [tx / len, ty / len];
        break;
      }
    }
  }
  if (!riverTangent) return document;

  // Unit normal to river tangent pointing generally from A to B
  let normal: Point = [-riverTangent[1], riverTangent[0]];
  const ab = [B[0] - A[0], B[1] - A[1]];
  if (normal[0] * ab[0] + normal[1] * ab[1] < 0) {
    normal = [-normal[0], -normal[1]];
  }

  const vA = [M[0] - A[0], M[1] - A[1]];
  const lenA = Math.hypot(vA[0], vA[1]);
  const uA: Point = [vA[0] / lenA, vA[1] / lenA];

  const vB = [B[0] - M[0], B[1] - M[1]];
  const lenB = Math.hypot(vB[0], vB[1]);
  const uB: Point = [vB[0] / lenB, vB[1] / lenB];

  const vAB = [B[0] - A[0], B[1] - A[1]];
  const lenAB = Math.hypot(vAB[0], vAB[1]) || 1;
  const uAB: Point = [vAB[0] / lenAB, vAB[1] / lenAB];
  const chordAlignment = uAB[0] * normal[0] + uAB[1] * normal[1];

  const dotAB = uA[0] * uB[0] + uA[1] * uB[1];
  const cA = uA[0] * normal[0] + uA[1] * normal[1];
  const cB = uB[0] * normal[0] + uB[1] * normal[1];

  // Step 1: L-shape alignment
  // If the bridge bends significantly and one arm deviates along the river, straighten that arm
  if (dotAB < 0.98) {
    if (cA > cB + 0.15) {
      // Arm A is well aligned to river normal; extend it to position B
      const targetB: Point = [M[0] + uA[0] * lenB, M[1] + uA[1] * lenB];
      next = tryMoveVertex(next, bId, targetB);
    } else if (cB > cA + 0.15) {
      // Arm B is well aligned; extend backwards to position A
      const targetA: Point = [M[0] - uB[0] * lenA, M[1] - uB[1] * lenA];
      next = tryMoveVertex(next, aId, targetA);
    } else if (chordAlignment < 0.7) {
      // Both arms and overall chord deviate from perpendicular; align both along river normal
      next = tryMoveVertex(next, aId, [M[0] - normal[0] * lenA, M[1] - normal[1] * lenA]);
      next = tryMoveVertex(next, bId, [M[0] + normal[0] * lenB, M[1] + normal[1] * lenB]);
    }
  }

  // Step 2: V-shape projection of M onto the line A-B
  A = next.mesh.vertices[aId]?.point;
  M = next.mesh.vertices[midId]?.point;
  B = next.mesh.vertices[bId]?.point;
  if (A && M && B) {
    const dirAB = [B[0] - A[0], B[1] - A[1]];
    const lenABsq = dirAB[0] * dirAB[0] + dirAB[1] * dirAB[1];
    if (lenABsq > 0) {
      const t = ((M[0] - A[0]) * dirAB[0] + (M[1] - A[1]) * dirAB[1]) / lenABsq;
      if (t > 0.05 && t < 0.95) {
        const targetM: Point = [A[0] + t * dirAB[0], A[1] + t * dirAB[1]];
        next = tryMoveVertex(next, midId, targetM);
      }
    }
  }

  return next;
}

export function straightenBridges(document: CityDocument): CityDocument {
  let next = document;
  for (const bridge of next.featureGroups.filter(g => g.id.startsWith("gc:bridge-"))) {
    next = straightenBridge(next, bridge.id);
  }
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
  next = extendRoadsThroughPassages(next);
  return straightenBridges(next);
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
