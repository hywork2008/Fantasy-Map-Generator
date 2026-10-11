import { resolveBridgeCrossingLimit } from "../../../../utils/bridgeCrossingPolicy";
import { populationWindowMeters } from "../../../../utils/requiredSiteBounds";
import { planRiverCrossing, RIVER_CARGO_VESSEL } from "../../../../utils/riverCrossing";
import { dryRuns } from "../../waterGeometry";
import { importedRoadsForSite } from "./importedRoads";
// BurgSiteDescriptor → the primitives the S0–S3 pipeline consumes. Pure parsing;
// no world-map imports. Used for both the synth path and real FMG descriptors —
// the pipeline never sees the descriptor directly.
//
// Coast / river polylines are down-sampled to ROUGH CORRIDORS: S1/S2 walk the
// Voronoi graph along them, so a dense descriptor polyline would over-constrain
// the shape. ~8 control points keeps the corridor's intent (chord, mouth, big
// bends) while leaving the fine shape to the graph.

import {
  azimuthToVec,
  nearestOnPolyline,
  pointInPolygon,
  polylineTangent,
  sideOfPolyline,
  simplifyPolyline,
  vecToAzimuth
} from "../geom";
import type { CityGeography, CityParams, CityProgram, Point, WallPlan } from "../types";
import { DEFAULT_WALL_PLAN } from "../types";
import type { BurgSiteDescriptor } from "./burgSiteDescriptor";

// A coast's shape comes from the graph walk, so a few control points suffice.
// A river's bends ARE the intent and must survive down-sampling — keep more.
const CORRIDOR_POINTS = 8;
const RIVER_CORRIDOR_POINTS = 22;

export function siteToParams(site: BurgSiteDescriptor): CityParams {
  assertRegionalCoverage(site);
  const { cityRadiusMeters, extentMeters } = site.frame;
  return {
    seed: site.burg.seed,
    extentMeters,
    cityRadiusMeters,
    dwellings: site.burg.dwellings,
    // Coarse from the start — one Voronoi cell ≈ one ward (TownGeneratorTS patch
    // scale). One light Lloyd pass keeps organic size/shape variety (design §4.2 S0).
    cellSizeMeters: cityRadiusMeters / 3.5,
    lloydPasses: 1
  };
}

export function siteToGeography(site: BurgSiteDescriptor, imported = false): CityGeography {
  assertRegionalCoverage(site);
  site = withWideRiverOffCore(site);
  const coast = extractCoast(site);
  // A wide river is not a second ocean. Promoting it to a coast half-plane
  // floods the far countryside and, at an estuary, can swallow the burg.
  // Draw only the channel, between the town-side bank and the far bank, and
  // keep the real sea/lake (if any) as the harbour shore.
  const { channels, consumed } =
    site.fixedCrossings && site.fixedCrossings.schemaVersion !== 1
      ? { channels: [], consumed: new Set(site.rivers.map(r => r.riverId)) }
      : extractWideChannels(site);
  const waterAreas = coast ? [{ ...coast, kind: site.waterbody?.kind ?? "ocean" } as const] : [];
  return {
    ...(site.burg.waterAccess?.port.river ? { riverPort: true } : {}),
    ...(site.burg.waterAccess?.port.sea ? { seaPort: true } : {}),
    coast,
    waterAreas,
    channels,
    rivers: extractRivers(site, consumed),
    roadBearings: extractRoadBearings(site),
    roadPaths: site.roads
      .filter(r => r.group !== "searoutes" && r.path.length >= 2)
      .map(r => r.path.map(p => [p[0], p[1]])),
    importedRoads: imported
      ? importedRoadsForSite(site).map(road => {
          if (!site.burg.waterAccess?.port.river) return road;
          // A port approach crossing an open-water channel ends at its town-side
          // landing. Keep its FMG identity rather than dropping the road or
          // drawing a ground road across the navigable water.
          const dry = dryRuns(
            road.path,
            channels.map(c => c.polygon)
          );
          const townRun = dry.find(run => Math.hypot(...run[0]) < 1);
          if (!townRun || townRun.length < 2) return road;
          const farRun = dry.at(-1)!;
          const tip: Point = [...townRun.at(-1)!];
          const farTip: Point = [...farRun[0]];
          const crosses = dry.length > 1;
          const river = site.rivers.find(r => r.riverId === site.burg.waterAccess?.riverId);
          const crossing = planRiverCrossing({
            widthMeters: Math.hypot(farTip[0] - tip[0], farTip[1] - tip[1]),
            depthMeters: river?.depthMeters,
            period: site.historicalPeriod,
            transport: site.transport,
            vessel: river?.navigationVessel ?? RIVER_CARGO_VESSEL
          });
          const prev = townRun.at(-2)!;
          const len = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]);
          if (len > 30 && Math.hypot(tip[0] - road.path.at(-1)![0], tip[1] - road.path.at(-1)![1]) > 1) {
            townRun[townRun.length - 1] = [
              tip[0] + ((prev[0] - tip[0]) * 30) / len,
              tip[1] + ((prev[1] - tip[1]) * 30) / len
            ];
          }
          return {
            ...road,
            path: townRun,
            ...(crosses
              ? {
                  riverConnection: {
                    sourceIndex: road.sourceIndex,
                    farRoad: farRun,
                    townRoad: [townRun.at(-1)!, tip],
                    banks: [tip, farTip] as [Point, Point],
                    crossing: river?.crossing ?? crossing
                  }
                }
              : {}),
            ...(Math.hypot(tip[0] - road.path.at(-1)![0], tip[1] - road.path.at(-1)![1]) > 1
              ? { riverLanding: true }
              : {})
          };
        })
      : undefined,
    suggestedGates: site.suggestedGates
  };
}

