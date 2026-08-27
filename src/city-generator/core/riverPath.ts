// S2 core — route a river onto the Voronoi cell-edge graph so it is literally a
// widened road (design §4.1). A* between the descriptor centerline's window
// entry / exit, edge cost biased toward that centerline, then the cell-edge
// vertex chain is smoothed (Model.ts buildStreets). See docs/city-generator/design.md §4.2.

import { aStar, type EdgeGraph, nearestNode, smoothPath } from "./edgeGraph";
import { nearestOnPolyline } from "./geom";
import type { Point } from "./types";

export interface RoutedRiver {
  /** Raw A* result — a chain of actual cell-edge vertices. Used for water /
   * bank classification (it lies exactly on cell boundaries). */
  edgePoints: Point[];
  /** `edgePoints` smoothed — the river's drawn / setback centerline. */
  smoothPoints: Point[];
  /** Full width per `smoothPoints` vertex, resampled from the descriptor widths. */
  widths: number[];
  /** True when no graph route was found and the descriptor centerline is used verbatim. */
  fallback: boolean;
}

const CENTERLINE_PULL = 6;
const SMOOTH_ITERATIONS = 3;

export function routeRiverAlongEdges(
  graph: EdgeGraph,
  centerline: Point[],
  widths: number[],
  cellSizeMeters: number
): RoutedRiver {
  const fallbackResult = (): RoutedRiver => ({
    edgePoints: centerline,
    smoothPoints: centerline,
    widths: centerline.map((_, i) => widths[Math.min(i, widths.length - 1)] ?? 0),
    fallback: true
  });

  if (centerline.length < 2 || graph.points.length === 0) return fallbackResult();

  const start = nearestNode(graph, centerline[0]);
  const goal = nearestNode(graph, centerline[centerline.length - 1]);
  if (start === goal) return fallbackResult();

  const ref = Math.max(cellSizeMeters, 1);
  const edgeCost = (a: number, b: number, w: number): number => {
    const mx = (graph.points[a][0] + graph.points[b][0]) / 2;
    const my = (graph.points[a][1] + graph.points[b][1]) / 2;
    const d = nearestOnPolyline([mx, my], centerline).dist;
    return w * (1 + CENTERLINE_PULL * (d / ref) ** 2);
  };

  const nodePath = aStar(graph, start, goal, edgeCost);
  if (!nodePath || nodePath.length < 3) return fallbackResult();

  const edgePoints = nodePath.map(id => [graph.points[id][0], graph.points[id][1]] as Point);
  const smoothPoints = smoothPath(edgePoints, SMOOTH_ITERATIONS);
  return { edgePoints, smoothPoints, widths: resampleWidths(smoothPoints, centerline, widths), fallback: false };
}

/** Width at each routed vertex = the descriptor width at its closest point on
 * the original centerline. */
function resampleWidths(routed: Point[], centerline: Point[], widths: number[]): number[] {
  return routed.map(p => {
    const hit = nearestOnPolyline(p, centerline);
    const w0 = widths[Math.min(hit.segIndex, widths.length - 1)] ?? 0;
    const w1 = widths[Math.min(hit.segIndex + 1, widths.length - 1)] ?? w0;
    return w0 + (w1 - w0) * hit.t;
  });
}
