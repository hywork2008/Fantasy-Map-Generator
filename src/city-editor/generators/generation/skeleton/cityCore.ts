// K2 — city core and built-up area as a star polygon limited by hard water.

import type { Point } from "../../../types/geometry";
import { pointInPolygon, polygonArea } from "../../geom";
import { MIN_SETTLEMENT_AREA_SHARE } from "../../settlementExtent";
import type { SkeletonCore, SkeletonFailure, SkeletonInputs } from "./contracts";
import { bandRing, distanceToPolyline, rayRingHit } from "./vector";

export const SKELETON_RAYS = 180;

/** Clearance kept between the skeleton and hard water, metres. */
export function waterClearance(inputs: Pick<SkeletonInputs, "cellSize" | "wallWidth">): number {
  return Math.max(inputs.wallWidth, inputs.cellSize * 0.5);
}

/** Distance from `origin` along `dir` to hard water or the town window, whichever is nearer. */
export function dryReach(inputs: SkeletonInputs, origin: Point, dir: Point, edges: readonly Point[][] = []): number {
  let reach = Number.POSITIVE_INFINITY;
  for (const area of inputs.water) reach = Math.min(reach, rayRingHit(origin, dir, area.polygon));
  for (const band of edges) reach = Math.min(reach, rayRingHit(origin, dir, band));
  const townWindow: Point[] = [
    [inputs.half, inputs.half],
    [-inputs.half, inputs.half],
    [-inputs.half, -inputs.half],
    [inputs.half, -inputs.half]
  ];
  return Math.min(reach, rayRingHit(origin, dir, townWindow));
}

export function rayDirection(index: number, count = SKELETON_RAYS): Point {
  const angle = (index / count) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * The nearest point to `inputs.core` that is dry and at least one block from
 * hard water. Synthetic coasts can put the nominal centre a few metres offshore.
 */
export function dryCore(inputs: SkeletonInputs): Point | null {
  const wet = (p: Point) => inputs.water.some(area => pointInPolygon(p, area.polygon));
  const clear = (p: Point) =>
    !wet(p) &&
    Array.from({ length: 16 }, (_, i) => rayDirection(i, 16)).every(d => dryReach(inputs, p, d) >= inputs.cellSize);
  if (clear(inputs.core)) return inputs.core;
  const step = inputs.cellSize / 4;
  for (let r = step; r <= inputs.cityRadius; r += step)
    for (let i = 0; i < 72; i++) {
      const d = rayDirection(i, 72);
      const p: Point = [inputs.core[0] + d[0] * r, inputs.core[1] + d[1] * r];
      if (clear(p)) return p;
    }
  return null;
}

/** Rivers whose course stays more than half the city radius from `core`. */
export function edgeRiversAround(inputs: SkeletonInputs, core: Point): SkeletonCore["edgeRivers"] {
  return inputs.rivers
    .filter(river => distanceToPolyline(core, river.centerline) >= inputs.cityRadius / 2)
    .map(river => ({ index: river.index, band: bandRing(river.centerline, river.halfWidth) }));
}

function starAround(inputs: SkeletonInputs, core: Point): SkeletonCore {
  const clearance = waterClearance(inputs);
  const urbanRadius = inputs.cityRadius;
  const edgeRivers = edgeRiversAround(inputs, core);
  const bands = edgeRivers.map(river => river.band);
  const rays = Array.from({ length: SKELETON_RAYS }, (_, i) =>
    Math.max(0, Math.min(urbanRadius, dryReach(inputs, core, rayDirection(i), bands) - clearance))
  );
  const urban = rays.map((r, i) => {
    const d = rayDirection(i);
    return [core[0] + d[0] * r, core[1] + d[1] * r] as Point;
  });
  return { core, urbanRadius, rays, urban, urbanArea: Math.abs(polygonArea(urban)), edgeRivers };
}

export function planSkeletonCore(inputs: SkeletonInputs): SkeletonCore | SkeletonFailure {
  const core = dryCore(inputs);
  if (!core) return { reason: "core-in-water", message: "No dry town centre within the city radius." };
  const floor = MIN_SETTLEMENT_AREA_SHARE * Math.PI * inputs.cityRadius * inputs.cityRadius;
  let best = starAround(inputs, core);
  if (best.urbanArea < floor) {
    // A centre on the tip of a headland: move it inland, nearest first, until
    // enough dry land surrounds it (mesh-first grows its flood fill the same way).
    const wet = (p: Point) => inputs.water.some(area => pointInPolygon(p, area.polygon));
    const step = inputs.cellSize / 2;
    search: for (let r = step; r <= inputs.cityRadius; r += step)
      for (let i = 0; i < 36; i++) {
        const d = rayDirection(i, 36);
        const p: Point = [core[0] + d[0] * r, core[1] + d[1] * r];
        if (wet(p)) continue;
        const star = starAround(inputs, p);
        if (star.urbanArea > best.urbanArea) best = star;
        if (best.urbanArea >= floor) break search;
      }
  }
  if (best.urbanArea < floor)
    return {
      reason: "urban-area-too-small",
      message: `Dry built-up area ${Math.round(best.urbanArea)} m² is below ${Math.round(floor)} m².`
    };
  return best;
}
