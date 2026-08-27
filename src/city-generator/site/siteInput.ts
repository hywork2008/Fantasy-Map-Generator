// BurgSiteDescriptor → the primitives the S0–S3 pipeline consumes. Pure parsing;
// no world-map imports. Used for both the synth path (M2) and real FMG descriptors
// (M3) — the pipeline never sees the descriptor directly.

import { polylineLength } from "../core/geom";
import type { CityGeography, CityParams, Point } from "../core/types";
import type { BurgSiteDescriptor } from "./burgSiteDescriptor";

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

function extractCoast(site: BurgSiteDescriptor): CityGeography["coast"] {
  if (!site.waterbody) return null;
  const longest = site.waterbody.shoreline
    .map(line => line as Point[])
    .filter(line => line.length >= 2)
    .sort((a, b) => polylineLength(b) - polylineLength(a))[0];
  if (!longest) return null;
  return { shoreline: longest, waterAzimuthDeg: site.waterbody.shoreAzimuthDeg };
}

function extractRivers(site: BurgSiteDescriptor): CityGeography["rivers"] {
  return site.rivers
    .filter(r => r.crossesSite || r.throughBurgCell)
    .map(r => {
      const centerline: Point[] = [];
      const widths: number[] = [];
      for (const seg of r.segments) {
        for (let i = 0; i < seg.points.length; i++) {
          centerline.push(seg.points[i] as Point);
          widths.push(seg.widthsMeters[i] ?? r.widthMeters);
        }
      }
      return { centerline, widths, cityBank: r.cityBank };
    })
    .filter(r => r.centerline.length >= 2);
}

function extractRoadBearings(site: BurgSiteDescriptor): number[] {
  return site.roads.filter(r => r.group !== "searoutes").map(r => r.entryAzimuthDeg);
}
