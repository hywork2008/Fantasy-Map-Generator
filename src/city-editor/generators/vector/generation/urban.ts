import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorStage, VectorUrbanSettings } from "../../../types/vector/urban";
import { bvFacilityAsset } from "../../bvFacilityAsset";
import { facilityPlacementOrder, facilityUseOf } from "../../facilityUses";
import { type GenerationTimingObserver, generationTiming } from "../../generationTiming";
import { polygonCentroid } from "../../geom";
import { buildPopulationFacilityRequests } from "../../populationFacilityRequests";
import { isDetachedFabricHouse, reattachFabricEntrances } from "../editing/fabricHouses";
import { rebuildRoadGraph } from "../editing/network";
import { curveSource } from "../editing/paths";
import { featureReservations } from "../environmentState";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { assertVectorDocument, VECTOR_DOCUMENT_LIMITS } from "../validation/document";
import { vectorUrbanStages } from "../validation/urban";
import { placeVectorPerimeterHouses, planVectorPerimeter, vectorPerimeterResidual } from "./perimeter";
import { deriveVectorBlocks, joinVectorGenerationAnchors } from "./pipeline";
import { allocateVectorResidents, vectorPlacementDwellings } from "./urbanCapacity";
import {
  createUrbanPacker,
  FACILITY_SEARCH_LIMITS,
  HOUSING_SEARCH_LIMITS,
  nearestRoadAnchor,
  type UrbanSearchStats,
  waterDistance
} from "./urbanPacking";
import { matchesVectorUrbanFingerprint, VECTOR_URBAN_ALGORITHM, vectorUrbanFingerprint } from "./urbanState";

