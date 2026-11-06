import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorBridge, VectorCityDocument, VectorGate } from "../../../types/vector/document";
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
/** All road edges are ranges of original curves; coincidence never merges nodes. */
export function rebuildRoadGraph(document: VectorCityDocument): void {
  for (const road of Object.values(document.paths).filter(p => p.role === "road")) {
    const ids = pathSegmentIds(road);
    for (const anchor of [
      { pathId: road.id, segmentId: ids[0], t: 0 },
      { pathId: road.id, segmentId: ids.at(-1)!, t: 1 },
      ...Object.values(document.connections.bridges)
        .filter(b => b.roadPathId === road.id)
        .flatMap(b => [b.from, b.to])
    ]) {
      const order = anchorOrder(road, anchor);
      if (
        !Object.values(document.connections.nodes).some(n =>
          n.anchors.some(a => a.pathId === road.id && Math.abs(anchorOrder(road, a) - order) < 1e-9)
        )
      ) {
        const existing =
          pathIsClosed(road) && anchor.t === 1
            ? Object.values(document.connections.nodes).find(n =>
                n.anchors.some(a => a.pathId === road.id && anchorOrder(road, a) === 0)
              )
            : undefined;
        if (existing) existing.anchors.push(anchor);
        else {
          const id = networkId(document.connections.nodes, "node");
          document.connections.nodes[id] = { id, position: evaluateAnchor(road, anchor), anchors: [anchor] };
        }
      }
    }
    const entries = Object.values(document.connections.nodes)
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
    const old = Object.values(document.connections.edges).filter(e => e.pathId === road.id);
    const reserved = new Set(old.map(e => e.id));
    for (const edge of old) delete document.connections.edges[edge.id];
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
      if (!id) {
        let n = 1;
        while (Object.hasOwn(document.connections.edges, `edge:${n}`) || reserved.has(`edge:${n}`)) n++;
        id = `edge:${n}`;
      }
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
