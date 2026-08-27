// Biased random walk over the Voronoi cell-edge graph. At every junction the
// next edge is chosen by (heading alignment + corridor pull + a random term), so
// the path follows cell edges but wanders — and *where it ends up* is scattered
// by the branching. This is the shared mechanic for rivers and coastlines
// (design §4.2): the descriptor gives a rough corridor, the walk gives the shape.

import type { EdgeGraph } from "./edgeGraph";
import { nearestNode } from "./edgeGraph";
import { nearestOnPolyline } from "./geom";
import type { Rng } from "./prng";
import type { Point } from "./types";

export interface WalkOptions {
  start: Point;
  /** Aim point. Clamp it inside the window — the walk stops when it gets within
   * ~1.5 cells, and a goal outside the reachable graph makes it run to maxSteps. */
  goal: Point;
  rng: Rng;
  cellSizeMeters: number;
  /** Random term added to each edge score, in [0, wander]. ~0.5 gentle, ~1.5 wild. */
  wander: number;
  /** Optional polyline the walk is pulled to follow (advancing downstream). */
  corridor?: Point[];
  /** Weight of the corridor-alignment term (0 disables). */
  corridorPull?: number;
  /** Exponent on the normalised corridor distance in the pull penalty. 2 (default)
   * springs the path tight to the corridor; ~1.5 lets it bulge between control
   * points so a meandering corridor reads as a meandering river. */
  corridorFalloff?: number;
  /** Stop as soon as this returns true for the node just stepped onto. */
  stop?: (nodeId: number, point: Point) => boolean;
  maxSteps?: number;
  /** Nodes to steer away from (e.g. another river's path). */
  avoid?: Set<number>;
}

/** Clamp a point into the [-half, half]² window (with a small inset). */
export function clampToWindow(p: Point, half: number): Point {
  const m = half * 0.985;
  return [Math.max(-m, Math.min(m, p[0])), Math.max(-m, Math.min(m, p[1]))];
}

/** Node ids from `start` toward `goal`. Always length >= 1. */
export function walkGraph(graph: EdgeGraph, opts: WalkOptions): number[] {
  const { rng, cellSizeMeters, wander } = opts;
  const corridorPull = opts.corridorPull ?? 0;
  const corridorFalloff = opts.corridorFalloff ?? 2;
  const maxSteps = opts.maxSteps ?? 400;
  const arrive = cellSizeMeters * 2;
  // Heading alignment dominates the choice; the random term only breaks ties
  // between similarly-aligned edges (so the path heads to the goal but wiggles).
  const ALIGN_WEIGHT = 1.6;

  let current = nearestNode(graph, opts.start);
  let previous = -1;
  const path = [current];
  const visited = new Set<number>([current]);

  for (let step = 0; step < maxSteps; step++) {
    const here = graph.points[current];
    const gx = opts.goal[0] - here[0];
    const gy = opts.goal[1] - here[1];
    const gLen = Math.hypot(gx, gy) || 1;
    if (gLen < arrive) break;
    const goalDir: Point = [gx / gLen, gy / gLen];

    let bestTo = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const { to } of graph.adjacency[current]) {
      if (to === previous) continue;
      const there = graph.points[to];
      const ex = there[0] - here[0];
      const ey = there[1] - here[1];
      const eLen = Math.hypot(ex, ey) || 1;
      const align = (ex * goalDir[0] + ey * goalDir[1]) / eLen; // [-1, 1]

      let score = ALIGN_WEIGHT * align + rng.range(0, wander);
      if (corridorPull > 0 && opts.corridor) {
        const mid: Point = [(here[0] + there[0]) / 2, (here[1] + there[1]) / 2];
        const d = nearestOnPolyline(mid, opts.corridor).dist;
        score -= corridorPull * (d / Math.max(cellSizeMeters, 1)) ** corridorFalloff;
      }
      if (opts.avoid?.has(to)) score -= 3;
      if (visited.has(to)) score -= 1.5;

      if (score > bestScore) {
        bestScore = score;
        bestTo = to;
      }
    }
    if (bestTo === -1) break;

    previous = current;
    current = bestTo;
    path.push(current);
    visited.add(current);
    if (opts.stop?.(current, graph.points[current])) break;
  }

  return path;
}
