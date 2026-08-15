import type { TechnologySimulationState } from "../generators/technologyTypes";
import { createEmptyTechnologySimulationState } from "../generators/technologyTypes";
import type { SimulationRngState } from "../runtime/simulationRngTypes";
import type { BurgDemographics, MilitaryRegiment } from "../types/models";
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
  /** Standing forest coverage / timber stock, 0..pack.cells.forestCover. */
  forestStock: Float32Array;
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

/** Values that change as a political state advances through simulation time. */
export interface StateSimulationState {
  alert?: number;
  salesTax?: number;
  pollTax?: number;
  treasury?: number;
  tributeRate?: number;
  tributePaid?: number;
  manpowerReconciled?: boolean;
  supplyStrain?: number;
  foodStock?: number;
}

/** Live state values keyed by stable `state.i`; never keyed by array position. */
export type StateSimulationStates = Record<number, StateSimulationState>;

/** Live regiments keyed by owner state id; regiment id is unique within its roster. */
export type SimulationMilitaryRosters = Record<number, MilitaryRegiment[]>;

/** A frontier cell remains politically unclaimed until Phase 4 incorporation. */
export const FRONTIER_STAGE = {
  wilderness: 0,
  outpost: 1,
  settlement: 2,
  incorporated: 3
} as const;

export type FrontierStage = (typeof FRONTIER_STAGE)[keyof typeof FRONTIER_STAGE];

export const FRONTIER_INVESTMENTS = ["granary", "well", "road", "fort", "sanitation"] as const;
export type FrontierInvestment = (typeof FRONTIER_INVESTMENTS)[number];
export type FrontierPolicy = "balanced" | "expansion" | "defense" | "recovery";
export type FrontierDisaster = "drought" | "flood" | "epidemic" | "bandits";

/** State-owned works that improve both a frontier's daily viability and its resilience. */
export interface FrontierStateGovernance {
  policy: FrontierPolicy;
  investments: Record<FrontierInvestment, number>;
  lastEvaluatedYear: number | null;
  reliefSpent: number;
}

export interface FrontierProjectStatus {
  year: number;
  outcome: "maintained" | "paused" | "settled" | "abandoned";
  failureReasons: readonly string[];
  disaster?: FrontierDisaster;
  recoveryCost: number;
}

/** Sparse, project-specific state for an unclaimed outpost or settlement. */
export interface FrontierProject {
  readonly cellId: number;
  readonly stateId: number;
  /** Land projects require an administrative corridor; seaborne ones establish an overseas province and port. */
  origin?: "land" | "seaborne";
  /** Departure port for a seaborne expedition, retained for the operational ledger. */
  sourcePortCellId?: number;
  /** A discovered mineral site this project is deliberately advancing toward. */
  resourceClaimCellId?: number;
  stage: typeof FRONTIER_STAGE.outpost | typeof FRONTIER_STAGE.settlement;
  establishedYear: number;
  supportYears: number;
  failedSupportYears: number;
  /** Persisted explanation for the frontier panel and the next annual evaluation. */
  lastStatus?: FrontierProjectStatus;
}

export type FrontierResourceClaimStatus = "discovered" | "guardMarching" | "guarding" | "settling" | "secured";

/**
 * A survey result reserves strategic attention, never ownership. The ordinary
 * Frontier incorporation transaction remains the sole writer of cells.state.
 */
export interface FrontierResourceClaim {
  readonly cellId: number;
  readonly stateId: number;
  readonly commodity: string;
  readonly discoveredYear: number;
  status: FrontierResourceClaimStatus;
  /** State-local regiment id assigned to keep the unclaimed site under watch. */
  guardRegimentId?: number;
}

/**
 * Host-owned Phase 3 frontier runtime state. Cell stages are dense so renderers
 * and cell tools can read one canonical column; project metadata stays sparse.
 */
