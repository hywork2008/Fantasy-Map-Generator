// The Voronoi cell-edge graph — nodes are shared cell-boundary vertices, edges
// are cell-polygon edges weighted by length. This is the `Topology` equivalent
// from TownGeneratorTS: streets AND rivers are routed A* over it, then the
// vertex chain is smoothed so the zig-zag of cell edges reads as a road.

import FlatQueue from "flatqueue";
import { polygonCentroid } from "./geom";
import type { Cell, Point } from "./types";

/** Coincident cell-boundary vertices closer than this merge to one node (m).
 * Far below the cell size, so distinct Voronoi vertices are never merged. */
export const MERGE_QUANTUM = 0.05;

/** Quantized identity of a shared cell-boundary vertex. Rivers and streets both
 * key folds with this so a moved vertex stays one vertex on every cell that
 * owns it. */
export function vertexKey(p: Point): string {
  return `${Math.round(p[0] / MERGE_QUANTUM)},${Math.round(p[1] / MERGE_QUANTUM)}`;
}

export interface EdgeGraph {
  /** node id → coordinate. */
  points: Point[];
  /** node id → outgoing edges. */
  adjacency: { to: number; w: number }[][];
}

export function buildEdgeGraph(cells: Cell[]): EdgeGraph {
  const idOf = new Map<string, number>();
  const points: Point[] = [];
  const adjacency: { to: number; w: number }[][] = [];
  const linked = new Set<number>();

  const node = (p: Point): number => {
    const key = `${Math.round(p[0] / MERGE_QUANTUM)},${Math.round(p[1] / MERGE_QUANTUM)}`;
    let id = idOf.get(key);
    if (id === undefined) {
      id = points.length;
      idOf.set(key, id);
      points.push([p[0], p[1]]);
      adjacency.push([]);
    }
    return id;
  };

  const link = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? a * 0x1000000 + b : b * 0x1000000 + a;
    if (linked.has(key)) return;
    linked.add(key);
    const w = Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
    adjacency[a].push({ to: b, w });
    adjacency[b].push({ to: a, w });
  };

  for (const cell of cells) {
    const poly = cell.polygon;
    let prev = node(poly[poly.length - 1]);
    for (const vertex of poly) {
      const cur = node(vertex);
      link(prev, cur);
      prev = cur;
    }
  }

  return { points, adjacency };
}

export function nearestNode(graph: EdgeGraph, p: Point): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < graph.points.length; i++) {
    const dx = graph.points[i][0] - p[0];
    const dy = graph.points[i][1] - p[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * A* over the edge graph. `edgeCost` defaults to Euclidean edge length; pass a
 * larger cost to bias the route (e.g. toward a target polyline). It must stay
 * >= the edge length or the straight-line heuristic would over-estimate.
 */
export function aStar(
  graph: EdgeGraph,
  start: number,
  goal: number,
  edgeCost: (a: number, b: number, w: number) => number = (_a, _b, w) => w
): number[] | null {
  const n = graph.points.length;
  if (start < 0 || goal < 0 || start >= n || goal >= n) return null;

  const gScore = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  gScore[start] = 0;

  const gx = graph.points[goal][0];
  const gy = graph.points[goal][1];
  const heuristic = (node: number): number => Math.hypot(graph.points[node][0] - gx, graph.points[node][1] - gy);

  const open = new FlatQueue<number>();
  open.push(start, heuristic(start));

  while (open.length > 0) {
    const current = open.pop() as number;
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    for (const { to, w } of graph.adjacency[current]) {
      if (closed[to]) continue;
      const tentative = gScore[current] + edgeCost(current, to, w);
      if (tentative < gScore[to]) {
        gScore[to] = tentative;
        cameFrom[to] = current;
        open.push(to, tentative + heuristic(to));
      }
    }
  }

  if (goal !== start && cameFrom[goal] === -1) return null;
  const path: number[] = [goal];
  for (let node = goal; node !== start; node = cameFrom[node]) {
    if (cameFrom[node] === -1) return null;
    path.push(cameFrom[node]);
  }
  return path.reverse();
}

/** Windowed average over interior points, endpoints fixed (Model.smoothStreet). */
export function smoothPath(points: Point[], iterations: number): Point[] {
  let out = points.map(p => [p[0], p[1]] as Point);
  for (let iter = 0; iter < iterations; iter++) {
    const next = out.map(p => [p[0], p[1]] as Point);
    for (let i = 1; i < out.length - 1; i++) {
      next[i] = [
        (out[i - 1][0] + 2 * out[i][0] + out[i + 1][0]) / 4,
        (out[i - 1][1] + 2 * out[i][1] + out[i + 1][1]) / 4
      ];
    }
    out = next;
  }
  return out;
}

/**
 * Replay a detached-graph vertex move onto the cell polygons that share those
 * vertices. TownGeneratorTS mutates the `Point`s its streets/rivers share with
 * the patches; our walk copies coordinates, so pipeline folds the shift back.
 * `reserved` keys stay pinned. Cells with no matching vertex — and the whole
 * array when nothing moves — are returned by reference.
 */
export function foldVerticesIntoCells(
  cells: Cell[],
  vertexShifts: Map<string, Point>,
  reserved: Set<string> = new Set()
): Cell[] {
  if (vertexShifts.size === 0) return cells;
  let moved = false;
  const out = cells.map(cell => {
    let touched = false;
    const polygon = cell.polygon.map(p => {
      const k = vertexKey(p);
      const shift = vertexShifts.get(k);
      if (!shift || reserved.has(k)) return [p[0], p[1]] as Point;
      touched = true;
      return [shift[0], shift[1]] as Point;
    });
    if (!touched) return cell;
    moved = true;
    return { ...cell, polygon, centroid: polygonCentroid(polygon) };
  });
  return moved ? out : cells;
}
