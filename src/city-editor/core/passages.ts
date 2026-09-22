import { isSimplePolygon, pointInPolygon, polygonArea, polygonCentroid, segmentSegmentHit } from "./gen/geom";
import { defaultRoadWidthMeters } from "./gen/settlementExtent";
// 4-way passages (gates / bridges) for generated routes.
//
// River, road and wall must not share an edge (Phase G7). They MAY share a
// vertex when that vertex has >= 4 incident edges and the two kinds use
// opposite (diagonal) pairs — a gate or a bridge. When they meet at a vertex
// of degree < 4, raise the degree by merging the nearest neighbour on the
// barrier, or by splitting an incident cell, then thread the road through.

import { appendEdge, createGroup, featureGroupVertices, groupUsesEdge } from "./features";
import {
  clone,
  edgeBetween,
  facePoints,
  faceVertices,
  incidentEdges,
  incidentFaces,
  insertEdgeVertex,
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
 * Raise a meeting vertex to a 4-way passage for `barrier`. Prefers splitting
 * incident cells along opposite diagonals to create a 4-way passage without
 * altering the barrier geometry.
 */
export function openBarrierPassage(document: CityDocument, vertexId: Id, barrier: BarrierKind): CityDocument | null {
  if (!document.mesh.vertices[vertexId]) return null;
  let next = document;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (vertexHasKindPassage(next, vertexId, barrier)) return next === document ? document : next;

    // Prioritize cell splitting so gates and passages become 4-way junctions without merging vertices
    const split = splitBarrierPassageFace(next, vertexId, barrier);
    if (split) {
      next = split;
      if (vertexHasKindPassage(next, vertexId, barrier)) return next;
      continue;
    }

    if (document.gridKind === "evolution") {
      const coarseSplit = splitCoarsePassage(next, vertexId, barrier);
      if (coarseSplit) return coarseSplit;
    }

    // For walls, do NOT merge when faces exist (gates must not collapse wall geometry).
    // Only fall back to merge for river crossings or if faces topology is empty (legacy test mocks).
    const hasFaces = Object.keys(next.mesh.faces).length > 0;
    if (barrier !== "wall" || !hasFaces) {
      const merged = mergeNearestBarrierNeighbour(next, vertexId, barrier);
      if (merged) {
        next = merged;
        continue;
      }
    }

    const faceSplit = splitLargestIncidentFace(next, vertexId);
    if (faceSplit) {
      next = faceSplit;
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
  let next = clone(document);
  let [a, b] = through;
  if (document.gridKind === "evolution") {
    const river = document.featureGroups.find(g => g.kind === "river" && g.vertices.includes(vertexId));
    const radius = (river?.style.widthMeters ?? 12) / 2 + 6;
    const arms: Edge[] = [];
    for (const edge of through) {
      const origin = next.mesh.vertices[vertexId].point;
      const other = next.mesh.vertices[edge.a === vertexId ? edge.b : edge.a].point;
      const t = Math.min(0.45, radius / Math.hypot(other[0] - origin[0], other[1] - origin[1]));
      const split = insertEdgeVertex(next, edge.id, edge.a === vertexId ? t : 1 - t);
      if (!split) return null;
      next = split.document;
      arms.push(edgeBetween(next.mesh, vertexId, split.vertexId)!);
    }
    [a, b] = arms;
  }
  next.featureGroups.push({
    id,
    kind: "road",
    name: "Bridge",
    locked: false,
    segments: [
      { edgeId: a.id, forward: a.b === vertexId },
      { edgeId: b.id, forward: b.a === vertexId }
    ],
    style: { widthMeters: defaultRoadWidthMeters(document.frame.extentMeters), color: "#735238" }
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
    if (!moved) continue;
    const invalid = incidentFaces(document.mesh, vertexId).some(face => {
      const movedFace = moved.mesh.faces[face.id];
      if (!movedFace) return true;
      const points = facePoints(moved.mesh, movedFace);
      if (face.properties.locked || !isSimplePolygon(points)) return true;
      const origArea = polygonArea(facePoints(document.mesh, face));
      const newArea = polygonArea(points);
      if (origArea !== 0 && newArea / origArea < (document.gridKind === "evolution" ? 0.5 : 0.12)) return true;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 2; j < points.length; j++) {
          if (i === 0 && j === points.length - 1) continue;
          if (segmentSegmentHit(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]))
            return true;
        }
      }
      return false;
    });
    if (invalid) continue;
    return moved;
  }
  return document;
}

