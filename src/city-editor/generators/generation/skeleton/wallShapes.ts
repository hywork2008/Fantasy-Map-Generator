// K3 — the town wall as a parametric ring around the core (§4.3).
//
// Every S1 family is star-shaped around the core, so a shape is scaled to the
// target area and then clamped ray by ray against hard water. Straight sides
// survive wherever the water does not reach them.

import type { WallShape, WallShapeChoice } from "../../../types/generation";
import type { Point } from "../../../types/geometry";
import { polygonArea, simplifyPolyline } from "../../geom";
import { dryReach, waterClearance } from "./cityCore";
import type { SkeletonCore, SkeletonInputs, SkeletonWall } from "./contracts";
import { add, densifyRing, distanceToPolyline, polylineCrossings, signedArea, sub, tangentAt, unit } from "./vector";

type Rng = () => number;

export const AUTO_WALL_SHAPES: readonly WallShape[] = ["organic", "round", "oval", "square", "polygon"];

export function resolveWallShape(choice: WallShapeChoice | undefined, rng: Rng): WallShape {
  if (choice && choice !== "auto") return choice;
  return AUTO_WALL_SHAPES[Math.floor(rng() * AUTO_WALL_SHAPES.length)];
}

const between = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();

function harmonicRing(
  rng: Rng,
  terms: number[],
  amplitude: [number, number],
  base: (theta: number) => number
): Point[] {
  const harmonics = terms.map(k => ({
    k,
    a: between(rng, ...amplitude) / Math.sqrt(k - 1),
    phase: rng() * Math.PI * 2
  }));
  return Array.from({ length: 120 }, (_, i) => {
    const theta = (i / 120) * Math.PI * 2;
    const r = base(theta) * (1 + harmonics.reduce((sum, h) => sum + h.a * Math.cos(h.k * theta + h.phase), 0));
    return [Math.cos(theta) * r, Math.sin(theta) * r] as Point;
  });
}

function regularPolygon(rng: Rng, sides: number): Point[] {
  const rotation = rng() * ((Math.PI * 2) / sides);
  return Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i / sides) * Math.PI * 2 + between(rng, -1, 1) * ((3 * Math.PI) / 180);
    const r = 1 + between(rng, -0.04, 0.04);
    return [Math.cos(angle) * r, Math.sin(angle) * r] as Point;
  });
}

/** Unit-scale ring (counter-clockwise, around the origin) for a wall shape. */
export function unitWallShape(shape: WallShape, rng: Rng, sides: number): Point[] {
  switch (shape) {
    case "round":
      return harmonicRing(rng, [2, 3, 4], [0.01, 0.035], () => 1);
    case "organic":
      return harmonicRing(rng, [2, 3, 4, 5], [0.03, 0.09], () => 1);
    case "oval": {
      const q = between(rng, 0.68, 0.85);
      const rotation = rng() * Math.PI;
      return harmonicRing(rng, [3, 4], [0.005, 0.015], theta => {
        const a = theta - rotation;
        return q / Math.sqrt(q * q * Math.cos(a) ** 2 + Math.sin(a) ** 2);
      });
    }
    case "square":
      return regularPolygon(rng, 4);
    case "polygon":
      return regularPolygon(rng, sides);
  }
}

/** Scale `unitRing` by `scale`, then pull each vertex in to stay clear of hard water. */
function placeRing(inputs: SkeletonInputs, core: SkeletonCore, unitRing: Point[], scale: number): Point[] {
  const clearance = waterClearance(inputs);
  const centre = core.core;
  const bands = core.edgeRivers.map(river => river.band);
  const scaled = unitRing.map(p => [centre[0] + p[0] * scale, centre[1] + p[1] * scale] as Point);
  const dense = densifyRing(scaled, inputs.cellSize / 2);
  const clamped = dense.map(p => {
    const offset = sub(p, centre);
    const r = Math.hypot(offset[0], offset[1]);
    if (r < 1e-9) return p;
    const dir: Point = [offset[0] / r, offset[1] / r];
    let reach = Math.min(r, Math.max(0, dryReach(inputs, centre, dir, bands) - clearance));
    // A ray that grazes a skirting river leaves less than the clearance across it: step in.
    const rivers = inputs.rivers.filter(river => core.edgeRivers.some(edge => edge.index === river.index));
    while (
      reach > 0 &&
      rivers.some(river => distanceToPolyline(add(centre, dir, reach), river.centerline) < river.halfWidth + clearance)
    )
      reach = Math.max(0, reach - 1);
    return add(centre, dir, reach);
  });
  return simplifyPolyline(clamped, 0.25, true);
}

/** Scale the shape until its clamped area meets `targetArea` (bisection; area grows with scale). */
export function fitRing(inputs: SkeletonInputs, core: SkeletonCore, unitRing: Point[], targetArea: number): Point[] {
  let lo = 0;
  let hi = inputs.half * 3;
  let best = placeRing(inputs, core, unitRing, hi);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const ring = placeRing(inputs, core, unitRing, mid);
    if (Math.abs(polygonArea(ring)) >= targetArea) {
      hi = mid;
      best = ring;
    } else lo = mid;
  }
  return best;
}

/**
 * Replace the wall near each river crossing with one straight segment along the
 * river normal, so the wall crosses at a right angle with clearance either side.
 * Crossings closer along the wall than their combined half spans (two mouths side
 * by side, a braid) share one segment.
 */