/** Port topology survives FMG window clipping. */
function hasSurveyedCourse(river: SiteRiver | undefined): boolean {
  if (!river) return false;
  return [...river.segments.map(segment => segment.points), ...river.leftBankSegments, ...river.rightBankSegments].some(
    line => line.length >= 2
  );
}

/** A river at least as wide as the town radius cannot run through the core:
 * the town would sit in the channel. Without surveyed physical banks
 * (`fixedCrossings`) or usable banks its course is only a coarse polyline through
 * the burg point, and walking it as a stroke paints round, brush-like banks.
 * Lay it straight along that course's chord, on the side the chord passes,
 * with the town-side bank toward the frame edge. */
const offCoreRivers = new WeakSet<SiteRiver>();

function hasSurveyedBanks(river: SiteRiver): boolean {
  return [...river.leftBankSegments, ...river.rightBankSegments].some(line => line.length >= 2);
}

function withWideRiverOffCore(site: BurgSiteDescriptor): BurgSiteDescriptor {
  if (site.fixedCrossings) return site;
  const radius = site.frame.cityRadiusMeters;
  const reach = site.frame.extentMeters * 2;
  const status = site.burg.riverSiteStatus;
  // Band centre of each relaid river, so a tributary can bend to meet it.
  const moved = new Map<number, Point>();
  const relay = (river: SiteRiver): SiteRiver => {
    if (river.frontage === "beyond-budget" || moved.has(river.riverId)) return river;
    // Channels (unbridgeable or river-port water) already keep their own bank
    // clearance, and surveyed banks are authoritative unless FMG itself could
    // not place the burg on them (e.g. `folded-banks`). A tributary whose
    // parent was relaid has lost the confluence its banks led to.
    const parent = river.parentRiverId == null ? undefined : moved.get(river.parentRiverId);
    const unresolved = (status?.status === "unresolved" && status.riverId === river.riverId) || !!parent;
    if (
      unbridgeableOnSite(site, river) ||
      (site.burg.waterAccess?.port.river && site.burg.waterAccess.riverId === river.riverId)
    ) {
      // buildChannels lays an unresolved channel along its chord, so its
      // tributaries lose the confluence at the burg point as well.
      const course = centerlineOf(river);
      if (unresolved && !parent && course.length >= 2)
        moved.set(river.riverId, nearestOnPolyline([0, 0], [course[0], course.at(-1)!]).point);
      return river;
    }
    if (!unresolved && hasSurveyedBanks(river)) return river;
    const width = drawnWidthMeters(river);
    const course = centerlineOf(river);
    if (width < radius || course.length < 2) return river;
    if (nearestOnPolyline([0, 0], course).dist - width / 2 >= radius) return river;
    const chord: Point[] = [course[0], course.at(-1)!];
    const length = Math.hypot(chord[1][0] - chord[0][0], chord[1][1] - chord[0][1]);
    if (length < 1) return river;
    const tangent: Point = [(chord[1][0] - chord[0][0]) / length, (chord[1][1] - chord[0][1]) / length];
    // Positive side = left of the flow, matching `offsetPolyline`. A course
    // through the burg point has no side; a tributary then leans towards its
    // parent's band, so the confluence stays out of town.
    const side = sideOfPolyline([0, 0], chord);
    const toward = parent ? -tangent[1] * parent[0] + tangent[0] * parent[1] : 0;
    const water =
      Math.abs(side) > 1
        ? -Math.sign(side)
        : Math.abs(toward) > 1
          ? Math.sign(toward)
          : river.cityBank === "left"
            ? -1
            : 1;
    // Toward the frame edge: the town-side bank lies halfway between the core
    // and the frame, leaving the town its outskirts and castle ground.
    const offset = width / 2 + Math.max(radius * 1.1, (radius + site.frame.extentMeters / 2) / 2);
    const center: Point = [-tangent[1] * water * offset, tangent[0] * water * offset];
    const points: Point[] = [
      [center[0] - tangent[0] * reach, center[1] - tangent[1] * reach],
      [center[0] + tangent[0] * reach, center[1] + tangent[1] * reach]
    ];
    moved.set(river.riverId, center);
    const relaid: SiteRiver = {
      ...river,
      widthMeters: width,
      axisAzimuthDeg: vecToAzimuth(tangent[0], tangent[1]),
      offsetMeters: offset,
      offsetRatio: offset / radius,
      rawOffsetMeters: offset,
      crossesSite: false,
      snappedToBank: false,
      segments: [{ points, widthsMeters: points.map(() => width) }],
      leftBankSegments: [],
      rightBankSegments: []
    };
    offCoreRivers.add(relaid);
    return relaid;
  };
  // Parents first: each pass can release the tributaries of the last.
  let rivers = site.rivers;
  for (let pass = 0; pass < site.rivers.length; pass++) {
    const before = moved.size;
    rivers = rivers.map(relay);
    if (moved.size === before) break;
  }
  return moved.size ? { ...site, rivers } : site;
}

