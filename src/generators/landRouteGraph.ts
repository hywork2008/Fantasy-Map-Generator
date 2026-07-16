import FlatQueue from "flatqueue";
import type { MapCoordinates } from "../context/worldContext";
import type { PackedGraph } from "../types/PackedGraph";
import { getLatitude } from "../utils/commonUtils";
import { getSeason } from "../utils/seasonUtils";

/**
 * Navigable graph over every charted "roads"/"trails" route, keyed by cell id. Same design as
 * seaRouteGraph.ts (docs/plan/naval-sea-lanes.md Phase 1), applied to land routes instead of sea
 * lanes — see docs/plan/military-movement.md §1.2. Land regiment movement/pathfinding should go
 * through this instead of straight-line distance, so a regiment can't cut across a bay or
 * unconnected peninsula just because the two endpoints are both its own state's land cells.
 *
 * Not merged into a single generic module with seaRouteGraph.ts: land routes don't cover every
 * land cell (sparse rural areas have no road/trail at all), so land-specific fallback handling
 * (BFS over cells.c, or an off-road speed penalty — see military-movement.md §1.2's open concern)
 * is expected to diverge from the sea-route module, which has no such gap to fill.
 */
export interface LandRouteGraph {
  /** cellId -> neighbor cellId -> distance (map units) along that route edge. */
  readonly adjacency: Map<number, Map<number, number>>;
}

/** Latitude beyond which winter closes a road/trail regardless of elevation (subarctic/arctic). */
const WINTER_ROAD_CLOSURE_LATITUDE = 55;
/** Elevation (pack.cells.h) beyond which winter closes a road/trail regardless of latitude (mountain passes). */
const WINTER_ROAD_CLOSURE_ELEVATION = 60;

/** The map context needed to decide whether a route segment is snowed in this month — see docs/simulation/seasons.md. */
export interface SeasonalRouteContext {
  month: number;
  mapCoordinates: MapCoordinates;
  graphHeight: number;
}

/**
 * True if the segment between cell1/cell2 is closed by winter snow: high latitude (subarctic/
 * arctic) or high elevation (mountain pass), evaluated at the segment's midpoint/highest
 * endpoint. Only route *selection* is affected — see landRouteGraph.ts's module doc comment on
 * docs/simulation/seasons.md's documented limitation that an already-marching regiment isn't
 * stopped mid-journey by this.
 */
function isWinterBlocked(
  pack: PackedGraph,
  y1: number,
  y2: number,
  cell1: number,
  cell2: number,
  seasonal: SeasonalRouteContext
): boolean {
  // Defensive: callers/tests that build a minimal WorldContext without map coordinates (e.g.
  // before generation completes) shouldn't crash — just skip seasonal blocking entirely.
  if (!seasonal.mapCoordinates || !seasonal.graphHeight) return false;

  const midY = (y1 + y2) / 2;
  const latitude = getLatitude(midY, seasonal.mapCoordinates, seasonal.graphHeight);
  if (getSeason(latitude, seasonal.month) !== "winter") return false;

  const elevation = Math.max(pack.cells.h[cell1] ?? 0, pack.cells.h[cell2] ?? 0);
  return Math.abs(latitude) >= WINTER_ROAD_CLOSURE_LATITUDE || elevation >= WINTER_ROAD_CLOSURE_ELEVATION;
}

/**
 * Builds the land-route graph from `pack.routes`. Rebuild whenever routes are (re)generated, or
 * (for seasonal road blocking) every tick — see regimentMovement.ts's advanceAllRegimentMovement,
 * which already rebuilds this graph fresh every call. `seasonal`, if given, omits segments that
 * are snowed in for the given month (see isWinterBlocked); omitting it preserves the old
 * always-open behavior, e.g. for callers that don't care about seasonal passability.
 */
export function buildLandRouteGraph(pack: PackedGraph, seasonal?: SeasonalRouteContext): LandRouteGraph {
  const adjacency = new Map<number, Map<number, number>>();

  const addEdge = (from: number, to: number, dist: number) => {
    if (!adjacency.has(from)) adjacency.set(from, new Map());
    const neighbors = adjacency.get(from)!;
    const existing = neighbors.get(to);
    if (existing === undefined || dist < existing) neighbors.set(to, dist);
  };

  for (const route of pack.routes ?? []) {
    if (route.group !== "roads" && route.group !== "trails") continue;

    const points = route.points;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1, cell1] = points[i];
      const [x2, y2, cell2] = points[i + 1];
      if (cell1 === cell2) continue;
      if (seasonal && isWinterBlocked(pack, y1, y2, cell1, cell2, seasonal)) continue;

      const dist = Math.hypot(x2 - x1, y2 - y1);
      addEdge(cell1, cell2, dist);
      addEdge(cell2, cell1, dist);
    }
  }

  return { adjacency };
}

/**
 * Dijkstra from `start`, stopping early once `target` is settled (if given). Shared core for
 * findLandRouteDistance (single target), findReachableLandCells (whole graph), and
 * findLandRoutePath (needs the predecessor chain too) — mirrors seaRouteGraph.ts's dijkstraFrom.
 */
function dijkstraFrom(
  graph: LandRouteGraph,
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
 * Shortest land-route distance between two cells. Returns null if no charted road/trail
 * connects them (including when either cell has no charted route at all) — callers that need a
 * distance regardless of road coverage must apply their own fallback (see the module doc comment).
 */
export function findLandRouteDistance(graph: LandRouteGraph, start: number, end: number): number | null {
  if (start === end) return 0;
  if (!graph.adjacency.has(end)) return null;
  return dijkstraFrom(graph, start, end).dist.get(end) ?? null;
}

/** Every cell reachable by charted road/trail from `start`, with its distance. */
export function findReachableLandCells(graph: LandRouteGraph, start: number): Map<number, number> {
  return dijkstraFrom(graph, start).dist;
}

/**
 * Ordered sequence of cell ids along the shortest land route from `start` to `end` (inclusive of
 * both endpoints), or null if unreachable. Used where a caller needs to walk partway along a
 * charted road/trail instead of just knowing the total distance.
 */
export function findLandRoutePath(graph: LandRouteGraph, start: number, end: number): number[] | null {
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
