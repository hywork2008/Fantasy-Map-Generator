// K4 — gates, bridges and water gates as exact line crossings (§4.4).
// Bridge thresholds come only from src/utils/bridgeSkewPolicy.ts.

import { BRIDGE_SKEW_PREFERRED_DEGREES, bridgeSkewDegrees } from "../../../../utils/bridgeSkewPolicy";
import type { Point } from "../../../types/geometry";
import { nearestOnPolyline, pointInPolygon } from "../../geom";
import { waterClearance } from "./cityCore";
import type { SkeletonBridge, SkeletonGate, SkeletonInputs, SkeletonRoute, SkeletonWall } from "./contracts";
import {
  add,
  dist,
  distanceToPolyline,
  exitSquare,
  lineAngleDegrees,
  polylineCrossings,
  rayRingHit,
  sub,
  tangentAt
} from "./vector";
import { outwardNormal } from "./wallShapes";

/** A gate road meets the wall within this angle of the wall normal ("almost square"). */
export const GATE_MAX_SKEW_DEGREES = 30;

const closed = (ring: Point[]): Point[] => [...ring, ring[0]];

/**
 * Replace the run of `path` around the crossing on segment `index` by one
 * straight leg along `axis`, `reach` either side of `point`. Vertices within
 * 1.5·reach of the crossing, or rejected by `keep`, are dropped.
 */
function straightLeg(
  path: Point[],
  index: number,
  point: Point,
  axis: Point,
  reach: number,
  keep: (p: Point) => boolean
): Point[] {
  const ok = (p: Point) => keep(p) && dist(p, point) >= reach * 1.5;
  const head = path.slice(0, index + 1);
  const tail = path.slice(index + 1);
  while (head.length > 1 && !ok(head[head.length - 1])) head.pop();
  while (tail.length > 1 && !ok(tail[0])) tail.shift();
  const back = head[head.length - 1];
  const dir = (back[0] - point[0]) * axis[0] + (back[1] - point[1]) * axis[1] > 0 ? 1 : -1;
  return [...head, add(point, axis, dir * reach), add(point, axis, -dir * reach), ...tail];
}

/** Walk `distance` metres along a closed ring from `point` on edge `edge` (negative = backwards). */
function walkRing(ring: Point[], edge: number, point: Point, distance: number): { point: Point; edge: number } {
  const n = ring.length;
  let e = edge;
  let p = point;
  let left = Math.abs(distance);
  const forward = distance >= 0;
  for (let guard = 0; guard < n * 2 && left > 1e-9; guard++) {
    const end = forward ? ring[(e + 1) % n] : ring[e];
    const run = dist(p, end);
    if (run >= left) return { point: add(p, sub(end, p), left / (run || 1)), edge: e };
    left -= run;
    p = end;
    e = forward ? (e + 1) % n : (e - 1 + n) % n;
  }
  return { point: p, edge: e };
}

/** A dry straight run from `start` to the town window edge, turning at most 75° off `dir`. */
function dryRunToEdge(inputs: SkeletonInputs, start: Point, dir: Point): Point | null {
  if (inputs.water.some(area => pointInPolygon(start, area.polygon))) return null;
  for (const degrees of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75]) {
    const a = (degrees * Math.PI) / 180;
    const d: Point = [dir[0] * Math.cos(a) - dir[1] * Math.sin(a), dir[0] * Math.sin(a) + dir[1] * Math.cos(a)];
    const edge = exitSquare(start, d, inputs.half);
    const water = inputs.water.reduce(
      (m, area) => Math.min(m, rayRingHit(start, d, area.polygon)),
      Number.POSITIVE_INFINITY
    );
    if (water > dist(start, edge)) return edge;
  }
  return null;
}

