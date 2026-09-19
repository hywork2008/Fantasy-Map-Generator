// TownGeneratorTS `Model.buildPatches` (Model.ts:167-222) + `Voronoi.relax`,
// re-implemented from the reference for the City Editor's grid.
//
// The idea, faithful to the reference:
//   1. spiral scatter — `a = sa + √i·5`, radius growing ~linearly in i with heavy
//      jitter → CENTRE DENSE, RIM SPARSE (areal density ∝ 1/r). i=0 pinned at the
//      origin. `nPatches·8` sites total.
//   2. relax only the few centre-most sites toward their Voronoi centroid, a few
//      passes — the rim keeps its size gradient (unlike a full Lloyd, which
//      equalises area and hexagonalises).
//
// Divergences from the GPL reference (allowed — reference is read-only):
//   - unbounded/unitless in TownGen; here scaled so the point cloud fills the
//     square window, with a guard ring + window clip like `grid.ts`.
//   - TownGen sorts by |p| and marks the first `nPatches` as the built-up area;
//     here every cell is just the editable macro grid — `classifyUrban` picks
//     the town downstream — so there is no sort / inner flag.
//
// See docs/city-generator/towngen-comparison.md §3.A and
// docs/city-editor/実装計画.md Phase G1.

import { clipPolygonToRect, polygonArea, polygonCentroid, polygonTouchesRectEdge, type Rect } from "./geom";
import type { Rng } from "./prng";
import type { Cell, Point } from "./types";
import { computeVoronoiCells } from "./voronoi";

export interface PatchParams {
  /** Side length of the square window, metres. */
  extentMeters: number;
  /** TownGeneratorTS `nPatches` — the built-up patch count. Total scatter = 8×. */
  nPatches: number;
  /** How many centre-most sites (spiral order) to relax toward their centroid
   * each pass. TownGeneratorTS relaxes `[0,1,2,nPatches]` ≈ 4. 0 = no relax. */
  relaxCount: number;
  /** Relax passes over those sites (TownGeneratorTS: 3). */
  relaxPasses: number;
}

export const DEFAULT_PATCH_PARAMS: Omit<PatchParams, "extentMeters"> = {
  nPatches: 15,
  relaxCount: 4,
  relaxPasses: 3
};

/** Sites drop from the grid when their window-clipped cell is a sliver. */
const SLIVER_AREA_FRACTION = 0.02;

/**
 * TownGeneratorTS `Model.buildPatches` spiral scatter (Model.ts:168-174), then
 * scaled so the farthest point sits just past the window edge. `a = sa + √i·5`,
 * `r_i ∈ [10 + 2i, 10 + 3i]` (i > 0), `r_0 = 0`. Returns `nPatches·8` sites.
 */
export function scatterPatchSites(nPatches: number, extentMeters: number, rng: Rng): Point[] {
  const half = extentMeters / 2;
  const count = Math.max(8, Math.round(nPatches) * 8);
  const startAngle = rng() * 2 * Math.PI;
  const raw: Point[] = [];
  let maxR = 0;
  for (let i = 0; i < count; i++) {
    const a = startAngle + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : 10 + i * (2 + rng());
    raw.push([Math.cos(a) * r, Math.sin(a) * r]);
    if (r > maxR) maxR = r;
  }
  // Fit the disc-shaped cloud over the square window: the outermost point lands
  // near the window corners so the corner Voronoi cells stay bounded and don't
  // balloon (the guard ring finishes the very edges).
  const scale = maxR > 0 ? (half * Math.SQRT2 * 0.96) / maxR : 1;
  return raw.map(([x, y]) => [x * scale, y * scale] as Point);
}

/**
 * The full pipeline: scatter → guard ring → Voronoi → relax the centre-most
 * `relaxCount` sites `relaxPasses` times → window clip → `Cell[]`. Deterministic
 * in `(params, rng stream)`.
 */
export function buildPatchCells(params: PatchParams, rng: Rng): Cell[] {
  const half = params.extentMeters / 2;
  const win: Rect = { minX: -half, minY: -half, maxX: half, maxY: half };
  const guard = guardRing(win, params.extentMeters / 10);

  let sites = scatterPatchSites(params.nPatches, params.extentMeters, rng);
  const relaxCount = Math.max(0, Math.min(Math.round(params.relaxCount), sites.length));
  for (let pass = 0; pass < Math.max(0, Math.round(params.relaxPasses)) && relaxCount > 0; pass++) {
    sites = relaxCentralSites(sites, guard, win, relaxCount);
  }
  return clipPatchCells(sites, guard, win, params.extentMeters);
}

/** Move the first `count` sites (spiral order = centre-out) onto their Voronoi
 * cell centroid; leave the rest. TownGeneratorTS `Voronoi.relax(v, subset)`.
 * Shared with `gridEvolution.ts` so its final stage matches `buildPatchCells`. */
export function relaxCentralSites(sites: Point[], guard: Point[], win: Rect, count: number): Point[] {
  const raw = computeVoronoiCells([...sites, ...guard]);
  return sites.map((site, i) => {
    if (i >= count) return site;
    const clipped = clipPolygonToRect(raw[i].polygon, win);
    return clipped.length >= 3 ? polygonCentroid(clipped) : site;
  });
}

/** Window-clipped Voronoi `Cell[]` for `sites` (guard excluded from the result),
 * slivers dropped — mirrors `grid.ts`'s capture. Shared with `gridEvolution.ts`. */
export function clipPatchCells(sites: Point[], guard: Point[], win: Rect, extentMeters: number): Cell[] {
  const raw = computeVoronoiCells([...sites, ...guard]);
  const minArea = (extentMeters / 40) ** 2 * SLIVER_AREA_FRACTION;
  const cells: Cell[] = [];
  for (let i = 0; i < sites.length; i++) {
    const polygon = clipPolygonToRect(raw[i].polygon, win);
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < minArea) continue;
    cells.push({
      id: i,
      site: sites[i],
      polygon,
      centroid: polygonCentroid(polygon),
      neighbors: raw[i].neighbors.filter(n => n < sites.length && n !== i),
      onBorder: polygonTouchesRectEdge(polygon, win)
    });
  }
  return cells;
}

/** Fixed sites just outside the window so every inner cell is bounded (a slimmer
 * version of `grid.ts`'s guard ring). */
export function guardRing(win: Rect, step: number): Point[] {
  const width = win.maxX - win.minX;
  const n = Math.max(2, Math.round(width / step));
  const cell = width / n;
  const ring: Point[] = [];
  for (let k = -2; k <= n + 1; k++) {
    const t = win.minX + (k + 0.5) * cell;
    ring.push([t, win.minY - cell], [t, win.maxY + cell]);
    ring.push([win.minX - cell, t], [win.maxX + cell, t]);
  }
  return ring;
}
