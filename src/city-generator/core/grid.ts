// S0 — region & grid. Jittered-grid scatter → Lloyd relaxation, one snapshot per
// pass so the "Grid evolution" slider can scrub the sequence.
// See docs/city-generator/design.md §4.2.

import { clipPolygonToRect, polygonCentroid, polygonTouchesRectEdge, type Rect } from "./geom";
import type { Rng } from "./prng";
import type { Cell, CityParams, GridStage, Point } from "./types";
import { computeVoronoiCells } from "./voronoi";

export function buildGrid(params: CityParams, rng: Rng): GridStage[] {
  const half = params.extentMeters / 2;
  const win: Rect = { minX: -half, minY: -half, maxX: half, maxY: half };
  const step = Math.max(params.cellSizeMeters, params.extentMeters / 64);

  const guard = guardRing(win, step);
  let sites = scatterSites(win, step, rng);
  const innerCount = sites.length;

  const capture = (label: string): GridStage => {
    const raw = computeVoronoiCells([...sites, ...guard]);
    const cells: Cell[] = [];
    for (let i = 0; i < innerCount; i++) {
      const polygon = clipPolygonToRect(raw[i].polygon, win);
      if (polygon.length < 3) continue;
      cells.push({
        id: i,
        site: sites[i],
        polygon,
        centroid: polygonCentroid(polygon),
        neighbors: raw[i].neighbors.filter(n => n < innerCount && n !== i),
        onBorder: polygonTouchesRectEdge(polygon, win)
      });
    }
    return { label, cells };
  };

  const stages: GridStage[] = [capture("Voronoi (scatter)")];
  for (let pass = 1; pass <= params.lloydPasses; pass++) {
    const prev = stages[stages.length - 1].cells;
    const centroidById = new Map(prev.map(c => [c.id, c.centroid]));
    sites = sites.map((s, i) => centroidById.get(i) ?? s);
    stages.push(capture(pass === params.lloydPasses ? `Lloyd ${pass} (final)` : `Lloyd ${pass}`));
  }
  return stages;
}

/** One site per grid cell, nudged off-lattice by up to ±40% of the step. */
function scatterSites(win: Rect, step: number, rng: Rng): Point[] {
  const width = win.maxX - win.minX;
  const nx = Math.max(2, Math.round(width / step));
  const cell = width / nx;
  const sites: Point[] = [];
  for (let row = 0; row < nx; row++) {
    for (let col = 0; col < nx; col++) {
      sites.push([
        win.minX + (col + 0.5 + rng.range(-0.4, 0.4)) * cell,
        win.minY + (row + 0.5 + rng.range(-0.4, 0.4)) * cell
      ]);
    }
  }
  return sites;
}

/** Fixed sites just outside the window so every inner cell is bounded. */
function guardRing(win: Rect, step: number): Point[] {
  const width = win.maxX - win.minX;
  const n = Math.max(2, Math.round(width / step));
  const cell = width / n;
  const ring: Point[] = [];
  for (let k = -2; k <= n + 1; k++) {
    const t = win.minX + (k + 0.5) * cell;
    ring.push([t, win.minY - cell], [t, win.minY - 2 * cell]);
    ring.push([t, win.maxY + cell], [t, win.maxY + 2 * cell]);
    ring.push([win.minX - cell, t], [win.minX - 2 * cell, t]);
    ring.push([win.maxX + cell, t], [win.maxX + 2 * cell, t]);
  }
  return ring;
}
