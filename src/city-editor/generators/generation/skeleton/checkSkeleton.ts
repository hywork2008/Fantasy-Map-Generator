// K5 — reject a skeleton before any mesh exists (§4.5).
// Each check maps to a mesh-first rejection reason it is meant to pre-empt.

import type { Point } from "../../../types/geometry";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon, polygonArea } from "../../geom";
import type {
  SkeletonBridge,
  SkeletonCore,
  SkeletonFailure,
  SkeletonGate,
  SkeletonInputs,
  SkeletonRoute,
  SkeletonWall
} from "./contracts";
import { add, dist, distanceToPolyline, lineAngleDegrees, sub, tangentAt } from "./vector";

export interface SkeletonCheckInput {
  inputs: SkeletonInputs;
  core: SkeletonCore;
  wall: SkeletonWall | null;
  routes: SkeletonRoute[];
  gates: SkeletonGate[];
  bridges: SkeletonBridge[];
}

function checkWallShape({ inputs, core, wall }: SkeletonCheckInput): SkeletonFailure | null {
  if (!wall) return null;
  const ring = wall.polygon;
  const problems: string[] = [];
  if (ring.length < 3 || !isSimplePolygon(ring)) problems.push("ring is not a simple polygon");
  if (!pointInPolygon(core.core, ring)) problems.push("ring does not enclose the core");
  if (Math.abs(polygonArea(ring)) < inputs.cellSize * inputs.cellSize * 4)
    problems.push("ring is smaller than four blocks");
  return problems.length
    ? { reason: "wall-shape-invalid", message: "The wall ring is not a usable enclosure.", details: problems }
    : null;
}

/** Minimum distance between a segment and a polyline, sampled every metre along the segment. */
function segmentToPolyline(a: Point, b: Point, line: Point[]): number {
  const steps = Math.max(1, Math.ceil(dist(a, b)));
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    best = Math.min(best, distanceToPolyline([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], line));
  }
  return best;
}

function checkWallRivers({ inputs, core, wall }: SkeletonCheckInput): SkeletonFailure | null {
  if (!wall) return null;
  // A wall following a river that skirts the town only has to stay out of the water;
  // one the river passes through must keep a full wall's clearance from it.
  const edge = new Set(core.edgeRivers.map(river => river.index));
  const ring = wall.polygon;
  const gateEdges = new Set(wall.waterGates.map(g => g.edge));
  const parallel: string[] = [];
  const crossing: string[] = [];
  for (const gate of wall.waterGates) {
    if (gate.shared > 1) continue;
    const river = inputs.rivers.find(r => r.index === gate.riverIndex)!;
    const a = ring[gate.edge];
    const b = ring[(gate.edge + 1) % ring.length];
    const hit = nearestOnPolyline(gate.point, river.centerline);
    const tangent = tangentAt(river.centerline, hit.segIndex);
    const angle = lineAngleDegrees(sub(b, a), [-tangent[1], tangent[0]]);
    // A water gate spans the river like a bridge: same era limit.
    if (angle > inputs.bridgeSkewLimit)
      crossing.push(`water gate on edge ${gate.edge}: ${angle.toFixed(1)}° off the river normal`);
  }
  for (let i = 0; i < ring.length; i++) {
    if (gateEdges.has(i)) continue;
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (const river of inputs.rivers) {
      const gap = segmentToPolyline(a, b, river.centerline);
      if (gap < river.halfWidth + (edge.has(river.index) ? 0.5 : inputs.wallWidth / 2))
        parallel.push(`edge ${i} within ${gap.toFixed(1)} m of river ${river.index}`);
    }
  }
  if (crossing.length)
    return { reason: "wall-river-crossing", message: "A wall crosses a river off its normal.", details: crossing };
  if (parallel.length)
    return {
      reason: "wall-river-parallel",
      message: "The wall runs along or over a river instead of crossing it once.",
      details: parallel.slice(0, 8)
    };
  return null;
}

function checkBridges({ inputs, wall, routes, bridges }: SkeletonCheckInput): SkeletonFailure | null {
  // Only geometry the skeleton drew is judged: an FMG road's course outside the
  // wall (its bridges, fords and landings) is an input, already certified by FMG.
  const drawn = (roadId: number, p: Point) =>
    !inputs.roads[roadId]?.fixed || (!!wall && pointInPolygon(p, wall.polygon));
  const problems: string[] = [];
  for (const bridge of bridges)
    if (drawn(bridge.roadId, bridge.point) && bridge.skewDegrees > inputs.bridgeSkewLimit)
      problems.push(`road ${bridge.roadId}: ${bridge.skewDegrees.toFixed(1)}° > ${inputs.bridgeSkewLimit}°`);
  for (const route of routes)
    for (const river of inputs.rivers)
      for (const p of route.path.slice(1, -1))
        if (drawn(route.id, p) && distanceToPolyline(p, river.centerline) < river.halfWidth)
          problems.push(`road ${route.id} bends over river ${river.index}`);
  return problems.length
    ? { reason: "bridge-skew", message: "A bridge exceeds the skew limit or bends over the river.", details: problems }
    : null;
}

