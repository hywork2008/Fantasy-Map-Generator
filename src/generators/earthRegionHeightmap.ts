import { HeightThreshold } from "../data/constants";
import { earthRegionView, KM_PER_DEG_LAT, KM_PER_DEG_LON_EQUATOR } from "../data/earthConfig";
import type { EarthRegion, EarthStrait } from "../data/earthRegions";
import type { Grid } from "../types/Grid";
import { findGridCell } from "../utils/graphUtils";
import { depthMetersToHeight, metersToHeight, normalizeHeightExponent } from "../utils/height";
import {
  decodeEarthRaster,
  type EarthRaster,
  lonLatToMapPoint,
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

function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / length2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Flood-fills every grid cell within `radiusPx` of the [start, end] segment to water. Idempotent
 * and monotonic (only ever turns land into water), so calling it again with a larger radius for
 * the same segment safely extends a previous, smaller carve rather than needing to undo it. */
function carveCorridor(
  heights: Uint8Array,
  grid: Grid,
  start: { x: number; y: number },
  end: { x: number; y: number },
  radiusPx: number
): void {
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

/** BFS over land cells only (mirrors the test suite's landmass-separation check). Returns the
 * smallest cell index in the connected land component containing `start`, or -1 if `start` isn't
 * land. Two probes return equal ids iff they're still connected by an unbroken land path. */
function landComponentId(heights: Uint8Array, grid: Grid, start: number): number {
  if (start < 0 || heights[start] < HeightThreshold.WATER_MAX_HEIGHT) return -1;
  const seen = new Uint8Array(heights.length);
  const stack = [start];
  seen[start] = 1;
  let min = start;
  while (stack.length) {
    const cell = stack.pop() as number;
    if (cell < min) min = cell;
    for (const neighbor of grid.cells.c[cell] ?? []) {
      if (seen[neighbor] || heights[neighbor] < HeightThreshold.WATER_MAX_HEIGHT) continue;
      seen[neighbor] = 1;
      stack.push(neighbor);
    }
  }
  return min;
}

/**
 * Radius multipliers (of `grid.spacing`) tried in increasing order before falling back to the
 * legacy 1.05 floor. `1.05` is a topology-safety floor, not a real-world width: at coarse
 * Earth-region resolutions (e.g. Japan's default ~21 km/cell) it forced every strait narrower
 * than ~1.5 cells (Naruto is 1.3 km wide!) into a ~44 km-wide carved corridor regardless of the
 * strait's actual width, and with several such straits packed across the Seto Inland Sea, the
 * oversized corridors overlapped and ate into the Sanyo coastal plain (Osaka–Kobe–Okayama–
 * Hiroshima) on both shores. Growing the radius only until the strait's own two shores are
 * verifiably disconnected keeps the same worst-case guarantee (the last candidate matches the old
 * floor exactly) while using far less of it in the common case where a smaller cut already works.
 */
const STRAIT_RADIUS_FLOOR_MULTIPLIERS = [0.55, 0.7, 0.85, 1.05];

function applyStraits(
  heights: Uint8Array,
  grid: Grid,
  region: EarthRegion,
  graphWidth: number,
  graphHeight: number,
  straits: EarthStrait[]
): void {
  const view = earthRegionView(region, graphWidth, graphHeight);
  const midLat = ((view.north + view.south) / 2) * (Math.PI / 180);
  const kmPerX = ((view.east - view.west) * KM_PER_DEG_LON_EQUATOR * Math.cos(midLat)) / graphWidth;
  const kmPerY = ((view.north - view.south) * KM_PER_DEG_LAT) / graphHeight;
  const cellKm = ((kmPerX + kmPerY) / 2) * grid.spacing;

  for (const strait of straits) {
    const widthCells = Math.max(1, Math.round(strait.widthKm / Math.max(cellKm, 1e-6)));
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

    // Probe cells sit well past each end of the (possibly extended) segment, on the shore each
    // side represents, so we can tell whether a given carve radius actually cut the land bridge
    // between them. The offset must clear every radius candidate below, so probes never end up
    // inside the corridor themselves.
    const maxCandidateRadius = Math.max(
      grid.spacing * STRAIT_RADIUS_FLOOR_MULTIPLIERS[STRAIT_RADIUS_FLOOR_MULTIPLIERS.length - 1],
      (widthCells * grid.spacing) / 2
    );
    const probeOffset = maxCandidateRadius + grid.spacing * 0.3;
    const segLen = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const ux = (end.x - start.x) / segLen;
    const uy = (end.y - start.y) / segLen;
    const probeA = findGridCell(start.x - ux * probeOffset, start.y - uy * probeOffset, grid);
    const probeB = findGridCell(end.x + ux * probeOffset, end.y + uy * probeOffset, grid);
    const probeALand = heights[probeA] >= HeightThreshold.WATER_MAX_HEIGHT;
    const probeBLand = heights[probeB] >= HeightThreshold.WATER_MAX_HEIGHT;

    for (const multiplier of STRAIT_RADIUS_FLOOR_MULTIPLIERS) {
      const radiusPx = Math.max(grid.spacing * multiplier, (widthCells * grid.spacing) / 2);
      carveCorridor(heights, grid, start, end, radiusPx);
      const isLastCandidate =
        multiplier === STRAIT_RADIUS_FLOOR_MULTIPLIERS[STRAIT_RADIUS_FLOOR_MULTIPLIERS.length - 1];
      if (isLastCandidate) break;
      // If either shore isn't solid land to begin with, we can't verify separation this way —
      // keep escalating to the legacy floor rather than guessing.
      if (!probeALand || !probeBLand) continue;
      if (landComponentId(heights, grid, probeA) !== landComponentId(heights, grid, probeB)) break;
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
