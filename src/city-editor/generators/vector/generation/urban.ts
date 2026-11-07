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
import { featureReservations } from "../environmentState";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { assertVectorDocument, VECTOR_DOCUMENT_LIMITS } from "../validation/document";
import { vectorUrbanStages } from "../validation/urban";
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
}
export interface VectorUrbanContinuation {
  retainedPlacements: string[];
  ownedPaths: string[];
  domain: NonNullable<VectorCityDocument["urban"]>["domain"];
  baseGeneration: NonNullable<VectorCityDocument["generation"]>;
  baseConnections: VectorCityDocument["connections"];
  baseContext: VectorCityDocument["context"];
}
type FrontageAsset = {
  minimumSite: { outer: Point[] }[];
  entrances: { outward: Point; required?: boolean }[];
};
/** Street length one real-size site consumes, including the clearance to the next site. */
function streetPitch(asset: FrontageAsset, clearance: number): number {
  const entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0],
    outer = asset.minimumSite.flatMap(site => site.outer);
  if (!entrance || outer.length < 2) return 8;
  const tx = -entrance.outward[1],
    ty = entrance.outward[0];
  let lo = Infinity,
    hi = -Infinity;
  for (const p of outer) {
    const t = p[0] * tx + p[1] * ty;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return Math.max(2, hi - lo) + clearance;
}
/** Depth of a real-size site, including the clearance kept in front of the entrance. */
function lotDepth(asset: FrontageAsset, clearance: number): number {
  const entrance = asset.entrances.find(e => e.required) ?? asset.entrances[0],
    outer = asset.minimumSite.flatMap(site => site.outer);
  if (!entrance || outer.length < 2) return 8 + clearance;
  const len = Math.hypot(entrance.outward[0], entrance.outward[1]) || 1,
    ox = entrance.outward[0] / len,
    oy = entrance.outward[1] / len;
  let lo = Infinity,
    hi = -Infinity;
  for (const p of outer) {
    const t = p[0] * ox + p[1] * oy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return Math.max(4, hi - lo) + clearance;
}
/** Centerline of the straight spurs the lane cap would try. One side of that length is a low credit for new frontage. */
function straightSpurCenterline(candidates: { start: Point; end: Point }[], maxLanes: number, spacing: number): number {
  const seen: Point[] = [];
  let meters = 0;
  let trials = 0;
  for (const candidate of candidates) {
    if (seen.length >= maxLanes || trials >= maxLanes * 8) break;
    if (seen.some(p => Math.hypot(p[0] - candidate.start[0], p[1] - candidate.start[1]) < spacing * 0.5)) continue;
    trials++;
    meters += Math.hypot(candidate.end[0] - candidate.start[0], candidate.end[1] - candidate.start[1]);
    seen.push(candidate.start);
  }
  return meters;
}
/**
 * One lane path folded across a block at the lane spacing.
 * A straight cul-de-sac spends the whole lane on depth, so land beside it never gets a door.
 * The polyline stays a single simple road: in from the mouth, across the far side, then back and forth.
 */
function ladderLane(
  block: { outer: Point[]; holes: Point[][] },
  start: Point,
  origin: Point,
  normal: Point,
  tangent: Point,
  spacing: number,
  depth: number,
  laneWidth: number,
  maxRungs = 8
): Point[] {
  const margin = laneWidth / 2 + 0.8;
  const at = (inward: number, along: number): Point => [
    origin[0] + normal[0] * inward + tangent[0] * along,
    origin[1] + normal[1] * inward + tangent[1] * along
  ];
  const fits = (p: Point, axis: Point) => {
    const side: Point = [-axis[1], axis[0]];
    return [0, margin, -margin].every(d => containsRegion([block], [p[0] + side[0] * d, p[1] + side[1] * d]));
  };
  const lineFits = (a: Point, b: Point) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      axis: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
      steps = Math.max(1, Math.ceil(len / 4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!fits([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], axis)) return false;
    }
    return true;
  };
  const extent = (inward: number, dir: 1 | -1) => {
    if (!fits(at(inward, 0), tangent)) return 0;
    let ok = 0;
    for (let d = 2; d <= 2000; d += 2) {
      if (!fits(at(inward, dir * d), tangent)) break;
      ok = d;
    }
    return ok;
  };
  const rungs: { inward: number; lo: number; hi: number }[] = [];
  const pad = laneWidth;
  for (let inward = spacing; inward <= depth - margin && rungs.length < maxRungs; inward += spacing) {
    const hi = extent(inward, 1) - pad,
      lo = -extent(inward, -1) + pad;
    if (hi - lo < 20) break;
    rungs.push({ inward, lo, hi });
  }
  if (!rungs.length) return [start];
  const first = rungs[0],
    foot = at(first.inward, 0),
    far = Math.abs(first.lo) >= Math.abs(first.hi) ? first.lo : first.hi,
    farPoint = at(first.inward, far);
  if (!lineFits(foot, farPoint)) return [start];
  const points: Point[] = [start, foot, farPoint];
  let along = far;
  for (let i = 1; i < rungs.length; i++) {
    const rung = rungs[i],
      turn = Math.min(rung.hi, Math.max(rung.lo, along)),
      corner = at(rung.inward, turn),
      previous = points.at(-1)!;
    if (!lineFits(previous, corner)) break;
    const dest = Math.abs(rung.lo - turn) >= Math.abs(rung.hi - turn) ? rung.lo : rung.hi,
      destPoint = at(rung.inward, dest);
    if (Math.hypot(destPoint[0] - corner[0], destPoint[1] - corner[1]) < 20 || !lineFits(corner, destPoint)) break;
    points.push(corner, destPoint);
    along = dest;
  }
  return points;
}
export function generateVectorUrban(
  input: VectorCityDocument,
  settings: VectorUrbanSettings = DEFAULT_VECTOR_URBAN,
  continuation?: VectorUrbanContinuation,
  run?: VectorUrbanRun
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
  const protectedRegions = [
    ...featureReservations(doc),
    ...Object.values(doc.regions)
      .filter(r => r.kind !== "district")
      .map(r => ({ outer: r.outer, holes: r.holes }))
  ];
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
  const existingFrontage = blocks.reduce((n, block) => n + block.frontage.reduce((m, f) => m + f.lengthMeters, 0), 0);
  const neededFrontage =
    (houseAsset ? required * streetPitch(houseAsset, settings.clearanceMeters) : 0) +
    requests.reduce((n, request) => n + streetPitch(request.asset, settings.clearanceMeters), 0);
  // Credit the straight spurs with their centerline. Fold only when that still cannot cover real-size pitches.
  const fillBlocks =
    neededFrontage >
    existingFrontage + straightSpurCenterline(laneCandidates, settings.maxLanes, settings.laneSpacingMeters);
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
  const lengthOf = (points: Point[]) =>
    points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
  if (!fillBlocks)
    for (const candidate of laneCandidates) {
      if (ownedPaths.length >= settings.maxLanes || laneTrials >= settings.maxLanes * 8) break;
      if (tooClose(candidate.start)) continue;
      laneTrials++;
      adoptLane([candidate.start, candidate.end], candidate.anchor, candidate.pathId, candidate.block);
    }
  else {
    const grouped = new Map<string, typeof laneCandidates>();
    for (const candidate of laneCandidates) {
      const list = grouped.get(candidate.block.id);
      if (list) list.push(candidate);
      else grouped.set(candidate.block.id, [candidate]);
    }
    const choices = [...grouped.values()].sort(
      (a, b) => b[0].depth - a[0].depth || a[0].pathId.localeCompare(b[0].pathId)
    );
    const clearOfOtherRoads = (start: Point, parentId: string) =>
      Object.values(doc.paths).every(p => {
        if (p.role !== "road" || p.id === parentId) return true;
        const point = evaluateAnchor(p, nearestRoadAnchor(p, start));
        return Math.hypot(point[0] - start[0], point[1] - start[1]) >= settings.laneSpacingMeters * 0.75;
      });
    for (const list of choices) {
      if (ownedPaths.length >= settings.maxLanes || laneTrials >= settings.maxLanes * 8) break;
      // Two facing rows of real-size houses decide how close folded lanes may sit. Requested spacing is the maximum.
      const rungSpacing = Math.min(
        settings.laneSpacingMeters,
        Math.max(
          15,
          (houseAsset ? lotDepth(houseAsset, settings.clearanceMeters) : 9) * 2 + settings.laneWidthMeters + 1
        )
      );
      const ranked = list
        .filter(candidate => !tooClose(candidate.start) && clearOfOtherRoads(candidate.start, candidate.pathId))
        .map(candidate => {
          const ladder = ladderLane(
            candidate.block,
            candidate.start,
            candidate.origin,
            candidate.normal,
            candidate.tangent,
            rungSpacing,
            candidate.depth,
            settings.laneWidthMeters
          );
          const spur = [candidate.start, candidate.end];
          return { candidate, ladder, spur, length: Math.max(lengthOf(ladder), lengthOf(spur)) };
        })
        .sort((a, b) => b.length - a.length);
      let adopted = false;
      for (const item of ranked.slice(0, 6)) {
        if (ownedPaths.length >= settings.maxLanes || adopted) break;
        laneTrials++;
        let points = item.ladder;
        for (let trim = 0; trim < 4 && points.length >= 3 && lengthOf(points) >= lengthOf(item.spur); trim++) {
          if (adoptLane(points, item.candidate.anchor, item.candidate.pathId, item.candidate.block)) {
            adopted = true;
            break;
          }
          points = points.slice(0, -2);
        }
      }
      if (!adopted && ranked[0] && ownedPaths.length < settings.maxLanes)
        adoptLane(ranked[0].spur, ranked[0].candidate.anchor, ranked[0].candidate.pathId, ranked[0].candidate.block);
    }
  }
  if (run?.profile) run.profile.lanesMs = performance.now() - laneStarted;
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
  const searchStats: UrbanSearchStats = { regionMs: 0, curveMs: 0 };
  const facilityLimits = {
    totalAttempts: run?.facilityAttempts ?? FACILITY_SEARCH_LIMITS.totalAttempts,
    requestAttempts: run?.requestAttempts ?? FACILITY_SEARCH_LIMITS.requestAttempts
  };
  const housingLimits = {
    totalAttempts: run?.housingAttempts ?? HOUSING_SEARCH_LIMITS.totalAttempts,
    requestAttempts: run?.housingAttempts ?? HOUSING_SEARCH_LIMITS.requestAttempts
  };
  const packer = createUrbanPacker(
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
  for (const request of requests) {
    if (ownedPlacements.includes(`urban:${request.id}`)) continue;
    const room = facilityLimits.totalAttempts - facilityAttempts;
    if (ownedPlacements.length >= 1500 || room <= 0) {
      unplacedFacilities.push({ id: request.id, reason: "unsearched" });
      continue;
    }
    const result = packer.place(request, "facility", Math.min(facilityLimits.requestAttempts, room));
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
    const result = packer.place(request, "facility", Math.min(40, retryCeiling - facilityAttempts));
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
  const facilityLand = deriveVectorBlocks(doc, protectedRegions),
    housingPacker = createUrbanPacker(doc, facilityLand, settings, core, new Map(), housingLimits, searchStats);
  let remaining =
    required - [...manual, ...ownedPlacements].reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0);
  let housingAttempts = 0;
  let housingStop: VectorUrbanProfile["housingStop"] = remaining > 0 ? "frontage" : "demand-met";
  const housingStarted = performance.now();
  if (remaining > 0 && houseAsset) {
    const asset = houseAsset;
    for (let n = 0; remaining > 0; n++) {
      if (ownedPlacements.length >= 1500) {
        housingStop = "placement-cap";
        break;
      }
      const room = housingLimits.totalAttempts - housingAttempts;
      if (room <= 0) {
        housingStop = "budget";
        break;
      }
      const result = housingPacker.place({ id: `housing:${n}`, asset }, "housing", room);
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
  const all = [...manual, ...facilities, ...ownedPlacements.filter(id => !facilities.includes(id))].sort(
    (a, b) => Number(inside(doc.placements[b].position)) - Number(inside(doc.placements[a].position))
  );
  checkpoint("housing", all);
  const allocation = allocateVectorResidents(doc, all, required, settings.population);
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
  if (manual.some(id => !doc.placements[id].building)) reasons.push("manual-capacity-unverified");
  if (packer.budgetExceeded() || housingPacker.budgetExceeded() || ownedPlacements.length >= 1500)
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
