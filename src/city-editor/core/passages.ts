import { documentBridgeSkewLimit, overSkewedBridgeDecks } from "./bridgeDeck";
import { townGates } from "./fortifications";
import {
  isSimplePolygon,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  segmentSegmentHit
} from "./gen/geom";
import { defaultRoadWidthMeters, townExtentMeters } from "./gen/settlementExtent";
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
  indexMeshEdges,
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
  // Rivers store vertices; one index per call avoids a full edge scan per river step.
  const index = kind === "river" ? indexMeshEdges(document.mesh) : null;
  for (const group of document.featureGroups) {
    if (group.kind !== kind) continue;
    if (group.kind === "river") {
      for (let i = 1; i < group.vertices.length; i++) {
        const edge = index!.between(group.vertices[i - 1], group.vertices[i]);
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
  second: FeatureGroup["kind"],
  cachedAIds?: Set<Id>,
  cachedBIds?: Set<Id>
): boolean {
  const ordered = orderedIncidentEdges(document, vertexId);
  const aIds = cachedAIds ?? kindEdgeIds(document, first);
  const bIds = cachedBIds ?? kindEdgeIds(document, second);
  const a = ordered.filter(e => aIds.has(e.id)).map(e => e.id);
  const b = ordered.filter(e => bIds.has(e.id)).map(e => e.id);
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      if (alternatingPairs(ordered, a, [b[i], b[j]])) return true;
    }
  return false;
}

function riverVertexSet(document: CityDocument): Set<Id> {
  const ids = new Set<Id>();
  for (const group of document.featureGroups) if (group.kind === "river") for (const id of group.vertices) ids.add(id);
  return ids;
}

/** One non-barrier arm on each side; no same-side fallback is permitted. Prefers the pair closest to a straight 180° line.
 * `landOnly` drops an arm that ends on another river vertex, so a road cannot turn along the channel. */
export function throughEdgesAt(
  document: CityDocument,
  vertexId: Id,
  barrier: BarrierKind,
  landOnly = false,
  cachedBanned?: Set<Id>,
  cachedRiverVertices?: Set<Id>
): Edge[] {
  const ordered = orderedIncidentEdges(document, vertexId);
  const banned = cachedBanned ?? kindEdgeIds(document, barrier);
  const used = ordered.filter(edge => banned.has(edge.id)).map(edge => edge.id);
  const stayOnRiver = landOnly && barrier === "river" ? (cachedRiverVertices ?? riverVertexSet(document)) : null;
  const free = ordered.filter(edge => {
    if (banned.has(edge.id)) return false;
    if (!stayOnRiver) return true;
    return !stayOnRiver.has(edge.a === vertexId ? edge.b : edge.a);
  });
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

/** Construct only the two bank approaches for this water passage. Never
 * merge channel vertices or split unrelated river-side cells. */
export function openRiverWallPassage(document: CityDocument, vertexId: Id): CityDocument | null {
  const frame = riverCrossingFrame(document, vertexId);
  const origin = document.mesh.vertices[vertexId]?.point;
  if (!frame || !origin || document.mesh.vertices[vertexId].locked) return null;
  const normal: Point = [-frame.tangent[1], frame.tangent[0]];
  const wallHalfWidth = Math.max(
    2,
    ...document.featureGroups.flatMap(group =>
      group.kind === "wall" &&
      group.segments.some(ref => {
        const edge = document.mesh.edges[ref.edgeId];
        return edge.a === vertexId || edge.b === vertexId;
      })
        ? [group.style.widthMeters / 2]
        : []
    )
  );
  const clearance = frame.width / 2 + wallHalfWidth + 2;
  const riverPoints = document.featureGroups.flatMap(group =>
    group.kind === "river" ? [group.vertices.map(id => document.mesh.vertices[id].point)] : []
  );
  const existing = throughEdgesAt(document, vertexId, "river", true);
  if (
    existing.length === 2 &&
    existing.every(edge => {
      const p = document.mesh.vertices[edge.a === vertexId ? edge.b : edge.a].point;
      const dx = p[0] - origin[0],
        dy = p[1] - origin[1];
      return (
        Math.abs(dx * normal[0] + dy * normal[1]) / Math.max(1e-7, Math.hypot(dx, dy)) >= 0.5 &&
        riverPoints.every(line => nearestOnPolyline(p, line).dist >= clearance)
      );
    })
  )
    return document;
  let next = document;
  for (const sign of [-1, 1]) {
    const direction: Point = [normal[0] * sign, normal[1] * sign];
    const far: Point = [
      origin[0] + direction[0] * document.frame.extentMeters * 2,
      origin[1] + direction[1] * document.frame.extentMeters * 2
    ];
    let from = vertexId;
    let reachedBank = false;
    for (let step = 0; step < 4; step++) {
      const point = next.mesh.vertices[from].point;
      const riverEdges = kindEdgeIds(next, "river");
      const along = incidentEdges(next.mesh, from).find(edge => {
        if (riverEdges.has(edge.id)) return false;
        const other = next.mesh.vertices[edge.a === from ? edge.b : edge.a].point;
        const dx = other[0] - point[0],
          dy = other[1] - point[1];
        return dx * direction[0] + dy * direction[1] > 1 && Math.abs(dx * direction[1] - dy * direction[0]) < 1e-5;
      });
      if (along) {
        from = along.a === from ? along.b : along.a;
        if (riverPoints.every(line => nearestOnPolyline(next.mesh.vertices[from].point, line).dist >= clearance)) {
          reachedBank = true;
          break;
        }
        continue;
      }
      const face = incidentFaces(next.mesh, from).find(
        face =>
          !face.properties.locked &&
          face.properties.water === "land" &&
          pointInPolygon([point[0] + direction[0] * 0.1, point[1] + direction[1] * 0.1], facePoints(next.mesh, face))
      );
      if (!face) return null;
      const hit = face.boundary
        .flatMap(ref => {
          const edge = next.mesh.edges[ref.edgeId];
          if (edge.a === from || edge.b === from) return [];
          const a = next.mesh.vertices[edge.a].point,
            b = next.mesh.vertices[edge.b].point;
          const crossing = segmentSegmentHit(point, far, a, b);
          return crossing && Math.hypot(crossing.point[0] - point[0], crossing.point[1] - point[1]) > 1
            ? [{ edge, a, b, crossing }]
            : [];
        })
        .sort((a, b) => a.crossing.t - b.crossing.t)[0];
      if (!hit || kindEdgeIds(next, "river").has(hit.edge.id)) return null;
      let to: Id;
      if (Math.hypot(hit.crossing.point[0] - hit.a[0], hit.crossing.point[1] - hit.a[1]) < 1) to = hit.edge.a;
      else if (Math.hypot(hit.crossing.point[0] - hit.b[0], hit.crossing.point[1] - hit.b[1]) < 1) to = hit.edge.b;
      else {
        const dx = hit.b[0] - hit.a[0],
          dy = hit.b[1] - hit.a[1];
        const fraction =
          ((hit.crossing.point[0] - hit.a[0]) * dx + (hit.crossing.point[1] - hit.a[1]) * dy) / (dx * dx + dy * dy);
        const inserted = insertEdgeVertex(next, hit.edge.id, fraction);
        if (!inserted) return null;
        next = inserted.document;
        to = inserted.vertexId;
      }
      if (!edgeBetween(next.mesh, from, to)) {
        const split = splitFace(next, face.id, from, to);
        if (!split) return null;
        next = split;
      }
      from = to;
      if (riverPoints.every(line => nearestOnPolyline(next.mesh.vertices[to].point, line).dist >= clearance)) {
        reachedBank = true;
        break;
      }
    }
    if (!reachedBank) return null;
  }
  return throughEdgesAt(next, vertexId, "river", true).length === 2 ? next : null;
}

/** Cut a wide-channel crossing along the river normal through the shared mesh.
 * Moving existing ward corners cannot span a channel wider than a ward. Instead
 * insert the bank approaches on face boundaries, keeping every junction real. */
export function addWideRiverBridge(
  document: CityDocument,
  vertexId: Id,
  id: Id,
  approachReachMeters?: number
): CityDocument | null {
  const frame = riverCrossingFrame(document, vertexId);
  const origin = document.mesh.vertices[vertexId]?.point;
  if (!frame || !origin) return null;
  const normal: Point = [-frame.tangent[1], frame.tangent[0]];
  const river = document.featureGroups.find(g => g.kind === "river" && g.vertices.includes(vertexId));
  if (river?.kind !== "river") return null;
  if (river.crossing && !["fixedBridge", "movableBridge"].includes(river.crossing.kind)) return null;
  const riverPoints = river.vertices.map(id => document.mesh.vertices[id].point);
  let next = document;
  const paths: Id[][] = [];
  const assignedGates = new Set<Id>();
  for (const sign of [-1, 1]) {
    const direction: Point = [normal[0] * sign, normal[1] * sign];
    const far: Point = [
      origin[0] + direction[0] * document.frame.extentMeters * 2,
      origin[1] + direction[1] * document.frame.extentMeters * 2
    ];
    const path = [vertexId];
    for (let step = 0; step < 32; step++) {
      const from = path.at(-1)!;
      const point = next.mesh.vertices[from].point;
      const face = incidentFaces(next.mesh, from).find(
        f =>
          !f.properties.locked &&
          f.properties.water === "land" &&
          pointInPolygon([point[0] + direction[0] * 0.1, point[1] + direction[1] * 0.1], facePoints(next.mesh, f))
      );
      if (!face) return null;
      const hits = face.boundary
        .flatMap(ref => {
          const edge = next.mesh.edges[ref.edgeId];
          if (edge.a === from || edge.b === from) return [];
          const a = next.mesh.vertices[edge.a].point,
            b = next.mesh.vertices[edge.b].point;
          const hit = segmentSegmentHit(point, far, a, b);
          return hit && Math.hypot(hit.point[0] - point[0], hit.point[1] - point[1]) > 1 ? [{ edge, hit, a, b }] : [];
        })
        .sort((a, b) => a.hit.t - b.hit.t);
      const hit = hits[0];
      if (!hit || kindEdgeIds(next, "river").has(hit.edge.id)) return null;
      const wall = kindEdgeIds(next, "wall").has(hit.edge.id);
      let to: Id;
      if (Math.hypot(hit.hit.point[0] - hit.a[0], hit.hit.point[1] - hit.a[1]) < 1) to = hit.edge.a;
      else if (Math.hypot(hit.hit.point[0] - hit.b[0], hit.hit.point[1] - hit.b[1]) < 1) to = hit.edge.b;
      else {
        const fraction =
          Math.hypot(hit.hit.point[0] - hit.a[0], hit.hit.point[1] - hit.a[1]) /
          Math.hypot(hit.b[0] - hit.a[0], hit.b[1] - hit.a[1]);
        const inserted = insertEdgeVertex(next, hit.edge.id, fraction);
        if (!inserted) return null;
        next = inserted.document;
        to = inserted.vertexId;
      }
      const split = splitFace(next, face.id, from, to);
      if (!split) return null;
      next = split;
      path.push(to);
      if (wall && !townGates(next).some(g => g.vertexId === to)) {
        const crossing = next.mesh.vertices[to].point;
        const submerged = next.gates.filter(
          g =>
            !g.locked &&
            !assignedGates.has(g.id) &&
            nearestOnPolyline(next.mesh.vertices[g.vertexId].point, riverPoints).dist < frame.width / 2
        );
        const candidates = submerged.length
          ? submerged
          : next.gates.filter(
              g =>
                !g.locked &&
                !assignedGates.has(g.id) &&
                (next.mesh.vertices[g.vertexId].point[0] - origin[0]) * direction[0] +
                  (next.mesh.vertices[g.vertexId].point[1] - origin[1]) * direction[1] >
                  0
            );
        const nearby = candidates
          .map(gate => ({ gate, point: next.mesh.vertices[gate.vertexId].point }))
          .sort(
            (a, b) =>
              Math.hypot(a.point[0] - crossing[0], a.point[1] - crossing[1]) -
              Math.hypot(b.point[0] - crossing[0], b.point[1] - crossing[1])
          )[0];
        const maxDistance = submerged.length
          ? frame.width * 1.2
          : Math.max(document.frame.blockSizeMeters, frame.width / 2);
        if (nearby && Math.hypot(nearby.point[0] - crossing[0], nearby.point[1] - crossing[1]) < maxDistance) {
          nearby.gate.vertexId = to;
          assignedGates.add(nearby.gate.id);
        } else {
          const gateId = `${id}:gate-${sign}-${step}`;
          next.gates.push({ id: gateId, vertexId: to, locked: false });
          assignedGates.add(gateId);
        }
      }
      const end = next.mesh.vertices[to].point;
      // A normal at a tight bend can run back into the upstream channel.
      // Try another crossing site rather than bridge along that bend.
      if (Math.hypot(end[0] - origin[0], end[1] - origin[1]) > (approachReachMeters ?? frame.width * 1.2)) return null;
      if (nearestOnPolyline(end, riverPoints).dist >= frame.width / 2 + 6 && !wall) break;
    }
    const end = next.mesh.vertices[path.at(-1)!].point;
    if (nearestOnPolyline(end, riverPoints).dist < frame.width / 2 + 6) return null;
    paths.push(path);
  }
  const vertices = [...paths[0].slice().reverse(), ...paths[1].slice(1)];
  const segments = vertices.slice(1).map((to, i) => {
    const edge = edgeBetween(next.mesh, vertices[i], to)!;
    return { edgeId: edge.id, forward: edge.a === vertices[i] };
  });
  // Keep the central bridge's two-arm contract; its longer bank approaches
  // share those arms and continue across as many wards as the channel needs.
  const mid = vertices.indexOf(vertexId);
  next.featureGroups.push({
    id,
    kind: "road",
    name: river?.crossing?.kind === "movableBridge" ? "Movable river bridge" : "Bridge",
    ...(river?.crossing ? { crossing: river.crossing } : {}),
    locked: false,
    segments: segments.slice(mid - 1, mid + 1),
    style: { widthMeters: defaultRoadWidthMeters(townExtentMeters(document.frame)), color: "#735238" }
  });
  next.featureGroups.push({
    id: id.replace("bridge-", "bridgeApproach-"),
    kind: "road",
    name: "Bridge approaches",
    locked: false,
    segments,
    style: { widthMeters: defaultRoadWidthMeters(townExtentMeters(document.frame)), color: "#735238" }
  });
  return next;
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
  const through = throughEdgesAt(document, vertexId, "river", true);
  const walls = kindEdgeIds(document, "wall");
  if (through.length !== 2 || through.some(e => walls.has(e.id))) return null;
  if (
    through.some(e =>
      [e.leftFace, e.rightFace].some(fid => fid && document.mesh.faces[fid].properties.water !== "land")
    )
  )
    return null;
  const river = document.featureGroups.find(g => g.kind === "river" && g.vertices.includes(vertexId));
  if (river?.crossing && !["fixedBridge", "movableBridge"].includes(river.crossing.kind)) return null;
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
    name: river?.crossing?.kind === "movableBridge" ? "Movable river bridge" : "Bridge",
    ...(river?.crossing ? { crossing: river.crossing } : {}),
    locked: false,
    segments: [
      { edgeId: a.id, forward: a.b === vertexId },
      { edgeId: b.id, forward: b.a === vertexId }
    ],
    style: { widthMeters: defaultRoadWidthMeters(townExtentMeters(document.frame)), color: "#735238" }
  });
  return straightenBridge(next, id);
}