export const DEFAULT_VECTOR_URBAN: VectorUrbanSettings = {
  mode: "medieval",
  population: 1000,
  houseModelId: "house:mediterranean",
  laneWidthMeters: 2.4,
  laneSpacingMeters: 36,
  maxLanes: 32,
  clearanceMeters: 0.6,
  allowExpansion: true
};
export interface VectorUrbanProfile {
  lanesMs: number;
  facilityMs: number;
  housingMs: number;
  facilityAttempts: number;
  housingAttempts: number;
  regionMs: number;
  curveMs: number;
  starvedFacilities: number;
  cappedFacilities: number;
  housingStop: "demand-met" | "frontage" | "budget" | "placement-cap";
}
/** Optional search caps and a caller-owned profile. Neither is stored in the city document. */
export interface VectorUrbanRun {
  facilityAttempts?: number;
  requestAttempts?: number;
  housingAttempts?: number;
  profile?: VectorUrbanProfile;
  timings?: GenerationTimingObserver;
  progress?: (phase: "lanes" | "facilities" | "housing" | "validation", completed?: number, total?: number) => void;
}
export interface VectorUrbanContinuation {
  retainedPlacements: string[];
  ownedPaths: string[];
  domain: NonNullable<VectorCityDocument["urban"]>["domain"];
  baseGeneration: NonNullable<VectorCityDocument["generation"]>;
  baseConnections: VectorCityDocument["connections"];
  baseContext: VectorCityDocument["context"];
  /** Highest occupancy draw adopted before the edit, when the source kept fabric records. Regeneration keeps the
   * CE street-block layout and adopts at least every lot up to this draw, so unaffected street blocks keep their
   * houses unchanged. */
  fabricDraw?: number;
}
export function generateVectorUrban(
  input: VectorCityDocument,
  settings: VectorUrbanSettings = DEFAULT_VECTOR_URBAN,
  continuation?: VectorUrbanContinuation,
  run?: VectorUrbanRun
): VectorCityDocument {
  const timed = generationTiming(run?.timings);
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
    if (!matchesVectorUrbanFingerprint(doc, previous.adoptedFingerprint)) throw new Error("edited-urban");
    for (const id of previous.ownedPaths) delete doc.paths[id];
    for (const id of previous.ownedPlacements) delete doc.placements[id];
    delete doc.fabric;
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
  timed("source-validation-and-clone");
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
  const protectedRegions = [
    ...featureReservations(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind !== "district")
      .map(r => ({ outer: r.outer, holes: r.holes }))
  ];
  const organicMode =
    settings.mode === "medieval" &&
    settings.maxLanes > 0 &&
    (!continuation || continuation.fabricDraw !== undefined) &&
    run?.housingAttempts === undefined;
  // A house detached from fabric records is occupancy for the CE plan; cutting it out would give its whole
  // skeleton block a hole, and a block with holes holds no CE district.
  const deriveLaneBlocks = () =>
    deriveVectorBlocks(
      {
        ...doc,
        placements: Object.fromEntries(
          Object.entries(doc.placements).filter(
            ([id, p]) => !continuation?.retainedPlacements.includes(id) && !(organicMode && isDetachedFabricHouse(p))
          )
        )
      },
      protectedRegions
    );
  timed("programme-and-domain");
  let blocks = deriveLaneBlocks();
  timed("base-blocks");
  const ownedPaths: string[] = [...(continuation?.ownedPaths ?? [])];
  run?.progress?.("lanes");
  const laneStarted = performance.now();
  // Frontage-rooted cul-de-sacs follow free land; no cells, vertex snapping or global grid.
  // Length follows the block, not two lot-depths, so a small lane budget still fronts the interior.
  const laneCandidates: {
    block: (typeof blocks)[number];
    pathId: string;
    depth: number;
    anchor: ReturnType<typeof nearestRoadAnchor>;
    origin: Point;
    normal: Point;
    tangent: Point;
    start: Point;
    end: Point;
  }[] = [];
  if (!continuation)
    for (const block of blocks) {
      if (!block.reachable) continue;
      for (const f of block.frontage) {
        const tangent: Point = [(f.to[0] - f.from[0]) / f.lengthMeters, (f.to[1] - f.from[1]) / f.lengthMeters];
        for (
          let offset = settings.laneSpacingMeters / 2;
          offset + 2 < f.lengthMeters;
          offset += settings.laneSpacingMeters
        ) {
          const p: Point = [f.from[0] + tangent[0] * offset, f.from[1] + tangent[1] * offset];
          let normal: Point = [-tangent[1], tangent[0]];
          if (!containsRegion([block], [p[0] + normal[0] * 0.1, p[1] + normal[1] * 0.1]))
            normal = [-normal[0], -normal[1]];
          const insideAt = (d: number) => containsRegion([block], [p[0] + normal[0] * d, p[1] + normal[1] * d]);
          if (!insideAt(20)) continue;
          let lo = 20,
            hi = 40;
          while (hi <= 2000 && insideAt(hi)) {
            lo = hi;
            hi *= 2;
          }
          hi = Math.min(hi, 2000);
          if (insideAt(hi)) lo = hi;
          else
            while (hi - lo > 2) {
              const mid = (lo + hi) / 2;
              if (insideAt(mid)) lo = mid;
              else hi = mid;
            }
          if (lo < 20) continue;
          const anchor = nearestRoadAnchor(doc.paths[f.pathId], p);
          laneCandidates.push({
            block,
            pathId: f.pathId,
            depth: lo,
            anchor,
            origin: p,
            normal,
            tangent,
            start: evaluateAnchor(doc.paths[f.pathId], anchor),
            end: [p[0] + normal[0] * (lo - 3), p[1] + normal[1] * (lo - 3)]
          });
        }
      }
    }
  laneCandidates.sort((a, b) => b.depth - a.depth || a.pathId.localeCompare(b.pathId));
  const mouths: Point[] = [];
  let laneTrials = 0;
  const houseAsset =
    settings.population > 0
      ? bvFacilityAsset(settings.houseModelId, [{ id: "main", position: [0, 0, 4], normalXZ: [0, 1], clearWidth: 1.1 }])
      : undefined;
  timed("lane-candidates");
  const organic = organicMode ? planVectorPerimeter(doc, blocks, settings) : undefined;
  const adoptLane = (
    points: Point[],
    anchor: (typeof laneCandidates)[number]["anchor"],
    parentId: string,
    block: (typeof laneCandidates)[number]["block"]
  ) => {
    const cleaned: Point[] = [];
    for (const point of points) {
      const previous = cleaned.at(-1);
      if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.05) cleaned.push(point);
    }
    if (cleaned.length < 2) return false;
    let id = `urban-lane:${ownedPaths.length}`;
    while (doc.paths[id]) id += "x";
    try {
      const lane = {
        id,
        revision: 0,
        role: "road" as const,
        origin: "automatic" as const,
        editPolicy: "editable" as const,
        source: curveSource(cleaned, "polyline", false),
        width: { leftMeters: settings.laneWidthMeters / 2, rightMeters: settings.laneWidthMeters / 2, stations: [] }
      };
      const surface = pathSurface(lane),
        allowed = regionBoolean([block], [pathSurface(doc.paths[parentId])], "union");
      // The mouth can cover a few square meters of the next block. A lane that misses its own block is larger.
      const outside = regionBoolean([surface], allowed, "difference").reduce((n, p) => n + regionArea(p), 0);
      if (outside > 20) return false;
      if (
        Object.values(doc.paths)
          .filter(p => p.role === "road" && p.id !== parentId)
          .some(p => regionBoolean([surface], [pathSurface(p)], "intersection").some(r => regionArea(r) > 1e-5))
      )
        return false;
      doc.paths[id] = lane;
    } catch {
      return false;
    }
    joinVectorGenerationAnchors(doc, [anchor, { pathId: id, segmentId: "segment:0", t: 0 }]);
    ownedPaths.push(id);
    mouths.push(cleaned[0]);
    return true;
  };
  const tooClose = (p: Point) =>
    mouths.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < settings.laneSpacingMeters * 0.5);
  if (!organic)
    for (const candidate of laneCandidates) {
      if (ownedPaths.length >= settings.maxLanes || laneTrials >= settings.maxLanes * 8) break;
      if (tooClose(candidate.start)) continue;
      laneTrials++;
      adoptLane([candidate.start, candidate.end], candidate.anchor, candidate.pathId, candidate.block);
    }
  if (run?.profile) run.profile.lanesMs = performance.now() - laneStarted;
  timed("ce-perimeter-plan-and-native-connections");
  rebuildRoadGraph(doc);
  timed("road-graph");
  blocks = organic ? organic.blocks : deriveLaneBlocks();
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
    // Fabric houses are adopted and shown with the housing stage only.
    const a = allocateVectorResidents(doc, ids, required, settings.population, id === "housing");
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
  timed("districts-and-checkpoints");
  const searchStats: UrbanSearchStats = { regionMs: 0, curveMs: 0 };
  const facilityLimits = {
    totalAttempts: run?.facilityAttempts ?? FACILITY_SEARCH_LIMITS.totalAttempts,
    requestAttempts: run?.requestAttempts ?? FACILITY_SEARCH_LIMITS.requestAttempts
  };
  const housingLimits = {
    totalAttempts: run?.housingAttempts ?? HOUSING_SEARCH_LIMITS.totalAttempts,
    requestAttempts: run?.housingAttempts ?? HOUSING_SEARCH_LIMITS.requestAttempts
  };
  const packer = organic
      ? undefined
      : createUrbanPacker(
          doc,
          blocks,
          settings,
          core,
          new Map(districts.map(d => [d.id, d.use])),
          facilityLimits,
          searchStats
        ),
    ownedPlacements: string[] = [...(continuation?.retainedPlacements ?? [])],
    unplacedFacilities: NonNullable<VectorCityDocument["urban"]>["report"]["unplacedFacilities"] = [];
  const missReason = (request: (typeof requests)[number]): "river" | "district" | "space" =>
    request.riverbankMaxDistanceMeters !== undefined && !allVectorWater(doc).length
      ? "river"
      : request.zone === "outskirts"
        ? "district"
        : "space";
  let facilityAttempts = 0;
  const facilityStarted = performance.now();
  for (const [requestIndex, request] of requests.entries()) {
    run?.progress?.("facilities", requestIndex, requests.length);
    if (ownedPlacements.includes(`urban:${request.id}`)) continue;
    const room = facilityLimits.totalAttempts - facilityAttempts;
    if (ownedPlacements.length >= 1500 || room <= 0) {
      unplacedFacilities.push({ id: request.id, reason: "unsearched" });
      continue;
    }
    const result = packer!.place(request, "facility", Math.min(facilityLimits.requestAttempts, room));
    facilityAttempts += result.attempts;
    if (result.placement) {
      result.placement.building!.pool = facilityUseOf(request);
      ownedPlacements.push(result.placement.id);
    } else unplacedFacilities.push({ id: request.id, reason: result.incomplete ? "budget" : missReason(request) });
  }
  const retryIds = unplacedFacilities.filter(item => item.reason === "budget").map(item => item.id);
  // A short shared reserve revisits capped requests. It does not let one request spend the rest of the budget.
  const retryCeiling = Math.min(facilityLimits.totalAttempts, facilityAttempts + 4000);
  let stalls = 0;
  while (retryIds.length && facilityAttempts < retryCeiling && ownedPlacements.length < 1500) {
    if (stalls >= retryIds.length) break;
    const id = retryIds[0];
    const request = requests.find(item => item.id === id);
    if (!request) break;
    const result = packer!.place(request, "facility", Math.min(40, retryCeiling - facilityAttempts));
    facilityAttempts += result.attempts;
    if (result.placement) {
      result.placement.building!.pool = facilityUseOf(request);
      ownedPlacements.push(result.placement.id);
      const index = unplacedFacilities.findIndex(item => item.id === id);
      if (index >= 0) unplacedFacilities.splice(index, 1);
      retryIds.shift();
      stalls = 0;
    } else if (!result.incomplete) {
      const row = unplacedFacilities.find(item => item.id === id);
      if (row) row.reason = missReason(request);
      retryIds.shift();
      stalls = 0;
    } else if (result.attempts === 0) {
      retryIds.shift();
      stalls++;
    } else {
      retryIds.push(retryIds.shift()!);
      stalls = 0;
    }
  }
  if (run?.profile) run.profile.facilityMs = performance.now() - facilityStarted;
  const facilities = ownedPlacements.filter(id => doc.placements[id].building?.kind === "facility");
  if (settings.mode === "medieval-facilities") checkpoint("facilities", [...manual, ...facilities]);
  timed("facilities");
  const facilityLand = organic ? [] : deriveVectorBlocks(doc, protectedRegions),
    housingPacker = organic
      ? undefined
      : createUrbanPacker(doc, facilityLand, settings, core, new Map(), housingLimits, searchStats);
  let remaining =
    required - [...manual, ...ownedPlacements].reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0);
  let housingAttempts = 0;
  let housingStop: VectorUrbanProfile["housingStop"] = remaining > 0 ? "frontage" : "demand-met";
  const housingStarted = performance.now();
  if (organic && remaining > 0) {
    const placed = placeVectorPerimeterHouses(doc, organic, remaining, inside, continuation?.fabricDraw);
    reattachFabricEntrances(doc);
    housingAttempts = organic.houses.length;
    remaining -= placed.dwellings;
    housingStop = remaining > 0 ? "frontage" : "demand-met";
  }
  if (!organic && remaining > 0 && houseAsset) {
    const asset = houseAsset;
    for (let n = 0; remaining > 0; n++) {
      if (n % 16 === 0) run?.progress?.("housing", required - remaining, required);
      if (ownedPlacements.length >= 1500) {
        housingStop = "placement-cap";
        break;
      }
      const room = housingLimits.totalAttempts - housingAttempts;
      if (room <= 0) {
        housingStop = "budget";
        break;
      }
      const result = housingPacker!.place({ id: `housing:${n}`, asset }, "housing", room);
      housingAttempts += result.attempts;
      if (!result.placement) {
        housingStop = result.incomplete ? "budget" : "frontage";
        break;
      }
      result.placement.building!.districtId =
        districts.find(d => containsRegion([d.polygon], result.placement!.position))?.id ??
        result.placement.building!.districtId;
      ownedPlacements.push(result.placement.id);
      remaining -= result.placement.building!.dwellings;
    }
    if (remaining <= 0) housingStop = "demand-met";
  }
  if (run?.profile) run.profile.housingMs = performance.now() - housingStarted;
  timed("housing-placement");
  const all = [...manual, ...facilities, ...ownedPlacements.filter(id => !facilities.includes(id))].sort(
    (a, b) => Number(inside(doc.placements[b].position)) - Number(inside(doc.placements[a].position))
  );
  checkpoint("housing", all);
  const allocation = allocateVectorResidents(doc, all, required, settings.population, true);
  if (allocation.unplacedDwellings)
    reasons.push(
      housingStop === "budget" || housingStop === "placement-cap"
        ? "housing-search-budget"
        : "housing-capacity-shortfall"
    );
  if (unplacedFacilities.some(item => item.reason === "space" || item.reason === "river" || item.reason === "district"))
    reasons.push("facility-space-shortfall");
  if (unplacedFacilities.some(item => item.reason === "budget" || item.reason === "unsearched"))
    reasons.push("facility-search-starved");
  if (manual.some(id => !doc.placements[id].building && doc.placements[id].display?.dwellings === undefined))
    reasons.push("manual-capacity-unverified");
  if (packer?.budgetExceeded() || housingPacker?.budgetExceeded() || (!organic && ownedPlacements.length >= 1500))
    reasons.push("placement-budget");
  if (run?.profile) {
    run.profile.facilityAttempts = facilityAttempts;
    run.profile.housingAttempts = housingAttempts;
    run.profile.regionMs = searchStats.regionMs;
    run.profile.curveMs = searchStats.curveMs;
    run.profile.starvedFacilities = unplacedFacilities.filter(item => item.reason === "unsearched").length;
    run.profile.cappedFacilities = unplacedFacilities.filter(item => item.reason === "budget").length;
    run.profile.housingStop = housingStop;
  }
  run?.progress?.("validation");
  timed("population-allocation");
  const fabricDwellings = (inner: boolean) =>
    Object.values(doc.fabric?.cells ?? {})
      .filter(c => !!c.inside === inner)
      .reduce((n, c) => n + c.houses.dwellings.reduce((m, d, i) => m + (c.detached.includes(i) ? 0 : d), 0), 0);
  const residualLand = organic
    ? vectorPerimeterResidual(doc, organic.blocks)
    : deriveVectorBlocks(doc, protectedRegions).map(b => ({ outer: b.outer, holes: b.holes }));
  timed("residual-land");
  doc.site = sourceSite;
  doc.context.targetPopulation = settings.population;
  doc.revision++;
  doc.generation = { ...doc.generation!, blocks, inputRevision: doc.revision };
  doc.urban = {
    algorithm: VECTOR_URBAN_ALGORITHM,
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
      capacityInside:
        all
          .filter(id => inside(doc.placements[id].position))
          .reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0) + fabricDwellings(true),
      capacityOutside:
        all
          .filter(id => !inside(doc.placements[id].position))
          .reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0) + fabricDwellings(false),
      requiredFacilities: requests.length,
      placedFacilities: facilities.length,
      provisionalFacilities: facilities.filter(id => doc.placements[id].building!.provenance === "provisional").length,
      unplacedFacilities,
      housingBuildings:
        ownedPlacements.length -
        facilities.length +
        Object.values(doc.fabric?.cells ?? {}).reduce((n, c) => n + c.houses.offsets.length - c.detached.length, 0),
      reasons
    }
  };
  if (checkpoints.map(c => c.id).join() !== vectorUrbanStages(settings.mode).join()) throw new Error("urban-stages");
  timed("ledger-and-fingerprint");
  assertVectorDocument(doc);
  timed("final-validation");
  if (JSON.stringify(doc).length > VECTOR_DOCUMENT_LIMITS.textLength) throw new Error("urban-document-budget");
  timed("save-budget-check");
  return doc;
}