interface Raster {
  index: (p: Point) => number;
  reached: (start: number[], inside: boolean) => Set<number>;
}

/** Dry cells at half-block spacing, split into inside / outside the wall; walls and hard water block. */
function raster(inputs: SkeletonInputs, wall: SkeletonWall | null): Raster {
  const step = inputs.cellSize / 2;
  const n = Math.max(2, Math.ceil((inputs.half * 2) / step));
  const centre = (i: number, j: number): Point => [-inputs.half + (i + 0.5) * step, -inputs.half + (j + 0.5) * step];
  const dry = new Uint8Array(n * n);
  const inside = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const p = centre(i, j);
      dry[j * n + i] = inputs.water.some(area => pointInPolygon(p, area.polygon)) ? 0 : 1;
      inside[j * n + i] = wall && pointInPolygon(p, wall.polygon) ? 1 : 0;
    }
  const index = (p: Point) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor((p[0] + inputs.half) / step)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((p[1] + inputs.half) / step)));
    return j * n + i;
  };
  const reached = (start: number[], wantInside: boolean) => {
    const seen = new Set<number>();
    const queue = start.filter(c => dry[c] && inside[c] === (wantInside ? 1 : 0));
    for (const c of queue) seen.add(c);
    while (queue.length) {
      const c = queue.pop()!;
      const i = c % n;
      const j = (c - i) / n;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const k = nj * n + ni;
        if (seen.has(k) || !dry[k] || inside[k] !== (wantInside ? 1 : 0)) continue;
        seen.add(k);
        queue.push(k);
      }
    }
    return seen;
  };
  return { index, reached };
}

function borderCells(inputs: SkeletonInputs, r: Raster): number[] {
  const cells: number[] = [];
  const step = inputs.cellSize / 2;
  for (let s = -inputs.half + step / 2; s < inputs.half; s += step)
    for (const p of [
      [s, -inputs.half + step / 2],
      [s, inputs.half - step / 2],
      [-inputs.half + step / 2, s],
      [inputs.half - step / 2, s]
    ] as Point[])
      cells.push(r.index(p));
  return cells;
}

function checkGates({ inputs, core, wall, gates }: SkeletonCheckInput): SkeletonFailure | null {
  if (!wall || !gates.length) return null;
  const r = raster(inputs, wall);
  const inner = r.reached([r.index(core.core)], true);
  const outer = r.reached(borderCells(inputs, r), false);
  const probe = (gate: SkeletonGate, sign: number) =>
    [1, 2].map(k => r.index(add(gate.point, gate.outward, sign * k * (inputs.cellSize / 2))));
  const blockedIn: string[] = [];
  const blockedOut: string[] = [];
  gates.forEach((gate, i) => {
    if (!probe(gate, -1).some(c => inner.has(c))) blockedIn.push(`gate ${i} cannot reach the centre inside the wall`);
    const outside = probe(gate, 1);
    const inRiver = inputs.rivers.some(
      river =>
        distanceToPolyline(add(gate.point, gate.outward, inputs.cellSize / 2), river.centerline) < river.halfWidth
    );
    if (inRiver || !outside.some(c => outer.has(c))) blockedOut.push(`gate ${i} has no dry way out of the town`);
  });
  if (blockedIn.length)
    return { reason: "gate-unreachable-inside", message: "A gate is cut off inside the wall.", details: blockedIn };
  if (blockedOut.length)
    return {
      reason: "gate-unreachable-outside",
      message: "A gate opens onto water or a cut-off strip.",
      details: blockedOut
    };
  return null;
}

function checkExternalRoads({ inputs, wall, routes }: SkeletonCheckInput): SkeletonFailure | null {
  const external = routes.filter(
    route => !route.dropped && route.reachesFrame && (!wall || route.gateIndex !== null)
  ).length;
  return external < inputs.requiredExternalRoads
    ? {
        reason: "too-few-external-roads",
        message: `${external} external road(s); at least ${inputs.requiredExternalRoads} required.`
      }
    : null;
}

/** First failing check in a fixed order, or null when the skeleton is usable. */
export function checkSkeleton(input: SkeletonCheckInput): SkeletonFailure | null {
  return (
    checkWallShape(input) ??
    checkWallRivers(input) ??
    checkBridges(input) ??
    checkGates(input) ??
    checkExternalRoads(input)
  );
}