/** Gate squaring must not erase the river clearance established by routing. */
function keepsWallRiverGap(before: CityDocument, after: CityDocument, vertexId: Id): boolean {
  const point = (doc: CityDocument, id: Id) => doc.mesh.vertices[id].point;
  const distance = (doc: CityDocument, edge: Edge, a: Id, b: Id) => {
    const p = point(doc, edge.a),
      q = point(doc, edge.b),
      u = point(doc, a),
      v = point(doc, b);
    if (segmentSegmentHit(p, q, u, v)) return 0;
    return Math.min(
      nearestOnPolyline(p, [u, v]).dist,
      nearestOnPolyline(q, [u, v]).dist,
      nearestOnPolyline(u, [p, q]).dist,
      nearestOnPolyline(v, [p, q]).dist
    );
  };
  for (const wall of before.featureGroups) {
    if (wall.kind !== "wall") continue;
    for (const ref of wall.segments) {
      const edge = before.mesh.edges[ref.edgeId];
      if (edge.a !== vertexId && edge.b !== vertexId) continue;
      for (const river of before.featureGroups) {
        if (river.kind !== "river") continue;
        for (let i = 1; i < river.vertices.length; i++) {
          const a = river.vertices[i - 1],
            b = river.vertices[i];
          const crossing = [edge.a, edge.b].find(id => id === a || id === b);
          if (crossing) {
            const sine = (doc: CityDocument) => {
              const p = point(doc, crossing),
                q = point(doc, edge.a === crossing ? edge.b : edge.a),
                r = point(doc, a === crossing ? b : a);
              const dx = q[0] - p[0],
                dy = q[1] - p[1],
                rx = r[0] - p[0],
                ry = r[1] - p[1];
              return Math.abs(dx * ry - dy * rx) / Math.max(1e-7, Math.hypot(dx, dy) * Math.hypot(rx, ry));
            };
            if (sine(after) < Math.min(0.5, sine(before)) - 1e-7) return false;
            continue;
          }
          const minimum = Math.min(
            wall.style.widthMeters / 2 + river.style.widthMeters / 2 + 2,
            distance(before, edge, a, b)
          );
          if (distance(after, edge, a, b) < minimum - 1e-7) return false;
        }
      }
    }
  }
  return true;
}

