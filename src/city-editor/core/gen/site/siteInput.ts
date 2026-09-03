// BurgSiteDescriptor → the primitives the S0–S3 pipeline consumes. Pure parsing;
// no world-map imports. Used for both the synth path and real FMG descriptors —
// the pipeline never sees the descriptor directly.
//
// Coast / river polylines are down-sampled to ROUGH CORRIDORS: S1/S2 walk the
// Voronoi graph along them, so a dense descriptor polyline would over-constrain
// the shape. ~8 control points keeps the corridor's intent (chord, mouth, big
// bends) while leaving the fine shape to the graph.

import { azimuthToVec, nearestOnPolyline } from "../geom";
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
    // Coarse from the start — one Voronoi cell ≈ one ward (TownGeneratorTS patch
    // scale). One light Lloyd pass keeps organic size/shape variety (design §4.2 S0).
    cellSizeMeters: cityRadiusMeters / 3.5,
    lloydPasses: 1
  };
}

export function siteToGeography(site: BurgSiteDescriptor): CityGeography {
  const openWater = extractOpenWater(site);
  const coast = extractCoast(site);
  const waterAreas = [...openWater, ...(coast ? [{ ...coast, kind: site.waterbody?.kind ?? "ocean" }] : [])];
  return {
    // `coast` is retained as the primary boundary for older consumers. Major
    // rivers come first: tributaries should resolve into the adjacent water
    // area rather than being forced across an unrelated distant ocean shore.
    coast: waterAreas[0] ?? null,
    waterAreas,
    rivers: extractRivers(
      site,
      openWater.map(w => w.riverId)
    ),
    roadBearings: extractRoadBearings(site),
    roadPaths: site.roads
      .filter(r => r.group !== "searoutes" && r.path.length >= 2)
      .map(r => r.path.map(p => [p[0], p[1]])),
    suggestedGates: site.suggestedGates
  };
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
  const plan: WallPlan = { ...DEFAULT_WALL_PLAN, extent: program.walls ? "full" : "none" };
  const hasCoast = site.waterbody !== null || extractOpenWater(site).length > 0;
  const hasRiver = site.rivers.some(r => r.throughBurgCell || r.crossesSite || Math.abs(r.offsetRatio) < 1.6);
  const fortified = program.citadel || program.capital;

  // Only a plain harbour leaves its sea front open; a landlocked-feeling harbour
  // town (no port) or a fortified one gets a real sea wall, so the perimeter
  // still closes against the water (wall-patterns.md §3).
  if (hasCoast) plan.coast = program.port && !fortified ? "open" : "seaWall";

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
  if (longest) return { corridor: downsample(longest, CORRIDOR_POINTS), waterAzimuthDeg };
  // A port burg whose shoreline polyline fell outside the window (real FMG
  // descriptors do this when the coast is just past the extent): lay a straight
  // rough coast across the window, set back toward the water off the town. The
  // graph walk jaggedises it, same path as a synth "straight" coast — better a
  // placed coast than a silently-landlocked harbour.
  return { corridor: syntheticShoreCorridor(waterAzimuthDeg, site.frame.extentMeters), waterAzimuthDeg };
}

function syntheticShoreCorridor(waterAzimuthDeg: number, extentMeters: number): Point[] {
  const half = extentMeters / 2;
  const toWater = azimuthToVec(waterAzimuthDeg);
  const along: Point = [-toWater[1], toWater[0]];
  const standoff = half * 0.33; // shore sits a third of the way out toward the water
  const mid: Point = [toWater[0] * standoff, toWater[1] * standoff];
  const reach = half * 1.4; // overshoot the window so edge cells still project onto it
  return [
    [mid[0] - along[0] * reach, mid[1] - along[1] * reach],
    [mid[0] + along[0] * reach, mid[1] + along[1] * reach]
  ];
}

const OPEN_WATER_FRACTION = 0.35;

type OpenWaterArea = NonNullable<CityGeography["waterAreas"]>[number] & { riverId: number };

/** Convert a channel that is too wide for the city window into a water area.
 * The nearest actual drawn bank is the shoreline; the water lies away from the
 * town, so this preserves FMG's bank placement even when its centreline is off
 * canvas. */
function extractOpenWater(site: BurgSiteDescriptor): OpenWaterArea[] {
  const threshold = site.frame.extentMeters * OPEN_WATER_FRACTION;
  return site.rivers.flatMap(r => {
    // Classify from the width at the closest approach, not a width sampled far
    // down a clipped tributary. The latter can be much wider at its confluence
    // and would incorrectly turn every feeder at Taris into open water.
    if (!r.throughBurgCell || r.widthMeters < threshold) return [];
    const banks = [...r.leftBankSegments, ...r.rightBankSegments]
      .filter(points => points.length >= 2)
      .sort((a, b) => nearestOnPolyline([0, 0], a as Point[]).dist - nearestOnPolyline([0, 0], b as Point[]).dist);
    const bank = banks[0] as Point[] | undefined;
    if (!bank) return [];
    // `cityBank` is measured in the downstream local frame. The water lies on
    // the opposite bank; this is more stable than inferring a normal from a
    // clipped, bank-snapped segment (which can select the far bank at a bend).
    const waterAzimuthDeg = (r.axisAzimuthDeg + (r.cityBank === "left" ? 90 : 270)) % 360;
    return [{ riverId: r.riverId, corridor: downsample(bank, RIVER_CORRIDOR_POINTS), waterAzimuthDeg, kind: "river" }];
  });
}

function extractRivers(site: BurgSiteDescriptor, openWaterIds: number[]): CityGeography["rivers"] {
  return (
    site.rivers
      .filter(r => !openWaterIds.includes(r.riverId))
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
          joinsWater: r.parentRiverId !== null && openWaterIds.includes(r.parentRiverId)
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
