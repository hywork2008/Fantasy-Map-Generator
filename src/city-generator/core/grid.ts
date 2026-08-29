// S0 — region & grid. Variable-radius Poisson-disc scatter → one light Lloyd
// pass, one snapshot per pass so the "Grid evolution" slider can scrub.
//
// This deliberately diverges from a uniform jittered grid + heavy Lloyd: that
// makes ~2900 near-identical hexagonal cells and the town then has to be
// re-assembled from clumps of them. A coarse blue-noise scatter (≈ one cell per
// ward, TownGeneratorTS 2.1 patch scale) with a denser band along the water
// corridors — so the coast/river walk still has cells to weave through — gives
// the town ~1 convex Voronoi cell per ward from the start. See design.md §4.2.

import {
  clipPolygonToRect,
  nearestOnPolyline,
  polygonArea,
  polygonCentroid,
  polygonTouchesRectEdge,
  type Rect
} from "./geom";
import type { Rng } from "./prng";
import type { Cell, CityGeography, CityParams, GridStage, Point } from "./types";
import { computeVoronoiCells } from "./voronoi";

export function buildGrid(params: CityParams, geo: CityGeography, rng: Rng): GridStage[] {
  const half = params.extentMeters / 2;
  const win: Rect = { minX: -half, minY: -half, maxX: half, maxY: half };

  const guard = guardRing(win, params.cellSizeMeters * 2.5);
  let sites = scatterSites(params, geo, rng);
  const innerCount = sites.length;

  const capture = (label: string): GridStage => {
    const raw = computeVoronoiCells([...sites, ...guard]);
    const cells: Cell[] = [];
    for (let i = 0; i < innerCount; i++) {
      const polygon = clipPolygonToRect(raw[i].polygon, win);
      if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < params.cellSizeMeters ** 2 * 0.015) continue;
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

/**
 * Bridson variable-radius Poisson-disc. Spacing is `cellSizeMeters` everywhere
 * except within `~1.4·cellSize` of a water corridor, where it tightens to half
 * that so the coast/river walk has room to meander. Blue noise ⇒ irregular,
 * size-varied convex cells with no lattice — a single Lloyd pass tidies slivers
 * without hexagonalising.
 */
function scatterSites(params: CityParams, geo: CityGeography, rng: Rng): Point[] {
  const half = params.extentMeters / 2;
  const s0 = params.cellSizeMeters;
  const near0 = s0 * 0.5;
  const band = s0 * 1.4;

  const waterLines: Point[][] = [
    ...(geo.coast ? [geo.coast.corridor] : []),
    ...geo.rivers.map(r => r.corridor),
    ...(geo.waterAreas?.map(w => w.corridor) ?? [])
  ].filter(l => l.length >= 2);

  const radius = (p: Point): number => {
    if (!waterLines.length) return s0;
    let d = Number.POSITIVE_INFINITY;
    for (const l of waterLines) d = Math.min(d, nearestOnPolyline(p, l).dist);
    return d >= band ? s0 : near0 + (s0 - near0) * (d / band);
  };

  const cell = near0 / Math.SQRT2;
  const gw = Math.ceil((2 * half) / cell) + 1;
  const gridIdx = new Int32Array(gw * gw).fill(-1);
  const pts: Point[] = [];
  const rad: number[] = []; // radius(pts[i]) cached — recomputing it in farEnough is the hot path
  const cellOf = (p: Point): number => {
    const gx = Math.min(gw - 1, Math.max(0, Math.floor((p[0] + half) / cell)));
    const gy = Math.min(gw - 1, Math.max(0, Math.floor((p[1] + half) / cell)));
    return gy * gw + gx;
  };
  const push = (p: Point): void => {
    gridIdx[cellOf(p)] = pts.length;
    rad.push(radius(p));
    pts.push(p);
  };
  const span = Math.ceil((s0 * 2) / cell) + 1;
  const farEnough = (p: Point, rp: number): boolean => {
    const gx = Math.floor((p[0] + half) / cell);
    const gy = Math.floor((p[1] + half) / cell);
    for (let y = Math.max(0, gy - span); y <= Math.min(gw - 1, gy + span); y++) {
      for (let x = Math.max(0, gx - span); x <= Math.min(gw - 1, gx + span); x++) {
        const id = gridIdx[y * gw + x];
        if (id < 0) continue;
        const q = pts[id];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.max(rp, rad[id]) * 0.9) return false;
      }
    }
    return true;
  };

  push([0, 0]);
  const active: number[] = [0];
  const inWin = (p: Point): boolean => Math.abs(p[0]) <= half * 1.02 && Math.abs(p[1]) <= half * 1.02;
  for (let guard = 0; active.length && guard < 300_000; guard++) {
    const ai = rng.int(0, active.length - 1);
    const src = pts[active[ai]];
    const rs = radius(src);
    let placed = false;
    for (let k = 0; k < 24; k++) {
      const ang = rng.range(0, Math.PI * 2);
      const step = rs * (1 + rng.range(0, 1));
      const cand: Point = [src[0] + Math.cos(ang) * step, src[1] + Math.sin(ang) * step];
      if (!inWin(cand) || !farEnough(cand, radius(cand))) continue;
      push(cand);
      active.push(pts.length - 1);
      placed = true;
      break;
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
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