function tryMoveVertex(document: CityDocument, vertexId: Id, target: Point): CityDocument {
  const v = document.mesh.vertices[vertexId];
  if (!v || v.locked || document.featureGroups.some(g => g.kind === "river" && g.vertices.includes(vertexId)))
    return document;
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
    if (invalid || !keepsWallRiverGap(document, moved, vertexId)) continue;
    return moved;
  }
  return document;
}

/** Wall-polyline neighbours of a gate. A closed ring wraps; an endpoint has none. */
function wallNeighbourIds(document: CityDocument, vertexId: Id): [Id, Id] | null {
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    const ids = featureGroupVertices(document, group);
    if (ids.length < 2) continue;
    const closed = ids.length > 3 && ids[0] === ids[ids.length - 1];
    const ring = closed ? ids.slice(0, -1) : ids;
    const index = ring.indexOf(vertexId);
    if (index < 0) continue;
    if (!closed && (index === 0 || index === ring.length - 1)) continue;
    const prev = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    if (prev && next && prev !== vertexId && next !== vertexId && prev !== next) return [prev, next];
  }
  return null;
}

/** The road vertices that actually pass through the gate, when the junction alternates. */
function throughRoadNeighbourIds(document: CityDocument, vertexId: Id): Id[] {
  const roads = kindEdgeIds(document, "road");
  const walls = kindEdgeIds(document, "wall");
  const ordered = orderedIncidentEdges(document, vertexId);
  const barrier = ordered.filter(edge => walls.has(edge.id)).map(edge => edge.id);
  const arms = ordered.filter(edge => roads.has(edge.id) && !walls.has(edge.id));
  for (let i = 0; i < arms.length; i++)
    for (let j = i + 1; j < arms.length; j++)
      if (alternatingPairs(ordered, barrier, [arms[i].id, arms[j].id]))
        return [arms[i], arms[j]].map(edge => (edge.a === vertexId ? edge.b : edge.a));
  return [];
}

