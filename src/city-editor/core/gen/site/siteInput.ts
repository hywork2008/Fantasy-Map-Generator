import { resolveBridgeCrossingLimit } from "../../../../utils/bridgeCrossingPolicy";
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
  site = withRiverPortFallback(site);
  const coast = extractCoast(site);
  // A wide river is not a second ocean. Promoting it to a coast half-plane
  // floods the far countryside and, at an estuary, can swallow the burg.
  // Draw only the channel, between the town-side bank and the far bank, and
  // keep the real sea/lake (if any) as the harbour shore.
  const { channels, consumed } = extractWideChannels(site);
  const waterAreas = coast ? [{ ...coast, kind: site.waterbody?.kind ?? "ocean" } as const] : [];
  return {
    ...(site.burg.waterAccess?.port.river ? { riverPort: true } : {}),
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

/** Port topology survives FMG window clipping. Reconstruct only an unavailable
 * river frontage; a sea/lake anchor alone is not evidence of a river port. */
function withRiverPortFallback(site: BurgSiteDescriptor): BurgSiteDescriptor {
  const access = site.burg.waterAccess;
  if (!site.burg.port || !access?.port.river) return site;
  const id = access.riverId ?? site.burg.riverPlacement?.riverId;
  if (id == null) return site;
  const existing = site.rivers.find(r => r.riverId === id);
  const radius = site.frame.cityRadiusMeters;
  const bankLines = [...(existing?.leftBankSegments ?? []), ...(existing?.rightBankSegments ?? [])];
  const hasLocalBank = bankLines.some(line => line.length >= 2 && nearestOnPolyline([0, 0], line).dist < radius);
  const hasLocalLine = existing?.segments.some(
    segment =>
      segment.points.length >= 2 &&
      nearestOnPolyline([0, 0], segment.points).dist - drawnWidthMeters(existing) / 2 < radius
  );
  const originInChannel = existing?.segments.some(
    segment =>
      segment.points.length >= 2 && nearestOnPolyline([0, 0], segment.points).dist < drawnWidthMeters(existing) / 2
  );
  if ((hasLocalBank || hasLocalLine) && existing && !originInChannel) {
    return { ...site, rivers: site.rivers.map(r => (r === existing ? { ...r, throughBurgCell: true } : r)) };
  }
  const width = Math.max(8, existing ? drawnWidthMeters(existing) : (site.burg.riverPlacement?.widthMeters ?? 30));
  const bank = existing?.cityBank ?? site.burg.riverPlacement?.bank ?? "left";
  // Metadata-only surveys have no local course to preserve. Retain the
  // established fallback orientation while consuming their hydrology.
  const axis = existing?.segments.some(s => s.points.length >= 2) ? existing.axisAzimuthDeg : 90;
  const tangent = azimuthToVec(axis);
  const sign = bank === "left" ? 1 : -1;
  const offset = width / 2 + radius * (originInChannel ? 0.9 : 0.45);
  const center: Point = [tangent[1] * sign * offset, -tangent[0] * sign * offset];
  const reach = site.frame.extentMeters * 2;
  const surveyed = existing ? centerlineOf(existing) : [];
  const curved =
    surveyed.length > 2 &&
    surveyed.some(p => {
      const a = surveyed[0],
        b = surveyed.at(-1)!;
      return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) > 1;
    });
  const anchor = curved ? nearestOnPolyline([0, 0], surveyed).point : null;
  const shift: Point = anchor ? [center[0] - anchor[0], center[1] - anchor[1]] : [0, 0];
  // Preserve surveyed bends when relocating a clipped frontage. A sparse or
  // missing survey needs a gentle local bend, not a ruler-straight canal.
  // Bound curvature so kilometre-wide offset banks cannot fold over themselves.
  const amplitude = Math.min(radius * 0.15, (site.frame.extentMeters ** 2 * 0.3) / (4 * Math.PI ** 2 * width));
  const points: Point[] = curved
    ? surveyed.map(p => [p[0] + shift[0], p[1] + shift[1]])
    : Array.from({ length: 49 }, (_, i) => {
        const d = -reach + (2 * reach * i) / 48;
        const bend = amplitude * (1 - Math.cos((2 * Math.PI * d) / site.frame.extentMeters));
        return [
          center[0] + tangent[0] * d + tangent[1] * sign * bend,
          center[1] + tangent[1] * d - tangent[0] * sign * bend
        ];
      });
  const river: SiteRiver = {
    ...existing,
    riverId: id,
    name: existing?.name ?? "River",
    type: existing?.type ?? "River",
    widthMeters: width,
    axisAzimuthDeg: axis,
    offsetMeters: offset,
    offsetRatio: offset / radius,
    rawOffsetMeters: offset,
    cityBank: bank,
    crossesSite: offset < radius,
    throughBurgCell: true,
    snappedToBank: false,
    segments: [{ points, widthsMeters: points.map(() => width) }],
    leftBankSegments: curved
      ? (existing?.leftBankSegments ?? []).map(line => line.map(p => [p[0] + shift[0], p[1] + shift[1]]))
      : [],
    rightBankSegments: curved
      ? (existing?.rightBankSegments ?? []).map(line => line.map(p => [p[0] + shift[0], p[1] + shift[1]]))
      : [],
    parentRiverId: existing?.parentRiverId ?? null,
    downstream: existing?.downstream ?? { terminal: "unknown", distanceMeters: 0, bearingDeg: 90 }
  };
  return { ...site, rivers: [...site.rivers.filter(r => r.riverId !== id), river] };
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
  site = withRiverPortFallback(site);
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
  const longest = wb.shoreline
    .map(line => line as Point[])
    .filter(line => line.length >= 2)
    .sort((a, b) => polylineLength(b) - polylineLength(a))[0];
  if (longest) {
    let corridor = downsample(longest, CORRIDOR_POINTS);
    // FMG's kilometre-scale coast can sit beyond a port's entire city disk.
    // Bring that shore to the town while retaining its shape and bearing;
    // an inland burg must keep its real distance from the water.
    // A wide navigable channel already supplies the waterfront. Moving the
    // ocean across that channel would flood the river port's remaining land.
    if (site.burg.port && wb.isPort && !site.rivers.some(r => unbridgeableOnSite(site, r))) {
      const hit = nearestOnPolyline([0, 0], corridor);
      const radius = site.frame.cityRadiusMeters;
      if (radius > 0 && hit.dist > radius) {
        const factor = 1 - (radius * 0.6) / hit.dist;
        corridor = corridor.map(p => [p[0] - hit.point[0] * factor, p[1] - hit.point[1] * factor]);
      }
    }
    return { corridor, waterAzimuthDeg };
  }
  // A river/estuary port can have a sea haven on the coarse FMG cell while
  // the actual sea shore is outside this city window. Its local river bank is
  // the frontage; inventing an ocean here can submerge real imported roads.
  if (site.burg.waterAccess?.port.river && site.rivers.some(r => r.riverId === site.burg.waterAccess?.riverId))
    return null;
  // A port burg whose shoreline polyline fell outside the window (real FMG
  // descriptors do this when the coast is just past the extent): lay a straight
  // rough coast across the window, set back toward the water off the town. The
  // graph walk jaggedises it, same path as a synth "straight" coast — better a
  // placed coast than a silently-landlocked harbour.
  return {
    corridor: syntheticShoreCorridor(waterAzimuthDeg, site.frame.extentMeters, site.frame.cityRadiusMeters),
    waterAzimuthDeg
  };
}

