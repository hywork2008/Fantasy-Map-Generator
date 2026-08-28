// BurgSiteDescriptor → the primitives the S0–S3 pipeline consumes. Pure parsing;
// no world-map imports. Used for both the synth path and real FMG descriptors —
// the pipeline never sees the descriptor directly.
//
// Coast / river polylines are down-sampled to ROUGH CORRIDORS: S1/S2 walk the
// Voronoi graph along them, so a dense descriptor polyline would over-constrain
// the shape. ~8 control points keeps the corridor's intent (chord, mouth, big
// bends) while leaving the fine shape to the graph.

import { azimuthToVec } from "../core/geom";
import type { CityGeography, CityParams, CityProgram, Point } from "../core/types";
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
    cellSizeMeters: cityRadiusMeters / 9,
    lloydPasses: 3
  };
}

export function siteToGeography(site: BurgSiteDescriptor): CityGeography {
  return {
    coast: extractCoast(site),
    rivers: extractRivers(site),
    roadBearings: extractRoadBearings(site)
  };
}

/** The built programme is a straight pass-through of the descriptor's Features
 * flags — no heuristics. Same shape for a real FMG descriptor and a synthetic
 * one (synthSite.ts writes `SiteConfig.features` onto these fields). */
export function siteToProgram(site: BurgSiteDescriptor): CityProgram {
  const b = site.burg;
  return {
    walls: b.walls,
    citadel: b.citadel,
    plaza: b.plaza,
    temple: b.temple,
    port: b.port,
    shanty: b.shanty,
    capital: b.capital
  };
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

function extractRivers(site: BurgSiteDescriptor): CityGeography["rivers"] {
  return (
    site.rivers
      .filter(r => r.segments.some(s => s.points.length >= 2))
      // Drop a river that neither crosses the site nor runs near it: real FMG
      // descriptors sometimes list a large river ~2+ radii away (offsetRatio) that
      // has nothing to do with the town plan but would otherwise dominate the window.
      .filter(r => r.crossesSite || Math.abs(r.offsetRatio) < 1.6)
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
          cityBank: r.cityBank
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
