import type { BurgDemographics } from "../types/models";
import type { Season } from "../utils/seasonUtils";

/**
 * Cell-indexed values whose current value is advanced or depleted by simulation.
 *
 * `pack.cells` still exposes these columns through a compatibility adapter while
 * legacy generators are migrated. The arrays themselves are owned here, so
 * map snapshots no longer need to persist a second copy of dynamic cell data.
 */
export interface SimulationCellColumns {
  population: Float32Array;
  carryingCapacity: Float32Array;
  children: Float32Array;
  maleAdults: Float32Array;
  femaleAdults: Float32Array;
  elders: Float32Array;
  danger: Uint8Array;
}

/** Values that evolve for a settlement after its map definition is generated. */
export interface BurgSimulationState {
  population?: number;
  product?: number;
  treasury?: number;
  demographics?: BurgDemographics;
}

/** Live burg values keyed by stable `burg.i`; never keyed by array position. */
export type BurgSimulationStates = Record<number, BurgSimulationState>;

/**
 * Host-owned containers for built-in and dynamic extension runtime state.
 *
 * An extension slice is opaque to the host until its registered validator has
 * narrowed it. Legacy pack-field access is projected from these slices only
 * during the Phase 8 compatibility period.
 */
export type ExtensionStateSlices = Record<string, Record<string, unknown>>;

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
  requiredAttackForce: number;
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
  /**
   * Display-only meteorological season at the map's reference (central) latitude, recomputed
   * on every advanceTime() call by src/generators/timeEngine.ts. A map can span both
   * hemispheres, so per-cell/per-market seasonal logic must call
   * src/utils/seasonUtils.ts's getSeason(latitude, month) itself rather than read this field.
   */
  worldSeason: Season;
  /** Dynamic cell columns. `SimulationData.cells` owns these values. */
  cells: SimulationCellColumns;
  /** Dynamic settlement values, keyed by stable burg id. */
  burgs: BurgSimulationStates;
  /** Namespaced runtime state owned by extensions, never by `pack`. */
  extensions: ExtensionStateSlices;
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
  worldSeason: "spring",
  cells: {
    population: new Float32Array(),
    carryingCapacity: new Float32Array(),
    children: new Float32Array(),
    maleAdults: new Float32Array(),
    femaleAdults: new Float32Array(),
    elders: new Float32Array(),
    danger: new Uint8Array()
  },
  burgs: {},
  extensions: {},
  intelligence: {},
  strategicGoals: {}
};
