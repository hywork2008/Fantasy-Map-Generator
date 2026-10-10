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
  const via = windowedCorridor(corridor, halfExtentMeters);
  if (via.length < 2) return null;
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
  keepBorderConnectedSea(cells, sea, halfExtentMeters);
  return { sea, shoreline, waterPolygon };
}

/** The corridor's guide points for this window: only the stretch inside it,
 * plus the one point just before it enters and just after it leaves, clamped
 * to the window edge. Several outside points in a row would all clamp onto
 * the same stretch of edge, and the walk then shuttles back and forth along it
 * (Bama: a regional shore well beyond the town mesh made a 633-node self-
 * crossing coast whose sea was then discarded). */
function windowedCorridor(corridor: Point[], half: number): Point[] {
  const inside = (p: Point) => Math.abs(p[0]) <= half && Math.abs(p[1]) <= half;
  // Liang–Barsky: the part of segment a→b inside the window, as [t0, t1].
  const clip = (a: Point, b: Point): [number, number] | null => {
    let t0 = 0,
      t1 = 1;
    const d: Point = [b[0] - a[0], b[1] - a[1]];
    for (const [p, q] of [
      [-d[0], a[0] + half],
      [d[0], half - a[0]],
      [-d[1], a[1] + half],
      [d[1], half - a[1]]
    ]) {
      if (Math.abs(p) < 1e-12) {
        if (q < 0) return null;
        continue;
      }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
    return [t0, t1];
  };
  const at = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dedupe = (points: Point[]) =>
    points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-6);
  if (corridor.some(inside)) return corridor.map(p => clampToWindow(p, half));
  // Every guide point is outside, yet the line may cross the window: use the
  // first crossing stretch rather than clamping them all onto one edge.
  const out: Point[] = [];
  for (let i = 1; i < corridor.length; i++) {
    const a = corridor[i - 1],
      b = corridor[i];
    const part = clip(a, b);
    if (!part) {
      if (out.length) break;
      continue;
    }
    if (!out.length) out.push(at(a, b, part[0]));
    out.push(at(a, b, part[1]));
    if (!inside(b)) break;
  }
  return dedupe(out.length >= 2 ? out : corridor.map(p => clampToWindow(p, half)));
}

/** A coast is open water: discard pockets cut off from the map boundary. */
function keepBorderConnectedSea(cells: Cell[], sea: Set<number>, half: number): void {
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  const connected = new Set<number>();
  const queue: number[] = [];
  // The classification window is the mesh. A civic-window flag (the settlement
  // square inside a wider mesh) is not that rim: sea beyond it would be dropped
  // as a pocket. Use the flag only when no cell actually touches `half`.
  const touchesWindow = (cell: Cell) => cell.polygon.some(p => Math.max(Math.abs(p[0]), Math.abs(p[1])) >= half - 1);
  const geometric = cells.some(touchesWindow);
  const onRim = (cell: Cell) => (geometric ? touchesWindow(cell) : cell.onBorder);
  for (const cell of cells) {
    if (onRim(cell) && sea.has(cell.id)) {
      connected.add(cell.id);
      queue.push(cell.id);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const cell = byId.get(queue[i]);
    if (!cell) continue;
    for (const neighbor of cell.neighbors) {
      if (!sea.has(neighbor) || connected.has(neighbor)) continue;
      connected.add(neighbor);
      queue.push(neighbor);
    }
  }
  for (const id of sea) if (!connected.has(id)) sea.delete(id);
}

/** Close the shoreline into a polygon whose interior is the water. */
function closeToWaterPolygon(shoreline: Point[], half: number, waterAzimuthDeg: number): Point[] {
  const startB = clampToRect(shoreline[0], half);
  const endB = clampToRect(shoreline[shoreline.length - 1], half);
  const shore: Point[] = [startB, ...shoreline.slice(1, -1), endB];

  const wd = azimuthToVec(waterAzimuthDeg);
  // Probe virtually on the requested water edge, *along the azimuth ray*.
  // Component-wise clamping turns a 174° probe into the bottom-right corner
  // instead of the nearly-south point where that ray meets the frame. For a
  // diagonal shore this selected the complement and flooded the whole city.
  const probeScale = (half * 0.999) / Math.max(Math.abs(wd[0]), Math.abs(wd[1]), 1e-9);
  const probe: Point = [wd[0] * probeScale, wd[1] * probeScale];

  return closeShorelineToFrame(shore, half, probe) ?? [...shore, ...perimeterPath(endB, startB, 1, half)];
}

/** Close an edge-to-edge shore around a known wet point, preserving its water side. */
export function closeShorelineToFrame(shore: Point[], half: number, wetPoint: Point): Point[] | null {
  if (shore.length < 2) return null;
  const start = shore[0],
    end = shore[shore.length - 1];
  for (const dir of [1, -1] as const) {
    const poly = [...shore, ...perimeterPath(end, start, dir, half)];
    if (pointInPolygon(wetPoint, poly)) return poly;
  }
  return null;
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