/**
 * Straighten a river crossing (A -> M -> B) so it crosses perpendicular and straight,
 * resolving L-shaped and V-shaped bends.
 */
export function straightenRiverCrossing(document: CityDocument, aId: Id, midId: Id, bId: Id): CityDocument {
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

/**
 * Straighten a specific river bridge feature.
 */
export function straightenBridge(document: CityDocument, bridgeId: Id): CityDocument {
  const bridge = document.featureGroups.find(g => g.id === bridgeId);
  if (bridge?.kind !== "road" || bridge.segments.length !== 2) return document;

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

  return straightenRiverCrossing(document, aId, midId, bId);
}

/**
 * Straighten all road crossings over rivers (both explicit bridge features and road segments crossing rivers)
 * so that they cross the river along the shortest perpendicular path, eliminating L-shapes and V-shapes.
 */
export function straightenBridges(document: CityDocument): CityDocument {
  let next = document;
  const riverVertices = new Set<Id>();
  for (const group of next.featureGroups) {
    if (group.kind === "river") {
      for (const vid of group.vertices) riverVertices.add(vid);
    }
  }
  if (riverVertices.size === 0) return next;

  const processed = new Set<string>();

  for (const group of next.featureGroups) {
    if (group.kind !== "road") continue;
    const vids = featureGroupVertices(next, group);
    for (let i = 1; i < vids.length - 1; i++) {
      const midId = vids[i];
      if (!riverVertices.has(midId)) continue;
      const aId = vids[i - 1];
      const bId = vids[i + 1];
      const key = `${midId}:${aId < bId ? `${aId},${bId}` : `${bId},${aId}`}`;
      if (processed.has(key)) continue;
      processed.add(key);
      next = straightenRiverCrossing(next, aId, midId, bId);
    }
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

/** Human-readable "how" for a rejected complete city: every broken gate, shared
 * edge, or unbridged town-dividing river. Empty when crossings are valid. */
export function explainGeneratedCrossingFailures(document: CityDocument): string[] {
  const details: string[] = [];
  for (const gate of document.gates) {
    if (gate.id.startsWith("gc:") && !vertexHasCrossing(document, gate.vertexId, "wall", "road"))
      details.push(`門 ${gate.id}（頂点 ${gate.vertexId}）に城壁と道路の十字交差がない`);
  }
  const walls = kindEdgeIds(document, "wall");
  const rivers = kindEdgeIds(document, "river");
  for (const id of walls) if (rivers.has(id)) details.push(`城壁と河川が辺 ${id} を共有している`);
  const wallVertices = new Set([...walls].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  const riverVertices = new Set([...rivers].flatMap(id => [document.mesh.edges[id].a, document.mesh.edges[id].b]));
  for (const id of wallVertices)
    if (riverVertices.has(id) && !vertexHasCrossing(document, id, "wall", "river"))
      details.push(`頂点 ${id} で城壁と河川が交わるが十字交差になっていない`);
  for (const bridge of document.featureGroups.filter(g => g.id.startsWith("gc:bridge-"))) {
    const vertices = featureGroupVertices(document, bridge);
    if (vertices.length !== 3)
      details.push(`橋 ${bridge.id} の頂点数が ${vertices.length} で、3（道路–河川–道路）ではない`);
    else if (!vertexHasCrossing(document, vertices[1], "river", "road"))
      details.push(`橋 ${bridge.id}（頂点 ${vertices[1]}）に河川と道路の十字交差がない`);
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
    if (dividesTown && !river.vertices.some(id => vertexHasCrossing(document, id, "river", "road")))
      details.push(`河川 ${river.id} が市街地を分断しているが橋がない`);
  }
  return details;
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

function splitCoarsePassage(document: CityDocument, vertexId: Id, barrier: BarrierKind): CityDocument | null {
  const a = document.mesh.vertices[vertexId].point;
  for (const face of incidentFaces(document.mesh, vertexId)) {
    if (face.properties.locked || face.properties.water !== "land") continue;
    const ids = faceVertices(document.mesh, face);
    const polygon = facePoints(document.mesh, face);
    for (const target of ids) {
      if (target === vertexId || document.mesh.vertices[target].locked || edgeBetween(document.mesh, vertexId, target))
        continue;
      const b = document.mesh.vertices[target].point;
      if (!pointInPolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], polygon)) continue;
      if (
        polygon.some((p, i) => {
          if ([vertexId, target].includes(ids[i]) || [vertexId, target].includes(ids[(i + 1) % ids.length]))
            return false;
          return !!segmentSegmentHit(a, b, p, polygon[(i + 1) % polygon.length]);
        })
      )
        continue;
      const split = splitFace(document, face.id, vertexId, target);
      if (!split || !vertexHasKindPassage(split, vertexId, barrier)) continue;
      const pieces = Object.values(split.mesh.faces).filter(f => f.id === face.id || !document.mesh.faces[f.id]);
      if (pieces.some(f => Math.abs(polygonArea(facePoints(split.mesh, f))) < 80)) continue;
      return split;
    }
  }
  return null;
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

/**
 * Subdivide/split incident cells at a barrier vertex so that the vertex acquires
 * through-arms on both sides of the barrier without moving or merging any vertices.
 */
function splitBarrierPassageFace(document: CityDocument, vertexId: Id, barrier: BarrierKind): CityDocument | null {
  const v = document.mesh.vertices[vertexId];
  if (!v || v.locked) return null;
  const origin = v.point;

  const barrierEdges = kindEdgeIds(document, barrier);
  const riverEdges = kindEdgeIds(document, "river");
  const riverVertices = new Set(
    [...riverEdges].flatMap(id =>
      document.mesh.edges[id] ? [document.mesh.edges[id].a, document.mesh.edges[id].b] : []
    )
  );
  const incident = incidentEdges(document.mesh, vertexId);
  const barrierIncident = incident.filter(e => barrierEdges.has(e.id));
  if (barrierIncident.length < 2) return null;

  let e0 = barrierIncident[0];
  let e1 = barrierIncident[1];
  if (barrierIncident.length > 2) {
    let bestDot = 1;
    for (let i = 0; i < barrierIncident.length; i++) {
      for (let j = i + 1; j < barrierIncident.length; j++) {
        const edgeI = barrierIncident[i];
        const edgeJ = barrierIncident[j];
        const pI = document.mesh.vertices[edgeI.a === vertexId ? edgeI.b : edgeI.a]?.point;
        const pJ = document.mesh.vertices[edgeJ.a === vertexId ? edgeJ.b : edgeJ.a]?.point;
        if (!pI || !pJ) continue;
        const dxI = pI[0] - origin[0],
          dyI = pI[1] - origin[1];
        const dxJ = pJ[0] - origin[0],
          dyJ = pJ[1] - origin[1];
        const dot = (dxI * dxJ + dyI * dyJ) / ((Math.hypot(dxI, dyI) || 1) * (Math.hypot(dxJ, dyJ) || 1));
        if (dot < bestDot) {
          bestDot = dot;
          e0 = edgeI;
          e1 = edgeJ;
        }
      }
    }
  }

  const p0 = document.mesh.vertices[e0.a === vertexId ? e0.b : e0.a]?.point;
  const p1 = document.mesh.vertices[e1.a === vertexId ? e1.b : e1.a]?.point;
  if (!p0 || !p1) return null;

  const a0 = (Math.atan2(p0[1] - origin[1], p0[0] - origin[0]) + 2 * Math.PI) % (2 * Math.PI);
  const a1 = (Math.atan2(p1[1] - origin[1], p1[0] - origin[0]) + 2 * Math.PI) % (2 * Math.PI);
  const alpha = Math.min(a0, a1);
  const beta = Math.max(a0, a1);

  const span1 = beta - alpha;
  const span2 = 2 * Math.PI - span1;
  const mid1 = alpha + span1 / 2;
  const mid2 = (beta + span2 / 2) % (2 * Math.PI);

  const inSector1 = (th: number): boolean => th > alpha + 1e-3 && th < beta - 1e-3;
  const inSector2 = (th: number): boolean => th > beta + 1e-3 || th < alpha - 1e-3;

  const nonBarrierEdges = incident.filter(e => !barrierEdges.has(e.id));
  const s1Edges: Edge[] = [];
  const s2Edges: Edge[] = [];
  for (const edge of nonBarrierEdges) {
    const pt = document.mesh.vertices[edge.a === vertexId ? edge.b : edge.a]?.point;
    if (!pt) continue;
    const th = (Math.atan2(pt[1] - origin[1], pt[0] - origin[0]) + 2 * Math.PI) % (2 * Math.PI);
    if (inSector1(th)) s1Edges.push(edge);
    else if (inSector2(th)) s2Edges.push(edge);
  }

  if (s1Edges.length > 0 && s2Edges.length > 0) {
    return document;
  }

  let next = document;

  const splitInSector = (doc: CityDocument, sector: 1 | 2, existingOppositeEdge?: Edge): CityDocument | null => {
    const sectorBisector = sector === 1 ? mid1 : mid2;
    let baseAngle = sectorBisector;

    if (existingOppositeEdge) {
      const oppPt =
        doc.mesh.vertices[existingOppositeEdge.a === vertexId ? existingOppositeEdge.b : existingOppositeEdge.a]?.point;
      if (oppPt) {
        const straightAngle = (Math.atan2(origin[1] - oppPt[1], origin[0] - oppPt[0]) + 2 * Math.PI) % (2 * Math.PI);
        const inTarget = sector === 1 ? inSector1(straightAngle) : inSector2(straightAngle);
        if (inTarget) {
          const dAlpha = Math.abs(straightAngle - alpha);
          const dBeta = Math.abs(straightAngle - beta);
          const margin = Math.min(dAlpha, 2 * Math.PI - dAlpha, dBeta, 2 * Math.PI - dBeta);
          if (margin > 0.15) baseAngle = straightAngle;
        }
      }
    }

    const testAngles = [baseAngle];
    for (let offset = 0.15; offset <= 0.6; offset += 0.15) {
      const aPlus = (baseAngle + offset + 2 * Math.PI) % (2 * Math.PI);
      const aMinus = (baseAngle - offset + 2 * Math.PI) % (2 * Math.PI);
      if (sector === 1 ? inSector1(aPlus) : inSector2(aPlus)) testAngles.push(aPlus);
      if (sector === 1 ? inSector1(aMinus) : inSector2(aMinus)) testAngles.push(aMinus);
    }

    const faces = incidentFaces(doc.mesh, vertexId).filter(f => !f.properties.locked && f.properties.water !== "sea");
    if (!faces.length) return null;

    if (barrier === "wall") {
      for (const face of faces) {
        for (const ref of face.boundary) {
          const edge = doc.mesh.edges[ref.edgeId];
          if (!edge || edge.a === vertexId || edge.b === vertexId) continue;
          if (riverEdges.has(edge.id)) continue;
          const pA = doc.mesh.vertices[edge.a]?.point;
          const pB = doc.mesh.vertices[edge.b]?.point;
          if (!pA || !pB) continue;
          const mid: Point = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2];
          const ang = (Math.atan2(mid[1] - origin[1], mid[0] - origin[0]) + 2 * Math.PI) % (2 * Math.PI);
          if (sector === 1 ? inSector1(ang) : inSector2(ang)) {
            if (!testAngles.some(ta => Math.abs(ta - ang) < 0.05)) testAngles.push(ang);
          }
        }
      }
    }

    for (const targetAngle of testAngles) {
      const probeDir: Point = [Math.cos(targetAngle), Math.sin(targetAngle)];

      let targetFace = faces.find(f => {
        const pts = facePoints(doc.mesh, f);
        return (
          pointInPolygon([origin[0] + 0.5 * probeDir[0], origin[1] + 0.5 * probeDir[1]], pts) ||
          pointInPolygon([origin[0] + 0.1 * probeDir[0], origin[1] + 0.1 * probeDir[1]], pts)
        );
      });

      if (!targetFace) {
        const bisectDir: Point = [Math.cos(sectorBisector), Math.sin(sectorBisector)];
        targetFace = faces.find(f => {
          const pts = facePoints(doc.mesh, f);
          return (
            pointInPolygon([origin[0] + 0.5 * bisectDir[0], origin[1] + 0.5 * bisectDir[1]], pts) ||
            pointInPolygon([origin[0] + 0.1 * bisectDir[0], origin[1] + 0.1 * bisectDir[1]], pts)
          );
        });
      }

      if (!targetFace) continue;

      const fVids = faceVertices(doc.mesh, targetFace);
      const fPts = facePoints(doc.mesh, targetFace);
      const fIdx = fVids.indexOf(vertexId);
      if (fIdx < 0) continue;
      const origArea = Math.abs(polygonArea(fPts));

      // Strategy 1: Check existing non-adjacent vertices
      const candidates: Array<{ vid: Id; score: number }> = [];
      for (let i = 0; i < fVids.length; i++) {
        const vid = fVids[i];
        if (vid === vertexId) continue;
        if (barrier === "wall" && riverVertices.has(vid)) continue;
        const step = Math.abs(i - fIdx);
        if (step === 1 || step === fVids.length - 1) continue;
        if (edgeBetween(doc.mesh, vertexId, vid)) continue;
        const pt = doc.mesh.vertices[vid]?.point;
        if (!pt || doc.mesh.vertices[vid]?.locked) continue;

        const vAngle = (Math.atan2(pt[1] - origin[1], pt[0] - origin[0]) + 2 * Math.PI) % (2 * Math.PI);
        const inSec = sector === 1 ? inSector1(vAngle) : inSector2(vAngle);
        if (!inSec) continue;

        const midPt: Point = [(origin[0] + pt[0]) / 2, (origin[1] + pt[1]) / 2];
        if (!pointInPolygon(midPt, fPts)) continue;

        const hits = fPts.some((p, k) => {
          const nextK = (k + 1) % fPts.length;
          if ([vertexId, vid].includes(fVids[k]) || [vertexId, vid].includes(fVids[nextK])) return false;
          return !!segmentSegmentHit(origin, pt, p, fPts[nextK]);
        });
        if (hits) continue;

        const dx = pt[0] - origin[0];
        const dy = pt[1] - origin[1];
        const len = Math.hypot(dx, dy) || 1;
        const dot = (dx * Math.cos(targetAngle) + dy * Math.sin(targetAngle)) / len;
        candidates.push({ vid, score: dot });
      }

      candidates.sort((a, b) => b.score - a.score);
      for (const cand of candidates) {
        if (cand.score < 0.3) break;
        const split = splitFace(doc, targetFace.id, vertexId, cand.vid);
        if (!split) continue;
        const pieces = Object.values(split.mesh.faces).filter(f => f.id === targetFace!.id || !doc.mesh.faces[f.id]);
        if (pieces.some(f => !isSimplePolygon(facePoints(split.mesh, f)))) continue;
        if (pieces.some(f => Math.abs(polygonArea(facePoints(split.mesh, f))) < Math.min(20, origArea * 0.1))) continue;
        for (const f of pieces) f.site = polygonCentroid(facePoints(split.mesh, f));
        return split;
      }

      // Strategy 2: Ray-cast against opposite edges of targetFace
      let bestHit: { edgeId: Id; fraction: number; dist: number } | null = null;
      for (let eIdx = 0; eIdx < targetFace.boundary.length; eIdx++) {
        const ref = targetFace.boundary[eIdx];
        const edge = doc.mesh.edges[ref.edgeId];
        if (!edge || edge.a === vertexId || edge.b === vertexId) continue;
        if (barrier === "wall" && riverEdges.has(edge.id)) continue;
        const pA = doc.mesh.vertices[edge.a]?.point;
        const pB = doc.mesh.vertices[edge.b]?.point;
        if (!pA || !pB) continue;

        const dx = pB[0] - pA[0];
        const dy = pB[1] - pA[1];
        const det = probeDir[0] * -dy - probeDir[1] * -dx;
        if (Math.abs(det) < 1e-6) continue;

        const rhsX = pA[0] - origin[0];
        const rhsY = pA[1] - origin[1];
        const s = (rhsX * -dy - rhsY * -dx) / det;
        const t = (probeDir[0] * rhsY - probeDir[1] * rhsX) / det;

        if (s > 0.5 && t >= 0 && t <= 1) {
          const hitPt: Point = [origin[0] + s * probeDir[0], origin[1] + s * probeDir[1]];
          const midPt: Point = [(origin[0] + hitPt[0]) / 2, (origin[1] + hitPt[1]) / 2];
          if (!pointInPolygon(midPt, fPts)) continue;

          // Ensure ray segment does not intersect any other boundary of the face
          const hitsOther = fPts.some((p, k) => {
            const nextK = (k + 1) % fPts.length;
            if (k === eIdx) return false;
            if ([fVids[k], fVids[nextK]].includes(vertexId)) return false;
            return !!segmentSegmentHit(origin, hitPt, p, fPts[nextK]);
          });
          if (hitsOther) continue;

          if (!bestHit || s < bestHit.dist) {
            bestHit = { edgeId: edge.id, fraction: t, dist: s };
          }
        }
      }

      if (bestHit) {
        const edge = doc.mesh.edges[bestHit.edgeId];
        const pA = doc.mesh.vertices[edge.a].point;
        const pB = doc.mesh.vertices[edge.b].point;
        const edgeLen = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);

        if (edgeLen < 2.05) {
          for (const endVid of [edge.a, edge.b]) {
            const step = Math.abs(fVids.indexOf(endVid) - fIdx);
            if (step !== 1 && step !== fVids.length - 1 && !edgeBetween(doc.mesh, vertexId, endVid)) {
              const split = splitFace(doc, targetFace.id, vertexId, endVid);
              if (split) {
                const pieces = Object.values(split.mesh.faces).filter(
                  f => f.id === targetFace!.id || !doc.mesh.faces[f.id]
                );
                if (pieces.some(f => !isSimplePolygon(facePoints(split.mesh, f)))) continue;
                if (pieces.some(f => Math.abs(polygonArea(facePoints(split.mesh, f))) < Math.min(20, origArea * 0.1)))
                  continue;
                for (const f of pieces) f.site = polygonCentroid(facePoints(split.mesh, f));
                return split;
              }
            }
          }
        } else {
          const minMargin = 1.05 / edgeLen;
          const clampedT = Math.max(minMargin, Math.min(1 - minMargin, bestHit.fraction));
          const inserted = insertEdgeVertex(doc, bestHit.edgeId, clampedT);
          if (inserted) {
            const split = splitFace(inserted.document, targetFace.id, vertexId, inserted.vertexId);
            if (split) {
              const pieces = Object.values(split.mesh.faces).filter(
                f => f.id === targetFace!.id || !doc.mesh.faces[f.id]
              );
              if (pieces.some(f => !isSimplePolygon(facePoints(split.mesh, f)))) continue;
              if (pieces.some(f => Math.abs(polygonArea(facePoints(split.mesh, f))) < Math.min(20, origArea * 0.1)))
                continue;
              for (const f of pieces) f.site = polygonCentroid(facePoints(split.mesh, f));
              return split;
            }
          }
        }
      }
    }

    return null;
  };

  if (s1Edges.length === 0 && s2Edges.length > 0) {
    const split = splitInSector(next, 1, s2Edges[0]);
    if (split) next = split;
  } else if (s2Edges.length === 0 && s1Edges.length > 0) {
    const split = splitInSector(next, 2, s1Edges[0]);
    if (split) next = split;
  } else if (s1Edges.length === 0 && s2Edges.length === 0) {
    const split1 = splitInSector(next, 1);
    if (split1) {
      next = split1;
      const newIncident = incidentEdges(next.mesh, vertexId).filter(e => !barrierEdges.has(e.id));
      const newS1 = newIncident.filter(e => {
        const pt = next.mesh.vertices[e.a === vertexId ? e.b : e.a]?.point;
        if (!pt) return false;
        const th = (Math.atan2(pt[1] - origin[1], pt[0] - origin[0]) + 2 * Math.PI) % (2 * Math.PI);
        return inSector1(th);
      });
      const split2 = splitInSector(next, 2, newS1[0]);
      if (split2) next = split2;
    }
  }

  return next === document ? null : next;
}

/**
 * Open a gate passage at `gateVertexId` via cell splitting (no vertex merging),
 * materializing the through-road across the wall and registering the gate.
 */
export function openGatePassage(document: CityDocument, gateVertexId: Id): CityDocument | null {
  const opened = openBarrierPassage(document, gateVertexId, "wall");
  if (!opened) return null;
  const through = throughEdgesAt(opened, gateVertexId, "wall");
  if (through.length !== 2) return null;
  let next = createGroup(opened, "road");
  const roadId = next.featureGroups.at(-1)?.id;
  if (!roadId) return null;
  for (const edge of through) {
    const appended = appendEdge(next, roadId, edge.id);
    if (!appended) return null;
    next = appended;
  }
  const existingGates = next.gates ?? [];
  let max = 0;
  for (const g of existingGates) {
    const m = g.id.match(/\d+$/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (n > max) max = n;
    }
  }
  next.gates = [...existingGates, { id: `gate-${max + 1}`, vertexId: gateVertexId, locked: false }];
  return next;
}