/** The built programme: the descriptor's Feature flags pass straight through;
 * `wallPlan` is derived from them + the site by the wall-patterns.md §8 matrix.
 * Same shape for a real FMG descriptor and a synthetic one. */
export function siteToProgram(site: BurgSiteDescriptor): CityProgram {
  const b = site.burg;
  const flags = {
    walls: b.walls,
    citadel: b.citadel,
    plaza: b.plaza,
    temple: b.temple,
    port: b.port,
    shanty: b.shanty,
    capital: b.capital
  };
  return { ...flags, wallPlan: siteToWallPlan(site, flags) };
}

/**
 * Pick a wall pattern from the descriptor (wall-patterns.md §8). M4b only emits
 * the implemented enum members; the rest are reached via the UI / M4b.1.
 */
export function siteToWallPlan(site: BurgSiteDescriptor, program: Omit<CityProgram, "wallPlan">): WallPlan {
  assertRegionalCoverage(site);
  site = withWideRiverOffCore(site);
  const plan: WallPlan = { ...DEFAULT_WALL_PLAN, extent: program.walls ? "full" : "none" };
  const hasCoast = site.waterbody !== null || site.rivers.some(r => unbridgeableOnSite(site, r));
  const hasRiver = site.rivers.some(r => r.throughBurgCell || r.crossesSite || Math.abs(r.offsetRatio) < 1.6);
  const fortified = program.citadel || program.capital;

  // A harbour uses the shore as its natural boundary. Sea defenses are an
  // independent Wall coast choice, not a consequence of capital/castle status.
  if (hasCoast) plan.coast = program.port ? "open" : "seaWall";

  if (hasCoast && program.port) {
    plan.envelope = "hull";
    plan.line = fortified ? "organic" : "polygonal";
  } else if (hasRiver) {
    plan.envelope = "notchFilled";
    plan.line = "organic";
  } else if (site.suggestedArchetype === "hillTop") {
    plan.envelope = "notchFilled"; // sectorPolygon in M4b.1
    plan.line = "organic";
  } else if (site.burg.population >= 8_000) {
    plan.envelope = "notchFilled"; // denseCore / expanded in M4b.1
    plan.line = "polygonal";
  } else {
    plan.envelope = "notchFilled";
    plan.line = "organic";
  }
  return plan;
}