function unit(x: number, y: number): Point | null {
  const len = Math.hypot(x, y);
  return len > 1e-6 ? [x / len, y / len] : null;
}

/** Degrees away from a right angle between each road arm and the wall tangent. 0 = perpendicular. */
function roadDeviationDegrees(gate: Point, roads: Point[], tangent: Point): number {
  let worst = 0;
  for (const road of roads) {
    const vx = road[0] - gate[0];
    const vy = road[1] - gate[1];
    const len = Math.hypot(vx, vy);
    if (len < 0.5) return 90;
    const along = Math.abs(vx * tangent[0] + vy * tangent[1]) / len;
    const across = Math.abs(-tangent[1] * vx + tangent[0] * vy) / len;
    worst = Math.max(worst, (Math.atan2(along, across) * 180) / Math.PI);
  }
  return worst;
}

function townCenter(document: CityDocument): Point {
  const plaza = document.elements.find(element => element.kind === "plaza" && element.point);
  if (plaza?.point) return plaza.point;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land" || !face.properties.buildable) continue;
    const point = face.site ?? polygonCentroid(facePoints(document.mesh, face));
    x += point[0];
    y += point[1];
    count++;
  }
  return count ? [x / count, y / count] : [0, 0];
}

/** Square gate tower side is the round curtain tower's diameter (1.6 × wall thickness). */
export const GATE_TOWER_SCALE = 1.6;
/** Semicircular gate plaza, as a multiple of the tower side, on each side of the curtain. */
export const GATE_PLAZA_SCALE = 1.35 * 0.7;

export function gatePlazaRadiusMeters(wallWidthMeters: number): number {
  return wallWidthMeters * GATE_TOWER_SCALE * GATE_PLAZA_SCALE;
}

