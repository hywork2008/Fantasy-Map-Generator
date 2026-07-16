import FlatQueue from "flatqueue";
import type { PackedGraph } from "../types/PackedGraph";

/**
 * Navigable graph over every charted "searoutes" route, keyed by cell id (a route's cells
 * are always port land cells at the endpoints and water cells in between — see
 * routes-generator.ts's generateSeaRoutes()). Naval reachability/distance checks should
 * go through this instead of straight-line distance: without a charted lane there is no
 * safe crossing in an era without reliable open-ocean navigation, so two cells not
 * connected here are treated as unreachable by sea, not just "far".
 */
export interface SeaRouteGraph {
  /** cellId -> neighbor cellId -> distance (map units) along that route edge. */
  readonly adjacency: Map<number, Map<number, number>>;
}

/** Builds the sea-route graph from `pack.routes`. Rebuild whenever routes are (re)generated. */
export function buildSeaRouteGraph(pack: PackedGraph): SeaRouteGraph {
  const adjacency = new Map<number, Map<number, number>>();

  const addEdge = (from: number, to: number, dist: number) => {
    if (!adjacency.has(from)) adjacency.set(from, new Map());
    const neighbors = adjacency.get(from)!;
    const existing = neighbors.get(to);
    if (existing === undefined || dist < existing) neighbors.set(to, dist);
  };

  for (const route of pack.routes ?? []) {
    if (route.group !== "searoutes") continue;

    const points = route.points;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1, cell1] = points[i];
      const [x2, y2, cell2] = points[i + 1];
      if (cell1 === cell2) continue;

      const dist = Math.hypot(x2 - x1, y2 - y1);
      addEdge(cell1, cell2, dist);
      addEdge(cell2, cell1, dist);
    }
  }

  return { adjacency };
}

/**
 * Dijkstra from `start`, stopping early once `target` is settled (if given). Shared core
 * for findSeaRouteDistance (single target), findReachableCells (whole graph), and
 * findSeaRoutePath (needs the predecessor chain too) so there's one traversal
 * implementation instead of three near-identical copies.
 */
function dijkstraFrom(
  graph: SeaRouteGraph,
  start: number,
  target?: number
): { dist: Map<number, number>; from: Map<number, number> } {
  const dist = new Map<number, number>();
  const from = new Map<number, number>();
  if (!graph.adjacency.has(start)) return { dist, from };

  dist.set(start, 0);

  const queue = new FlatQueue<number>();
  queue.push(start, 0);

  const settled = new Set<number>();

  while (queue.length) {
    const currentDist = queue.peekValue()!;
    const current = queue.pop()!;
    if (settled.has(current)) continue;
    settled.add(current);

    if (target !== undefined && current === target) break;

    const neighbors = graph.adjacency.get(current);
    if (!neighbors) continue;

    for (const [next, edgeDist] of neighbors) {
      if (settled.has(next)) continue;
      const total = currentDist + edgeDist;
      if (total < (dist.get(next) ?? Infinity)) {
        dist.set(next, total);
        from.set(next, current);
        queue.push(next, total);
      }
    }
  }

  return { dist, from };
}

/**
 * Shortest sea-route distance between two cells (typically both port/anchor cells —
 * `MilitaryRegiment.cell` for a fleet regiment is always its home port's land cell, see
 * docs/plan/naval-sea-lanes.md §0.3). Returns null if no charted route connects them
 * (including when either cell has no charted route at all), meaning the crossing isn't
 * one a fleet can safely make.
 */
export function findSeaRouteDistance(graph: SeaRouteGraph, start: number, end: number): number | null {
  if (start === end) return 0;
  if (!graph.adjacency.has(end)) return null;
  return dijkstraFrom(graph, start, end).dist.get(end) ?? null;
}

/**
 * Every cell reachable by charted sea route from `start`, with its distance. Useful when
 * checking one origin against many candidate destinations at once (e.g. frontierAnalysis.ts
 * scanning every other state's ports for one of our own) — a single traversal instead of
 * one findSeaRouteDistance call per candidate.
 */
export function findReachableCells(graph: SeaRouteGraph, start: number): Map<number, number> {
  return dijkstraFrom(graph, start).dist;
}

/**
 * Ordered sequence of cell ids along the shortest sea route from `start` to `end`
 * (inclusive of both endpoints), or null if unreachable. Used where a caller needs to walk
 * partway along a charted lane instead of just knowing the total distance — e.g.
 * military-generator.ts repositioning a fleet toward a threatened port without letting it
 * cut across open water to get there.
 */
export function findSeaRoutePath(graph: SeaRouteGraph, start: number, end: number): number[] | null {
  if (start === end) return graph.adjacency.has(start) ? [start] : null;
  if (!graph.adjacency.has(end)) return null;

  const { dist, from } = dijkstraFrom(graph, start, end);
  if (!dist.has(end)) return null;

  const path = [end];
  let node = end;
  while (from.has(node)) {
    node = from.get(node)!;
    path.push(node);
  }
  return path.reverse();
}
