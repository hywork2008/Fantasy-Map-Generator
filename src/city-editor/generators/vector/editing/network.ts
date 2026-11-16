import type { Point } from "../../../types/primitives";
import type {
  CurveAnchor,
  VectorBridge,
  VectorCityDocument,
  VectorGate,
  VectorNode,
  VectorRoadEdge
} from "../../../types/vector/document";
import { evaluateAnchor, pathIsClosed, pathSegmentIds } from "../geometry/curves";
import { anchorOrder, distance, dryLandingExtent, unit } from "../geometry/network";
import { offsetRing, ringInside, sampledClosedRing, wallGapRoute } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { assertVectorDocument } from "../validation/document";
import { curveSource, freshPathId, moveCurveVertex, replaceVectorPath } from "./paths";

export function networkId(table: object, prefix: string): string {
  let n = 1;
  while (Object.hasOwn(table, `${prefix}:${n}`)) n++;
  return `${prefix}:${n}`;
}
const sameAnchor = (a: CurveAnchor, b: CurveAnchor) =>
  a.pathId === b.pathId && a.segmentId === b.segmentId && a.t === b.t;
/** Smallest free `${prefix}:n` id, matching a linear scan from 1 while ids are freed and reused. */
function numberedIdAllocator(table: object, prefix: string) {
  const pattern = new RegExp(`^${prefix}:([1-9]\\d*)$`);
  const numberOf = (id: string) => {
    const match = pattern.exec(id);
    return match && String(Number(match[1])) === match[1] ? Number(match[1]) : undefined;
  };
  const used = new Set<number>();
  for (const id of Object.keys(table)) {
    const n = numberOf(id);
    if (n !== undefined) used.add(n);
  }
  // Free numbers below `scan` live in the heap; `scan` only passes numbers that were in use.
  const heap: number[] = [];
  let scan = 1;
  const push = (n: number) => {
    heap.push(n);
    for (let i = heap.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (heap[parent] <= heap[i]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l] < heap[m]) m = l;
        if (r < heap.length && heap[r] < heap[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  return {
    release(id: string) {
      const n = numberOf(id);
      if (n === undefined || !used.delete(n)) return;
      push(n);
    },
    claim(id: string) {
      const n = numberOf(id);
      if (n !== undefined) used.add(n);
    },
    next(reserved: Set<string> = new Set()): string {
      const skipped: number[] = [];
      for (;;) {
        while (heap.length && used.has(heap[0])) pop();
        while (used.has(scan)) scan++;
        const fromHeap = heap.length > 0 && heap[0] < scan,
          n = fromHeap ? heap[0] : scan;
        if (fromHeap) pop();
        else scan++;
        if (reserved.has(`${prefix}:${n}`)) {
          skipped.push(n);
          continue;
        }
        for (const s of skipped) push(s);
        used.add(n);
        return `${prefix}:${n}`;
      }
    }
  };
}

/** All road edges are ranges of original curves; coincidence never merges nodes.
 * Per-road indexes keep the original iteration order, ids and output while avoiding whole-table scans per road. */
export function rebuildRoadGraph(document: VectorCityDocument): void {
  const { nodes, edges } = document.connections;
  const nodesByPath = new Map<string, VectorNode[]>(),
    edgesByPath = new Map<string, VectorRoadEdge[]>(),
    bridgesByRoad = new Map<string, VectorBridge[]>();
  const add = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const node of Object.values(nodes))
    for (const pathId of new Set(node.anchors.map(a => a.pathId))) add(nodesByPath, pathId, node);
  for (const edge of Object.values(edges)) add(edgesByPath, edge.pathId, edge);
  for (const bridge of Object.values(document.connections.bridges)) add(bridgesByRoad, bridge.roadPathId, bridge);
  const edgeIds = numberedIdAllocator(edges, "edge");
  let nodeNumber = 1;
  for (const road of Object.values(document.paths).filter(p => p.role === "road")) {
    const ids = pathSegmentIds(road),
      roadNodes = nodesByPath.get(road.id) ?? [];
    for (const anchor of [
      { pathId: road.id, segmentId: ids[0], t: 0 },
      { pathId: road.id, segmentId: ids.at(-1)!, t: 1 },
      ...(bridgesByRoad.get(road.id) ?? []).flatMap(b => [b.from, b.to])
    ]) {
      const order = anchorOrder(road, anchor);
      if (
        !roadNodes.some(n => n.anchors.some(a => a.pathId === road.id && Math.abs(anchorOrder(road, a) - order) < 1e-9))
      ) {
        const existing =
          pathIsClosed(road) && anchor.t === 1
            ? roadNodes.find(n => n.anchors.some(a => a.pathId === road.id && anchorOrder(road, a) === 0))
            : undefined;
        if (existing) existing.anchors.push(anchor);
        else {
          // Nodes are never removed here, so the smallest free number only moves forward.
          while (Object.hasOwn(nodes, `node:${nodeNumber}`)) nodeNumber++;
          const id = `node:${nodeNumber}`;
          nodes[id] = { id, position: evaluateAnchor(road, anchor), anchors: [anchor] };
          roadNodes.push(nodes[id]);
        }
      }
    }
    const entries = roadNodes
      .flatMap(node =>
        node.anchors
          .filter(a => a.pathId === road.id)
          .map(anchor => ({ node, anchor, order: anchorOrder(road, anchor) }))
      )
      .sort((a, b) => a.order - b.order);
    const cuts = entries.filter(
      (entry, i) =>
        i === 0 || entry.node.id !== entries[i - 1].node.id || Math.abs(entry.order - entries[i - 1].order) > 1e-9
    );
    const old = edgesByPath.get(road.id) ?? [];
    const reserved = new Set(old.map(e => e.id));
    for (const edge of old) {
      delete edges[edge.id];
      edgeIds.release(edge.id);
    }
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1],
        b = cuts[i];
      if (b.order - a.order < 1e-9) throw new Error("duplicate-connection");
      const existing = old.find(
        e =>
          e.fromNodeId === a.node.id &&
          e.toNodeId === b.node.id &&
          sameAnchor(e.from, a.anchor) &&
          sameAnchor(e.to, b.anchor)
      );
      let id = existing?.id;
      if (id) edgeIds.claim(id);
      else id = edgeIds.next(reserved);
      document.connections.edges[id] = {
        id,
        pathId: road.id,
        fromNodeId: a.node.id,
        toNodeId: b.node.id,
        from: a.anchor,
        to: b.anchor
      };
    }
  }
}
function finish(document: VectorCityDocument): VectorCityDocument {
  rebuildRoadGraph(document);
  document.revision++;
  assertVectorDocument(document);
  return document;
}
/** Snap only an editable endpoint; a shared interior point must already coincide exactly. */
export function connectVectorAnchors(
  document: VectorCityDocument,
  target: CurveAnchor,
  source: CurveAnchor
): VectorCityDocument {
  assertVectorDocument(document);
  if (target.pathId === source.pathId) throw new Error("duplicate-connection");
  const targetPath = document.paths[target.pathId],
    sourcePath = document.paths[source.pathId];
  if (
    new Set([targetPath.role, sourcePath.role]).has("road") &&
    new Set([targetPath.role, sourcePath.role]).has("river")
  )
    throw new Error("bridge-required");
  let next = structuredClone(document);
  const position = evaluateAnchor(targetPath, target);
  if (distance(position, evaluateAnchor(sourcePath, source)) > 1e-6) {
    if (sourcePath.editPolicy === "fixed") throw new Error("fixed-connection");
    if (sourcePath.source.kind !== "curve" || (source.t !== 0 && source.t !== 1))
      throw new Error("interior-connection");
    const candidate = structuredClone(sourcePath),
      index = sourcePath.source.segments.findIndex(s => s.id === source.segmentId);
    if ((source.t === 0 && index !== 0) || (source.t === 1 && index !== sourcePath.source.segments.length - 1))
      throw new Error("interior-connection");
    moveCurveVertex(candidate, index, source.t === 0 ? "from" : "to", position);
    next = replaceVectorPath(next, candidate);
  }
  const equivalent = (a: CurveAnchor, b: CurveAnchor) =>
    a.pathId === b.pathId &&
    Math.abs(anchorOrder(next.paths[a.pathId], a) - anchorOrder(next.paths[b.pathId], b)) < 1e-9;
  const nodes = Object.values(next.connections.nodes).filter(n =>
    n.anchors.some(a => equivalent(a, target) || equivalent(a, source))
  );
  const id = nodes[0]?.id ?? networkId(next.connections.nodes, "node"),
    anchors = [...nodes.flatMap(n => n.anchors), target, source].filter(
      (a, i, all) => all.findIndex(b => sameAnchor(a, b)) === i
    );
  for (const node of nodes) {
    delete next.connections.nodes[node.id];
    for (const edge of Object.values(next.connections.edges)) {
      if (edge.fromNodeId === node.id) edge.fromNodeId = id;
      if (edge.toNodeId === node.id) edge.toNodeId = id;
    }
    for (const gate of Object.values(next.connections.gates)) if (gate.nodeId === node.id) gate.nodeId = id;
  }
  next.connections.nodes[id] = { id, position, anchors };
  return finish(next);
}
export function disconnectVectorNode(document: VectorCityDocument, id: string): VectorCityDocument {
  const next = structuredClone(document),
    node = next.connections.nodes[id];
  if (!node) throw new Error("referenced-segment");
  if (Object.values(next.connections.gates).some(g => g.nodeId === id)) throw new Error("gate-connection");
  delete next.connections.nodes[id];
  for (const edge of Object.values(next.connections.edges))
    if (edge.fromNodeId === id || edge.toNodeId === id) delete next.connections.edges[edge.id];
  return finish(next);
}
export function setWallCircuit(document: VectorCityDocument, pathId: string, parentId?: string): VectorCityDocument {
  const next = structuredClone(document),
    path = next.paths[pathId];
  if (path?.role !== "wall" || !pathIsClosed(path)) throw new Error("circuit-containment");
  const id =
    Object.values(next.connections.circuits).find(c => c.pathId === pathId)?.id ??
    networkId(next.connections.circuits, "circuit");
  next.connections.circuits[id] = { id, pathId, ...(parentId ? { parentCircuitId: parentId } : {}) };
  return finish(next);
}
export function createVectorGate(
  document: VectorCityDocument,
  wall: CurveAnchor,
  access: CurveAnchor,
  width: number,
  kind: VectorGate["kind"],
  existingId?: string
): VectorCityDocument {
  let next = structuredClone(document);
  if (
    next.paths[wall.pathId]?.role !== "wall" ||
    next.paths[access.pathId]?.role !== (kind === "passage" ? "road" : "river")
  )
    throw new Error("gate-access");
  if (next.paths[wall.pathId].editPolicy === "fixed") throw new Error("fixed-path");
  if (existingId) {
    const old = next.connections.gates[existingId];
    if (!old) throw new Error("referenced-segment");
    if (next.paths[old.wallPathId].editPolicy === "fixed") throw new Error("fixed-path");
    const node = next.connections.nodes[old.nodeId];
    node.anchors = node.anchors.filter(a => !sameAnchor(a, old.anchor));
    delete next.connections.gates[existingId];
    if (!node.anchors.length) delete next.connections.nodes[node.id];
  }
  if (
    pathIsClosed(next.paths[wall.pathId]) &&
    !Object.values(next.connections.circuits).some(c => c.pathId === wall.pathId)
  )
    next = setWallCircuit(next, wall.pathId);
  next = connectVectorAnchors(next, wall, access);
  const node = Object.values(next.connections.nodes).find(
    n => n.anchors.some(a => sameAnchor(a, wall)) && n.anchors.some(a => sameAnchor(a, access))
  )!;
  const id = existingId ?? networkId(next.connections.gates, "gate"),
    circuit = Object.values(next.connections.circuits).find(c => c.pathId === wall.pathId);
  next.connections.gates[id] = {
    id,
    wallPathId: wall.pathId,
    nodeId: node.id,
    anchor: structuredClone(wall),
    widthMeters: width,
    kind,
    ...(circuit ? { circuitId: circuit.id } : {})
  };
  return finish(next);
}
export function removeVectorGate(document: VectorCityDocument, id: string): VectorCityDocument {
  const next = structuredClone(document),
    gate = next.connections.gates[id];
  if (!gate) throw new Error("referenced-segment");
  if (next.paths[gate.wallPathId].editPolicy === "fixed") throw new Error("fixed-path");
  delete next.connections.gates[id];
  const node = next.connections.nodes[gate.nodeId];
  node.anchors = node.anchors.filter(a => !sameAnchor(a, gate.anchor));
  return finish(next);
}
export function adoptVectorBridge(document: VectorCityDocument, bridge: VectorBridge): VectorCityDocument {
  const next = structuredClone(document);
  if (next.connections.bridges[bridge.id]?.editPolicy === "fixed") throw new Error("fixed-bridge");
  next.connections.bridges[bridge.id] = structuredClone(bridge);
  return finish(next);
}
export function removeVectorBridge(document: VectorCityDocument, id: string): VectorCityDocument {
  if (!document.connections.bridges[id]) throw new Error("bridge-reference");
  const next = structuredClone(document);
  if (next.connections.bridges[id]?.editPolicy === "fixed") throw new Error("fixed-bridge");
  delete next.connections.bridges[id];
  return finish(next);
}
/** Square crossing candidate, deliberately independent of cell vertices and existing road bends. */
export function proposeSquareBridge(
  document: VectorCityDocument,
  river: CurveAnchor,
  width: number,
  landing: number,
  structure: VectorBridge["structure"]
): VectorCityDocument {
  const riverPath = document.paths[river.pathId];
  if (riverPath?.role !== "river" || !(landing > 0 && width > 0 && Number.isFinite(landing + width)))
    throw new Error("bridge-reference");
  const center = evaluateAnchor(riverPath, river),
    t = unit(evaluateAnchor(riverPath, river, true)),
    normal: Point = [-t[1], t[0]];
  const initial =
    Math.max(
      riverPath.width.leftMeters,
      riverPath.width.rightMeters,
      ...riverPath.width.stations.flatMap(s => [s.leftMeters, s.rightMeters])
    ) +
    landing +
    width;
  const water = pathSurface(riverPath),
    before = dryLandingExtent(water, center, [-normal[0], -normal[1]], width / 2, landing, initial),
    after = dryLandingExtent(water, center, normal, width / 2, landing, initial);
  const from: Point = [center[0] - normal[0] * before, center[1] - normal[1] * before],
    to: Point = [center[0] + normal[0] * after, center[1] + normal[1] * after];
  const next = structuredClone(document),
    id = freshPathId(next),
    bridgeId = networkId(next.connections.bridges, "bridge");
  next.paths[id] = {
    id,
    revision: 0,
    role: "road",
    origin: "automatic",
    editPolicy: "editable",
    source: curveSource([from, to], "polyline", false),
    width: { leftMeters: width / 2, rightMeters: width / 2, stations: [] }
  };
  next.connections.bridges[bridgeId] = {
    id: bridgeId,
    roadPathId: id,
    riverAnchor: river,
    from: { pathId: id, segmentId: "segment:0", t: 0 },
    to: { pathId: id, segmentId: "segment:0", t: 1 },
    structure,
    dryLandingMeters: landing,
    editPolicy: "editable"
  };
  return finish(next);
}

