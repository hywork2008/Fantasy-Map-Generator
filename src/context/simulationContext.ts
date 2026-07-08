export interface IntelligenceReport {
  estimatedMilitaryPower: number;
  estimatedWealth: number;
  lastUpdatedYear: number;
  accuracyLevel: "accurate" | "overestimated" | "underestimated" | "unknown";
  hiddenBySpymaster: boolean;
  spymasterId?: number;
  rulerId?: number;
}

export interface StrategicGoal {
  targetBurg: number;
  targetState: number;
  type: "siege" | "raid";
  tension: number;
  expectedCasualties: "low" | "moderate" | "high_cornered";
  justification: string;
}

export interface SimulationContext {
  /** In-world calendar year, advanced by src/generators/timeEngine.ts's advanceTime(). */
  currentYear: number;
  /** In-world calendar month (1-12). */
  currentMonth: number;
  /** In-world calendar day (1-30). */
  currentDay: number;
  /** In-world era name, mirrors worldContext.options.era. */
  era: string;
  /** Number of times advanceTime() has run since the current map was generated. */
  tickCount: number;
  /** Espionage reports: intelligence[observerStateId][targetStateId] */
  intelligence: Record<number, Record<number, IntelligenceReport>>;
  /** Strategic goals: strategicGoals[stateId] */
  strategicGoals: Record<number, StrategicGoal[]>;
}

/**
 * Live, tick-driven simulation clock — distinct from WorldContext because these
 * values mutate repeatedly during a session rather than being static generation output.
 * Initialized by timeEngine.ts's initSimulationClock() once per map generation.
 */
export const simulationContext: SimulationContext = {
  currentYear: 0,
  currentMonth: 1,
  currentDay: 1,
  era: "",
  tickCount: 0,
  intelligence: {},
  strategicGoals: {}
};
