import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorBlock, VectorGenerationSettings, VectorPolygon } from "../../../types/vector/generation";
import { mapDocumentAnchors } from "../editing/anchors";
import { createVectorGate, networkId, proposeSquareBridge, rebuildRoadGraph, setWallCircuit } from "../editing/network";
import { curveSource, removeVectorPath } from "../editing/paths";
import { featureReservations } from "../environmentState";
import { evaluateAnchor, pathIsClosed, pathSegmentIds } from "../geometry/curves";
import { pathIntersections } from "../geometry/intersections";
import { anchorOrder, bridgeGeometry, distance, gateOpening, unit, widthAt } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater, vectorWaterSurfaces } from "../geometry/water";
import { assertVectorDocument } from "../validation/document";
import { type RouteLink, skeletonRoutes } from "./routes";

export const DEFAULT_VECTOR_GENERATION: VectorGenerationSettings = {
  seed: "meshless",
  roadWidthMeters: 5,
  clearanceMeters: 0.5,
  branches: 8,
  wall: "none"
};
export function generationFingerprint(doc: VectorCityDocument, ids: Set<string>): string {
  const nodes = Object.values(doc.connections.nodes)
    .filter(n => n.anchors.some(a => ids.has(a.pathId)))
    .map(n => n.id);
  return JSON.stringify({
    nodes: Object.values(doc.connections.nodes).filter(n => nodes.includes(n.id)),
    edges: Object.values(doc.connections.edges).filter(
      e => ids.has(e.pathId) || nodes.includes(e.fromNodeId) || nodes.includes(e.toNodeId)
    ),
    gates: Object.values(doc.connections.gates).filter(g => ids.has(g.wallPathId) || nodes.includes(g.nodeId)),
    circuits: Object.values(doc.connections.circuits).filter(c => ids.has(c.pathId)),
    bridges: Object.values(doc.connections.bridges).filter(b => ids.has(b.roadPathId) || ids.has(b.riverAnchor.pathId)),
    wallRoads: Object.values(doc.connections.wallRoads).filter(r => ids.has(r.pathId)),
    ...(doc.environment?.defenses ? { defenses: doc.environment.defenses } : {})
  });
}
export function joinVectorGenerationAnchors(doc: VectorCityDocument, anchors: CurveAnchor[]): void {
  const unique = anchors.filter((a, i, all) => all.findIndex(b => JSON.stringify(a) === JSON.stringify(b)) === i);
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
  const nodes = Object.values(doc.connections.nodes).filter(n =>
    n.anchors.some(a => unique.some(b => samePosition(a, b)))
  );
  const id = nodes[0]?.id ?? networkId(doc.connections.nodes, "node"),
    all = [...unique, ...nodes.flatMap(n => n.anchors)].filter(
      (a, i, entries) => entries.findIndex(b => JSON.stringify(a) === JSON.stringify(b)) === i
    );
  for (const n of nodes) {
    delete doc.connections.nodes[n.id];
    for (const e of Object.values(doc.connections.edges)) {
      if (e.fromNodeId === n.id) e.fromNodeId = id;
      if (e.toNodeId === n.id) e.toNodeId = id;
    }
    for (const g of Object.values(doc.connections.gates)) if (g.nodeId === n.id) g.nodeId = id;
  }
  doc.connections.nodes[id] = { id, position: point, anchors: all };
}
function walls(doc: VectorCityDocument): VectorPolygon[] {
  return Object.values(doc.paths)
    .filter(p => p.role === "wall")
    .flatMap(p =>
      regionBoolean(
        [pathSurface(p)],
        Object.values(doc.connections.gates)
          .filter(g => g.wallPathId === p.id)
          .map(g => ({ outer: gateOpening(doc, g), holes: [] })),
        "difference"
      )
    );
}
function freeLand(doc: VectorCityDocument): VectorPolygon[] {
  const obstacles = [
    ...featureReservations(doc),
    ...allVectorWater(doc),
    ...walls(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind === "reservation")
      .map(r => ({ outer: r.outer, holes: r.holes })),
    ...Object.values(doc.placements).flatMap(p => p.building?.reserved ?? [p.site])
  ];
  return regionBoolean(doc.site!.domain, obstacles, "difference");
}
function roadEndpoints(path: VectorPath): CurveAnchor[] {
  const ids = pathSegmentIds(path);
  return [
    { pathId: path.id, segmentId: ids[0], t: 0 },
    { pathId: path.id, segmentId: ids.at(-1)!, t: 1 }
  ];
}
export function reachablePaths(doc: VectorCityDocument, center: Point): Set<string> {
  const nodes = Object.values(doc.connections.nodes);
  if (!nodes.length) return new Set();
  const root = [...nodes].sort((a, b) => distance(a.position, center) - distance(b.position, center))[0],
    reached = new Set([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of Object.values(doc.connections.edges))
      if (reached.has(edge.fromNodeId) || reached.has(edge.toNodeId)) {
        if (!reached.has(edge.fromNodeId) || !reached.has(edge.toNodeId)) changed = true;
        reached.add(edge.fromNodeId);
        reached.add(edge.toNodeId);
      }
  }
  return new Set(
    Object.values(doc.connections.edges)
      .filter(e => reached.has(e.fromNodeId) && reached.has(e.toNodeId))
      .map(e => e.pathId)
  );
}
export function frontages(region: VectorPolygon, road: VectorPath): VectorBlock["frontage"] {
  const result: VectorBlock["frontage"] = [],
    surface = pathSurface(road);
  for (const ring of [region.outer, ...region.holes])
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy);
      if (len < 1e-7) continue;
      for (const boundary of [surface.outer, ...surface.holes])
        for (let j = 0; j < boundary.length; j++) {
          const p = boundary[j],
            q = boundary[(j + 1) % boundary.length];
          if (
            Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / len > 1e-5 ||
            Math.abs(dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / len > 1e-5
          )
            continue;
          const t = (r: Point) => ((r[0] - a[0]) * dx + (r[1] - a[1]) * dy) / (len * len),
            lo = Math.max(0, Math.min(t(p), t(q))),
            hi = Math.min(1, Math.max(t(p), t(q)));
          if ((hi - lo) * len > 1e-5)
            result.push({
              pathId: road.id,
              from: [a[0] + dx * lo, a[1] + dy * lo],
              to: [a[0] + dx * hi, a[1] + dy * hi],
              lengthMeters: (hi - lo) * len
            });
        }
    }
  return result;
}
export function deriveVectorBlocks(doc: VectorCityDocument, extra: VectorPolygon[] = []): VectorBlock[] {
  const roads = Object.values(doc.paths).filter(p => p.role === "road"),
    land = regionBoolean(freeLand(doc), [...roads.map(pathSurface), ...extra], "difference"),
    reachable = reachablePaths(doc, doc.site!.center);
  return land.map((polygon, i) => {
    const frontage = roads.flatMap(p => frontages(polygon, p));
    return {
      id: `block:${i}`,
      outer: polygon.outer,
      holes: polygon.holes,
      areaMeters2: regionArea(polygon),
      frontage,
      reachable: frontage.some(f => reachable.has(f.pathId))
    };
  });
}
export interface VectorGenerationResult {
  document: VectorCityDocument;
  stages: { id: "inputs" | "skeleton" | "regions"; document: VectorCityDocument }[];
}
/** Adopted geometry is computed here, never while rendering or loading a document. */
export function generateVectorSkeleton(
  input: VectorCityDocument,
  settings: VectorGenerationSettings = DEFAULT_VECTOR_GENERATION
): VectorGenerationResult {
  assertVectorDocument(input);
  if (input.urban) throw new Error("urban-generated");
  if (!input.site) throw new Error("site-required");
  if (
    !(
      Number.isFinite(settings.roadWidthMeters) &&
      settings.roadWidthMeters > 0 &&
      settings.roadWidthMeters <= 50 &&
      Number.isFinite(settings.clearanceMeters) &&
      settings.clearanceMeters >= 0 &&
      settings.clearanceMeters <= 30 &&
      Number.isInteger(settings.branches) &&
      settings.branches >= 0 &&
      settings.branches <= 24 &&
      settings.seed.length <= 256 &&
      ["none", "rectangle", "ellipse"].includes(settings.wall)
    )
  )
    throw new Error("invalid-generation-settings");
  let doc = structuredClone(input);
  const old = doc.generation;
  if (old) {
    const ids = new Set(Object.keys(old.pathRevisions));
    if (
      Object.entries(old.pathRevisions).some(
        ([id, revision]) =>
          doc.paths[id]?.revision !== revision ||
          doc.paths[id].origin !== "automatic" ||
          doc.paths[id].editPolicy !== "editable"
      ) ||
      old.connectionFingerprint !== generationFingerprint(doc, ids)
    )
      throw new Error("edited-generation");
    delete doc.generation;
    for (const id of [...ids].sort(
      (a, b) => Number(doc.paths[a].role === "wall") - Number(doc.paths[b].role === "wall")
    ))
      doc = removeVectorPath(doc, id);
  }
  delete doc.generation;
  const stages: VectorGenerationResult["stages"] = [{ id: "inputs", document: structuredClone(doc) }],
    before = new Set(Object.keys(doc.paths)),
    center = doc.site!.center;
  const diagnostics: { code: string; entityId: string; severity: "warning" | "error" }[] = [];
  if (settings.wall !== "none" && !Object.values(doc.paths).some(p => p.role === "wall")) {
    const ring = doc.site!.domain[0].outer,
      minX = Math.min(...ring.map(p => p[0])),
      maxX = Math.max(...ring.map(p => p[0])),
      minY = Math.min(...ring.map(p => p[1])),
      maxY = Math.max(...ring.map(p => p[1]));
    const id = "auto-wall";
    doc.paths[id] = {
      id,
      revision: 0,
      role: "wall",
      origin: "automatic",
      editPolicy: "editable",
      source: {
        kind: "preset",
        preset: settings.wall,
        center: [(minX + maxX) / 2, (minY + maxY) / 2],
        widthMeters: maxX - minX,
        heightMeters: maxY - minY,
        bearingDegrees: 90
      },
      width: { leftMeters: 1, rightMeters: 1, stations: [] }
    };
    doc = setWallCircuit(doc, id);
    for (const path of Object.values(doc.paths).filter(p => p.id !== id && (p.role === "road" || p.role === "river")))
      for (const hit of pathIntersections(doc.paths[id], path)) {
        const tangent = unit(evaluateAnchor(doc.paths[id], hit.a, true)),
          axis = unit(evaluateAnchor(path, hit.b, true)),
          width = widthAt(path, hit.b),
          angle = Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0]);
        if (angle < 0.1) throw new Error("gate-access");
        const opening = (width.left + width.right) / angle + 2 * settings.clearanceMeters + 0.1;
        const prior = Object.values(doc.connections.gates).find(
          g => distance(evaluateAnchor(doc.paths[id], g.anchor), evaluateAnchor(doc.paths[id], hit.a)) < 1e-5
        );
        if (prior) {
          prior.widthMeters = Math.max(prior.widthMeters, opening);
          joinVectorGenerationAnchors(doc, [prior.anchor, hit.b]);
        } else doc = createVectorGate(doc, hit.a, hit.b, opening, path.role === "road" ? "passage" : "water");
      }
  }
  let bridgeNumber = 0;
  for (const river of Object.values(doc.paths).filter(p => p.role === "river")) {
    if (Object.values(doc.connections.bridges).some(b => b.riverAnchor.pathId === river.id)) continue;
    const samples = samplePath(river).filter(s => containsRegion(doc.site!.domain, s.point));
    const candidate = samples.sort((a, b) => distance(a.point, center) - distance(b.point, center))[0];
    // Linear paths need interior candidates too; samples intentionally do not densify straight source segments.
    let anchor = candidate?.anchor;
    if (river.source.kind === "curve") {
      const candidates = river.source.segments
        .flatMap(s => Array.from({ length: 17 }, (_, i) => ({ pathId: river.id, segmentId: s.id, t: i / 16 })))
        .filter(a => containsRegion(doc.site!.domain, evaluateAnchor(river, a)))
        .sort((a, b) => distance(evaluateAnchor(river, a), center) - distance(evaluateAnchor(river, b), center));
      anchor = candidates[0] ?? anchor;
    }
    if (!anchor) continue;
    try {
      doc = proposeSquareBridge(
        doc,
        anchor,
        settings.roadWidthMeters,
        settings.roadWidthMeters / 2 + settings.clearanceMeters + 2,
        "stone"
      );
      const created = Object.values(doc.connections.bridges).find(
        b => !before.has(b.roadPathId) && !b.roadPathId.startsWith("auto-bridge-road:")
      );
      if (created) {
        const oldId = created.roadPathId;
        let newId = `auto-bridge-road:${bridgeNumber++}`;
        while (Object.hasOwn(doc.paths, newId)) newId = `auto-bridge-road:${bridgeNumber++}`;
        doc.paths[newId] = { ...doc.paths[oldId], id: newId };
        delete doc.paths[oldId];
        mapDocumentAnchors(doc, a => (a.pathId === oldId ? { ...a, pathId: newId } : a));
        for (const edge of Object.values(doc.connections.edges)) if (edge.pathId === oldId) edge.pathId = newId;
        created.roadPathId = newId;
      }
    } catch {
      diagnostics.push({ code: "bridge-unavailable", entityId: river.id, severity: "warning" });
    }
  }
  const waters = allVectorWater(doc),
    decks = Object.values(doc.connections.bridges).map(b => ({
      outer: bridgeGeometry(doc, b, vectorWaterSurfaces(doc)).deck,
      holes: []
    }));
  for (const road of Object.values(doc.paths).filter(p => p.role === "road")) {
    const inDomain = regionBoolean([pathSurface(road)], doc.site!.domain, "intersection");
    const exposed = regionBoolean(inDomain, decks, "difference");
    if (regionBoolean(exposed, waters, "intersection").some(r => regionArea(r) > 1e-5))
      throw new Error(`unbridged-road:${road.id}`);
  }
  const free = freeLand(doc);
  if (!containsRegion(free, center)) throw new Error("site-center-blocked");
  const ports: Point[] = [[...center]],
    bindings: CurveAnchor[][] = [[]];
  for (const road of Object.values(doc.paths).filter(p => p.role === "road" && !pathIsClosed(p))) {
    const endpoints = roadEndpoints(road).sort(
      (a, b) => distance(evaluateAnchor(road, a), center) - distance(evaluateAnchor(road, b), center)
    );
    const a = endpoints.find(a => containsRegion(free, evaluateAnchor(road, a)));
    if (a) {
      ports.push(evaluateAnchor(road, a));
      bindings.push([a]);
    }
  }
  const required = ports.length;
  const bounds = doc.site!.domain[0].outer,
    radius =
      Math.min(
        Math.max(...bounds.map(p => Math.abs(p[0] - center[0]))),
        Math.max(...bounds.map(p => Math.abs(p[1] - center[1])))
      ) * 0.72;
  let hash = 2166136261;
  for (const c of settings.seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  for (let i = 0; i < settings.branches; i++) {
    const angle = (i / settings.branches + (hash >>> 0) / 2 ** 32) * 2 * Math.PI,
      p: Point = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
    if (containsRegion(free, p)) {
      ports.push(p);
      bindings.push([]);
    }
  }
  const links: RouteLink[] = Object.values(doc.connections.bridges).map(b => {
    const road = doc.paths[b.roadPathId],
      ends = roadEndpoints(road);
    return {
      from: evaluateAnchor(road, ends[0]),
      to: evaluateAnchor(road, ends[1]),
      cost: samplePath(road).at(-1)!.distance,
      pathId: road.id
    };
  });
  const route = skeletonRoutes(free, ports, links, settings.roadWidthMeters / 2 + settings.clearanceMeters + 0.011);
  if (route.unreachable.some(i => i < required)) throw new Error("fixed-port-unreachable");
  for (const i of route.unreachable)
    diagnostics.push({ code: "branch-unreachable", entityId: `target:${i}`, severity: "warning" });
  while (bindings.length < route.points.length) bindings.push([]);
  let number = 0;
  for (const edge of route.edges) {
    if (edge.pathId) {
      const ends = roadEndpoints(doc.paths[edge.pathId]);
      for (const end of ends) {
        const p = evaluateAnchor(doc.paths[end.pathId], end),
          i = route.points.findIndex(q => distance(p, q) < 1e-6);
        if (i >= 0) bindings[i].push(end);
      }
      continue;
    }
    const from = route.points[edge.a],
      to = route.points[edge.b];
    if (distance(from, to) < 1e-6) continue;
    let id = `auto-road:${number++}`;
    while (Object.hasOwn(doc.paths, id)) id = `auto-road:${number++}`;
    doc.paths[id] = {
      id,
      revision: 0,
      role: "road",
      origin: "automatic",
      editPolicy: "editable",
      source: curveSource([from, to], "polyline", false),
      width: { leftMeters: settings.roadWidthMeters / 2, rightMeters: settings.roadWidthMeters / 2, stations: [] }
    };
    bindings[edge.a].push({ pathId: id, segmentId: "segment:0", t: 0 });
    bindings[edge.b].push({ pathId: id, segmentId: "segment:0", t: 1 });
  }
  for (let i = 0; i < bindings.length; i++) {
    const all = bindings.flatMap((b, j) => (distance(route.points[i], route.points[j]) < 1e-6 ? b : []));
    joinVectorGenerationAnchors(doc, all);
  }
  const roads = Object.values(doc.paths).filter(p => p.role === "road");
  for (let i = 0; i < roads.length; i++)
    for (let j = i + 1; j < roads.length; j++)
      for (const hit of pathIntersections(roads[i], roads[j]))
        if (containsRegion(free, evaluateAnchor(roads[i], hit.a))) joinVectorGenerationAnchors(doc, [hit.a, hit.b]);
  rebuildRoadGraph(doc);
  doc.revision++;
  assertVectorDocument(doc);
  stages.push({ id: "skeleton", document: structuredClone(doc) });
  const blocks = deriveVectorBlocks(doc);
  for (const b of blocks)
    if (!b.reachable) diagnostics.push({ code: "land-without-frontage", entityId: b.id, severity: "warning" });
  const owned = Object.values(doc.paths).filter(p => !before.has(p.id));
  doc.revision++;
  doc.generation = {
    algorithm: "vector-skeleton-v1",
    sourceRevision: doc.site!.revision,
    settings: structuredClone(settings),
    pathRevisions: Object.fromEntries(owned.map(p => [p.id, p.revision])),
    connectionFingerprint: generationFingerprint(doc, new Set(owned.map(p => p.id))),
    blocks,
    diagnostics,
    inputNodes: Object.values(structuredClone(stages[0].document.connections.nodes)),
    inputRevision: doc.revision
  };
  assertVectorDocument(doc);
  stages.push({ id: "regions", document: structuredClone(doc) });
  return { document: doc, stages };
}
