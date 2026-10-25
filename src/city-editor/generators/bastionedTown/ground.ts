// Defense heights follow the same ground the cells will use. A flat site keeps the old zero datum.
import type { Point } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { elevationSampler } from "../elevationPreset";
import type { SkeletonInputs } from "../generation/skeleton/contracts";
import { dist } from "../generation/skeleton/vector";

/** A defender cannot keep a continuous walk steeper than this. */
export const MAX_RAMPART_GRADE = 0.15;
/** One wet-ditch water level is only honest when the banks stay inside this band. */
export const WET_DITCH_LEVEL_RANGE = 0.5;

export function fortressGround(
  settings: GenerationSettings,
  seed: string,
  inputs: SkeletonInputs,
  extentMeters: number
): (point: Point) => number {
  const sample = elevationSampler(
    {
      elevationPreset: settings.elevationPreset,
      elevationRelief: settings.elevationRelief,
      elevationSeed: seed,
      rivers: inputs.rivers.map(river => ({ resolvedEdgePoints: river.centerline })),
      waterPolygon: inputs.water[0]?.polygon ?? null
    },
    { extentMeters }
  );
  return point => sample(point, 0, 1);
}

export function groundVaries(points: Point[], ground: (point: Point) => number): boolean {
  if (!points.length) return false;
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const height = ground(point);
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  return high - low > 0.05;
}

export function gradeTooSteep(edges: Array<[Point, Point]>, ground: (point: Point) => number): boolean {
  return edges.some(([a, b]) => {
    const run = dist(a, b);
    return run > 0.5 && Math.abs(ground(a) - ground(b)) / run > MAX_RAMPART_GRADE;
  });
}

export function profile(
  count: number,
  crest: number,
  points: Point[],
  ground: (point: Point) => number,
  vary: boolean
): { base: number[]; crest: number[] } {
  if (!vary) return { base: Array.from({ length: count }, () => 0), crest: Array.from({ length: count }, () => crest) };
  const base = Array.from({ length: count }, (_, index) => ground(points[index] ?? points[0]));
  return { base, crest: base.map(height => height + crest) };
}
