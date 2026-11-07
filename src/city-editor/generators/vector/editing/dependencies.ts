import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { featureReservations } from "../environmentState";
import { deriveVectorBlocks, generationFingerprint, reachablePaths } from "../generation/pipeline";
import { generateVectorUrban } from "../generation/urban";
import { waterDistance } from "../generation/urbanPacking";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { evaluateAnchor } from "../geometry/curves";
import { bridgeGeometry, dryLandingExtent, gateOpening, junctionSurface, unit } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater, vectorWaterSurfaces } from "../geometry/water";
import { vectorTerrain } from "../terrain";
import { assertVectorDocument } from "../validation/document";
import { rebuildRoadGraph } from "./network";
import { replaceVectorPath } from "./paths";

export interface VectorEditImpact {
  changedPaths: string[];
  changedPlacements: string[];
  changedConnections: boolean;
  relocatedPlacements: string[];
  retainedPlacements: string[];
  removedLanes: string[];
  affectedBlocks: string[];
}
export interface VectorEditResult {
  document: VectorCityDocument;
  impact: VectorEditImpact;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ownedEditable = (p: VectorPlacement | undefined) => p?.origin === "automatic" && p.editPolicy === "editable";
/** Temporary validation input. Only engine-owned automatic placements may be displaced. */
export function prepareVectorEdit(input: VectorCityDocument): VectorCityDocument {
  const doc = structuredClone(input);
  if (!doc.urban) return doc;
  for (const id of doc.urban.ownedPlacements) if (ownedEditable(doc.placements[id])) delete doc.placements[id];
  delete doc.urban;
  return doc;
}
function stripLanes(doc: VectorCityDocument, ids: Set<string>): void {
  for (const id of ids) delete doc.paths[id];
  for (const node of Object.values(doc.connections.nodes)) {
    node.anchors = node.anchors.filter(a => !ids.has(a.pathId));
    if (!node.anchors.length) delete doc.connections.nodes[node.id];
  }
  for (const e of Object.values(doc.connections.edges))
    if (ids.has(e.pathId) || !doc.connections.nodes[e.fromNodeId] || !doc.connections.nodes[e.toNodeId])
      delete doc.connections.edges[e.id];
  rebuildRoadGraph(doc);
}
const overlap = (a: VectorPolygon[], b: VectorPolygon[]) =>
  regionBoolean(a, b, "intersection").some(p => regionArea(p) > 1e-5);
const parts = (p: VectorPlacement) => p.building?.reserved ?? [p.site];
function obstacles(doc: VectorCityDocument): VectorPolygon[] {
  return [
    ...featureReservations(doc),
    ...allVectorWater(doc),
    ...Object.values(doc.paths)
      .filter(p => p.role === "road" || p.role === "wall")
      .map(pathSurface),
    ...Object.values(doc.regions)
      .filter(r => r.kind !== "district")
      .map(r => ({ outer: r.outer, holes: r.holes })),
    ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] })),
    ...Object.values(doc.connections.nodes).flatMap(n => {
      const j = junctionSurface(doc, n.id);
      return j ? [j] : [];
    })
  ];
}
/** Recompute dependencies against both old and proposed geometry, then retain every unaffected placement verbatim. */
export function reconcileVectorEdit(source: VectorCityDocument, candidate: VectorCityDocument): VectorEditResult {
  assertVectorDocument(source);
  assertVectorDocument(candidate);
  for (const [id, plan] of Object.entries(source.environment?.defenses ?? {}))
    if (!same(plan, candidate.environment?.defenses?.[id])) throw Error(`dependency-fixed-defense:${id}`);
  if (source.environment?.harbor && !same(source.environment.harbor, candidate.environment?.harbor))
    throw Error("dependency-fixed-harbor");
  const previous = source.urban;
  if (!previous)
    return {
      document: candidate,
      impact: {
        changedPaths: [],
        changedPlacements: [],
        changedConnections: false,
        relocatedPlacements: [],
        retainedPlacements: [],
        removedLanes: [],
        affectedBlocks: []
      }
    };
  if (previous.inputRevision !== source.revision || !matchesVectorUrbanFingerprint(source, previous.adoptedFingerprint))
    throw new Error("dependency-stale");
  const authoredChanges = Object.keys(candidate.paths).filter(
    id => source.paths[id] && !same(source.paths[id], candidate.paths[id])
  );
  let doc = structuredClone(candidate);
  delete doc.urban;
  for (const bridge of Object.values(source.connections.bridges)) {
    if (
      bridge.editPolicy === "fixed" &&
      !same({ ...bridge, editPolicy: undefined }, { ...doc.connections.bridges[bridge.id], editPolicy: undefined })
    )
      throw new Error(`dependency-fixed-bridge:${bridge.id}`);
    if (doc.connections.bridges[bridge.id] || !doc.paths[bridge.roadPathId] || !doc.paths[bridge.riverAnchor.pathId])
      continue;
    if (
      same(source.paths[bridge.roadPathId], doc.paths[bridge.roadPathId]) &&
      same(source.paths[bridge.riverAnchor.pathId], doc.paths[bridge.riverAnchor.pathId])
    )
      throw new Error(`dependency-unbridged-road:${bridge.roadPathId}`);
    const road = doc.paths[bridge.roadPathId];
    if (
      bridge.editPolicy !== "editable" ||
      road.origin !== "automatic" ||
      road.editPolicy !== "editable" ||
      road.source.kind !== "curve" ||
      road.source.segments.length !== 1 ||
      road.source.segments[0].kind !== "line"
    )
      throw new Error(`dependency-fixed-bridge:${bridge.id}`);
    const river = doc.paths[bridge.riverAnchor.pathId],
      center = evaluateAnchor(river, bridge.riverAnchor),
      t = unit(evaluateAnchor(river, bridge.riverAnchor, true));
    let normal: [number, number] = [-t[1], t[0]];
    const old = road.source.segments[0];
    if ((old.to[0] - old.from[0]) * normal[0] + (old.to[1] - old.from[1]) * normal[1] < 0)
      normal = [-normal[0], -normal[1]];
    const water = vectorWaterSurfaces(doc).get(river.id)!,
      half = Math.max(
        road.width.leftMeters,
        road.width.rightMeters,
        ...road.width.stations.flatMap(s => [s.leftMeters, s.rightMeters])
      ),
      initial = half + bridge.dryLandingMeters + Math.max(river.width.leftMeters, river.width.rightMeters);
    const before = dryLandingExtent(water, center, [-normal[0], -normal[1]], half, bridge.dryLandingMeters, initial),
      after = dryLandingExtent(water, center, normal, half, bridge.dryLandingMeters, initial),
      replacement = structuredClone(road);
    if (replacement.source.kind !== "curve") throw new Error("bridge-reference");
    replacement.source.segments[0] = {
      ...old,
      from: [center[0] - normal[0] * before, center[1] - normal[1] * before],
      to: [center[0] + normal[0] * after, center[1] + normal[1] * after]
    };
    doc = replaceVectorPath(doc, replacement);
    doc.connections.bridges[bridge.id] = structuredClone(bridge);
    bridgeGeometry(doc, doc.connections.bridges[bridge.id], vectorWaterSurfaces(doc));
  }
  for (const id of authoredChanges)
    if (
      doc.paths[id]?.origin === "automatic" &&
      !same(
        { ...source.paths[id], revision: undefined, editPolicy: undefined },
        { ...candidate.paths[id], revision: undefined, editPolicy: undefined }
      )
    )
      doc.paths[id].origin = "manual";
  const changedPaths = [...new Set([...Object.keys(source.paths), ...Object.keys(doc.paths)])].filter(
    id => !same(source.paths[id], doc.paths[id])
  );
  const changedPlacements = Object.keys(doc.placements).filter(id => !same(source.placements[id], doc.placements[id]));
  const explicitlyChangedPlacements = new Set(changedPlacements);
  // Fixed and hand-authored geometry is never removed to make regeneration fit.
  for (const p of Object.values(source.paths))
    if (
      p.editPolicy === "fixed" &&
      !same(
        { ...p, editPolicy: undefined, revision: undefined },
        { ...doc.paths[p.id], editPolicy: undefined, revision: undefined }
      )
    )
      throw new Error(`dependency-fixed-path:${p.id}`);
  for (const p of Object.values(source.placements))
    if (!previous.ownedPlacements.includes(p.id) || !ownedEditable(p))
      if (
        !same(p, doc.placements[p.id]) &&
        ((!doc.placements[p.id] &&
          !Object.values(source.environment?.features ?? {}).some(
            f =>
              f.editPolicy === "editable" &&
              f.placementIds.includes(p.id) &&
              !doc.environment?.features[f.id]?.placementIds.includes(p.id)
          )) ||
          (p.editPolicy === "fixed" &&
            !same({ ...p, editPolicy: undefined }, { ...doc.placements[p.id], editPolicy: undefined })))
      )
        throw new Error(`dependency-protected-placement:${p.id}`);
  const removedLanes: string[] = [];
  const water = allVectorWater(doc);
  const nonRoad = [
    ...featureReservations(doc),
    ...water,
    ...Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .flatMap(p =>
        regionBoolean(
          [pathSurface(p)],
          Object.values(doc.connections.gates)
            .filter(g => g.wallPathId === p.id)
            .map(g => ({ outer: gateOpening(doc, g), holes: [] })),
          "difference"
        )
      ),
    ...Object.values(doc.regions)
      .filter(r => r.kind !== "district")
      .map(r => ({ outer: r.outer, holes: r.holes }))
  ];
  for (const id of previous.ownedPaths) {
    const p = doc.paths[id];
    if (!p) continue;
    if (overlap([pathSurface(p)], nonRoad)) {
      if (p.origin !== "automatic" || p.editPolicy !== "editable" || changedPaths.includes(id))
        throw new Error(`dependency-fixed-lane:${id}`);
      if (Object.values(doc.placements).some(p => p.accesses.some(a => a.pathId === id)))
        throw new Error(`dependency-protected-access:${id}`);
      removedLanes.push(id);
    }
  }
  stripLanes(doc, new Set(removedLanes));
  const decks = Object.values(doc.connections.bridges).map(b => ({
    outer: bridgeGeometry(doc, b, vectorWaterSurfaces(doc)).deck,
    holes: []
  }));
  for (const path of Object.values(doc.paths).filter(p => p.role === "road"))
    if (
      overlap(
        regionBoolean(regionBoolean([pathSurface(path)], previous.domain, "intersection"), decks, "difference"),
        water
      )
    )
      throw new Error(`dependency-unbridged-road:${path.id}`);
  for (const path of Object.values(doc.paths).filter(p => p.role === "road"))
    if (
      overlap(
        [pathSurface(path)],
        nonRoad.filter(
          p =>
            !water.includes(p) &&
            !Object.values(doc.environment?.features ?? {}).some(f => f.pathIds.includes(path.id) && p === f.boundary)
        )
      )
    )
      throw new Error(`dependency-road-obstacle:${path.id}`);
  const oldObstacles = obstacles(source);
  for (const p of Object.values(doc.placements).filter(p => !previous.ownedPlacements.includes(p.id)))
    if (
      overlap(
        parts(p),
        obstacles(doc).filter(
          obstacle =>
            !Object.values(doc.environment?.features ?? {}).some(
              f => f.placementIds.includes(p.id) && obstacle === f.boundary
            )
        )
      ) &&
      !overlap(parts(source.placements[p.id] ?? p), oldObstacles)
    )
      throw new Error(`dependency-protected-placement:${p.id}`);
  const reachable = reachablePaths(doc, doc.site!.center),
    blocked = obstacles(doc),
    retainedPlacements: string[] = [],
    relocatedPlacements: string[] = [];
  const walls = Object.values(doc.connections.circuits)
    .filter(c => !c.parentCircuitId)
    .map(c => ({ outer: sampledClosedRing(doc, c.pathId), holes: [] }));
  const oldWalls = Object.values(source.connections.circuits)
    .filter(c => !c.parentCircuitId)
    .map(c => ({ outer: sampledClosedRing(source, c.pathId), holes: [] }));
  for (const id of previous.ownedPlacements) {
    const p = structuredClone(doc.placements[id] ?? source.placements[id]);
    if (!p) continue;
    let impacted =
      overlap(parts(p), blocked) ||
      p.accesses.some(
        a =>
          !doc.paths[a.pathId] ||
          !reachable.has(a.pathId) ||
          !same(evaluateAnchor(source.paths[a.pathId], a), evaluateAnchor(doc.paths[a.pathId], a))
      );
    if (
      !same(source.regions, doc.regions) &&
      [...Object.values(source.regions), ...Object.values(doc.regions)].some(
        r => r.kind === "district" && overlap(parts(p), [r])
      )
    )
      impacted = true;
    if (!same(source.environment?.terrain, doc.environment?.terrain) && doc.environment?.terrain) {
      const terrain = vectorTerrain(doc),
        heights = p.site.outer.map(terrain.heightAt);
      if (Math.max(...heights) - Math.min(...heights) > 2) impacted = true;
    }
    if (p.building?.riverbankDistanceMeters !== undefined) {
      const distance = waterDistance(doc, [p.site]);
      if (distance > 50) impacted = true;
      else if (distance !== p.building.riverbankDistanceMeters) {
        p.building.riverbankDistanceMeters = distance;
        if (!changedPlacements.includes(id)) changedPlacements.push(id);
      }
    }
    if (!same(containsRegion(walls, p.position), containsRegion(oldWalls, p.position))) impacted = true;
    if (Object.values(doc.placements).some(other => other.id !== id && overlap(parts(p), parts(other))))
      impacted = true;
    if (impacted) {
      if (explicitlyChangedPlacements.has(id) || !ownedEditable(p))
        throw new Error(`dependency-protected-placement:${id}`);
      relocatedPlacements.push(id);
      delete doc.placements[id];
    } else {
      doc.placements[id] = structuredClone(p);
      retainedPlacements.push(id);
    }
  }
  // Reserve the edited topology as the new pre-urban baseline. Strip only M5-owned lanes.
  const featureAccessPaths = new Set(Object.values(doc.environment?.features ?? {}).map(f => f.access.pathId));
  const ownedPaths = previous.ownedPaths.filter(
      id => doc.paths[id] && !removedLanes.includes(id) && !featureAccessPaths.has(id)
    ),
    baseline = structuredClone(doc);
  stripLanes(baseline, new Set(ownedPaths));
  for (const id of previous.ownedPlacements) delete baseline.placements[id];
  const generation = structuredClone(previous.baseGeneration);
  generation.pathRevisions = Object.fromEntries(
    Object.keys(generation.pathRevisions)
      .filter(id => baseline.paths[id]?.origin === "automatic" && baseline.paths[id].editPolicy === "editable")
      .map(id => [id, baseline.paths[id].revision])
  );
  generation.connectionFingerprint = generationFingerprint(baseline, new Set(Object.keys(generation.pathRevisions)));
  generation.blocks = deriveVectorBlocks(baseline);
  generation.inputRevision = doc.revision;
  generation.inputNodes = Object.values(baseline.connections.nodes)
    .map(n => ({
      ...structuredClone(n),
      anchors: n.anchors.filter(a => !Object.hasOwn(generation.pathRevisions, a.pathId))
    }))
    .filter(n => n.anchors.length);
  doc.generation = { ...structuredClone(generation), inputRevision: doc.revision };
  assertVectorDocument(doc);
  const result = generateVectorUrban(doc, previous.settings, {
    retainedPlacements,
    ownedPaths,
    domain: previous.domain,
    baseGeneration: generation,
    baseConnections: baseline.connections,
    baseContext: doc.context
  });
  const changedSurfaces = [
    ...changedPaths.flatMap(id => [source.paths[id], doc.paths[id]].filter(p => !!p).map(pathSurface)),
    ...changedPlacements.flatMap(id => [source.placements[id], doc.placements[id]].filter(p => !!p).flatMap(parts))
  ];
  for (const id of new Set([...Object.keys(source.connections.gates), ...Object.keys(doc.connections.gates)]))
    if (!same(source.connections.gates[id], doc.connections.gates[id])) {
      if (source.connections.gates[id])
        changedSurfaces.push({ outer: gateOpening(source, source.connections.gates[id]), holes: [] });
      if (doc.connections.gates[id])
        changedSurfaces.push({ outer: gateOpening(doc, doc.connections.gates[id]), holes: [] });
    }
  const oldReachable = reachablePaths(source, source.site!.center);
  const affectedBlocks = previous.laneBlocks
    .filter(
      b =>
        overlap([b], changedSurfaces) ||
        relocatedPlacements.some(id => containsRegion([b], source.placements[id].position)) ||
        b.frontage.some(f => oldReachable.has(f.pathId) !== reachable.has(f.pathId))
    )
    .map(b => b.id);
  return {
    document: result,
    impact: {
      changedPaths,
      changedPlacements,
      changedConnections: !same(source.connections, result.connections),
      relocatedPlacements,
      retainedPlacements,
      removedLanes,
      affectedBlocks
    }
  };
}