/** Overlay non-"auto" UI choices on a matrix-derived plan (standalone only). */
export function resolveWallPlan(
  base: WallPlan,
  choice: { envelope?: string; coast?: string; line?: string }
): WallPlan {
  const next = { ...base };
  if (choice.envelope && choice.envelope !== "auto") next.envelope = choice.envelope as WallPlan["envelope"];
  if (choice.coast && choice.coast !== "auto") next.coast = choice.coast as WallPlan["coast"];
  if (choice.line && choice.line !== "auto") next.line = choice.line as WallPlan["line"];
  return next;
}

function extractCoast(site: BurgSiteDescriptor): CityGeography["coast"] {
  const wb = site.waterbody;
  if (!wb) return null;
  const waterAzimuthDeg = wb.shoreAzimuthDeg;
  const runs = wb.shoreline
    .map((line, index) => ({ line: line as Point[], side: wb.shorelineWaterSide?.[index] }))
    .filter(run => run.line.length >= 2)
    .sort((a, b) => polylineLength(b.line) - polylineLength(a.line));
  const longest = runs[0]?.line;
  if (longest) {
    // Further runs of the same coast cross the frame away from the town (a
    // cape over a corner). Only their FMG water side places them; a run with
    // no recorded side stays unknown rather than guessed.
    const extraShores = runs.slice(1).flatMap(({ line, side }) => {
      if (!side) return [];
      const wet = waterSideWitness(line, side);
      return wet ? [{ line: line.map(p => [p[0], p[1]] as Point), wet }] : [];
    });
    const shore = keepImportedLandDry(site, longest, azimuthToVec(waterAzimuthDeg));
    const corridor = downsample(shore, CORRIDOR_POINTS);
    const regionalShore: Point[] = shore.map(p => [p[0], p[1]]);
    // FMG settles every port within its waterfront gap of this shore
    // (waterfrontSettlement.ts); a shore beyond the town is reported there,
    // never pulled here.
    return {
      corridor,
      waterAzimuthDeg,
      regionalShore,
      ...(extraShores.length ? { regionalExtraShores: extraShores } : {})
    };
  }
  // No surveyed shore in the window: FMG's waterfront check reports the port;
  // City Editor does not invent a coast.
  return null;
}

/** A point just off the longest segment of `line`, on its `side` of travel. */
function waterSideWitness(line: Point[], side: "left" | "right"): Point | null {
  let best = -1,
    bestLength = 0;
  for (let i = 1; i < line.length; i++) {
    const length = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (length > bestLength) [best, bestLength] = [i, length];
  }
  if (best < 0 || bestLength < 1e-6) return null;
  const [a, b] = [line[best - 1], line[best]];
  const [tx, ty] = [(b[0] - a[0]) / bestLength, (b[1] - a[1]) / bestLength];
  // Y-up local frame: the left normal of travel (tx, ty) is (-ty, tx).
  const sign = side === "left" ? 1 : -1;
  const offset = Math.min(2, bestLength / 4);
  return [(a[0] + b[0]) / 2 - ty * sign * offset, (a[1] + b[1]) / 2 + tx * sign * offset];
}

/** Imported features the pulled-in coast must leave on dry land, with this margin. */
const PULLED_COAST_CLEARANCE_METERS = 60;
const PULLED_COAST_SAMPLE_METERS = 20;

/** Points of FMG's fixed bridges and land roads in the window, every few metres. */
function importedLandPoints(site: BurgSiteDescriptor): Point[] {
  const half = site.frame.extentMeters / 2;
  const points: Point[] = [];
  const addSegment = (a: Point, b: Point) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / PULLED_COAST_SAMPLE_METERS));
    for (let i = 0; i <= steps; i++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps];
      if (Math.abs(p[0]) <= half && Math.abs(p[1]) <= half) points.push(p);
    }
  };
  for (const c of site.fixedCrossings?.crossings ?? []) {
    addSegment(c.approachA as Point, c.deckA as Point);
    addSegment(c.deckA as Point, c.deckB as Point);
    addSegment(c.deckB as Point, c.approachB as Point);
  }
  for (const road of site.regionalContext?.roads ?? [])
    for (let i = 1; i < road.points.length; i++) addSegment(road.points[i - 1] as Point, road.points[i] as Point);
  return points;
}