export interface FrontierSimulationState {
  cellStages: Uint8Array;
  projects: Record<number, FrontierProject>;
  /** The annual guard prevents daily simulation ticks from re-evaluating projects. */
  lastEvaluatedYear: number | null;
  /** Treasury captured at the prior calendar boundary, keyed by state id. */
  budgetByState: Record<number, number>;
  /** Earliest year in which a state may begin another project. */
  stateCooldownUntilYear: Record<number, number>;
  /** State policy, infrastructure and relief spending for Phase 5 frontier governance. */
  governanceByState: Record<number, FrontierStateGovernance>;
  /** Incorporated overseas harbour cells, retained as long-lived colonial frontiers. */
  seaborneBeachheadsByState: Record<number, number[]>;
  /** Discovered, unclaimed deposits that should pull the next frontier project toward them. */
  resourceClaimsByCell: Record<number, FrontierResourceClaim>;
  /**
   * Population points (male/female adults) displaced by any system (e.g. Economy's rural
   * labour release) and aggregated by destination state, awaiting a new frontier project.
   * `advanceFrontierExpansion` drains this before pulling any further colonists directly out
   * of live cells (docs/plan/megacity-food-import-economy.md §4.1 `frontierApplicantPool`).
   * Host-owned and extension-agnostic: any system may add to it via addFrontierApplicants().
   */
  applicantPoolByState: Record<number, { maleAdults: number; femaleAdults: number }>;
}

export function createEmptyFrontierSimulationState(cellCount = 0): FrontierSimulationState {
  return {
    cellStages: new Uint8Array(cellCount),
    projects: {},
    lastEvaluatedYear: null,
    budgetByState: {},
    stateCooldownUntilYear: {},
    governanceByState: {},
    seaborneBeachheadsByState: {},
    resourceClaimsByCell: {},
    applicantPoolByState: {}
  };
}

/** Records an extension-reported survey result without granting territory. */
export function recordFrontierResourceClaim(
  frontier: FrontierSimulationState,
  claim: Omit<FrontierResourceClaim, "status">
): boolean {
  const existing = frontier.resourceClaimsByCell[claim.cellId];
  if (existing) return false;
  frontier.resourceClaimsByCell[claim.cellId] = { ...claim, status: "discovered" };
  return true;
}

/** Adds displaced colonists to a state's frontier applicant pool. Host-owned, extension-agnostic. */
export function addFrontierApplicants(
  frontier: FrontierSimulationState,
  stateId: number,
  maleAdults: number,
  femaleAdults: number
): void {
  if (!stateId || (maleAdults <= 0 && femaleAdults <= 0)) return;
  const pool = frontier.applicantPoolByState[stateId] ?? { maleAdults: 0, femaleAdults: 0 };
  frontier.applicantPoolByState[stateId] = {
    maleAdults: pool.maleAdults + Math.max(0, maleAdults),
    femaleAdults: pool.femaleAdults + Math.max(0, femaleAdults)
  };
}

/**
 * Annual hunt/cull work against a local threat. Lowering danger never assigns
 * `cells.state` — claiming land remains a separate frontier / politics cost.
 */
export interface ThreatCullProject {
  readonly cellId: number;
  readonly stateId: number;
  /** Stable monster id (`Monster.i`), or null for residual high-danger hunts. */
  monsterId: number | null;
  establishedYear: number;
  progressYears: number;
  lastOutcome?: "progress" | "cleared" | "abandoned";
  /** Cumulative danger reduction observed at the hunt cell (diagnostic). */
  dangerReduced: number;
}

/** Host-owned Phase 4 wilderness ecology runtime state. */
export interface WildernessEcologyState {
  cullProjects: Record<number, ThreatCullProject>;
  /** The annual guard prevents daily ticks from re-running hunt/rewild. */
  lastEvaluatedYear: number | null;
  /**
   * Temporary rural/pest pressure suppression by cell (0..1).
   * Applied inside applyBiomePredatorDanger / rebuildDangerField.
   * Decays on the annual wilderness tick (−0.15/year, floor 0).
   * Spec: docs/plan/player-threat-cull-jobs.md PR-1.
   */
  pestSuppressionByCell?: Record<number, number>;
}

export function createEmptyWildernessEcologyState(): WildernessEcologyState {
  return {
    cullProjects: {},
    lastEvaluatedYear: null,
    pestSuppressionByCell: {}
  };
}

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

/** Per-cause death headcounts for one state inside a population-loss day bucket. */
export interface PopulationLossDeathTotals {
  combat: number;
  famine: number;
  natural: number;
  other: number;
  total: number;
}

/**
 * Coarse daily death bucket (max ~40 retained). Keys are stable entity ids as
 * JSON-friendly string or number records; readers coerce with Number().
 */
export interface PopulationLossDayBucket {
  /** Floor of the simulation day index when the bucket was opened. */
  day: number;
  /** stateId → cause totals (display people). */
  byState: Record<number, PopulationLossDeathTotals>;
  /** cellId → combat death headcount at that battlefield. */
  combatByCell: Record<number, number>;
}