/**
 * Two plaza disks closer than this cover the curtain between the gates.
 * The extra wall thickness leaves a visible stub of masonry between the circles.
 */
export function minGateSpacingMeters(wallWidthMeters: number): number {
  return gatePlazaRadiusMeters(wallWidthMeters) * 2 + wallWidthMeters;
}

/** Both gate plazas together are a disk centred on the gate. Buildings must stay outside it. */
export function gatePlazaDisks(document: CityDocument): { center: Point; radius: number }[] {
  const disks: { center: Point; radius: number }[] = [];
  for (const gate of townGates(document)) {
    const frame = gateCrossingFrame(document, gate.vertexId);
    if (!frame) continue;
    const wall = document.featureGroups.find(
      group => group.kind === "wall" && featureGroupVertices(document, group).includes(gate.vertexId)
    );
    if (wall?.kind !== "wall") continue;
    disks.push({ center: frame.point, radius: gatePlazaRadiusMeters(wall.style.widthMeters) });
  }
  return disks;
}

export interface GateCrossingFrame {
  point: Point;
  /** Unit vector along the wall at the gate. */
  tangent: Point;
  /** Unit vector toward the town, perpendicular to `tangent`. */
  inward: Point;
  roads: Point[];
}

/**
 * Orientation of the gatehouse: along the wall, facing the town. Uses the chord
 * of the two wall neighbours when the curtain is nearly straight, and the
 * corner bisector when the gate sits on a bend.
 */
export function gateCrossingFrame(document: CityDocument, vertexId: Id): GateCrossingFrame | null {
  const gate = document.mesh.vertices[vertexId];
  if (!gate) return null;
  const neighbours = wallNeighbourIds(document, vertexId);
  const roads = throughRoadNeighbourIds(document, vertexId)
    .map(id => document.mesh.vertices[id]?.point)
    .filter((point): point is Point => !!point);
  let tangent: Point | null = null;
  let cornerBisector: Point | null = null;
  if (neighbours) {
    const a = document.mesh.vertices[neighbours[0]]?.point;
    const b = document.mesh.vertices[neighbours[1]]?.point;
    if (a && b) {
      const u = unit(a[0] - gate.point[0], a[1] - gate.point[1]);
      const v = unit(b[0] - gate.point[0], b[1] - gate.point[1]);
      const chord = unit(b[0] - a[0], b[1] - a[1]);
      if (u && v && chord && u[0] * v[0] + u[1] * v[1] < -0.5) tangent = chord;
      else if (u && v) {
        cornerBisector = unit(u[0] + v[0], u[1] + v[1]);
        if (cornerBisector) tangent = [-cornerBisector[1], cornerBisector[0]];
      }
      tangent ??= chord;
    }
  }
  if (!tangent) {
    for (const edge of incidentEdges(document.mesh, vertexId)) {
      if (!kindEdgeIds(document, "wall").has(edge.id)) continue;
      const other = document.mesh.vertices[edge.a === vertexId ? edge.b : edge.a]?.point;
      if (!other) continue;
      tangent = unit(other[0] - gate.point[0], other[1] - gate.point[1]);
      if (tangent) break;
    }
  }
  if (!tangent) return null;
  let inward = unit(-tangent[1], tangent[0]);
  if (!inward) return null;
  const castleOwner = document.gates.find(g => g.vertexId === vertexId)?.ownerCastleId;
  const castleCircuit = document.defenseCircuits?.find(c => c.ownerCastleId === castleOwner && c.scope === "castle");
  const center = castleCircuit
    ? polygonCentroid(castleCircuit.areaFaceIds.flatMap(id => facePoints(document.mesh, document.mesh.faces[id])))
    : townCenter(document);
  const toward = unit(center[0] - gate.point[0], center[1] - gate.point[1]) ?? cornerBisector;
  if (toward && inward[0] * toward[0] + inward[1] * toward[1] < 0) inward = [-inward[0], -inward[1]];
  return { point: gate.point, tangent, inward, roads };
}

/** Worst through-road deviation from a right angle with the wall, in degrees. */
export function gateRoadDeviationDegrees(document: CityDocument, vertexId: Id): number | null {
  const frame = gateCrossingFrame(document, vertexId);
  if (!frame || frame.roads.length === 0) return null;
  return roadDeviationDegrees(frame.point, frame.roads, frame.tangent);
}

const PERPENDICULAR_GATE_DEGREES = 10;