/**
 * FMG draws its coast at kilometre scale, so inside a town window it can run
 * across land FMG itself routes over (Matra: the drawn coast crossed the town
 * and put the eastern road, its bridge and the far bank in the sea). Those
 * roads and bridges are surveyed; bend the shore seaward around them, with a
 * smooth falloff, until each lies on land with the pulled-coast clearance.
 */
function keepImportedLandDry(site: BurgSiteDescriptor, line: Point[], toWater: Point): Point[] {
  const points = importedLandPoints(site);
  const deficit = (shore: Point[]) =>
    points.flatMap(p => {
      const near = nearestOnPolyline(p, shore);
      const seaward = (p[0] - near.point[0]) * toWater[0] + (p[1] - near.point[1]) * toWater[1];
      const need = seaward >= 0 ? seaward + PULLED_COAST_CLEARANCE_METERS : PULLED_COAST_CLEARANCE_METERS - near.dist;
      return need > 0 ? [{ p, need }] : [];
    });
  if (!points.length || !deficit(line).length) return line;
  const shore: Point[] = [];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / PULLED_COAST_SAMPLE_METERS));
    for (let k = 0; k < steps; k++)
      shore.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
  }
  shore.push([line.at(-1)![0], line.at(-1)![1]]);
  const reach = site.frame.extentMeters * 0.45;
  let moved = 0;
  for (let round = 0; round < 40; round++) {
    const wet = deficit(shore);
    if (!wet.length) break;
    for (const v of shore) {
      let move = 0;
      for (const { p, need } of wet) {
        const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
        if (d < reach) move = Math.max(move, need * (0.5 + 0.5 * Math.cos((Math.PI * d) / reach)));
      }
      v[0] += toWater[0] * move * 1.05;
      v[1] += toWater[1] * move * 1.05;
    }
    moved += Math.max(0, ...wet.map(item => item.need));
  }
  // A shore already within a few metres of the clearance keeps FMG's points.
  if (moved < PULLED_COAST_SAMPLE_METERS) return line;
  // Hand back a few control points, as FMG gave them. The sea walk clamps
  // corridor points beyond the town mesh onto its edge, and a dense line put
  // most of them there and flipped the sea (Valsaz).
  return simplifyPolyline(shore, 2);
}

type SiteRiver = BurgSiteDescriptor["rivers"][number];

function bridgeCrossingMeters(site: BurgSiteDescriptor): number {
  return resolveBridgeCrossingLimit(site.historicalPeriod, site.transport);
}

/** Widest water in the town window. The width at the burg can be bridgeable
 * while a clipped downstream sample is already wider than the era's supported crossing allowance. */
function drawnWidthMeters(river: SiteRiver): number {
  let width = river.widthMeters;
  for (const seg of river.segments) {
    for (const sample of seg.widthsMeters) if (sample > width) width = sample;
  }
  return width;
}

/** A channel the town's era cannot span, passing through the burg or the city disk. */
function unbridgeableOnSite(site: BurgSiteDescriptor, river: SiteRiver): boolean {
  return drawnWidthMeters(river) > bridgeCrossingMeters(site) && (river.throughBurgCell || river.crossesSite);
}

/** Land the burg must keep between the map origin and a wide channel. */
function bankMarginMeters(site: BurgSiteDescriptor): number {
  return Math.min(150, Math.max(20, 0.3 * site.frame.cityRadiusMeters));
}

/** Nearest measured centreline or bank. Infinity when the survey has no course. */
function nearestSurveyMeters(river: SiteRiver): number {
  let best = Infinity;
  const lines = [
    ...river.segments.map(segment => segment.points),
    ...river.leftBankSegments,
    ...river.rightBankSegments
  ];
  for (const line of lines) {
    if (line.length < 2) continue;
    best = Math.min(best, nearestOnPolyline([0, 0], line).dist);
  }
  return best;
}

