/**
 * Map pixel ↔ lon/lat for maps generated from an Earth-region template, and the check that
 * decides whether a local war window may read the real DEM instead of the cell heights.
 * See docs/plan/japan-local-war-terrain.md (R0).
 */

import type { EarthBBox } from "../data/earthConfig";
import { type EarthLocalTerrainSite, getEarthRegion, JAPAN_REGION } from "../data/earthRegions";
import type { EarthRegionGeoref } from "../types/WorldState";

/** Share of sampled land cells whose re-encoded DEM height may differ before the DEM is refused. */
export const GEOREF_MISMATCH_LIMIT = 0.1;
/** Height-index difference still counted as a match (re-encoding and strait carving). */
export const GEOREF_HEIGHT_TOLERANCE = 2;

export function earthRegionGeoref(
  region: (EarthBBox & { id: string }) | undefined,
  graphWidth: number,
  graphHeight: number
): EarthRegionGeoref | undefined {
  if (!region || !(graphWidth > 0) || !(graphHeight > 0)) return undefined;
  const { id, west, east, south, north } = region;
  return { id, west, east, south, north, graphWidth, graphHeight };
}

/** `graphWidth`/`graphHeight` default to the generation size; pass the live size if it changed. */
export function georefMapToLonLat(
  geo: EarthRegionGeoref,
  x: number,
  y: number,
  graphWidth = geo.graphWidth,
  graphHeight = geo.graphHeight
): { lon: number; lat: number } {
  return {
    lon: geo.west + (x / graphWidth) * (geo.east - geo.west),
    lat: geo.north - (y / graphHeight) * (geo.north - geo.south)
  };
}

export function georefLonLatToMap(
  geo: EarthRegionGeoref,
  lon: number,
  lat: number,
  graphWidth = geo.graphWidth,
  graphHeight = geo.graphHeight
): { x: number; y: number } {
  return {
    x: ((lon - geo.west) / (geo.east - geo.west)) * graphWidth,
    y: ((geo.north - lat) / (geo.north - geo.south)) * graphHeight
  };
}

export interface GeorefConsistency {
  sampled: number;
  mismatched: number;
  ratio: number;
  ok: boolean;
}

/**
 * Pass grid points (`grid.points` / `grid.cells.h`), not pack centroids: pack cells inherit the
 * grid height but sit elsewhere, so a re-read DEM drifts there on rough ground.
 * Compares stored cell heights with the DEM re-encoded at the same points. `expectedHeight`
 * returns the 0–100 index the template would have produced there (e.g. `encodeEarthCellHeight`
 * over the region raster). Water cells are skipped: depth encoding and straits differ by design.
 */
export function georefConsistency(
  cells: ReadonlyArray<{ x: number; y: number; h: number }>,
  expectedHeight: (x: number, y: number) => number,
  limit = GEOREF_MISMATCH_LIMIT,
  tolerance = GEOREF_HEIGHT_TOLERANCE
): GeorefConsistency {
  let sampled = 0;
  let mismatched = 0;
  for (const cell of cells) {
    if (cell.h < 20) continue;
    sampled++;
    if (Math.abs(expectedHeight(cell.x, cell.y) - cell.h) > tolerance) mismatched++;
  }
  const ratio = sampled > 0 ? mismatched / sampled : 0;
  return { sampled, mismatched, ratio, ok: sampled > 0 && ratio <= limit };
}

/** Japan tuning fixtures (approximate lon/lat); kept for the Japan harnesses. */
export const JAPAN_LOCAL_TERRAIN_SITES = JAPAN_REGION.localTerrain?.sites ?? [];

/** Tuning fixtures of a region with real-DEM terrain; empty for other regions. */
export function localTerrainSites(regionId: string): readonly EarthLocalTerrainSite[] {
  return getEarthRegion(regionId)?.localTerrain?.sites ?? [];
}
