// S2 core — walk a river along the Voronoi cell-edge graph (design §4.1): it is
// literally a widened road. The descriptor gives a rough corridor (source → mouth
// + chord); walkGraph turns it into an organic cell-edge polyline whose exact
// route is scattered by the branching. The walk STARTS on land and RUNS TO THE
// SEA: with a coast it aims just past the shoreline and stops at the water's
// edge, ending exactly at the mouth. See docs/city-generator/design.md §4.2.

import type { EdgeGraph } from "./edgeGraph";
import { smoothPath } from "./edgeGraph";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { clampToWindow, walkGraph } from "./graphWalk";
import type { Rng } from "./prng";
import type { Point } from "./types";

export interface RoutedRiver {
  /** Raw walk — a chain of actual cell-edge vertices (used for classification). */
  edgePoints: Point[];
  /** `edgePoints` smoothed — the river's drawn / setback centerline. */
  smoothPoints: Point[];
  /** Full width per vertex, resampled from the corridor. */
  widths: number[];
  /** True when the river could not be walked onto the grid (offshore / degenerate). */
  fallback: boolean;
}

const SMOOTH_ITERATIONS = 3;

export function walkRiver(
  graph: EdgeGraph,
  corridor: Point[],
  widths: number[],
  waterPolygon: Point[] | null,
  shoreline: Point[] | null,
  cellSizeMeters: number,
  halfExtentMeters: number,
  rng: Rng
): RoutedRiver {
  const dead: RoutedRiver = { edgePoints: [], smoothPoints: [], widths: [], fallback: true };
  if (corridor.length < 2 || graph.points.length === 0) return dead;

  // Start from the first corridor point on land; bail if the whole river is offshore.
  let start = corridor[0];
  if (waterPolygon) {
    const dry = corridor.find(p => !pointInPolygon(p, waterPolygon));
    if (!dry) return dead;
    start = dry;
  }
  start = clampToWindow(start, halfExtentMeters);

  // Goal: with a coast, aim just PAST the shoreline (in the water) so the walk
  // actually reaches it and `stop` fires at the edge; otherwise the rough mouth.
  const roughMouth = corridor[corridor.length - 1];
  let goal = clampToWindow(roughMouth, halfExtentMeters);
  if (waterPolygon && shoreline && shoreline.length >= 2) {
    goal = seawardOf(roughMouth, shoreline, waterPolygon, cellSizeMeters, halfExtentMeters);
  }
  const stop = waterPolygon ? (_id: number, p: Point) => pointInPolygon(p, waterPolygon) : undefined;

  let nodes = walkGraph(graph, {
    start,
    goal,
    rng,
    cellSizeMeters,
    wander: 0.9,
    corridor,
    corridorPull: 1.5,
    corridorFalloff: 1.5,
    maxSteps: 300,
    stop
  });
  if (nodes.length < 3) {
    nodes = walkGraph(graph, {
      start,
      goal,
      rng,
      cellSizeMeters,
      wander: 0.35,
      corridorPull: 1.2,
      maxSteps: 220,
      stop
    });
  }
  if (nodes.length < 3) return dead;

  const walked = nodes.map(id => [graph.points[id][0], graph.points[id][1]] as Point);
  const edgePoints = waterPolygon ? trimAtWater(walked, waterPolygon) : walked;
  if (edgePoints.length < 3) return dead;

  const rawSmooth = smoothPath(edgePoints, SMOOTH_ITERATIONS);
  // Smoothing must not push an INTERIOR vertex into the sea (the mouth may sit in it).
  const smoothPoints = waterPolygon
    ? rawSmooth.map((p, i) => (i < rawSmooth.length - 1 && pointInPolygon(p, waterPolygon) ? edgePoints[i] : p))
    : rawSmooth;
  return { edgePoints, smoothPoints, widths: resampleWidths(smoothPoints, corridor, widths), fallback: false };
}

/** Keep vertices up to and including the first that reaches the water (the mouth). */
function trimAtWater(points: Point[], waterPolygon: Point[]): Point[] {
  const firstWet = points.findIndex(p => pointInPolygon(p, waterPolygon));
  if (firstWet === -1) return points;
  return points.slice(0, Math.max(firstWet + 1, 3));
}

/** A point a few cells into the water, off the shoreline near `mouth`. */
function seawardOf(mouth: Point, shoreline: Point[], waterPolygon: Point[], cell: number, half: number): Point {
  const hit = nearestOnPolyline(mouth, shoreline);
  const a = shoreline[hit.segIndex];
  const b = shoreline[Math.min(hit.segIndex + 1, shoreline.length - 1)];
  const tlen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let nx = -(b[1] - a[1]) / tlen;
  let ny = (b[0] - a[0]) / tlen;
  const probe: Point = [hit.point[0] + nx * cell * 3, hit.point[1] + ny * cell * 3];
  if (!pointInPolygon(probe, waterPolygon)) {
    nx = -nx;
    ny = -ny;
  }
  return clampToWindow([hit.point[0] + nx * cell * 4, hit.point[1] + ny * cell * 4], half);
}

function resampleWidths(routed: Point[], corridor: Point[], widths: number[]): number[] {
  return routed.map(p => {
    const hit = nearestOnPolyline(p, corridor);
    const w0 = widths[Math.min(hit.segIndex, widths.length - 1)] ?? 0;
    const w1 = widths[Math.min(hit.segIndex + 1, widths.length - 1)] ?? w0;
    return w0 + (w1 - w0) * hit.t;
  });
}