/** Outside the population window a mesh walk would pin the water to the town edge. */
function surveyedOutsideTownWindow(site: BurgSiteDescriptor, river: SiteRiver): boolean {
  if (!hasSurveyedCourse(river)) return false;
  return nearestSurveyMeters(river) > populationWindowMeters(site.frame.cityRadiusMeters) / 2 + 1;
}

function extractWideChannels(site: BurgSiteDescriptor): {
  channels: NonNullable<CityGeography["channels"]>;
  consumed: Set<number>;
} {
  const consumed = new Set<number>();
  const channels: NonNullable<CityGeography["channels"]> = [];
  const margin = bankMarginMeters(site);
  const half = site.frame.extentMeters / 2;
  for (const river of site.rivers) {
    if (river.frontage === "beyond-budget") continue;
    const portChannel =
      !!site.burg.waterAccess?.port.river &&
      site.burg.waterAccess.riverId === river.riverId &&
      drawnWidthMeters(river) > site.frame.cityRadiusMeters * 0.4;
    // A course outside the town mesh is drawn from its banks, not walked as a stroke.
    // A river moved off the core is a straight band; walking a stroke that
    // wide over the mesh paints round, brush-like banks.
    if (
      !unbridgeableOnSite(site, river) &&
      !portChannel &&
      !surveyedOutsideTownWindow(site, river) &&
      !offCoreRivers.has(river)
    )
      continue;
    // Broad river ports need a real water surface and shoreline even when
    // bridge technology could span the river. The stroke/wall pipeline cannot
    // model that frontage or berth piers on it.
    consumed.add(river.riverId);
    const status = site.burg.riverSiteStatus;
    const unresolved = status?.status === "unresolved" && status.riverId === river.riverId;
    channels.push(...buildChannels(river, drawnWidthMeters(river), margin, half, unresolved));
  }
  return { channels, consumed };
}

/** Town-side bank to far bank, extended across the window. The origin stays
 * on dry land; when the true bank is closer than `margin`, the near edge
 * moves into the channel rather than the town moving off centre. */