export function createInnerWall(document: VectorCityDocument, outerId: string, offset: number): VectorCityDocument {
  if (!(offset > 0 && Number.isFinite(offset))) throw new Error("invalid-dimensions");
  const outer = document.connections.circuits[outerId];
  if (!outer) throw new Error("circuit-containment");
  const points = offsetRing(sampledClosedRing(document, outer.pathId), -offset),
    next = structuredClone(document),
    id = freshPathId(next),
    path = structuredClone(next.paths[outer.pathId]);
  path.id = id;
  path.revision = 0;
  path.origin = "automatic";
  path.editPolicy = "editable";
  path.source = curveSource(points, "polyline", true);
  path.width.stations = [];
  if (!ringInside(pathSurface(path).outer, pathSurface(next.paths[outer.pathId]).holes[0]))
    throw new Error("circuit-containment");
  next.paths[id] = path;
  return setWallCircuit(next, id, outerId);
}
export function createWallGapRoad(
  document: VectorCityDocument,
  outerId: string,
  innerId: string,
  start: Point,
  end: Point,
  width: number,
  clearance: number
): VectorCityDocument {
  const points = wallGapRoute(document, outerId, innerId, start, end, width, clearance),
    id = freshPathId(document);
  const candidate = {
    id,
    revision: 0,
    role: "road" as const,
    origin: "automatic" as const,
    editPolicy: "editable" as const,
    source: curveSource(points, "polyline", false),
    width: { leftMeters: width / 2, rightMeters: width / 2, stations: [] }
  };
  const next = replaceVectorPath(document, candidate),
    routeId = networkId(next.connections.wallRoads, "wall-road");
  next.connections.wallRoads[routeId] = {
    id: routeId,
    pathId: id,
    outerCircuitId: outerId,
    innerCircuitId: innerId,
    clearanceMeters: clearance
  };
  return finish(next);
}

