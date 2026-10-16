import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { runWithSystemRng } from "../runtime/simulationRng";

/**
 * Track R (docs/plan/simulation-core-separation.md §13): simulation code that still calls
 * `Math.random` (directly or through rand/P/ra/gauss) must draw from the persisted simulation
 * RNG, never from whatever state the page's last map generation left in the global.
 */

/** Routes `Math.random` to `appServices.rng` (the root stream, or a system stream inside one). */
export function withSimulationAmbientRandom<T>(fn: () => T): T {
  const ambient = Math.random;
  Math.random = () => appServices.rng.rand();
  try {
    return fn();
  } finally {
    Math.random = ambient;
  }
}

/**
 * Runs simulation work that happens outside a registered system's `run()` — e.g. the economy's
 * coalesced monthly settlement microtask — on its own stream derived from `simulation.rng.seed`,
 * `streamId` and the current clock, so its draws are reproducible and independent of other work.
 */
export function runWithSimulationRandom<T>(streamId: string, fn: () => T): T {
  return withSimulationAmbientRandom(() =>
    runWithSystemRng(
      simulationContext,
      {
        systemId: streamId,
        tick: simulationContext.tickCount,
        year: simulationContext.currentYear,
        month: simulationContext.currentMonth,
        day: simulationContext.currentDay
      },
      appServices,
      () => fn()
    )
  );
}
