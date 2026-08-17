import { HeightThreshold } from "../data/constants";
import type { EarthRegion, EarthStrait } from "../data/earthRegions";
import type { Grid } from "../types/Grid";
import { findGridCell } from "../utils/graphUtils";
import { depthMetersToHeight, metersToHeight, normalizeHeightExponent } from "../utils/height";
import {
  decodeEarthRaster,
  type EarthRaster,
  mapPointToLonLat,
  sampleElevation,
  sampleLand
} from "./earthRegionRaster";

const rasterCache = new Map<string, EarthRaster>();

function resolvePublicPath(url: string): string {
  const rel = url.replace(/^\.\//, "");
  if (rel.startsWith("heightmaps/")) return `public/${rel}`;
  if (rel.startsWith("public/")) return rel;
  return `public/heightmaps/${rel}`;
}

export async function loadEarthRasterBytes(path: string): Promise<Uint8Array> {
  const inNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (inNode) {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const candidates = [
      nodePath.resolve(process.cwd(), resolvePublicPath(path)),
      nodePath.resolve(process.cwd(), "..", resolvePublicPath(path)),
      nodePath.resolve(process.cwd(), path.replace(/^\.\//, ""))
    ];
    for (const candidate of candidates) {
      try {
        return new Uint8Array(await fs.readFile(candidate));
      } catch {
        // try the next location
      }
    }
    throw new Error(`Earth raster not found: ${path} (cwd=${process.cwd()})`);
  }
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Earth raster fetch failed: ${path} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadEarthRaster(region: EarthRegion): Promise<EarthRaster> {
  const cached = rasterCache.get(region.id);
  if (cached) return cached;
  const bytes = await loadEarthRasterBytes(region.raster.path);
  const raster = decodeEarthRaster(bytes);
  rasterCache.set(region.id, raster);
  return raster;
}

export function clearEarthRasterCache(): void {
  rasterCache.clear();
}

export function encodeEarthCellHeight(isLand: boolean, elevationMeters: number | null, exponent: number): number {
  if (isLand) {
    if (elevationMeters == null) return HeightThreshold.WATER_MAX_HEIGHT;
    return metersToHeight(Math.max(0, elevationMeters), exponent);
  }
  if (elevationMeters == null || elevationMeters >= 0) return HeightThreshold.WATER_MAX_HEIGHT - 2;
  return depthMetersToHeight(elevationMeters);
}

function lonLatToMapPoint(
  region: EarthRegion,
  graphWidth: number,
  graphHeight: number,
  lon: number,
  lat: number
): {
  x: number;
  y: number;
} {
  return {
    x: ((lon - region.west) / (region.east - region.west)) * graphWidth,
    y: ((region.north - lat) / (region.north - region.south)) * graphHeight
  };
}

function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / length2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function applyStraits(
  heights: Uint8Array,
  grid: Grid,
  region: EarthRegion,
  graphWidth: number,
  graphHeight: number,
  straits: EarthStrait[]
): void {
  const midLat = ((region.north + region.south) / 2) * (Math.PI / 180);
  const kmPerX = ((region.east - region.west) * 111.32 * Math.cos(midLat)) / graphWidth;
  const kmPerY = ((region.north - region.south) * 110.57) / graphHeight;
  const cellKm = ((kmPerX + kmPerY) / 2) * grid.spacing;

  for (const strait of straits) {
    const widthCells = Math.max(1, Math.round(strait.widthKm / Math.max(cellKm, 1e-6)));
    const radiusPx = Math.max(grid.spacing * 1.05, (widthCells * grid.spacing) / 2);
    let start = lonLatToMapPoint(region, graphWidth, graphHeight, strait.a[0], strait.a[1]);
    let end = lonLatToMapPoint(region, graphWidth, graphHeight, strait.b[0], strait.b[1]);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    const minLength = grid.spacing * 1.6;
    if (len > 1e-3 && len < minLength) {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const ux = dx / len;
      const uy = dy / len;
      start = { x: mx - (ux * minLength) / 2, y: my - (uy * minLength) / 2 };
      end = { x: mx + (ux * minLength) / 2, y: my + (uy * minLength) / 2 };
    }
    const steps = Math.max(4, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / Math.max(grid.spacing / 2, 1)));
    const seen = new Set<number>();
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      const seed = findGridCell(x, y, grid);
      const queue = [seed];
      while (queue.length) {
        const cell = queue.pop();
        if (cell == null || seen.has(cell)) continue;
        const [cx, cy] = grid.points[cell];
        if (pointToSegmentDistance(cx, cy, start.x, start.y, end.x, end.y) > radiusPx) continue;
        seen.add(cell);
        if (heights[cell] >= HeightThreshold.WATER_MAX_HEIGHT) {
          heights[cell] = HeightThreshold.WATER_MAX_HEIGHT - 2;
        }
        const neighbors = grid.cells.c[cell];
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
          if (!seen.has(neighbor)) queue.push(neighbor);
        }
      }
    }
  }
}

export async function buildEarthRegionHeights(
  grid: Grid,
  region: EarthRegion,
  graphWidth: number,
  graphHeight: number,
  heightExponent: number
): Promise<Uint8Array> {
  const raster = await loadEarthRaster(region);
  const exponent = normalizeHeightExponent(heightExponent);
  const heights = new Uint8Array(grid.points.length);

  for (let i = 0; i < grid.points.length; i++) {
    const [x, y] = grid.points[i];
    const { lon, lat } = mapPointToLonLat(region, graphWidth, graphHeight, x, y);
    const land = sampleLand(raster, lon, lat);
    const elevation = sampleElevation(raster, lon, lat);
    heights[i] = encodeEarthCellHeight(land, elevation, exponent);
  }

  if (region.topology?.keepStraits?.length) {
    applyStraits(heights, grid, region, graphWidth, graphHeight, region.topology.keepStraits);
  }

  return heights;
}