function gateAt(
  inputs: SkeletonInputs,
  core: Point,
  wall: SkeletonWall,
  route: SkeletonRoute,
  fixed: boolean,
  gates: SkeletonGate[]
): void {
  const ring = wall.polygon;
  const hit = polylineCrossings(route.path, closed(ring))[0];
  if (!hit) return;
  const step = inputs.cellSize;
  const clearance = waterClearance(inputs);
  const wet = (p: Point) => inputs.water.some(area => pointInPolygon(p, area.polygon));
  const usable = (p: Point, edge: number) => {
    const out = outwardNormal(ring, edge);
    return (
      inputs.rivers.every(r => distanceToPolyline(p, r.centerline) >= r.halfWidth + clearance + step / 2) &&
      wall.waterGates.every(g => dist(g.point, p) >= inputs.minGateSpacing) &&
      !wet(add(p, out, step)) &&
      !wet(add(p, out, -step))
    );
  };
  const shared = gates.findIndex(g => dist(g.point, hit.point) < inputs.minGateSpacing);
  let site = { point: hit.point, edge: hit.bIndex };
  if (shared < 0 && !fixed && wall.curtainMidpoints?.length) {
    // A bastioned trace takes its gates mid-curtain, covered by the flanks either side.
    const curtain = wall.curtainMidpoints
      .map(point => ({ point, edge: nearestOnPolyline(point, closed(ring)).segIndex }))
      .filter(c => usable(c.point, c.edge) && gates.every(g => dist(g.point, c.point) >= inputs.minGateSpacing))
      .sort((x, y) => dist(x.point, hit.point) - dist(y.point, hit.point))[0];
    if (curtain) site = curtain;
  }
  if (shared < 0 && !fixed && !usable(site.point, site.edge)) {
    // Slide a synthetic road's gate along the curtain, away from rivers and the shore.
    const perimeter = ring.reduce((sum, p, i) => sum + dist(p, ring[(i + 1) % ring.length]), 0);
    for (let offset = step / 4; offset < perimeter / 4; offset += step / 4) {
      const found = [offset, -offset]
        .map(d => walkRing(ring, hit.bIndex, hit.point, d))
        .find(c => usable(c.point, c.edge) && gates.every(g => dist(g.point, c.point) >= inputs.minGateSpacing));
      if (found) {
        site = found;
        break;
      }
    }
    if (!usable(site.point, site.edge)) {
      route.dropped = true;
      route.reachesFrame = false;
      route.path = [core];
      return;
    }
  }
  const gatePoint = shared >= 0 ? gates[shared].point : site.point;
  const gateOutward = shared >= 0 ? gates[shared].outward : outwardNormal(ring, site.edge);
  const moved = shared >= 0 || dist(gatePoint, hit.point) > 1e-6;
  const awayFromGate = (p: Point) => dist(p, gatePoint) > step * 1.5;
  const skew = lineAngleDegrees(tangentAt(route.path, hit.aIndex), gateOutward);
  // Inside the town the street runs straight from the core and enters the gate square.
  const start = core;
  const innerPath = awayFromGate(start) ? [start, add(gatePoint, gateOutward, -step), gatePoint] : [start, gatePoint];
  let outer = route.path.slice(hit.aIndex + 1);
  // Outside, an FMG course is an input; a synthetic road leaves the gate square.
  if (!fixed && (skew > GATE_MAX_SKEW_DEGREES || moved))
    outer = [add(gatePoint, gateOutward, step), ...outer.filter(awayFromGate)];
  if (!fixed && !route.reachesFrame) {
    // A synthetic course that runs into the sea is re-aimed from the gate over dry land.
    const from = add(gatePoint, gateOutward, step);
    const edge = dryRunToEdge(inputs, from, gateOutward);
    if (edge) {
      outer = [from, edge];
      route.reachesFrame = true;
    }
  }
  route.path = [...innerPath, ...outer];
  if (shared >= 0) {
    gates[shared].roadIds.push(route.id);
    route.gateIndex = shared;
  } else {
    gates.push({ point: gatePoint, edge: site.edge, outward: gateOutward, roadIds: [route.id] });
    route.gateIndex = gates.length - 1;
  }
}

/** Point and unit tangent `offset` metres along `line` from segment `index` at fraction `t`. */
function alongLine(
  line: Point[],
  index: number,
  point: Point,
  offset: number,
  clamp = false
): { point: Point; index: number } | null {
  let i = index;
  let p = point;
  let left = Math.abs(offset);
  const forward = offset >= 0;
  while (left > 1e-9) {
    const end = forward ? line[i + 1] : line[i];
    if (!end) return null;
    const run = dist(p, end);
    if (run >= left) return { point: add(p, sub(end, p), left / (run || 1)), index: i };
    left -= run;
    p = end;
    i += forward ? 1 : -1;
    if (i < 0 || i >= line.length - 1)
      return clamp ? { point: p, index: Math.max(0, Math.min(i, line.length - 2)) } : null;
  }
  return { point: p, index: i };
}

/** Mean unit tangent of `line` over ±`reach` metres around a point (shortened at the line ends). */
function chordTangent(line: Point[], at: { point: Point; index: number }, reach: number): Point | null {
  const back = alongLine(line, at.index, at.point, -reach, true);
  const ahead = alongLine(line, at.index, at.point, reach, true);
  if (!back || !ahead) return null;
  const axis = sub(ahead.point, back.point);
  const length = Math.hypot(axis[0], axis[1]);
  return length > 1e-9 ? [axis[0] / length, axis[1] / length] : null;
}

/** Skew of a straight leg across the river, measured where it really crosses; null unless it crosses once. */
function legSkew(line: Point[], point: Point, axis: Point, reach: number): number | null {
  const leg = [add(point, axis, -reach), add(point, axis, reach)];
  const hits = polylineCrossings(leg, line);
  if (hits.length !== 1) return null;
  return bridgeSkewDegrees(axis, tangentAt(line, hits[0].bIndex));
}