/**
 * Rolling death tallies for the Population Overview dialog and combat-death layer.
 * Owned by the host simulation slice so save/load and headless runs share one source.
 */
export interface PopulationLossState {
  /** Continuous simulation day index advanced with each tick's elapsed days. */
  simDay: number;
  /** Chronological day buckets; pruned to a rolling window. */
  history: PopulationLossDayBucket[];
}

export function createEmptyPopulationLossState(): PopulationLossState {
  return { simDay: 0, history: [] };
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
  /**
   * Calendar bucket (`currentYear * 12 + (currentMonth - 1)`) at which
   * `grid.cells.seasonalTemp` was last recomputed by `seasonal-climate.tick`
   * (`src/generators/seasonalClimate.ts`). `null` before the first computation. Not
   * meaningfully persisted across save/load — a mismatch (including `undefined` from an
   * older archive) simply forces one recompute, which is the desired behavior.
   */
  lastSeasonalTempBucket: number | null;
  /**
   * Persistable simulation PRNG stream. Independent of map-generation `Math.random`
   * and of incidental UI randomness. Written on each simulation commit and restored
   * from `.fmg` archives so mid-session save/load keeps the same stream position.
   */
  rng: SimulationRngState;
  /** Dynamic cell columns. `SimulationData.cells` owns these values. */
  cells: SimulationCellColumns;
  /** Dynamic settlement values, keyed by stable burg id. */
  burgs: BurgSimulationStates;
  /** Dynamic political-state values, keyed by stable state id. */
  states: StateSimulationStates;
  /** Dynamic regiment rosters, keyed by their stable owner state id. */
  military: SimulationMilitaryRosters;
  /** Namespaced runtime state owned by extensions, never by `pack`. */
  extensions: ExtensionStateSlices;
  /** Espionage reports: intelligence[observerStateId][targetStateId] */
  intelligence: Record<number, Record<number, IntelligenceReport>>;
  /** Strategic goals: strategicGoals[stateId] */
  strategicGoals: Record<number, StrategicGoal[]>;
  /**
   * Rolling population-loss tallies (40-day window). Module-local storage was
   * removed so archive / world.replace round-trips keep overview and heatmap data.
   */
  populationLoss: PopulationLossState;
  /**
   * Naval strength multipliers keyed by stable state id (default 1 when absent).
   * Grown by Shipbuilding completion events; host-owned so military regen survives save/load.
   */
  navalTechBonus: Record<number, number>;
  /** Unclaimed outposts and settlements; State incorporation is a later phase. */
  frontier: FrontierSimulationState;
  /**
   * Phase 4 wild oikoumene: hunt/cull projects that lower danger without annexing land,
   * plus annual rewilding pressure. Spec: docs/plan/wild-oikoumene-frontier.md
   */
  wilderness: WildernessEcologyState;
  /**
   * Host-owned technology graph progress (locked→diffused). Distinct from calendar `era`.
   * See docs/plan/technology-development-roadmap.md §12.
   */
  technology: TechnologySimulationState;
}

/**
 * Live, tick-driven simulation clock — the sole source of truth for in-session
 * calendar date (P2-10). Distinct from WorldContext.options.year/month/day, which
 * remain generation-parameter seeds only and are not mirrored on advanceTime.
 * Initialized by timeEngine.ts's initSimulationClock() once per map generation
 * (or restored from archive simulation on `.fmg` load).
 */
export const simulationContext: SimulationContext = {
  currentYear: 0,
  currentMonth: 1,
  currentDay: 1,
  era: "",
  tickCount: 0,
  worldSeason: "spring",
  lastSeasonalTempBucket: null,
  // Placeholder until initRng()/bindSimulationRng() installs a seeded stream.
  rng: { algorithm: "alea-0.9", seed: "", state: [0, 0, 0, 1], streams: {} },
  cells: {
    population: new Float32Array(),
    carryingCapacity: new Float32Array(),
    children: new Float32Array(),
    maleAdults: new Float32Array(),
    femaleAdults: new Float32Array(),
    elders: new Float32Array(),
    danger: new Uint8Array(),
    forestStock: new Float32Array()
  },
  burgs: {},
  states: {},
  military: {},
  extensions: {},
  intelligence: {},
  strategicGoals: {},
  populationLoss: createEmptyPopulationLossState(),
  navalTechBonus: {},
  frontier: createEmptyFrontierSimulationState(),
  wilderness: createEmptyWildernessEcologyState(),
  technology: createEmptyTechnologySimulationState()
};