function buildChannels(
  river: SiteRiver,
  widthMeters: number,
  margin: number,
  halfExtent: number,
  /** FMG could not place the burg on this course (e.g. `invalid-curve`). */
  unresolved = false
): NonNullable<CityGeography["channels"]> {
  // FMG's surveyed physical banks are authoritative; do not push the near
  // bank into the channel to make room for the generated town. Legacy snapped
  // surveys may contain exaggerated banks; reconstruct their channel below.
  const left = river.leftBankSegments.filter(line => line.length >= 2);
  const right = river.rightBankSegments.filter(line => line.length >= 2);
  const channel = (near: Point[], far: Point[]): NonNullable<CityGeography["channels"]>[number] => {
    const hit = nearestOnPolyline([0, 0], near);
    return {
      polygon: [...near, ...[...far].reverse()],
      shoreline: near,
      waterAzimuthDeg: vecToAzimuth(hit.point[0], hit.point[1])
    };
  };
  // Banks of an unresolved course only offset the same bent polyline.
  if (!unresolved && !river.snappedToBank && left.length && right.length) {
    // Clipping each bank independently can produce different fragment counts.
    // Pair only mutually closest fragments, never concatenate across a gap or
    // assume that the same array index identifies the same stretch of river.
    const distance = (a: Point[], b: Point[]): number =>
      Math.min(...a.map(p => nearestOnPolyline(p, b).dist), ...b.map(p => nearestOnPolyline(p, a).dist));
    const distances = left.map(a => right.map(b => distance(a, b)));
    const closestRight = distances.map(row => row.indexOf(Math.min(...row)));
    const closestLeft = right.map((_, j) => {
      const column = distances.map(row => row[j]);
      return column.indexOf(Math.min(...column));
    });
    const pairedLeft = new Set<number>();
    const pairedRight = new Set<number>();
    const result: NonNullable<CityGeography["channels"]> = [];
    for (let i = 0; i < left.length; i++) {
      const j = closestRight[i];
      if (closestLeft[j] !== i) continue;
      pairedLeft.add(i);
      pairedRight.add(j);
      result.push(river.cityBank === "left" ? channel(left[i], right[j]) : channel(right[j], left[i]));
    }
    // An unmatched bank has its opposite bank outside the clipping window.
    // Preserve each fragment separately using the existing one-bank fallback.
    for (const [lines, paired] of [
      [left, pairedLeft],
      [right, pairedRight]
    ] as const) {
      for (let i = 0; i < lines.length; i++) {
        if (paired.has(i)) continue;
        const near = lines[i];
        const sign = Math.sign(sideOfPolyline([0, 0], near)) || (river.cityBank === "left" ? 1 : -1);
        result.push(channel(near, offsetPolyline(near, -sign * widthMeters)));
      }
    }
    return result;
  }
  // A kilometre-scale river can have only its town-side bank in the local
  // frame. Keep that water boundary even when its centreline is off-screen.
  if (!unresolved && !river.snappedToBank && (left.length || right.length)) {
    return [...left, ...right].map(near => {
      const sign = Math.sign(sideOfPolyline([0, 0], near)) || (river.cityBank === "left" ? 1 : -1);
      return channel(near, offsetPolyline(near, -sign * widthMeters));
    });
  }
  // An unresolved course is only a coarse polyline bent through the burg
  // point. Offsetting a band hundreds of metres wide around that bend folds
  // it over itself and over the origin (Berbafudovar: a 605 m port river
  // left no urban land). Lay the band along the course's chord instead.
  const course = centerlineOf(river);
  const segments = unresolved && course.length > 2 ? [{ points: [course[0], course.at(-1)!] }] : river.segments;
  return segments.flatMap(segment => {
    const centerline = extendPastFrame(withoutRepeats(segment.points), halfExtent);
    if (centerline.length < 2 || widthMeters <= 0) return [];
    const side = sideOfPolyline([0, 0], centerline);
    const sign = Math.abs(side) < 1e-3 ? (river.cityBank === "left" ? 1 : -1) : Math.sign(side);
    let nearOffset = (widthMeters / 2) * sign;
    const farOffset = -(widthMeters / 2) * sign;
    let near = offsetPolyline(centerline, nearOffset);
    for (let i = 0; i < 6; i++) {
      // Clearance is positive only on the town side of the bank. An origin
      // inside the channel needs the bank moved past it before adding margin.
      const dist = sideOfPolyline([0, 0], near) * sign;
      if (dist >= margin - 0.5) break;
      nearOffset -= (margin - dist) * sign;
      near = offsetPolyline(centerline, nearOffset);
    }
    const far = offsetPolyline(centerline, farOffset);
    const polygon = [...near, ...[...far].reverse()];
    if (polygon.length < 4 || pointInPolygon([0, 0], polygon)) return [];
    const hit = nearestOnPolyline([0, 0], near);
    return [
      {
        polygon,
        shoreline: near,
        waterAzimuthDeg: vecToAzimuth(hit.point[0], hit.point[1])
      }
    ];
  });
}

function centerlineOf(river: SiteRiver): Point[] {
  const pts: Point[] = [];
  for (const seg of river.segments) {
    for (const p of seg.points) {
      const q: Point = [p[0], p[1]];
      const prev = pts[pts.length - 1];
      if (prev && Math.hypot(prev[0] - q[0], prev[1] - q[1]) < 1) continue;
      pts.push(q);
    }
  }
  return pts;
}

function extendPastFrame(poly: Point[], half: number): Point[] {
  if (poly.length < 2) return poly;
  const reach = half * 3;
  const outward = (tip: Point, prev: Point): Point => {
    const dx = tip[0] - prev[0];
    const dy = tip[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    return [tip[0] + (dx / len) * reach, tip[1] + (dy / len) * reach];
  };
  return [outward(poly[0], poly[1]), ...poly.slice(1, -1), outward(poly[poly.length - 1], poly[poly.length - 2])];
}

/** Consecutive repeats (FMG segment joins) have no tangent; offsetting them
 * would pin both banks to the centreline and pinch the channel shut. */
function withoutRepeats(poly: Point[]): Point[] {
  return poly.filter((p, i) => i === 0 || Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) > 1e-6);
}

/** Signed offset along the left normal. Positive `distance` is left of the flow. */
function offsetPolyline(line: Point[], distance: number): Point[] {
  const poly = withoutRepeats(line);
  if (poly.length < 2) return poly;
  return poly.map((p, i) => {
    const t = polylineTangent(poly, Math.min(i, poly.length - 2));
    return [p[0] - t[1] * distance, p[1] + t[0] * distance] as Point;
  });
}