function straightenBridges(inputs: SkeletonInputs, route: SkeletonRoute, mutable: (p: Point) => boolean): void {
  const done: Point[] = [];
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    for (const river of inputs.rivers) {
      const hit = polylineCrossings(route.path, river.centerline).find(
        h => !done.some(p => dist(p, h.point) < 1) && mutable(h.point)
      );
      if (!hit) continue;
      const skew = bridgeSkewDegrees(tangentAt(route.path, hit.aIndex), tangentAt(river.centerline, hit.bIndex));
      if (skew <= BRIDGE_SKEW_PREFERRED_DEGREES) {
        done.push(hit.point);
        continue;
      }
      const reach = river.halfWidth + inputs.cellSize * 0.5;
      // Candidate sites within three blocks along the river; keep the one whose leg
      // really crosses squarest, preferring the original crossing on ties.
      let site: { point: Point; tangent: Point; skew: number; offset: number } | null = null;
      for (let offset = 0; offset <= inputs.cellSize * 3; offset += inputs.cellSize / 4)
        for (const d of offset ? [offset, -offset] : [0]) {
          const at = alongLine(river.centerline, hit.bIndex, hit.point, d);
          const tangent = at && chordTangent(river.centerline, at, reach);
          if (!at || !tangent || !mutable(at.point)) continue;
          const axis: Point = [-tangent[1], tangent[0]];
          const legSkewDegrees = legSkew(river.centerline, at.point, axis, reach);
          if (legSkewDegrees === null) continue;
          // A bridge spans one river: keep the leg clear of every other (no bridge on a confluence).
          const leg = [add(at.point, axis, -reach), add(at.point, axis, reach)];
          const others = inputs.rivers.filter(other => other !== river);
          if (
            others.some(
              other =>
                polylineCrossings(leg, other.centerline).length > 0 ||
                leg.some(p => distanceToPolyline(p, other.centerline) < other.halfWidth)
            )
          )
            continue;
          if (!site || legSkewDegrees < site.skew - 1)
            site = { point: at.point, tangent, skew: legSkewDegrees, offset };
        }
      const point = site?.point ?? hit.point;
      const tangent = site?.tangent ?? tangentAt(river.centerline, hit.bIndex);
      done.push(point);
      route.path = straightLeg(
        route.path,
        hit.aIndex,
        point,
        [-tangent[1], tangent[0]],
        reach,
        p => distanceToPolyline(p, river.centerline) >= reach
      );
      changed = true;
      break;
    }
    if (!changed) break;
  }
}

export function bridgesOf(
  inputs: SkeletonInputs,
  routes: SkeletonRoute[],
  straightened: Set<string>
): SkeletonBridge[] {
  const bridges: SkeletonBridge[] = [];
  for (const route of routes)
    for (const river of inputs.rivers)
      for (const hit of polylineCrossings(route.path, river.centerline)) {
        const key = `${route.id}:${Math.round(hit.point[0])},${Math.round(hit.point[1])}`;
        // An FMG bridge was certified against the surveyed banks; the coarse course
        // centreline cannot judge it better.
        const certified = inputs.roads[route.id]?.fixed
          ? inputs.fixedBridges.find(b => dist(b.point, hit.point) <= river.halfWidth + inputs.cellSize / 2)
          : undefined;
        bridges.push({
          roadId: route.id,
          riverIndex: river.index,
          point: hit.point,
          skewDegrees:
            certified?.skewDegrees ??
            bridgeSkewDegrees(tangentAt(route.path, hit.aIndex), tangentAt(river.centerline, hit.bIndex)),
          straightened: straightened.has(key)
        });
      }
  return bridges;
}

export function planSkeletonCrossings(
  inputs: SkeletonInputs,
  core: Point,
  wall: SkeletonWall | null
): { routes: SkeletonRoute[]; gates: SkeletonGate[]; bridges: SkeletonBridge[] } {
  const gates: SkeletonGate[] = [];
  const routes: SkeletonRoute[] = inputs.roads.map(road => ({
    id: road.id,
    // Every road starts at the (possibly relocated) core.
    path: [...(dist(road.path[0], core) > 1 ? [core] : []), ...road.path.map(p => [p[0], p[1]] as Point)],
    gateIndex: null,
    reachesFrame: road.reachesFrame,
    dropped: false
  }));
  const before = new Map(routes.map(r => [r.id, r.path.map(p => `${p[0]},${p[1]}`).join(";")]));
  // Gates first: a bridge leg must not be undone by the gate approach.
  if (wall) for (const [i, route] of routes.entries()) gateAt(inputs, core, wall, route, inputs.roads[i].fixed, gates);
  routes.forEach((route, i) => {
    if (route.dropped) return;
    const fixed = inputs.roads[i].fixed;
    // An FMG road keeps its course outside the wall; town streets may always be squared.
    // The gate square itself (one block either side) is left to K5 to judge.
    const mutable = (p: Point) =>
      (!fixed || (!!wall && pointInPolygon(p, wall.polygon))) &&
      gates.every(gate => dist(gate.point, p) > inputs.cellSize);
    straightenBridges(inputs, route, mutable);
  });
  const straightened = new Set<string>();
  for (const route of routes) {
    if (before.get(route.id) === route.path.map(p => `${p[0]},${p[1]}`).join(";")) continue;
    for (const river of inputs.rivers)
      for (const hit of polylineCrossings(route.path, river.centerline))
        straightened.add(`${route.id}:${Math.round(hit.point[0])},${Math.round(hit.point[1])}`);
  }
  return { routes, gates, bridges: bridgesOf(inputs, routes, straightened) };
}
