// Phase G2 — pipeline-end plausibility filter (towngen-comparison.md §3.E).
//
// TownGeneratorTS has no sea, so there is no upstream original to port. The
// river walk's `stop` / `trimAtWater` / `finalizeEnds` is the in-house pattern
// this copies for roads, walls and building footprints: `waterPolygon` is the
// single source of truth, and anything that sits in it is dropped or reclassified.
// Inspired by publicly documented algorithms only — no GPL code.

import {
  longestDryRun,
  pointInPolygon,
  polygonCentroid,
  segmentInteriorInPolygon,
  segmentPolylineIntersection
} from "./geom";
import type { Gate, Point } from "./types";

/** Landward replacement of a far-aim that landed in the water: the `goal→gate`
 * × shoreline intersection, then one `cellSize` step toward the gate. Falls
 * back to walking the same bearing back out of the polygon when the shoreline
 * is missing or the segment misses it. */
export function landwardFarNode(
  gate: Point,
  goal: Point,
  waterPolygon: Point[] | null,
  shoreline: Point[] | null,
  cellSize: number,
  clamp: (p: Point) => Point
): Point {
  if (!waterPolygon || waterPolygon.length < 3 || !pointInPolygon(goal, waterPolygon)) return clamp(goal);
  const hit = shoreline && shoreline.length >= 2 ? segmentPolylineIntersection(goal, gate, shoreline) : null;
  if (hit) {
    const dx = gate[0] - hit[0];
    const dy = gate[1] - hit[1];
    const len = Math.hypot(dx, dy) || 1;
    const landward: Point = [hit[0] + (dx / len) * cellSize, hit[1] + (dy / len) * cellSize];
    if (!pointInPolygon(landward, waterPolygon)) return clamp(landward);
  }
  for (let t = 0.9; t > 0; t -= 0.05) {
    const fromGate: Point = [gate[0] + (goal[0] - gate[0]) * t, gate[1] + (goal[1] - gate[1]) * t];
    if (!pointInPolygon(fromGate, waterPolygon)) return clamp(fromGate);
  }
  return gate;
}

/** How close to the window edge a vertex may sit and still count as leaving the map.
 * Coarse evolution cells often stop a block inward of the exact frame. */
export function frameReachSlack(halfExtent: number, cellSize: number): number {
  return Math.max(cellSize * 2, halfExtent * 0.12);
}

export function polylineReachesFrame(line: Point[], halfExtent: number, slack: number): boolean {
  const limit = halfExtent - slack;
  return line.some(p => Math.abs(p[0]) >= limit || Math.abs(p[1]) >= limit);
}

/** Approach roads that actually leave the window, not intramural streets. */
export function countFrameReachingPolylines(lines: Point[][], halfExtent: number, cellSize: number): number {
  const slack = frameReachSlack(halfExtent, cellSize);
  return lines.filter(line => polylineReachesFrame(line, halfExtent, slack)).length;
}

/** Keep the longest dry stretch of each polyline; drop a line that is entirely wet. */
export function clipPolylinesToLand(lines: Point[][], waterPolygon: Point[] | null): Point[][] {
  if (!waterPolygon || waterPolygon.length < 3) return lines.map(line => line.map(p => [p[0], p[1]] as Point));
  const out: Point[][] = [];
  for (const line of lines) {
    const dry = longestDryRun(line, waterPolygon);
    if (dry && dry.length >= 2) out.push(dry);
  }
  return out;
}

/** A land gate whose road A* returned null cannot be reached on foot — re-mark
 * it as a water gate (quay) rather than drawing a road through the sea. */
export function remakeUnreachableLandGates(gates: Gate[], roads: Point[][], cellSize: number): Gate[] {
  if (!gates.length) return gates;
  const reach = cellSize * 1.5;
  const served = (gate: Gate): boolean =>
    roads.some(line => {
      const end = line[line.length - 1];
      return Math.hypot(end[0] - gate.point[0], end[1] - gate.point[1]) < reach;
    });
  return gates.map(gate => (gate.water || served(gate) ? gate : { ...gate, water: true }));
}

/** True when more than half of the still-land gates have no road. */
export function majorityLandGatesUnserved(gates: Gate[], roads: Point[][], cellSize: number): boolean {
  const land = gates.filter(g => !g.water);
  if (!land.length) return false;
  const remade = remakeUnreachableLandGates(land, roads, cellSize);
  const unserved = remade.filter(g => g.water).length;
  return unserved * 2 > land.length;
}

/** A wall edge whose midpoint sits in the water should not be drawn (the sea
 * side is left open). Boundary-hugging shoreline edges stay. */
export function wallSegmentIsDry(a: Point, b: Point, waterPolygon: Point[] | null): boolean {
  if (!waterPolygon || waterPolygon.length < 3) return true;
  return !segmentInteriorInPolygon(a, b, waterPolygon);
}

/**
 * Split a closed wall loop into maximal contiguous dry runs. `segments[i]` is
 * the edge `points[i] → points[i+1]`. Empty when every edge is wet. A fully
 * dry loop is returned as a single run (still closed).
 */
export function splitDryWallRuns<T>(points: Point[], segments: T[], waterPolygon: Point[] | null): T[][] {
  if (!segments.length) return [];
  if (!waterPolygon || waterPolygon.length < 3 || points.length !== segments.length) return [segments];
  const n = segments.length;
  const dry = segments.map((_, i) => wallSegmentIsDry(points[i], points[(i + 1) % n], waterPolygon));
  if (dry.every(Boolean)) return [segments];
  if (!dry.some(Boolean)) return [];
  const runs: T[][] = [];
  const start = dry.findIndex((d, i) => d && !dry[(i - 1 + n) % n]);
  let i = start < 0 ? 0 : start;
  for (let step = 0; step < n; ) {
    while (step < n && !dry[i]) {
      i = (i + 1) % n;
      step++;
    }
    if (step >= n) break;
    const run: T[] = [];
    while (step < n && dry[i]) {
      run.push(segments[i]);
      i = (i + 1) % n;
      step++;
    }
    if (run.length) runs.push(run);
  }
  return runs;
}

/** Drop building pieces whose centroid sits in the water. City Editor does not
 * currently emit S7 footprints; the filter is the same `withinCell` clause
 * `city-generator/core/buildings.ts` already uses, ready for that stage. */
export function filterBuildingsOverWater(pieces: Point[][], waterPolygon: Point[] | null): Point[][] {
  if (!waterPolygon || waterPolygon.length < 3) return pieces;
  return pieces.filter(piece => piece.length < 3 || !pointInPolygon(polygonCentroid(piece), waterPolygon));
}

export function buildingOverWater(piece: Point[], waterPolygon: Point[] | null): boolean {
  if (!waterPolygon || waterPolygon.length < 3 || piece.length < 3) return false;
  return pointInPolygon(polygonCentroid(piece), waterPolygon);
}
