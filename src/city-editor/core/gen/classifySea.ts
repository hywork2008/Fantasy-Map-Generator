// S1 — sea / land. The coast corridor (a few rough control points) is walked
// along the Voronoi cell-edge graph into a detailed shoreline, which is then
// closed into a water polygon along the window boundary on the side
// `waterAzimuthDeg` points to. A cell is `sea` when its centroid lies inside
// that polygon. Shape-agnostic (straight / bay / cape) and organically jagged,
// because the shape comes from the graph walk, not authored anchors.
// See docs/city-generator/design.md §4.2.

import type { EdgeGraph } from "./edgeGraph";
import { azimuthToVec, pointInPolygon } from "./geom";
import { clampToWindow, walkGraph } from "./graphWalk";
import type { Rng } from "./prng";
import type { Cell, Point } from "./types";

export interface CoastResult {
  sea: Set<number>;
  /** Detailed shoreline (graph vertices), upstream endpoint → downstream endpoint. */
  shoreline: Point[];
  /** Closed polygon whose interior is the water. */
  waterPolygon: Point[];
}

export function classifyCoast(
  graph: EdgeGraph,
  corridor: Point[],
  waterAzimuthDeg: number,
  cells: Cell[],
  halfExtentMeters: number,
  cellSizeMeters: number,
  rng: Rng
): CoastResult | null {
  if (corridor.length < 2 || graph.points.length === 0) return null;

  // Walk each corridor leg in turn so a deep finger / promontory is actually
  // traced rather than corner-cut.
  const via = corridor.map(p => clampToWindow(p, halfExtentMeters));
  const nodes: number[] = [];
  for (let i = 0; i < via.length - 1; i++) {
    const from = i === 0 ? via[0] : graph.points[nodes[nodes.length - 1]];
    const leg = walkGraph(graph, {
      start: from,
      goal: via[i + 1],
      rng,
      cellSizeMeters,
      wander: 0.7,
      corridor,
      corridorPull: 2.2,
      maxSteps: 200
    });
    for (let k = i === 0 ? 0 : 1; k < leg.length; k++) nodes.push(leg[k]);
  }
  if (nodes.length < 4) return null;
  const shoreline = nodes.map(id => [graph.points[id][0], graph.points[id][1]] as Point);

  const waterPolygon = closeToWaterPolygon(shoreline, halfExtentMeters, waterAzimuthDeg);
  const sea = new Set<number>();
  for (const cell of cells) {
    if (pointInPolygon(cell.centroid, waterPolygon)) sea.add(cell.id);
  }
  smoothMembership(cells, sea, 1);
  return { sea, shoreline, waterPolygon };
}

/** Close the shoreline into a polygon whose interior is the water. */
function closeToWaterPolygon(shoreline: Point[], half: number, waterAzimuthDeg: number): Point[] {
  const startB = clampToRect(shoreline[0], half);
  const endB = clampToRect(shoreline[shoreline.length - 1], half);
  const shore: Point[] = [startB, ...shoreline.slice(1, -1), endB];

  const wd = azimuthToVec(waterAzimuthDeg);
  const probe: Point = [clampN(wd[0] * half * 4, half * 0.95), clampN(wd[1] * half * 4, half * 0.95)];

  for (const dir of [1, -1] as const) {
    const poly = [...shore, ...perimeterPath(endB, startB, dir, half)];
    if (pointInPolygon(probe, poly)) return poly;
  }
  return [...shore, ...perimeterPath(endB, startB, 1, half)];
}

/** Flip a cell when >= 75% of its (>= 3) neighbours disagree. */
function smoothMembership(cells: Cell[], set: Set<number>, passes: number): void {
  const byId = new Map(cells.map(c => [c.id, c]));
  for (let pass = 0; pass < passes; pass++) {
    const flips: number[] = [];
    for (const cell of cells) {
      const neighbours = cell.neighbors.map(id => byId.get(id)).filter((c): c is Cell => c !== undefined);
      if (neighbours.length < 3) continue;
      const mine = set.has(cell.id);
      const disagree = neighbours.filter(n => set.has(n.id) !== mine).length;
      if (disagree / neighbours.length >= 0.75) flips.push(cell.id);
    }
    for (const id of flips) set.has(id) ? set.delete(id) : set.add(id);
  }
}

// --- window-boundary walk --------------------------------------------------------

const clampN = (v: number, half: number): number => Math.max(-half, Math.min(half, v));
const mod4 = (x: number): number => ((x % 4) + 4) % 4;

/** Snap a point to the nearest edge of the [-half, half]² window. */
function clampToRect(p: Point, half: number): Point {
  const toLeft = p[0] + half;
  const toRight = half - p[0];
  const toBottom = p[1] + half;
  const toTop = half - p[1];
  const m = Math.min(toLeft, toRight, toBottom, toTop);
  if (m === toLeft) return [-half, clampN(p[1], half)];
  if (m === toRight) return [half, clampN(p[1], half)];
  if (m === toBottom) return [clampN(p[0], half), -half];
  return [clampN(p[0], half), half];
}

/** Perimeter coordinate in [0, 4): bottom edge 0–1, right 1–2, top 2–3, left 3–4. */
function boundaryParam(p: Point, half: number): number {
  const eps = 1e-3;
  if (p[1] <= -half + eps) return mod4((p[0] + half) / (2 * half));
  if (p[0] >= half - eps) return 1 + mod4((p[1] + half) / (2 * half));
  if (p[1] >= half - eps) return 2 + mod4((half - p[0]) / (2 * half));
  return 3 + mod4((half - p[1]) / (2 * half));
}

function boundaryPoint(t: number, half: number): Point {
  const s = mod4(t);
  if (s < 1) return [-half + s * 2 * half, -half];
  if (s < 2) return [half, -half + (s - 1) * 2 * half];
  if (s < 3) return [half - (s - 2) * 2 * half, half];
  return [-half, half - (s - 3) * 2 * half];
}

/** Points along the window boundary from `from` to `to`, walking dir (+1 / -1). */
function perimeterPath(from: Point, to: Point, dir: 1 | -1, half: number): Point[] {
  const a = boundaryParam(from, half);
  const b = boundaryParam(to, half);
  const span = dir > 0 ? mod4(b - a) : mod4(a - b);
  const out: Point[] = [];
  let t = dir > 0 ? Math.floor(a) + 1 : Math.ceil(a) - 1;
  let walked = dir > 0 ? mod4(t - a) : mod4(a - t);
  let guard = 0;
  while (walked < span && guard++ < 8) {
    out.push(boundaryPoint(t, half));
    t += dir;
    walked = dir > 0 ? mod4(t - a) : mod4(a - t);
  }
  out.push(boundaryPoint(b, half));
  return out;
}