/** Pull the more oblique road arm onto the wall normal so the street leaves the gate square-on. */
function swingObliqueGateArm(
  document: CityDocument,
  gateVertexId: Id,
  roadIds: Id[],
  tangent: Point,
  riverVertices: Set<Id>
): CityDocument {
  const gatePoint = document.mesh.vertices[gateVertexId]?.point;
  if (!gatePoint) return document;
  const placed = roadIds
    .map(id => ({ id, point: document.mesh.vertices[id]?.point }))
    .filter((arm): arm is { id: Id; point: Point } => !!arm.point);
  if (
    roadDeviationDegrees(
      gatePoint,
      placed.map(arm => arm.point),
      tangent
    ) <= PERPENDICULAR_GATE_DEGREES
  )
    return document;
  // The arm that leaves a river crossing stays on the river normal. Square the
  // gate with the other arm so the bridge is not pulled diagonal again.
  const roadEdges = kindEdgeIds(document, "road");
  const bridgeArm = (id: Id) =>
    incidentEdges(document.mesh, id).some(
      edge => roadEdges.has(edge.id) && riverVertices.has(edge.a === id ? edge.b : edge.a)
    );
  let worse: { id: Id; point: Point } | null = null;
  let worseDev = -1;
  for (const arm of placed) {
    if (bridgeArm(arm.id)) continue;
    const dev = roadDeviationDegrees(gatePoint, [arm.point], tangent);
    if (dev > worseDev) {
      worseDev = dev;
      worse = arm;
    }
  }
  if (!worse || worseDev <= PERPENDICULAR_GATE_DEGREES) return document;
  const road = document.mesh.vertices[worse.id];
  if (!road || road.locked || riverVertices.has(worse.id)) return document;
  if (townGates(document).some(gate => gate.vertexId === worse.id)) return document;
  if (bridgeArmIsFixed(document, worse.id)) return document;
  const vx = worse.point[0] - gatePoint[0];
  const vy = worse.point[1] - gatePoint[1];
  const dist = Math.max(4, Math.abs(vx * -tangent[1] + vy * tangent[0]));
  if (dist < 1) return document;
  const sign = vx * -tangent[1] + vy * tangent[0] >= 0 ? 1 : -1;
  const target: Point = [gatePoint[0] + -tangent[1] * sign * dist, gatePoint[1] + tangent[0] * sign * dist];
  const moved = tryMoveVertex(document, worse.id, target);
  if (moved === document) return document;
  for (const face of incidentFaces(moved.mesh, worse.id)) {
    if (!face.properties.locked) face.site = polygonCentroid(facePoints(moved.mesh, face));
  }
  return moved;
}

/** Keep a normal, bank-clearing first exterior span even when its far arm also serves a river bridge.
 * Applied to every town gate, independently of whether a moat is enabled. */
function straightenExteriorGateApproaches(document: CityDocument): CityDocument {
  let next = document;
  const riverIds = riverVertexSet(document);
  for (const gate of document.gates) {
    if (gate.locked || next.mesh.vertices[gate.vertexId]?.locked || riverIds.has(gate.vertexId)) continue;
    const frame = gateCrossingFrame(next, gate.vertexId);
    if (!frame) continue;
    const roadEdges = kindEdgeIds(next, "road");
    for (const roadEdge of incidentEdges(next.mesh, gate.vertexId)) {
      if (!roadEdges.has(roadEdge.id)) continue;
      const id = roadEdge.a === gate.vertexId ? roadEdge.b : roadEdge.a;
      const point = next.mesh.vertices[id]?.point;
      if (!point || riverIds.has(id)) continue;
      const outward = -(point[0] - frame.point[0]) * frame.inward[0] - (point[1] - frame.point[1]) * frame.inward[1];
      if (outward <= 0) continue;
      const distance = Math.max(24, outward);
      const target: Point = [frame.point[0] - frame.inward[0] * distance, frame.point[1] - frame.inward[1] * distance];
      if (Math.hypot(point[0] - target[0], point[1] - target[1]) < 0.001) continue;
      const onRiverApproach = incidentEdges(next.mesh, id).some(
        edge => roadEdges.has(edge.id) && riverIds.has(edge.a === id ? edge.b : edge.a)
      );
      let moved = next;
      if (!bridgeArmIsFixed(next, id) && !onRiverApproach) moved = tryMoveVertex(next, id, target);
      if (
        moved !== next &&
        Math.hypot(moved.mesh.vertices[id].point[0] - target[0], moved.mesh.vertices[id].point[1] - target[1]) < 0.001
      ) {
        next = moved;
        for (const face of incidentFaces(next.mesh, id)) face.site = polygonCentroid(facePoints(next.mesh, face));
        continue;
      }
      // A separate gate approach preserves the existing river-bank vertex and road junctions.
      const edge = edgeBetween(next.mesh, gate.vertexId, id);
      if (!edge) continue;
      const span = Math.min(24, outward * 0.6);
      if (span < 4) continue;
      const fraction = span / outward;
      const inserted = insertEdgeVertex(next, edge.id, edge.a === gate.vertexId ? fraction : 1 - fraction);
      if (!inserted) continue;
      const approach: Point = [frame.point[0] - frame.inward[0] * span, frame.point[1] - frame.inward[1] * span];
      const squared = tryMoveVertex(inserted.document, inserted.vertexId, approach);
      const at = squared.mesh.vertices[inserted.vertexId].point;
      if (Math.hypot(at[0] - approach[0], at[1] - approach[1]) > 0.001) continue;
      next = squared;
      for (const face of incidentFaces(next.mesh, inserted.vertexId))
        face.site = polygonCentroid(facePoints(next.mesh, face));
    }
  }
  return next;
}

/**
 * Square each gate to the road that passes through it. The gate vertex slides
 * along the curtain first. When that cannot bring both arms under a right
 * angle, the more oblique arm swings onto the wall normal so the gatehouse
 * does not cover the street.
 */
