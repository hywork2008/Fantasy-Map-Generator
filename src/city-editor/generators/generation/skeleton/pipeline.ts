// Skeleton-first K1–K5: build the vector skeleton, retrying the wall until it passes K5.

import type { GenerationSettings } from "../../../types/generation";
import { makeRng } from "../../prng";
import { checkSkeleton } from "./checkSkeleton";
import { planSkeletonCore } from "./cityCore";
import type { Skeleton, SkeletonFailure, SkeletonInputs } from "./contracts";
import { planSkeletonCrossings } from "./crossings";
import { planSkeletonWall, resolveWallShape } from "./wallShapes";

/** Skeleton draws before the request is rejected (§4.5; provisional, see §8.3). */
export const SKELETON_ATTEMPTS = 16;

export interface SkeletonPlanResult {
  skeleton: Skeleton | null;
  /** Rejected draws in order, one per attempt. */
  failures: (SkeletonFailure & { attempt: number; shape?: string })[];
  /** Diagnostics only: the last rejected draw, when there was one. */
  rejected?: Skeleton;
}

/** Deterministic for (inputs, settings, seed); each draw has its own RNG stream. */
export function planSkeleton(
  inputs: SkeletonInputs,
  settings: Pick<GenerationSettings, "wallShape" | "wallSides">,
  seed: string
): SkeletonPlanResult {
  const core = planSkeletonCore(inputs);
  if ("reason" in core) return { skeleton: null, failures: [{ ...core, attempt: 0 }] };
  const failures: SkeletonPlanResult["failures"] = [];
  let rejected: Skeleton | undefined;
  for (let attempt = 0; attempt < SKELETON_ATTEMPTS; attempt++) {
    const rng = makeRng(`${seed}:skeleton:${attempt}:wall`);
    const shape = resolveWallShape(settings.wallShape, rng, inputs.bastionEra);
    const sides = settings.wallSides ?? 5 + Math.floor(rng() * 4);
    const wall = inputs.walls ? planSkeletonWall(inputs, core, shape, sides, rng) : null;
    const { routes, gates, bridges } = planSkeletonCrossings(inputs, core.core, wall);
    const failure = checkSkeleton({ inputs, core, wall, routes, gates, bridges });
    if (!failure) return { skeleton: { attempt, core, wall, routes, gates, bridges }, failures };
    failures.push({ ...failure, attempt, ...(wall ? { shape } : {}) });
    rejected = { attempt, core, wall, routes, gates, bridges };
  }
  return { skeleton: null, failures, rejected };
}