function syntheticShoreCorridor(waterAzimuthDeg: number, extentMeters: number, cityRadiusMeters: number): Point[] {
  const half = extentMeters / 2;
  const toWater = azimuthToVec(waterAzimuthDeg);
  const along: Point = [-toWater[1], toWater[0]];
  const standoff = Math.min(half * 0.33, cityRadiusMeters * 0.6);
  const mid: Point = [toWater[0] * standoff, toWater[1] * standoff];
  const reach = half * 1.4; // overshoot the window so edge cells still project onto it
  return [
    [mid[0] - along[0] * reach, mid[1] - along[1] * reach],
    [mid[0] + along[0] * reach, mid[1] + along[1] * reach]
  ];
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

function extractWideChannels(site: BurgSiteDescriptor): {
  channels: NonNullable<CityGeography["channels"]>;
  consumed: Set<number>;
} {
  const consumed = new Set<number>();
  const channels: NonNullable<CityGeography["channels"]> = [];
  const margin = bankMarginMeters(site);
  const half = site.frame.extentMeters / 2;
  for (const river of site.rivers) {
    if (
      !unbridgeableOnSite(site, river) &&
      !(
        site.burg.waterAccess?.port.river &&
        site.burg.waterAccess.riverId === river.riverId &&
        drawnWidthMeters(river) > site.frame.cityRadiusMeters * 0.4
      )
    )
      continue;
    // Broad river ports need a real water surface and shoreline even when
    // bridge technology could span the river. The stroke/wall pipeline cannot
    // model that frontage or berth piers on it.
    consumed.add(river.riverId);
    const channel = buildChannel(river, drawnWidthMeters(river), margin, half);
    if (channel) channels.push(channel);
  }
  return { channels, consumed };
}

/** Town-side bank to far bank, extended across the window. The origin stays
 * on dry land; when the true bank is closer than `margin`, the near edge
 * moves into the channel rather than the town moving off centre. */
function buildChannel(
  river: SiteRiver,
  widthMeters: number,
  margin: number,
  halfExtent: number
): NonNullable<CityGeography["channels"]>[number] | null {
  // FMG's surveyed physical banks are authoritative; do not push the near
  // bank into the channel to make room for the generated town. Legacy snapped
  // surveys may contain exaggerated banks; reconstruct their channel below.
  const left = river.leftBankSegments?.flat() ?? [];
  const right = river.rightBankSegments?.flat() ?? [];
  if (!river.snappedToBank && left.length >= 2 && right.length >= 2) {
    const near = river.cityBank === "left" ? left : right;
    const far = river.cityBank === "left" ? right : left;
    const hit = nearestOnPolyline([0, 0], near);
    return {
      polygon: [...near, ...far.reverse()],
      shoreline: near,
      waterAzimuthDeg: vecToAzimuth(hit.point[0], hit.point[1])
    };
  }
  // A kilometre-scale river can have only its town-side bank in the local
  // frame. Keep that water boundary even when its centreline is off-screen.
  if (!river.snappedToBank && (left.length >= 2 || right.length >= 2)) {
    const near = left.length >= 2 ? left : right;
    const sign = Math.sign(sideOfPolyline([0, 0], near)) || (river.cityBank === "left" ? 1 : -1);
    const far = offsetPolyline(near, -sign * widthMeters);
    const hit = nearestOnPolyline([0, 0], near);
    return {
      polygon: [...near, ...far.reverse()],
      shoreline: near,
      waterAzimuthDeg: vecToAzimuth(hit.point[0], hit.point[1])
    };
  }
  const centerline = extendPastFrame(centerlineOf(river), halfExtent);
  if (centerline.length < 2 || widthMeters <= 0) return null;
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
  if (polygon.length < 4 || pointInPolygon([0, 0], polygon)) return null;
  const hit = nearestOnPolyline([0, 0], near);
  return {
    polygon,
    shoreline: near,
    waterAzimuthDeg: vecToAzimuth(hit.point[0], hit.point[1])
  };
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

/** Signed offset along the left normal. Positive `distance` is left of the flow. */
function offsetPolyline(poly: Point[], distance: number): Point[] {
  return poly.map((p, i) => {
    const t = polylineTangent(poly, Math.min(i, poly.length - 2));
    return [p[0] - t[1] * distance, p[1] + t[0] * distance] as Point;
  });
}

function extractRivers(site: BurgSiteDescriptor, wideChannelIds: Set<number>): CityGeography["rivers"] {
  const crossingLimit = bridgeCrossingMeters(site);
  return (
    site.rivers
      .filter(r => !wideChannelIds.has(r.riverId))
      .filter(r => r.segments.some(s => s.points.length >= 2))
      // Drop a river that neither crosses the site nor runs near it: real FMG
      // descriptors sometimes list a large river ~2+ radii away (offsetRatio) that
      // has nothing to do with the town plan but would otherwise dominate the window.
      .filter(r => r.throughBurgCell || r.crossesSite || Math.abs(r.offsetRatio) < 1.6)
      .map(r => {
        const pts: Point[] = [];
        const widths: number[] = [];
        for (const seg of r.segments) {
          for (let i = 0; i < seg.points.length; i++) {
            pts.push(seg.points[i] as Point);
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
