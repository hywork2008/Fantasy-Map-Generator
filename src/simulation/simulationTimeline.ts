import type { SimulationContext } from "../context/simulationContext";
import { createSimulationRngState } from "../runtime/simulationRng";

/**
 * Timeline seed (docs/plan/simulation-core-separation.md §13.3).
 *
 * Every simulation draw derives from `simulation.rng.seed` (root stream + per-system streams), so a
 * saved world replays the same future when its RNG is kept. Loading picks one of:
 * - "new": a fresh random timeline seed, so the same map yields a different history each time
 *   (default for play; the seed is saved with the world, so that history can be replayed later);
 * - "continue": keep the saved RNG state (own save continuation, bug reproduction, tests);
 * - an explicit seed string: replay or share a specific history.
 */
export type SimulationTimelineMode = "new" | "continue";

export interface SimulationTimelineChoice {
  readonly mode: SimulationTimelineMode;
  /** Overrides `mode` when non-empty. */
  readonly seed?: string;
}

/** A timeline seed that keeps the map seed readable and never touches `Math.random`. */
export function createTimelineSeed(mapSeed: string): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return `${mapSeed}~${bytes[0].toString(36)}`;
}

/** Re-seeds the simulation RNG of a (staged) simulation slice; returns the seed in effect. */
export function applySimulationTimeline(
  simulation: SimulationContext,
  mapSeed: string,
  choice: SimulationTimelineChoice
): string {
  const seed = choice.seed?.trim() || (choice.mode === "new" ? createTimelineSeed(mapSeed) : "");
  if (!seed) return simulation.rng?.seed ?? mapSeed;
  simulation.rng = createSimulationRngState(seed);
  return seed;
}