function extractRivers(site: BurgSiteDescriptor, wideChannelIds: Set<number>): CityGeography["rivers"] {
  const crossingLimit = bridgeCrossingMeters(site);
  return (
    site.rivers
      .filter(r => r.frontage !== "beyond-budget" && !wideChannelIds.has(r.riverId))
      .filter(r => r.segments.some(s => s.points.length >= 2))
      // Drop a river that neither crosses the site nor runs near it: real FMG
      // descriptors sometimes list a large river ~2+ radii away (offsetRatio) that
      // has nothing to do with the town plan but would otherwise dominate the window.
      // The burg's own surveyed frontage stays, including one outside 1.6 radii.
      .filter(
        r =>
          r.throughBurgCell ||
          r.crossesSite ||
          Math.abs(r.offsetRatio) < 1.6 ||
          (hasSurveyedCourse(r) &&
            (site.burg.waterAccess?.riverId === r.riverId || site.burg.riverPlacement?.riverId === r.riverId))
      )
      .map(r => {
        const pts: Point[] = [];
        const widths: number[] = [];
        for (const seg of r.segments) {
          for (let i = 0; i < seg.points.length; i++) {
            const p = seg.points[i] as Point,
              prev = pts.at(-1);
            // FMG repeats the join point between segments; a zero-length step has no direction.
            if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) <= 1e-6) continue;
            pts.push(p);
            widths.push(seg.widthsMeters[i] ?? r.widthMeters);
          }
        }
        return {
          corridor: downsample(pts, RIVER_CORRIDOR_POINTS),
          widths: downsampleScalars(widths, RIVER_CORRIDOR_POINTS),
          cityBank: r.cityBank,
          // A road on the world map does not make a channel wider than the era's
          // crossing allowance bridgeable. Those channels are water bands, not strokes.
          bridgeAllowed: r.crossing
            ? ["fixedBridge", "movableBridge"].includes(r.crossing.kind)
            : drawnWidthMeters(r) <= crossingLimit,
          crossing: r.crossing,
          joinsWater:
            (r.parentRiverId !== null && wideChannelIds.has(r.parentRiverId)) ||
            r.downstream.terminal === "ocean" ||
            r.downstream.terminal === "lake"
        };
      })
      .filter(r => r.corridor.length >= 2)
  );
}

function extractRoadBearings(site: BurgSiteDescriptor): number[] {
  return site.roads.filter(r => r.group !== "searoutes").map(r => r.entryAzimuthDeg);
}

/** Evenly-spaced arc-length samples of a polyline (>= 2, <= `poly.length`). */
function downsample(poly: Point[], count: number): Point[] {
  if (poly.length <= count) return poly.map(p => [p[0], p[1]] as Point);
  const cum = arcLengths(poly);
  const total = cum[cum.length - 1] || 1;
  const out: Point[] = [];
  for (let k = 0; k < count; k++) {
    const [i, t] = locate(cum, (k / (count - 1)) * total);
    out.push([poly[i][0] + (poly[i + 1][0] - poly[i][0]) * t, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * t]);
  }
  return out;
}

function downsampleScalars(values: number[], count: number): number[] {
  if (values.length <= count) return values.slice();
  return Array.from({ length: count }, (_, k) => values[Math.round((k / (count - 1)) * (values.length - 1))]);
}

function arcLengths(poly: Point[]): number[] {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  }
  return cum;
}

function locate(cum: number[], d: number): [number, number] {
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i] || 1;
  return [i, Math.max(0, Math.min(1, (d - cum[i]) / seg))];
}

function polylineLength(poly: Point[]): number {
  const cum = arcLengths(poly);
  return cum[cum.length - 1];
}

function assertRegionalCoverage(site: BurgSiteDescriptor): void {
  if (site.fixedCrossings?.schemaVersion !== 3 && site.fixedCrossings?.schemaVersion !== 4) return;
  const bounds = site.fixedCrossings.coverageBounds;
  const half = site.frame.extentMeters / 2;
  if (!bounds || bounds.minX > -half || bounds.minY > -half || bounds.maxX < half || bounds.maxY < half)
    throw new RangeError("Regional river source does not cover the requested city frame");
}
