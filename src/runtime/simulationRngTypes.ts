/** Persistable simulation PRNG algorithm. Bump when the stream semantics change. */
export const SIMULATION_RNG_ALGORITHM = "alea-0.9" as const;

export type SimulationRngAlgorithm = typeof SIMULATION_RNG_ALGORITHM;

/** Alea internal tuple: s0, s1, s2, c. */
export type SimulationRngEngineState = readonly [number, number, number, number];

/**
 * Canonical simulation RNG snapshot. Stored on `SimulationContext.rng` and in
 * `.fmg` archives so save/load continues the same random stream mid-session.
 *
 * This is intentionally a single shared stream for the compatibility period.
 * Per-system derived streams remain a later target (see unite-data-and-map §6.3).
 */
export interface SimulationRngState {
  readonly algorithm: SimulationRngAlgorithm;
  /** Seed that initialized the stream (usually the map seed). */
  readonly seed: string;
  readonly state: SimulationRngEngineState;
}
