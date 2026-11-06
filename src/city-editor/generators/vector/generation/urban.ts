import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorStage, VectorUrbanSettings } from "../../../types/vector/urban";
import { bvFacilityAsset } from "../../bvFacilityAsset";
import { facilityPlacementOrder, facilityUseOf } from "../../facilityUses";
import { polygonCentroid } from "../../geom";
import { buildPopulationFacilityRequests } from "../../populationFacilityRequests";
import { rebuildRoadGraph } from "../editing/network";
import { curveSource } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { assertVectorDocument, VECTOR_DOCUMENT_LIMITS } from "../validation/document";
import { vectorUrbanStages } from "../validation/urban";
import { deriveVectorBlocks, joinVectorGenerationAnchors } from "./pipeline";
import { allocateVectorResidents, vectorPlacementDwellings } from "./urbanCapacity";
import { createUrbanPacker, nearestRoadAnchor, waterDistance } from "./urbanPacking";
import { vectorUrbanFingerprint } from "./urbanState";

export const DEFAULT_VECTOR_URBAN: VectorUrbanSettings = {
  mode: "medieval-facilities",
  population: 1000,
  houseModelId: "house:mediterranean",
  laneWidthMeters: 2.4,
  laneSpacingMeters: 36,
  maxLanes: 32,
  clearanceMeters: 0.6,
  allowExpansion: true
};
export interface VectorUrbanContinuation {
  retainedPlacements: string[];
  ownedPaths: string[];
  domain: NonNullable<VectorCityDocument["urban"]>["domain"];
  baseGeneration: NonNullable<VectorCityDocument["generation"]>;
  baseConnections: VectorCityDocument["connections"];
  baseContext: VectorCityDocument["context"];
}
export function generateVectorUrban(
  input: VectorCityDocument,
  settings: VectorUrbanSettings = DEFAULT_VECTOR_URBAN,
  continuation?: VectorUrbanContinuation
): VectorCityDocument {
  assertVectorDocument(input);
  if (
    !["medieval", "medieval-facilities"].includes(settings.mode) ||
    !Number.isSafeInteger(settings.population) ||
    settings.population < 0 ||
    settings.population > 220000 ||
    settings.houseModelId !== "house:mediterranean" ||
    !Number.isFinite(settings.laneWidthMeters) ||
    settings.laneWidthMeters < 1.4 ||
    settings.laneWidthMeters > 6 ||
    !Number.isFinite(settings.laneSpacingMeters) ||
    settings.laneSpacingMeters < 15 ||
    settings.laneSpacingMeters > 100 ||
    !Number.isInteger(settings.maxLanes) ||
    settings.maxLanes < 0 ||
    settings.maxLanes > 64 ||
    !Number.isFinite(settings.clearanceMeters) ||
    settings.clearanceMeters < 0.2 ||
    settings.clearanceMeters > 5 ||
    typeof settings.allowExpansion !== "boolean"
  )
    throw new Error("invalid-urban-settings");
  const doc = structuredClone(input);
  if (doc.urban) {
    const previous = doc.urban;
    if (
      previous.ownedPaths.some(
        id => doc.paths[id]?.origin !== "automatic" || doc.paths[id]?.editPolicy !== "editable"
      ) ||
      previous.ownedPlacements.some(
        id => doc.placements[id]?.origin !== "automatic" || doc.placements[id]?.editPolicy !== "editable"
      )
    )
      throw new Error("edited-urban");
    if (vectorUrbanFingerprint(doc) !== previous.adoptedFingerprint) throw new Error("edited-urban");
    for (const id of previous.ownedPaths) delete doc.paths[id];
    for (const id of previous.ownedPlacements) delete doc.placements[id];
    doc.connections = previous.baseConnections;
    doc.generation = previous.baseGeneration;
    doc.context = previous.baseContext;
    delete doc.urban;
    doc.generation.inputRevision = doc.revision;
  }
  if (!doc.site || !doc.generation || doc.generation.inputRevision !== doc.revision)
    throw new Error("urban-skeleton-required");
  const baseGeneration = structuredClone(continuation?.baseGeneration ?? doc.generation),
    baseConnections = structuredClone(continuation?.baseConnections ?? doc.connections),
    baseContext = structuredClone(continuation?.baseContext ?? doc.context),
    basePaths = Object.keys(doc.paths).filter(id => !continuation?.ownedPaths.includes(id)),
    manual = Object.keys(doc.placements).filter(id => !continuation?.retainedPlacements.includes(id)),
    reasons: string[] = [];
  const sourceSite = structuredClone(doc.site),
    required =
      settings.population === 0
        ? 0
        : settings.population === doc.site.descriptor?.burg.population
          ? doc.site.descriptor.burg.dwellings
          : getUrbanDwellings(settings.population);
  const requests =
    settings.mode === "medieval-facilities" && settings.population > 0
      ? facilityPlacementOrder(
          buildPopulationFacilityRequests(settings.population, {
            period: doc.context.historicalPeriod,
            port: !!doc.site.descriptor?.burg.port
          }).requests
        )
      : [];
  const domain = structuredClone(continuation?.domain ?? sourceSite.domain);
  // Expansion is a suburb within the synthetic input's known frame; source geometry is never stretched.
  if (
    !continuation &&
    settings.allowExpansion &&
    sourceSite.kind === "synthetic" &&
    sourceSite.id === "synthetic-site" &&
    !Object.values(doc.paths).some(p => p.role === "wall" && (p.origin !== "automatic" || p.editPolicy === "fixed"))
  ) {
    const area = domain.reduce((n, p) => n + regionArea(p), 0),
      needed =
        required * 95 +
        requests.reduce(
          (n, r) => n + r.asset.minimumSite.reduce((n, p) => n + regionArea({ outer: p.outer, holes: [] }), 0) * 1.5,
          0
        ),
      scale = Math.min(
        1.4,
        Math.max(1, Math.sqrt(needed / Math.max(area, 1))),
        ...domain
          .flatMap(p => p.outer)
          .map(p =>
            Math.min(
              Math.abs(p[0] - sourceSite.center[0]) > 1e-9
                ? (doc.frame.extentMeters / 2 - 2) / Math.abs(p[0] - sourceSite.center[0])
                : Infinity,
              Math.abs(p[1] - sourceSite.center[1]) > 1e-9
                ? (doc.frame.extentMeters / 2 - 2) / Math.abs(p[1] - sourceSite.center[1])
                : Infinity
            )
          )
      );
    if (scale > 1) {
      for (const polygon of domain)
        for (const ring of [polygon.outer, ...polygon.holes])
          for (const p of ring) {
            p[0] = sourceSite.center[0] + (p[0] - sourceSite.center[0]) * scale;
            p[1] = sourceSite.center[1] + (p[1] - sourceSite.center[1]) * scale;
          }
      reasons.push("suburbs-expanded");
    }
  }
  doc.site.domain = domain;
  const protectedRegions = Object.values(doc.regions)
    .filter(r => r.kind !== "district")
    .map(r => ({ outer: r.outer, holes: r.holes }));
  const deriveLaneBlocks = () =>
    deriveVectorBlocks(
      {
        ...doc,
        placements: Object.fromEntries(
          Object.entries(doc.placements).filter(([id]) => !continuation?.retainedPlacements.includes(id))
        )
      },
      protectedRegions
    );
  let blocks = deriveLaneBlocks();
  const ownedPaths: string[] = [...(continuation?.ownedPaths ?? [])];
  // Frontage-rooted cul-de-sacs follow free land; no cells, vertex snapping or global grid.
  for (const block of continuation ? [] : blocks) {
    if (ownedPaths.length >= settings.maxLanes) break;
    if (!block.reachable) continue;
    for (const f of block.frontage) {
      if (ownedPaths.length >= settings.maxLanes) break;
      for (let offset = settings.laneSpacingMeters / 2; offset < f.lengthMeters; offset += settings.laneSpacingMeters) {
        if (ownedPaths.length >= settings.maxLanes) break;
        const t: Point = [(f.to[0] - f.from[0]) / f.lengthMeters, (f.to[1] - f.from[1]) / f.lengthMeters],
          p: Point = [f.from[0] + t[0] * offset, f.from[1] + t[1] * offset];
        let n: Point = [-t[1], t[0]];
        if (!containsRegion([block], [p[0] + n[0] * 0.1, p[1] + n[1] * 0.1])) n = [-n[0], -n[1]];
        const anchor = nearestRoadAnchor(doc.paths[f.pathId], p),
          start = evaluateAnchor(doc.paths[f.pathId], anchor);
        let depth = 0;
        for (let d = 2; d <= settings.laneSpacingMeters * 2; d += 2) {
          if (!containsRegion([block], [p[0] + n[0] * d, p[1] + n[1] * d])) break;
          depth = d;
        }
        if (depth < 20) continue;
        const end: Point = [p[0] + n[0] * (depth - 3), p[1] + n[1] * (depth - 3)];
        let id = `urban-lane:${ownedPaths.length}`;
        while (doc.paths[id]) id += "x";
        const lane = {
          id,
          revision: 0,
          role: "road" as const,
          origin: "automatic" as const,
          editPolicy: "editable" as const,
          source: curveSource([start, end], "polyline", false),
          width: { leftMeters: settings.laneWidthMeters / 2, rightMeters: settings.laneWidthMeters / 2, stations: [] }
        };
        const allowed = regionBoolean([block], [pathSurface(doc.paths[f.pathId])], "union");
        if (regionBoolean([pathSurface(lane)], allowed, "difference").some(p => regionArea(p) > 1e-5)) continue;
        if (
          Object.values(doc.paths)
            .filter(p => p.role === "road" && p.id !== f.pathId)
            .some(p =>
              regionBoolean([pathSurface(lane)], [pathSurface(p)], "intersection").some(p => regionArea(p) > 1e-5)
            )
        )
          continue;
        doc.paths[id] = lane;
        joinVectorGenerationAnchors(doc, [anchor, { pathId: id, segmentId: "segment:0", t: 0 }]);
        ownedPaths.push(id);
      }
    }
  }
  rebuildRoadGraph(doc);
  blocks = deriveLaneBlocks();
  const walls = Object.values(doc.connections.circuits)
    .filter(c => !c.parentCircuitId)
    .map(c => ({ outer: sampledClosedRing(doc, c.pathId), holes: [] }));
  const inside = (p: Point) => !walls.length || containsRegion(walls, p);
  const radius = Math.max(
    ...sourceSite.domain
      .flatMap(p => p.outer)
      .map(p => Math.hypot(p[0] - sourceSite.center[0], p[1] - sourceSite.center[1]))
  );
  const core = (p: Point) =>
    walls.length ? inside(p) : Math.hypot(p[0] - sourceSite.center[0], p[1] - sourceSite.center[1]) < radius * 0.65;
  const districts = blocks.map(b => {
    const center = polygonCentroid(b.outer);
    return {
      id: b.id,
      use:
        settings.mode === "medieval"
          ? ("residential" as const)
          : waterDistance(doc, [b]) <= 50
            ? ("river" as const)
            : !core(center)
              ? ("hazard" as const)
              : Math.hypot(center[0] - sourceSite.center[0], center[1] - sourceSite.center[1]) <
                  Math.sqrt(domain.reduce((n, p) => n + regionArea(p), 0)) * 0.2
                ? ("commerce" as const)
                : ("craft" as const),
      inside: inside(center),
      polygon: { outer: b.outer, holes: b.holes }
    };
  });
  const pathIds = Object.keys(doc.paths),
    checkpoints: NonNullable<VectorCityDocument["urban"]>["checkpoints"] = [];
  const checkpoint = (id: VectorStage, ids: string[], paths = pathIds) => {
    const a = allocateVectorResidents(doc, ids, required, settings.population);
    checkpoints.push({
      id,
      pathIds: paths,
      placementIds: [...ids],
      capacityDwellings: a.capacity,
      assignedDwellings: a.assignedDwellings,
      assignedPopulation: a.assignedPopulation,
      unplacedPopulation: a.unplacedPopulation
    });
  };
  checkpoint(
    "inputs",
    manual,
    basePaths.filter(id => !Object.hasOwn(baseGeneration.pathRevisions, id))
  );
  checkpoint("skeleton", manual, basePaths);
  checkpoint("regions", manual, basePaths);
  checkpoint("blocksAndLanes", manual);
  const packer = createUrbanPacker(doc, blocks, settings, core, new Map(districts.map(d => [d.id, d.use]))),
    ownedPlacements: string[] = [...(continuation?.retainedPlacements ?? [])],
    unplacedFacilities: NonNullable<VectorCityDocument["urban"]>["report"]["unplacedFacilities"] = [];
  for (const request of requests) {
    if (ownedPlacements.includes(`urban:${request.id}`)) continue;
    const p = ownedPlacements.length < 1500 ? packer.place(request, "facility") : undefined;
    if (p) {
      p.building!.pool = facilityUseOf(request);
      ownedPlacements.push(p.id);
    } else
      unplacedFacilities.push({
        id: request.id,
        reason:
          packer.budgetExceeded() || ownedPlacements.length >= 1500
            ? "budget"
            : request.riverbankMaxDistanceMeters !== undefined && !allVectorWater(doc).length
              ? "river"
              : request.zone === "outskirts"
                ? "district"
                : "space"
      });
  }
  const facilities = ownedPlacements.filter(id => doc.placements[id].building?.kind === "facility");
  if (settings.mode === "medieval-facilities") checkpoint("facilities", [...manual, ...facilities]);
  const facilityLand = deriveVectorBlocks(doc, protectedRegions),
    housingPacker = createUrbanPacker(doc, facilityLand, settings, core);
  let remaining =
    required - [...manual, ...ownedPlacements].reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0);
  if (remaining > 0) {
    const asset = bvFacilityAsset(settings.houseModelId, [
      { id: "main", position: [0, 0, 4], normalXZ: [0, 1], clearWidth: 1.1 }
    ]);
    for (let n = 0; remaining > 0 && ownedPlacements.length < 1500; n++) {
      const p = housingPacker.place({ id: `housing:${n}`, asset }, "housing");
      if (!p) break;
      p.building!.districtId =
        districts.find(d => containsRegion([d.polygon], p.position))?.id ?? p.building!.districtId;
      ownedPlacements.push(p.id);
      remaining -= p.building!.dwellings;
    }
  }
  const all = [...manual, ...facilities, ...ownedPlacements.filter(id => !facilities.includes(id))].sort(
    (a, b) => Number(inside(doc.placements[b].position)) - Number(inside(doc.placements[a].position))
  );
  checkpoint("housing", all);
  const allocation = allocateVectorResidents(doc, all, required, settings.population);
  if (allocation.unplacedDwellings) reasons.push("housing-capacity-shortfall");
  if (unplacedFacilities.length) reasons.push("facility-space-shortfall");
  if (manual.some(id => !doc.placements[id].building)) reasons.push("manual-capacity-unverified");
  if (packer.budgetExceeded() || housingPacker.budgetExceeded() || ownedPlacements.length >= 1500)
    reasons.push("placement-budget");
  const residualLand = deriveVectorBlocks(doc, protectedRegions).map(b => ({ outer: b.outer, holes: b.holes }));
  doc.site = sourceSite;
  doc.context.targetPopulation = settings.population;
  doc.revision++;
  doc.generation = { ...doc.generation!, blocks, inputRevision: doc.revision };
  doc.urban = {
    algorithm: "vector-urban-v1",
    inputRevision: doc.revision,
    settings: structuredClone(settings),
    baseGeneration,
    baseConnections,
    baseContext,
    domain,
    laneBlocks: blocks,
    residualLand,
    districts,
    ownedPaths,
    ownedPlacements,
    adoptedFingerprint: vectorUrbanFingerprint(doc),
    checkpoints,
    assignments: allocation.assignments,
    report: {
      targetPopulation: settings.population,
      requiredDwellings: required,
      capacityDwellings: allocation.capacity,
      assignedDwellings: allocation.assignedDwellings,
      unplacedDwellings: allocation.unplacedDwellings,
      assignedPopulation: allocation.assignedPopulation,
      unplacedPopulation: allocation.unplacedPopulation,
      mixedDwellings: facilities.reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0),
      capacityInside: all
        .filter(id => inside(doc.placements[id].position))
        .reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0),
      capacityOutside: all
        .filter(id => !inside(doc.placements[id].position))
        .reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0),
      requiredFacilities: requests.length,
      placedFacilities: facilities.length,
      provisionalFacilities: facilities.filter(id => doc.placements[id].building!.provenance === "provisional").length,
      unplacedFacilities,
      housingBuildings: ownedPlacements.length - facilities.length,
      reasons
    }
  };
  if (checkpoints.map(c => c.id).join() !== vectorUrbanStages(settings.mode).join()) throw new Error("urban-stages");
  assertVectorDocument(doc);
  if (JSON.stringify(doc, null, 2).length > VECTOR_DOCUMENT_LIMITS.textLength) throw new Error("urban-document-budget");
  return doc;
}