export function squareRiverCrossings(
  inputs: SkeletonInputs,
  ring: Point[]
): { ring: Point[]; waterGates: SkeletonWall["waterGates"] } {
  const clearance = waterClearance(inputs);
  type Crossing = {
    position: number;
    aIndex: number;
    point: Point;
    axis: Point;
    h: number;
    river: (typeof inputs.rivers)[number];
  };
  const crossings: Crossing[] = [];
  for (const river of inputs.rivers)
    for (const hit of polylineCrossings(ring, river.centerline, true)) {
      const t = tangentAt(river.centerline, hit.bIndex);
      let axis: Point = [-t[1], t[0]];
      const along = sub(ring[(hit.aIndex + 1) % ring.length], ring[hit.aIndex]);
      if (axis[0] * along[0] + axis[1] * along[1] < 0) axis = [-axis[0], -axis[1]];
      crossings.push({
        position: hit.aIndex + hit.aT,
        aIndex: hit.aIndex,
        point: hit.point,
        axis,
        h: river.halfWidth + clearance,
        river
      });
    }
  if (!crossings.length) return { ring, waterGates: [] };
  crossings.sort((x, y) => x.position - y.position);
  const groups: Crossing[][] = [];
  for (const crossing of crossings) {
    const last = groups[groups.length - 1]?.at(-1);
    if (last && Math.hypot(crossing.point[0] - last.point[0], crossing.point[1] - last.point[1]) < crossing.h + last.h)
      groups[groups.length - 1].push(crossing);
    else groups.push([crossing]);
  }
  // A group that wraps past the ring's start joins the first group.
  if (groups.length > 1) {
    const first = groups[0][0];
    const last = groups[groups.length - 1].at(-1)!;
    if (Math.hypot(first.point[0] - last.point[0], first.point[1] - last.point[1]) < first.h + last.h)
      groups[0].unshift(...groups.pop()!);
  }
  const removed = new Set<number>();
  const inserts = new Map<
    number,
    { position: number; a: Point; b: Point; members: Crossing[]; centre: Point; axis: Point }[]
  >();
  for (const members of groups) {
    const centre: Point = [
      members.reduce((sum, m) => sum + m.point[0], 0) / members.length,
      members.reduce((sum, m) => sum + m.point[1], 0) / members.length
    ];
    const axis = unit(members.reduce((sum, m) => add(sum, m.axis), [0, 0] as Point));
    const across: Point = [-axis[1], axis[0]];
    const half = Math.max(
      ...members.map(m => Math.abs((m.point[0] - centre[0]) * axis[0] + (m.point[1] - centre[1]) * axis[1]) + m.h)
    );
    const depth = 2 * Math.max(...members.map(m => m.h));
    // Drop every wall vertex in a box round the crossing (along the leg × along the river),
    // so no stretch of the old line survives between the new leg's ends.
    ring.forEach((v, i) => {
      const d = sub(v, centre);
      const onLeg = Math.abs(d[0] * axis[0] + d[1] * axis[1]);
      const off = Math.abs(d[0] * across[0] + d[1] * across[1]);
      if ((onLeg < half * 1.2 && off < depth) || members.some(m => distanceToPolyline(v, m.river.centerline) < m.h))
        removed.add(i);
    });
    const list = inserts.get(members[0].aIndex) ?? [];
    list.push({
      position: members[0].position,
      a: add(centre, axis, -half),
      b: add(centre, axis, half),
      members,
      centre,
      axis
    });
    inserts.set(members[0].aIndex, list);
  }
  const out: Point[] = [];
  const waterGates: SkeletonWall["waterGates"] = [];
  ring.forEach((v, i) => {
    if (!removed.has(i)) out.push(v);
    for (const insert of (inserts.get(i) ?? []).sort((x, y) => x.position - y.position)) {
      out.push(insert.a, insert.b);
      for (const m of insert.members) {
        const along =
          (m.point[0] - insert.centre[0]) * insert.axis[0] + (m.point[1] - insert.centre[1]) * insert.axis[1];
        waterGates.push({
          riverIndex: m.river.index,
          edge: out.length - 2,
          point: add(insert.centre, insert.axis, along),
          shared: insert.members.length
        });
      }
    }
  });
  return { ring: out, waterGates };
}

export function planSkeletonWall(
  inputs: SkeletonInputs,
  core: SkeletonCore,
  shape: WallShape,
  sides: number,
  rng: Rng
): SkeletonWall {
  const unitRing = unitWallShape(shape, rng, sides);
  let ring = fitRing(inputs, core, unitRing, core.urbanArea * inputs.walledAreaShare);
  if (signedArea(ring) < 0) ring = ring.reverse();
  const edge = new Set(core.edgeRivers.map(river => river.index));
  const squared = squareRiverCrossings(
    { ...inputs, rivers: inputs.rivers.filter(river => !edge.has(river.index)) },
    ring
  );
  return {
    shape,
    ...(shape === "polygon" || shape === "square" ? { sides: shape === "square" ? 4 : sides } : {}),
    polygon: squared.ring,
    waterGates: squared.waterGates
  };
}

/** Outward unit normal of ring edge `edge` for a counter-clockwise ring. */
export function outwardNormal(ring: Point[], edge: number): Point {
  const a = ring[edge];
  const b = ring[(edge + 1) % ring.length];
  const t = unit(sub(b, a));
  return [t[1], -t[0]];
}
