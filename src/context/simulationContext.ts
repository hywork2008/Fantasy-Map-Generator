export interface SimulationContext {
  /** In-world calendar year, advanced by src/generators/timeEngine.ts's advanceTime(). */
  currentYear: number;
  /** In-world era name, mirrors worldContext.options.era. */
  era: string;
  /** Number of times advanceTime() has run since the current map was generated. */
  tickCount: number;
}

/**
 * Live, tick-driven simulation clock — distinct from WorldContext because these
 * values mutate repeatedly during a session rather than being static generation output.
 * Initialized by timeEngine.ts's initSimulationClock() once per map generation.
 */
export const simulationContext: SimulationContext = {
  currentYear: 0,
  era: "",
  tickCount: 0
};