export function straightenGateCrossings(document: CityDocument): CityDocument {
  let next = document;
  const riverVertices = new Set<Id>();
  for (const group of next.featureGroups) {
    if (group.kind === "river") for (const id of group.vertices) riverVertices.add(id);
  }
  for (const gate of townGates(next)) {
    if (
      gate.locked ||
      riverVertices.has(gate.vertexId) ||
      next.featureGroups.some(
        group =>
          group.kind === "road" &&
          group.id.startsWith("gc:bridgeApproach-") &&
          featureGroupVertices(next, group).includes(gate.vertexId)
      )
    )
      continue;
    const vertex = next.mesh.vertices[gate.vertexId];
    if (!vertex || vertex.locked) continue;
    const neighbours = wallNeighbourIds(next, gate.vertexId);
    if (!neighbours) continue;
    const wallA = next.mesh.vertices[neighbours[0]]?.point;
    const wallB = next.mesh.vertices[neighbours[1]]?.point;
    const roadIds = throughRoadNeighbourIds(next, gate.vertexId);
    const roads = roadIds.map(id => next.mesh.vertices[id]?.point).filter((point): point is Point => !!point);
    if (!wallA || !wallB || roads.length < 2) continue;
    const fromGateA = unit(wallA[0] - vertex.point[0], wallA[1] - vertex.point[1]);
    const fromGateB = unit(wallB[0] - vertex.point[0], wallB[1] - vertex.point[1]);
    // A sharp curtain corner has no single slide line; leave the bend alone.
    if (!fromGateA || !fromGateB) continue;
    if (fromGateA[0] * fromGateB[0] + fromGateA[1] * fromGateB[1] >= -0.5) {
      // A corner cannot slide along a single curtain chord, but its road arms
      // can still be squared to the same bisector used by the gate renderer.
      for (let pass = 0; pass < 16; pass++) {
        const frame = gateCrossingFrame(next, gate.vertexId);
        if (!frame) break;
        const moved = swingObliqueGateArm(next, gate.vertexId, roadIds, frame.tangent, riverVertices);
        if (moved === next) break;
        next = moved;
      }
      continue;
    }
    const chordX = wallB[0] - wallA[0];
    const chordY = wallB[1] - wallA[1];
    const chordLen = Math.hypot(chordX, chordY);
    const tangent = unit(chordX, chordY);
    if (!tangent || chordLen < 8) continue;
    const project = (point: Point) =>
      ((point[0] - wallA[0]) * chordX + (point[1] - wallA[1]) * chordY) / (chordLen * chordLen);
    const endpointMargin = Math.min(0.35, Math.max(4, Math.min(8, chordLen * 0.18)) / chordLen);
    let tMin = endpointMargin;
    let tMax = 1 - endpointMargin;
    // A river at one end of the chord keeps the clearance the gate already has.
    // The usual end margin still applies on the other side.
    const holdRiverEnd = (neighborId: Id, neighbor: Point, atStart: boolean) => {
      if (!riverVertices.has(neighborId)) return;
      const clearance = Math.hypot(vertex.point[0] - neighbor[0], vertex.point[1] - neighbor[1]) / chordLen;
      if (atStart) tMin = Math.max(tMin, clearance);
      else tMax = Math.min(tMax, 1 - clearance);
    };
    holdRiverEnd(neighbours[0], wallA, true);
    holdRiverEnd(neighbours[1], wallB, false);
    const at = (t: number): Point => [wallA[0] + chordX * t, wallA[1] + chordY * t];
    let cursor = next;
    const currentScore = roadDeviationDegrees(vertex.point, roads, tangent);
    if (currentScore > PERPENDICULAR_GATE_DEGREES) {
      if (tMin <= tMax) {
        let bestT = Math.max(tMin, Math.min(tMax, project(vertex.point)));
        let bestScore = roadDeviationDegrees(at(bestT), roads, tangent);
        for (let i = 0; i <= 32; i++) {
          const t = tMin + ((tMax - tMin) * i) / 32;
          const score = roadDeviationDegrees(at(t), roads, tangent);
          if (score + 0.75 < bestScore) {
            bestScore = score;
            bestT = t;
          }
        }
        // Sliding alone can square both arms. Otherwise park the gate on the
        // squarer arm and swing the other arm onto that normal afterwards.
        let chosenT = bestT;
        if (bestScore > PERPENDICULAR_GATE_DEGREES) {
          let anchor = roads[0];
          let anchorDev = Infinity;
          for (const road of roads) {
            const dev = roadDeviationDegrees(vertex.point, [road], tangent);
            if (dev < anchorDev) {
              anchorDev = dev;
              anchor = road;
            }
          }
          chosenT = Math.max(tMin, Math.min(tMax, project(anchor)));
        }
        const target = at(chosenT);
        if (Math.hypot(target[0] - vertex.point[0], target[1] - vertex.point[1]) >= 0.8) {
          const moved = tryMoveVertex(cursor, gate.vertexId, target);
          if (moved !== cursor) {
            for (const face of incidentFaces(moved.mesh, gate.vertexId)) {
              if (!face.properties.locked) face.site = polygonCentroid(facePoints(moved.mesh, face));
            }
            cursor = moved;
          }
        }
      }
      for (let pass = 0; pass < 16; pass++) {
        const frame = gateCrossingFrame(cursor, gate.vertexId);
        const moved = swingObliqueGateArm(cursor, gate.vertexId, roadIds, frame?.tangent ?? tangent, riverVertices);
        if (moved === cursor) break;
        cursor = moved;
      }
    }
    next = cursor;
  }
  return straightenExteriorGateApproaches(next);
}

