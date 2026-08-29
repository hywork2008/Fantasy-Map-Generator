// S2 core — walk a river along the Voronoi cell-edge graph (design §4.1): it is
// literally a widened road. The descriptor gives a rough corridor (source → mouth
// + chord); walkGraph turns it into an organic cell-edge polyline whose exact
// route is scattered by the branching. The walk STARTS on land and RUNS TO THE
// SEA: with a coast it aims just past the shoreline and stops at the water's
// edge, ending exactly at the mouth. See docs/city-generator/design.md §4.2.

import type { EdgeGraph } from "./edgeGraph";
import { smoothPath } from "./edgeGraph";
import { nearestOnPolyline, pointInPolygon, segmentsIntersect } from "./geom";
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

// Two passes, not three: on the coarse ward-scale grid the walked `edgePoints`
// are already ~one cell apart, so heavier smoothing pulls the drawn centre-line
// too far off the grid (and out into the sea past `trimAtWater`).
const SMOOTH_ITERATIONS = 2;

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

  // Mouth = where the corridor actually meets the coast. The corridor's LAST
  // point overshoots the window and, for a meander / great-bend heading, can
  // land in a corner beyond the ends of the shoreline arc — aiming there sends
  // the walk skimming the whole coast and tying itself in knots. The corridor
  // vertex closest to the shoreline is the real landfall.
  let mouth = corridor[corridor.length - 1];
  if (waterPolygon && shoreline && shoreline.length >= 2) {
    let best = Number.POSITIVE_INFINITY;
    for (const c of corridor) {
      const d = nearestOnPolyline(c, shoreline).dist;
      if (d < best) {
        best = d;
        mouth = c;
      }
    }
  }

  // Goal: with a coast, aim just PAST the shoreline (in the water) so the walk
  // actually reaches it and `stop` fires at the edge; otherwise the rough mouth.
  let goal = clampToWindow(mouth, halfExtentMeters);
  if (waterPolygon && shoreline && shoreline.length >= 2) {
    goal = seawardOf(mouth, shoreline, waterPolygon, cellSizeMeters, halfExtentMeters);
  }
  const stop = waterPolygon ? (_id: number, p: Point) => pointInPolygon(p, waterPolygon) : undefined;

  let nodes = walkGraph(graph, {
    start,
    goal,
    rng,
    cellSizeMeters,
    wander: 0.7,
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

  const walked = exciseLoops(
    nodes.map(id => [graph.points[id][0], graph.points[id][1]] as Point),
    cellSizeMeters
  );
  const edgePoints = waterPolygon ? trimAtWater(walked, waterPolygon) : walked;
  if (edgePoints.length < 3) return dead;

  const rawSmooth = smoothPath(edgePoints, SMOOTH_ITERATIONS);
  // Smoothing must not push an INTERIOR vertex into the sea (the mouth may sit in it).
  const clamped = waterPolygon
    ? rawSmooth.map((p, i) => (i < rawSmooth.length - 1 && pointInPolygon(p, waterPolygon) ? edgePoints[i] : p))
    : rawSmooth;

  // INVARIANT: both ends of the drawn centreline must be RESOLVED — within ~1
  // cell of a map edge, or in / at the sea. The walk often stops a little short
  // of that. finalizeEnds snaps each end to whichever (edge or shoreline) it can
  // reach with a short, grid-respecting step; if an end can reach neither, the
  // river is not viable for this geography and the whole thing is dropped.
  const finalized = finalizeEnds(clamped, halfExtentMeters, cellSizeMeters, waterPolygon, shoreline);
  if (!finalized) return dead;
  // Snapping the mouth onto the shore can strand the previous (smoothed,
  // unclamped) tip out in the water — drop any INTERIOR point left deep past the
  // coastline. The two ends are already resolved by finalizeEnds.
  const pruned =
    waterPolygon && shoreline && shoreline.length >= 2
      ? finalized.filter(
          (p, i) =>
            i === 0 ||
            i === finalized.length - 1 ||
            !pointInPolygon(p, waterPolygon) ||
            nearestOnPolyline(p, shoreline).dist <= cellSizeMeters * 1.2
        )
      : finalized;
  // A snapped end can, rarely, cross a nearby bend — clear it the same way.
  const smoothPoints = exciseLoops(pruned.length >= 3 ? pruned : finalized, cellSizeMeters);
  if (smoothPoints.length < 3) return dead;

  return { edgePoints, smoothPoints, widths: resampleWidths(smoothPoints, corridor, widths), fallback: false };
}

/**
 * Enforce the endpoint invariant. Each end independently: keep it if already
 * resolved (near a map edge, or in/at the sea); else snap it to the nearest of
 * {map edge, shoreline} that is within `REACH` and reachable without crossing
 * water; else the river is unviable — return null so the caller drops it.
 */
function finalizeEnds(
  points: Point[],
  half: number,
  cell: number,
  waterPolygon: Point[] | null,
  shoreline: Point[] | null
): Point[] | null {
  if (points.length < 3) return null;
  // "Already there" is a fraction of a cell — the river's own stroke width. The
  // walk routinely stops ~1 cell shy of its goal; a 1-cell gap to the map edge
  // reads clearly as "the river doesn't reach the edge", so it must be snapped.
  const RESOLVED = cell * 0.4;
  // A perpendicular bridge to a map EDGE is a visible straight run that ignores
  // the cell grid, so keep it short. Snapping a near-shore end ONTO the coastline
  // just moves the mouth onto the water's edge — no straight run — so that can
  // reach further.
  const REACH_EDGE = cell * 5;
  const REACH_SEA = cell * 9;

  const edgeGap = (p: Point): number => Math.min(half - Math.abs(p[0]), half - Math.abs(p[1]));
  const seaGap = (p: Point): number =>
    waterPolygon == null
      ? Number.POSITIVE_INFINITY
      : shoreline && shoreline.length >= 2
        ? nearestOnPolyline(p, shoreline).dist
        : Number.POSITIVE_INFINITY;
  const inSea = (p: Point): boolean => waterPolygon != null && pointInPolygon(p, waterPolygon);
  const dryPath = (a: Point, b: Point): boolean => {
    if (waterPolygon == null) return true;
    for (let s = 0; s <= 4; s++) {
      const p: Point = [a[0] + ((b[0] - a[0]) * s) / 4, a[1] + ((b[1] - a[1]) * s) / 4];
      if (pointInPolygon(p, waterPolygon)) return false;
    }
    return true;
  };

  /** null = drop river; the point = new tip to prepend/append; undefined = keep as-is. */
  const resolve = (tip: Point): Point | null | undefined => {
    if (inSea(tip)) {
      // A proper mouth sits just past the coastline; a tip left deep in the water
      // (coarse grid, cape headland) is pulled back onto the shore.
      if (shoreline && shoreline.length >= 2) {
        const hit = nearestOnPolyline(tip, shoreline);
        return hit.dist > cell * 1.5 ? hit.point : undefined;
      }
      return undefined;
    }
    if (edgeGap(tip) < RESOLVED) return undefined;
    const eg = edgeGap(tip);
    const sg = seaGap(tip);
    // already at the coast — snap exactly onto the shoreline so it reads as a mouth
    if (sg < RESOLVED && shoreline && shoreline.length >= 2) return nearestOnPolyline(tip, shoreline).point;
    // nearest map edge, perpendicular (never a long oblique bridge). A landlocked
    // river MUST span the map, so it always takes this branch regardless of gap.
    if (waterPolygon == null || (eg <= REACH_EDGE && eg <= sg)) {
      const gx = half - Math.abs(tip[0]);
      const gy = half - Math.abs(tip[1]);
      const edge: Point =
        gx < gy ? [Math.sign(tip[0]) * half || half, tip[1]] : [tip[0], Math.sign(tip[1]) * half || half];
      if (dryPath(tip, edge)) return edge;
    }
    // else snap onto the shoreline if close-ish — terminates the river at the coast
    if (sg <= REACH_SEA && shoreline && shoreline.length >= 2) return nearestOnPolyline(tip, shoreline).point;
    return null;
  };

  const out = points.map(p => [p[0], p[1]] as Point);
  const head = resolve(out[0]);
  if (head === null) return null;
  if (head) out.unshift(head);
  const tail = resolve(out[out.length - 1]);
  if (tail === null) return null;
  if (tail) out.push(tail);
  return out;
}

/**
 * A river never crosses itself, and at this scale it never curls back on itself
 * either. The biased walk can still do both — spiral a cell cluster where the
 * corridor kinks, or make a wide excursion that `wander` swings out and `align`
 * yanks back. Cut out any span that (a) self-crosses, or (b) is a long detour
 * returning within ~1.5 cells of where it began (a near-loop / hairpin). Join
 * the ends directly — they are close, so the bridge is short and smoothing
 * rounds it.
 */
function exciseLoops(points: Point[], cell: number): Point[] {
  const near = cell * 1.5;
  let out = points;
  for (let guard = 0; guard < 20; guard++) {
    let cut = false;
    for (let i = 0; i < out.length - 3 && !cut; i++) {
      for (let j = i + 2; j < out.length - 1; j++) {
        let hit = !(i === 0 && j === out.length - 2) && segmentsIntersect(out[i], out[i + 1], out[j], out[j + 1]);
        if (!hit && j >= i + 5 && Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1]) < near) {
          let arc = 0;
          for (let k = i; k < j; k++) arc += Math.hypot(out[k + 1][0] - out[k][0], out[k + 1][1] - out[k][1]);
          hit = arc > near * 3.5; // travelled far but ended up back near the start
        }
        if (hit) {
          out = [...out.slice(0, i + 1), ...out.slice(j + 1)];
          cut = true;
          break;
        }
      }
    }
    if (!cut) break;
  }
  return out;
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
