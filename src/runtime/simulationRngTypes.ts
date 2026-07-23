/** Persistable simulation PRNG algorithm. Bump when the stream semantics change. */
export const SIMULATION_RNG_ALGORITHM = "alea-0.9" as const;

export type SimulationRngAlgorithm = typeof SIMULATION_RNG_ALGORITHM;

/** Alea internal tuple: s0, s1, s2, c. */
export type SimulationRngEngineState = readonly [number, number, number, number];

/**
 * Canonical simulation RNG snapshot. Stored on `SimulationContext.rng` and in
 * `.fmg` archives so save/load continues mid-session.
 *
 * - `state` is the shared root stream used by non-system callers via
 *   `appServices.rng` when no system is running.
 * - `streams` holds the ending engine state of each simulation system after its
 *   last completed run. Per-step draws are derived from
 *   `(seed, systemId, tick, calendar)` so one system's extra consumption cannot
 *   perturb another (unite-data-and-map §6.3 / P2-6).
 */
export interface SimulationRngState {
  readonly algorithm: SimulationRngAlgorithm;
  /** Seed that initialized the root stream (usually the map seed). */
  readonly seed: string;
  /** Root / shared Alea engine state. */
  readonly state: SimulationRngEngineState;
  /**
   * Ending engine state per system id after that system's last successful run.
   * Keys are stable `SimulationSystem.id` values. Absent on older archives —
   * load normalizes to `{}`.
   */
  streams: Record<string, SimulationRngEngineState>;
}