/** Join coincident curve anchors without cloning or validating an unfinished generation draft. */
export function joinVectorGenerationAnchors(doc: VectorCityDocument, anchors: CurveAnchor[]): void {
  createGenerationJoiner(doc).join(anchors);
}

/** Batch form of joinVectorGenerationAnchors for generation loops. Indexes are kept across calls, so every node
 * mutation in between must go through the same joiner. Node order, node ids and edge/gate rewrites match the
 * single-call form exactly. */
export function createGenerationJoiner(doc: VectorCityDocument) {
  const { nodes, edges, gates } = doc.connections;
  const sequence = new Map<string, number>(),
    byPath = new Map<string, Set<string>>(),
    edgesByNode = new Map<string, Set<VectorRoadEdge>>(),
    gatesByNode = new Map<string, Set<VectorGate>>();
  let counter = 0;
  const add = <T>(map: Map<string, Set<T>>, key: string, value: T) => {
    const set = map.get(key);
    if (set) set.add(value);
    else map.set(key, new Set([value]));
  };
  const index = (node: VectorNode) => {
    sequence.set(node.id, counter++);
    for (const a of node.anchors) add(byPath, a.pathId, node.id);
  };
  const unindex = (node: VectorNode) => {
    sequence.delete(node.id);
    for (const a of node.anchors) byPath.get(a.pathId)?.delete(node.id);
  };
  for (const node of Object.values(nodes)) index(node);
  for (const e of Object.values(edges)) {
    add(edgesByNode, e.fromNodeId, e);
    add(edgesByNode, e.toNodeId, e);
  }
  for (const g of Object.values(gates)) add(gatesByNode, g.nodeId, g);
  const nodeIds = numberedIdAllocator(nodes, "node");
  const key = (a: CurveAnchor) => JSON.stringify(a);
  const samePosition = (a: CurveAnchor, b: CurveAnchor) => {
    if (a.pathId !== b.pathId) return false;
    const path = doc.paths[a.pathId],
      order = (anchor: CurveAnchor) => {
        const value = anchorOrder(path, anchor),
          count = pathSegmentIds(path).length;
        return pathIsClosed(path) && Math.abs(value - count) < 1e-9 ? 0 : value;
      };
    return Math.abs(order(a) - order(b)) < 1e-9;
  };
  return {
    /** Node at one curve position: an existing node there, or a new node holding only this anchor. */
    ensure(anchor: CurveAnchor): string {
      const existing = [...(byPath.get(anchor.pathId) ?? [])]
        .map(id => nodes[id])
        .filter(n => n.anchors.some(a => samePosition(a, anchor)))
        .sort((a, b) => sequence.get(a.id)! - sequence.get(b.id)!)[0];
      if (existing) return existing.id;
      const id = nodeIds.next();
      nodes[id] = { id, position: evaluateAnchor(doc.paths[anchor.pathId], anchor), anchors: [anchor] };
      index(nodes[id]);
      return id;
    },
    join(anchors: CurveAnchor[]): void {
      const unique = anchors.filter((a, i, all) => all.findIndex(b => key(a) === key(b)) === i);
      if (unique.length < 2) return;
      const point = evaluateAnchor(doc.paths[unique[0].pathId], unique[0]);
      if (unique.some(a => distance(point, evaluateAnchor(doc.paths[a.pathId], a)) > 1e-6))
        throw new Error("connection-conflict");
      const samePosition = (a: CurveAnchor, b: CurveAnchor) => {
        if (a.pathId !== b.pathId) return false;
        const path = doc.paths[a.pathId],
          order = (anchor: CurveAnchor) => {
            const value = anchorOrder(path, anchor),
              count = pathSegmentIds(path).length;
            return pathIsClosed(path) && Math.abs(value - count) < 1e-9 ? 0 : value;
          };
        return Math.abs(order(a) - order(b)) < 1e-9;
      };
      const candidates = new Set<string>();
      for (const a of unique) for (const id of byPath.get(a.pathId) ?? []) candidates.add(id);
      const found = [...candidates]
        .map(id => nodes[id])
        .filter(n => n.anchors.some(a => unique.some(b => samePosition(a, b))))
        .sort((a, b) => sequence.get(a.id)! - sequence.get(b.id)!);
      const id = found[0]?.id ?? nodeIds.next(),
        all = [...unique, ...found.flatMap(n => n.anchors)].filter(
          (a, i, entries) => entries.findIndex(b => key(a) === key(b)) === i
        );
      for (const n of found) {
        unindex(n);
        delete nodes[n.id];
        nodeIds.release(n.id);
        for (const e of edgesByNode.get(n.id) ?? []) {
          if (e.fromNodeId === n.id) e.fromNodeId = id;
          if (e.toNodeId === n.id) e.toNodeId = id;
          add(edgesByNode, id, e);
        }
        if (n.id !== id) edgesByNode.delete(n.id);
        for (const g of gatesByNode.get(n.id) ?? []) {
          g.nodeId = id;
          add(gatesByNode, id, g);
        }
        if (n.id !== id) gatesByNode.delete(n.id);
      }
      nodeIds.claim(id);
      nodes[id] = { id, position: point, anchors: all };
      index(nodes[id]);
    }
  };
}