/** Local river direction at a crossing, and the drawn channel width. */
function riverCrossingFrame(document: CityDocument, midId: Id): { tangent: Point; width: number } | null {
  const mid = document.mesh.vertices[midId]?.point;
  if (!mid) return null;
  for (const group of document.featureGroups) {
    if (group.kind !== "river") continue;
    const index = group.vertices.indexOf(midId);
    if (index < 0) continue;
    let tx = 0;
    let ty = 0;
    const prev = index > 0 ? document.mesh.vertices[group.vertices[index - 1]]?.point : null;
    const next = index + 1 < group.vertices.length ? document.mesh.vertices[group.vertices[index + 1]]?.point : null;
    if (prev) {
      const toward = unit(mid[0] - prev[0], mid[1] - prev[1]);
      if (toward) {
        tx += toward[0];
        ty += toward[1];
      }
    }
    if (next) {
      const toward = unit(next[0] - mid[0], next[1] - mid[1]);
      if (toward) {
        tx += toward[0];
        ty += toward[1];
      }
    }
    const length = Math.hypot(tx, ty);
    if (length < 1e-6) continue;
    return { tangent: [tx / length, ty / length], width: Math.max(1, group.style.widthMeters) };
  }
  return null;
}

/** A bridge arm may slide. The river vertex, gates, and wall vertices stay put. */
function bridgeArmIsFixed(document: CityDocument, id: Id): boolean {
  const vertex = document.mesh.vertices[id];
  if (!vertex || vertex.locked) return true;
  if (townGates(document).some(gate => gate.vertexId === id)) return true;
  for (const group of document.featureGroups) {
    if (group.kind === "river") {
      if (group.vertices.includes(id)) return true;
      continue;
    }
    if (group.kind !== "wall" && !group.locked) continue;
    if (
      group.segments.some(segment => {
        const edge = document.mesh.edges[segment.edgeId];
        return edge && (edge.a === id || edge.b === id);
      })
    )
      return true;
  }
  return false;
}

function moveBridgeArm(document: CityDocument, id: Id, target: Point): CityDocument {
  const current = document.mesh.vertices[id]?.point;
  if (!current || Math.hypot(target[0] - current[0], target[1] - current[1]) < 0.4) return document;
  const moved = tryMoveVertex(document, id, target);
  if (moved === document) return document;
  for (const face of incidentFaces(moved.mesh, id)) {
    if (!face.properties.locked) face.site = polygonCentroid(facePoints(moved.mesh, face));
  }
  return moved;
}

/**
 * Slide the two road vertices beside a river crossing onto the river normal.
 * The crossing vertex stays on the channel. Each arm keeps its across-river
 * distance when that already clears the bank, and is pushed out to the bank
 * when it was running along the channel, so the bridge is the short perpendicular.
 */
export function straightenRiverCrossing(document: CityDocument, aId: Id, midId: Id, bId: Id): CityDocument {
  const frame = riverCrossingFrame(document, midId);
  const origin = document.mesh.vertices[midId]?.point;
  const a = document.mesh.vertices[aId]?.point;
  const b = document.mesh.vertices[bId]?.point;
  if (!frame || !origin || !a || !b) return document;
  const normal: Point = [-frame.tangent[1], frame.tangent[0]];
  const across = (point: Point) => (point[0] - origin[0]) * normal[0] + (point[1] - origin[1]) * normal[1];
  const signOf = (value: number) => (value > 0.05 ? 1 : value < -0.05 ? -1 : 0);
  let signA = signOf(across(a));
  let signB = signOf(across(b));
  if (signA === 0 && signB === 0) {
    signA = -1;
    signB = 1;
  } else if (signA === 0) signA = -signB;
  else if (signB === 0) signB = -signA;
  else if (signA === signB) {
    if (Math.abs(across(a)) >= Math.abs(across(b))) signB = -signA;
    else signA = -signB;
  }
  const half = frame.width / 2;
  const targetFor = (point: Point, sign: number): Point => {
    const offset = across(point);
    const clearance = Math.abs(sign === signOf(offset) ? offset : 0);
    const distance = clearance > half ? clearance : half + 1.4;
    return [origin[0] + normal[0] * sign * distance, origin[1] + normal[1] * sign * distance];
  };
  let next = document;
  // A valid partial move must not be treated as a completed crossing. Repeat
  // the local line search, preserving mesh topology and face orientation.
  const targetA = targetFor(a, signA);
  const targetB = targetFor(b, signB);
  for (let pass = 0; pass < 16; pass++) {
    const before = next;
    if (!bridgeArmIsFixed(next, aId)) next = moveBridgeArm(next, aId, targetA);
    if (!bridgeArmIsFixed(next, bId)) next = moveBridgeArm(next, bId, targetB);
    if (next === before) break;
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
 * Square every road that bridges a river. The river vertex stays put. The road
 * vertices on either side slide onto the river normal, which is the shortest
 * crossing. Runs again after block rectification so a later merge cannot leave
 * an oblique span.
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
export function validGeneratedCrossings(
  document: CityDocument,
  skewLimit = documentBridgeSkewLimit(document)
): boolean {
  if (overSkewedBridgeDecks(document, skewLimit).length) return false;
  for (const gate of townGates(document)) {
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
export function explainGeneratedCrossingFailures(
  document: CityDocument,
  skewLimit = documentBridgeSkewLimit(document)
): string[] {
  const details: string[] = [];
  for (const deck of overSkewedBridgeDecks(document, skewLimit))
    details.push(
      `橋 ${deck.groupId} が河川の法線から ${deck.skewDegrees.toFixed(1)}° 傾いている（上限 ${skewLimit.toFixed(0)}°）`
    );
  for (const gate of townGates(document)) {
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
  for (const gate of townGates(next)) {
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
  const through = throughEdgesAt(document, vertexId, barrier, barrier === "river");
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
