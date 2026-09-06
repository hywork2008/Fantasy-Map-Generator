import { appServices, restoreRngFromSimulation } from "../context/appServices";
import {
  createEmptyFrontierSimulationState,
  createEmptyWildernessEcologyState,
  recordFrontierResourceClaim,
  type SimulationContext,
  simulationContext
} from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { durationToCalendarDays } from "../runtime/calendarDuration";
import {
  runWithSystemRng,
  type SimulationRngState,
  simulationRngStatesEqual,
  syncSimulationRngToContext
} from "../runtime/simulationRng";
import { registerDayBatchController, registerDayStepObserver } from "../runtime/simulationRunner";
import {
  type DataTopic,
  FULL_REPLACE_TOPICS,
  legacyMutation,
  registerSimulationAdvanceHandler,
  registerSimulationStepDayHandler,
  type SimulationStepResult,
  stepDaySimulation
} from "../runtime/worldRuntime";
import { telemetry } from "../services/simulationTelemetry";
import { useDebugSnapshotState } from "../store/debugSnapshotState";
import { isFastAdvanceActive, resolveFastAdvanceRates, resolveHistoryModeProfile } from "../store/fastAdvanceState";
import { useOptionsState } from "../store/optionsState";
import { useTimeSimulationState } from "../store/timeSimulationState";
import { captureSnapshotData, debugSnapshotsEnabled } from "../utils/aiDebugExporter";
import { normalizeConflictAutonomy } from "../utils/conflictAutonomy";
import { getDaysInMonth, getSeason } from "../utils/seasonUtils";
import { isStateInActiveConflict } from "./activeConflict";
import { type DemographicsSimulationResult, simulateDemographics } from "./demography-simulator";
import { advanceDungeonEcology } from "./dungeonEcology";
import { applyFastForwardPopulation } from "./fastAdvance/fastAdvancePopulation";
import { strideStepDays } from "./fastAdvance/historyModeProfiles";
import {
  beginHistoryModeRun,
  endHistoryModeRun,
  getActiveHistoryModeRun,
  isSystemDisabledByHistoryMode
} from "./fastAdvance/historyModeRun";
import { applyHistoryStubFunding } from "./fastAdvance/historyStubFunding";
import { advanceFrontierExpansion, snapshotFrontierBudgets } from "./frontierExpansion";
import { tickManpower } from "./manpower";
import { Military } from "./military-generator";
import { advancePopulationLossClock, resetPopulationLossTracker } from "./populationLossTracker";
import { advancePortDevelopment } from "./portDevelopment";
import { advanceAllRegimentMovement } from "./regimentMovement";
import { advanceSeasonalClimate } from "./seasonalClimate";
import { createSimulationSystemRegistry, type SimulationStepContext, type SimulationSystem } from "./simulationSystem";
import { seedTechnologyStartProfile, settleTechnologyAnnual } from "./technologyProgress";
import { createEmptyTechnologySimulationState } from "./technologyTypes";
import { logTickProfile, measureTickStep, resetTickProfile } from "./tickProfiler";
import { advanceUndergroundEcology } from "./undergroundEcology";
import { advanceWildernessEcology } from "./wildernessEcology";

/** Day is the base simulation unit. Month/Year UI buttons expand to ~this many days. */
const DAYS_PER_YEAR = 365.2425;
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12; // ≈ 30.436875

/**
 * Per-chunk budget for `runTimeSimulation`, in wall-clock ms. Days are stepped
 * in a tight loop until either this budget or MAX_DAYS_PER_FRAME is hit, then
 * the event loop yields for progress updates, cancellation, and redraw work.
 * This leaves headroom under a normal interactive frame for the browser's own
 * paint work without making simulation throughput depend on rAF cadence.
 */
const FRAME_BUDGET_MS = 12;
/** Safety cap on days-per-frame in case a day step is implausibly cheap. */
const MAX_DAYS_PER_FRAME = 500;

export type TimeTickHook = (
  deltaYears: number,
  deltaMonths: number,
  deltaDays: number
) => readonly DataTopic[] | undefined;
const timeTickSystems = createSimulationSystemRegistry();
// History mode masks whole subsystems off for the duration of a run — see
// docs/plan/advance-time-history-mode.md §5.1. Outside a history-mode run
// isSystemDisabledByHistoryMode() is always false, so this filter is a no-op.
timeTickSystems.setFilter(system => !isSystemDisabledByHistoryMode(system.id));

/**
 * Calendar days from the live clock to the 1st of the next month (1 when already on the 1st of a
 * month with a single day left in it). The unit a history-mode "month" stride advances by — see
 * strideStepDays() for why landing on the 1st matters.
 */
function daysUntilNextMonthStart(): number {
  const { currentYear, currentMonth, currentDay } = simulationContext;
  return getDaysInMonth(currentYear, currentMonth) - currentDay + 1;
}

/** Days the next tick should cover, given how many remain in this advance. */
function nextStrideDays(remainingDays: number): number {
  const run = getActiveHistoryModeRun();
  if (!run) return 1;
  return strideStepDays(run.stride, remainingDays, daysUntilNextMonthStart());
}

let nextLegacyHookId = 0;
const legacyHookIds: string[] = [];

interface FrontierResourceDiscoveredEventDetail {
  stateId: number;
  cellId: number;
  commodity: string;
  discoveredYear: number;
}

/**
 * Economy owns geological knowledge and emits this generic survey result. The
 * host records only the strategic intent; it never assumes a discovery grants
 * ownership before the normal Frontier incorporation transaction.
 */
document.addEventListener("fmg:frontier-resource-discovered", event => {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isFrontierResourceDiscoveredEventDetail(detail)) return;
  recordFrontierResourceClaim(simulationContext.frontier, detail);
});

function isFrontierResourceDiscoveredEventDetail(value: unknown): value is FrontierResourceDiscoveredEventDetail {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.stateId === "number" &&
    Number.isInteger(record.stateId) &&
    record.stateId > 0 &&
    typeof record.cellId === "number" &&
    Number.isInteger(record.cellId) &&
    record.cellId >= 0 &&
    typeof record.commodity === "string" &&
    record.commodity.length > 0 &&
    typeof record.discoveredYear === "number" &&
    Number.isInteger(record.discoveredYear) &&
    record.discoveredYear >= 0
  );
}

registerSimulationAdvanceHandler(({ deltaYears, deltaMonths, deltaDays }) =>
  advanceTimeMutation(deltaYears, deltaMonths, deltaDays)
);

registerSimulationStepDayHandler(request => stepDayMutation(request?.days ?? 1));

/**
 * @deprecated Prefer `registerSimulationSystem()` with explicit phase, cadence,
 * reads, writes, and dependencies. Built-in economy / nobility / shipbuilding
 * systems already use that API. This wrapper remains only for dynamic ZIP
 * extensions that have not migrated yet; it registers a politics-phase system
 * and never unregisters (session lifetime), matching the historical hook API.
 */
export function registerTimeTickHook(fn: TimeTickHook, label = "unlabeled", writes?: readonly DataTopic[]): void {
  if (import.meta.env.DEV) {
    console.warn(
      `[fmg] registerTimeTickHook(${JSON.stringify(label)}) is deprecated; use registerSimulationSystem() with phase/reads/writes`
    );
  }
  const previousId = legacyHookIds.at(-1);
  const id = `legacy-hook:${nextLegacyHookId++}`;
  const declaredWrites = writes?.length
    ? [...new Set(writes)]
    : ([label === "unlabeled" ? "extension.legacy" : `extension.${label}`] as DataTopic[]);
  timeTickSystems.register({
    id,
    phase: "politics",
    reads: [],
    writes: declaredWrites,
    after: previousId ? [previousId] : undefined,
    cadence: { every: 1 },
    profileLabel: `hook:${label}`,
    run: (context, writer) => {
      const topics = fn(context.delta.years, context.delta.months, context.delta.days);
      // void/undefined keeps the historical fallback: publish the declared writes.
      if (topics === undefined) writer.markChanged(...declaredWrites);
      else if (topics.length) writer.markChanged(...topics);
    }
  });
  legacyHookIds.push(id);
}

/**
 * Registers a synchronous simulation system for each `advanceTime` / day step.
 * Prefer this over `registerTimeTickHook`. Systems must not import Renderer APIs;
 * mark changed topics on the TransactionWriter so undeclared writes are rejected.
 */
export function registerSimulationSystem(system: SimulationSystem): () => void {
  return timeTickSystems.register(system);
}

// Live seasonal climate. Self-gates to once per calendar month inside
// advanceSeasonalClimate() (SimulationSystem.cadence counts advanceTime() calls, not
// calendar months — see docs/plan/seasonal-temperature-variation.md). Runs in the
// "environment" phase so any later-phase system in the same tick could read the current
// month's grid.cells.seasonalTemp if it ever needs to.
registerSimulationSystem({
  id: "seasonal-climate.tick",
  phase: "environment",
  reads: ["map.physical", "simulation.cells"],
  writes: ["simulation.cells"],
  cadence: { every: 1 },
  profileLabel: "seasonalClimate",
  run: (_context, writer) => {
    const result = advanceSeasonalClimate({ world: worldContext, simulation: simulationContext });
    if (result.topics.length) writer.markChanged(...result.topics);
  }
});

/**
 * Loop-reduction Phase 1 (docs/plan/advance-time-loop-reduction.md): the manpower ledger
 * (draft/demobilize/wastage in manpower.ts) is pure linear rate math — every constant there is a
 * "fraction of X per year" scaled by deltaYears, with no probability rolls or reaction/detection
 * logic — so applying several accumulated days' worth of deltaYears in one call is (within
 * floating-point rounding) equivalent to applying each day's tiny slice separately. It used to run
 * unconditionally every simulated day (~11ms/day, ~4s/year on a 711-burg map — see
 * docs/analytics/advance-year-performance.md), the single largest non-self-gated per-day cost.
 *
 * `SimulationCadence.every` counts `advanceTime()` calls, not calendar days (a bulk one-year jump
 * and a single-day step both count as one tick — see docs/plan/seasonal-temperature-variation.md),
 * so it cannot express "once a week" by itself. Self-gating on an accumulated-day counter inside
 * `run()` — the same pattern economy's `daysSinceLastProduction` already uses
 * (src/extensions/economy/index.tsx) — is what makes this calendar-accurate regardless of how many
 * days a single tick represents. This changes nothing about how many `simulation.stepDay` commits
 * happen, so P2-5's "Advance Day×N == Advance Month×1" invariant is untouched; only how often the
 * manpower body actually executes does.
 */
const MANPOWER_GATE_DAYS = 7;
/**
 * Fast-Forward (docs/plan/advance-time-fast-forward.md §8 Phase 4): a coarser manpower gate while a
 * Fast-Forward bulk advance is running. `tickManpower` closes a fixed fraction of the draft/
 * demobilization gap per year scaled by deltaYears, so a monthly slice (39.7% annual draft) is
 * within ~0.4pp of the weekly slice (39.3%) — negligible for an already-approximate mode — while
 * running the O(states × (cells + burgs)) body ~4× less often (the single largest surviving
 * per-tick cost once Phase 1-3 removed the monthly production cluster).
 */
const MANPOWER_FAST_ADVANCE_GATE_DAYS = 30;
let manpowerDaysAccumulated = 0;

registerSimulationSystem({
  id: "manpower.tick",
  phase: "population",
  reads: ["simulation.cells", "simulation.states", "simulation.military"],
  writes: ["simulation.states", "simulation.military"],
  cadence: { every: 1 },
  profileLabel: "core:manpower",
  run: (context, writer) => {
    const sim = useOptionsState.getState();
    if (!sim.simManpower || !worldContext.pack?.states) {
      // Drop any partial accumulation so re-enabling later doesn't apply a surprise multi-day
      // lump built up while the ledger was off.
      manpowerDaysAccumulated = 0;
      return;
    }

    const { years, months, days } = context.delta;
    manpowerDaysAccumulated += years * DAYS_PER_YEAR + months * DAYS_PER_MONTH + days;
    const gateDays = isFastAdvanceActive(context.isBulkAdvance) ? MANPOWER_FAST_ADVANCE_GATE_DAYS : MANPOWER_GATE_DAYS;
    if (manpowerDaysAccumulated < gateDays) return;

    const dueDeltaYears = manpowerDaysAccumulated / DAYS_PER_YEAR;
    manpowerDaysAccumulated = 0;
    tickManpower(worldContext.pack, dueDeltaYears, worldContext.populationRate);
    writer.markChanged("simulation.states", "simulation.military");
  }
});

/**
 * Stub treasury income while a history-mode run is in progress
 * (docs/plan/advance-time-history-mode.md §6).
 *
 * Registered as a host system rather than an economy step on purpose: the `dynastyOnly` profile
 * masks the entire economy tick off, and treasuries still need to be solvent for frontier
 * governance and war to keep producing history. Outside a history-mode run this returns
 * immediately, so it costs one null check per ordinary tick.
 *
 * It runs in the "economy" phase, before politics, so the frontier/expansion decisions later in
 * the same tick see this tick's balance.
 */
registerSimulationSystem({
  id: "history.stubFunding",
  phase: "economy",
  reads: ["simulation.cells", "simulation.burgs", "simulation.states"],
  writes: ["simulation.states", "simulation.burgs"],
  cadence: { every: 1 },
  profileLabel: "core:historyStubFunding",
  run: (context, writer) => {
    const run = getActiveHistoryModeRun();
    if (!run?.stubFunding.enabled || !worldContext.pack?.states) return;

    const { years, months, days } = context.delta;
    const yearsElapsed = years + months / 12 + days / DAYS_PER_YEAR;
    const result = applyHistoryStubFunding(worldContext.pack, yearsElapsed, run.stubFunding, isStateInActiveConflict);
    if (result.statesFunded > 0) writer.markChanged("simulation.states", "simulation.burgs");
  }
});

// Snapshot last-settled treasury before the economy phase spends it. Frontier
// expansion (politics) then evaluates that calendar-boundary reserve instead of
// the post-upkeep remainder — otherwise a new map with Economy enabled never
// meets the 20-point founding reserve.
registerSimulationSystem({
  id: "frontier-budget.snapshot",
  phase: "population",
  reads: ["simulation.states", "simulation.cells"],
  writes: ["simulation.cells"],
  cadence: { every: 1 },
  profileLabel: "frontierBudgetSnapshot",
  run: (_context, writer) => {
    if (simulationContext.currentMonth !== 1 || simulationContext.currentDay !== 1) return;
    if (snapshotFrontierBudgets(worldContext, simulationContext)) writer.markChanged("simulation.cells");
  }
});

// Frontier projects are host-owned politics work. The module's annual guard
// keeps this registered daily system cheap while making Advance Day/Month/Year
// share identical calendar-boundary semantics.
registerSimulationSystem({
  id: "frontier-expansion.tick",
  phase: "politics",
  reads: ["map.politics", "simulation.cells", "simulation.states"],
  writes: [
    "simulation.cells",
    "simulation.states",
    "simulation.burgs",
    "map.politics",
    "map.settlements",
    "map.networks"
  ],
  cadence: { every: 1 },
  profileLabel: "frontierExpansion",
  run: (context, writer) => {
    const result = advanceFrontierExpansion({
      world: worldContext,
      simulation: simulationContext,
      rng: context.rng
    });
    for (const incorporation of result.incorporations) {
      if (incorporation.origin !== "seaborne" || incorporation.burgId === undefined) continue;
      document.dispatchEvent(
        new CustomEvent("fmg:settlement-promoted", {
          detail: {
            burgId: incorporation.burgId,
            cellId: incorporation.settlementCellId,
            stateId: incorporation.stateId
          }
        })
      );
    }
    if (result.topics.length) writer.markChanged(...result.topics);
  }
});

// Phase 4 wild oikoumene: hunt/cull lowers danger; rewild recovers pressure.
// Claiming land remains a separate frontier/politics cost (never sets cells.state).
registerSimulationSystem({
  id: "wilderness-ecology.tick",
  phase: "politics",
  // advanceWildernessEcology() reads/writes pack.monsters (power recovery, dead-monster removal)
  // and prunes their pack.markers (pruneDeadMonsterMarkers()) and reads pack.dungeons as danger
  // sources — all three are map.annotations-owned (dataFieldOwnership.ts). Declaring only
  // simulation.cells/simulation.states let a live monster-marker prune's topic
  // (wildernessEcology.ts's `markersOrMonstersChanged` branch) reach `writer.markChanged()`
  // undeclared, throwing "topic 'map.annotations' is not in the system's declared writes" and
  // aborting the whole Advance Time batch (found 2026-08-08 via live Advance Year testing).
  reads: ["map.politics", "map.annotations", "simulation.cells", "simulation.states"],
  writes: ["simulation.cells", "simulation.states", "map.annotations"],
  cadence: { every: 1 },
  profileLabel: "wildernessEcology",
  run: (context, writer) => {
    const result = advanceWildernessEcology({
      world: worldContext,
      simulation: simulationContext,
      rng: context.rng
    });
    if (result.topics.length) writer.markChanged(...result.topics);
  }
});

// High Fantasy dungeons: rare spontaneous land sites over decades–centuries.
registerSimulationSystem({
  id: "dungeon-ecology.tick",
  phase: "politics",
  reads: ["map.annotations", "map.settlements", "simulation.cells"],
  writes: ["map.annotations", "simulation.cells"],
  cadence: { every: 1 },
  profileLabel: "dungeonEcology",
  run: (context, writer) => {
    const result = advanceDungeonEcology({
      world: worldContext,
      simulation: simulationContext,
      rng: context.rng
    });
    if (result.topics.length) writer.markChanged(...result.topics);
  }
});

// Underground realm Phase 4 (docs/plan/underground-realm-and-supernatural-areas.md §4.3a): Deep
// Worms slowly dig, raising cavity void at their cell/neighbors. No-ops on non-Fantasy maps
// (subterraneanVoid absent) and whenever no Deep Worm monster is alive.
registerSimulationSystem({
  id: "underground-ecology.tick",
  phase: "politics",
  reads: ["map.annotations", "simulation.cells"],
  writes: ["simulation.cells"],
  cadence: { every: 1 },
  profileLabel: "undergroundEcology",
  run: (_context, writer) => {
    const result = advanceUndergroundEcology({ world: worldContext, simulation: simulationContext });
    if (result.topics.length) writer.markChanged(...result.topics);
  }
});

// Technology graph: evaluate after economy knowledge/stocks have updated in the
// economy phase (lexical order places "technology.tick" after "shipbuilding.tick").
// Self-gates to once per calendar year inside settleTechnologyAnnual().
registerSimulationSystem({
  id: "technology.tick",
  phase: "economy",
  reads: ["map.politics", "map.settlements", "simulation.states", "extension.economy", "extension.shipbuilding"],
  writes: ["simulation.states"],
  cadence: { every: 1 },
  profileLabel: "technologyProgress",
  run: (_context, writer) => {
    if (settleTechnologyAnnual(simulationContext.currentYear)) {
      writer.markChanged("simulation.states");
    }
  }
});

/** Test/support: ordered system ids currently registered for the host tick. */
export function listRegisteredSimulationSystemIds(): readonly string[] {
  return timeTickSystems.list().map(system => system.id);
}

/**
 * Recomputes simulationContext.worldSeason from the map's reference (central) latitude and
 * the current month. This is a display-only convenience for the calendar UI — a map can span
 * both hemispheres, so per-cell/per-market seasonal logic (economy, roads, sea routes) must
 * call getSeason(latitude, month) itself with its own local latitude, never read this field.
 */
function updateWorldSeason(): void {
  const { latN, latS } = worldContext.mapCoordinates;
  const referenceLatitude = latN !== undefined && latS !== undefined ? (latN + latS) / 2 : 0;
  simulationContext.worldSeason = getSeason(referenceLatitude, simulationContext.currentMonth);
}

/**
 * Notifies UI listeners (map calendar overlay, ToolsTab display) that
 * simulationContext.currentYear/era changed, regardless of the cause.
 */
function dispatchSimulationUpdated(): void {
  document.dispatchEvent(
    new CustomEvent("fmg:simulation-updated", {
      detail: {
        currentYear: simulationContext.currentYear,
        currentMonth: simulationContext.currentMonth,
        currentDay: simulationContext.currentDay,
        era: simulationContext.era
      }
    })
  );
}

/**
 * Seeds (or re-seeds) the live simulation clock from generation options without
 * touching tickCount. Called when the user edits Year/Era in the Options
 * Generation tab after generation. This is an explicit user edit of the live
 * clock start, not a continuous dual-write mirror.
 *
 * Month/day on options are legacy seed fields only; they are applied when
 * present so map load can restore a saved calendar position into SimulationContext.
 */
export function syncSimulationClockFromOptions(): void {
  simulationContext.currentYear = worldContext.options.year ?? 0;
  simulationContext.currentMonth = worldContext.options.month ?? 1;
  simulationContext.currentDay = worldContext.options.day ?? 1;
  simulationContext.era = worldContext.options.era ?? "";
  updateWorldSeason();
  dispatchSimulationUpdated();
}

/**
 * Resets the simulation clock from the current map's generation year/era.
 * Called once from main.ts after core map generation completes, and from
 * legacy `.map` load after options are staged. `.fmg` load restores the clock
 * from the archive simulation slice via `world.replace` instead.
 */
export function initSimulationClock(): void {
  syncSimulationClockFromOptions();
  simulationContext.tickCount = 0;
  simulationContext.intelligence = {};
  simulationContext.strategicGoals = {};
  simulationContext.navalTechBonus = {};
  simulationContext.frontier = createEmptyFrontierSimulationState(worldContext.pack?.cells?.i.length ?? 0);
  simulationContext.wilderness = createEmptyWildernessEcologyState();
  simulationContext.technology = createEmptyTechnologySimulationState();
  seedTechnologyStartProfile(simulationContext.currentYear);
  resetPopulationLossTracker();
}

// Economy seeds state.treasury during map-ready tasks, after initSimulationClock.
// Capture that opening reserve so the Tools panel and the first January
// evaluation see the same calendar-boundary budget.
document.addEventListener("fmg:map-ready-tasks-completed", () => {
  snapshotFrontierBudgets(worldContext, simulationContext);
});

/**
 * Post-commit observers for one finished calendar day (or a reported delta).
 * Shared by `advanceTime`, UI day loops, and the headless runner's notify path.
 */
export function notifyAfterDayStep(deltaYears: number, deltaMonths: number, deltaDays: number): void {
  document.dispatchEvent(
    new CustomEvent("fmg:time-advanced", {
      detail: { deltaYears, deltaMonths, deltaDays, currentYear: simulationContext.currentYear }
    })
  );
  dispatchSimulationUpdated();

  telemetry()?.onTickEnd?.(
    {
      tick: simulationContext.tickCount,
      cal: {
        y: simulationContext.currentYear,
        m: simulationContext.currentMonth,
        d: simulationContext.currentDay,
        era: simulationContext.era
      }
    },
    { deltaYears, deltaMonths, deltaDays }
  );

  if (debugSnapshotsEnabled()) {
    try {
      useDebugSnapshotState.getState().addSnapshot({
        tickCount: simulationContext.tickCount,
        year: simulationContext.currentYear,
        label: `Advance Time +${deltaYears}y ${deltaMonths}m ${deltaDays}d`,
        data: captureSnapshotData()
      });
    } catch {
      // Headless / incomplete pack fixtures skip debug capture.
    }
  }
}

// Headless runner notify path uses the same observers without importing advanceTime.
registerDayStepObserver(notifyAfterDayStep);

/**
 * Fires once per completed top-level advance action — one `advanceTime()` call, or one full
 * `runTimeSimulation()` run (Tools tab Advance Day/Month/Year button) — regardless of how many
 * calendar days it expanded to internally. `notifyAfterDayStep`/`fmg:time-advanced` fires once per
 * *day* (or per asynchronous UI chunk of days), which is too fine-grained for
 * listeners that want "the user's advance action is done" (e.g. Balance History's one-snapshot-
 * per-action capture, `src/extensions/economy/controllers/balance-history.ts`). Not dispatched on
 * a failed/thrown batch — see call sites.
 */
function notifyAdvanceCompleted(): void {
  document.dispatchEvent(
    new CustomEvent("fmg:time-advance-completed", {
      detail: {
        currentYear: simulationContext.currentYear,
        currentMonth: simulationContext.currentMonth,
        currentDay: simulationContext.currentDay,
        era: simulationContext.era
      }
    })
  );
}

/**
 * Advances simulation time. Public entry for `window.fmg.actions.advanceTime`.
 *
 * P2-5: multi-day / month / year spans expand to a calendar-day sequence of
 * `simulation.stepDay` commits (same semantics as Tools → Advance Time).
 * One calendar day → one tickCount increment, one system pass, one event set.
 * Live clock is only `simulationContext` (P2-10); options.year/month/day are
 * not updated and remain generation-parameter values.
 */
export function advanceTime(deltaYears: number, deltaMonths = 0, deltaDays = 0): void {
  if (deltaYears <= 0 && deltaMonths <= 0 && deltaDays <= 0) return;

  // Pure single-day fast path (UI rAF loop and day button).
  if (deltaYears === 0 && deltaMonths === 0 && deltaDays === 1) {
    const commit = stepDaySimulation();
    if (!commit) return;
    notifyAfterDayStep(0, 0, 1);
    notifyAdvanceCompleted();
    return;
  }

  const totalDays = durationToCalendarDays(
    {
      year: simulationContext.currentYear,
      month: simulationContext.currentMonth,
      day: simulationContext.currentDay
    },
    { years: deltaYears, months: deltaMonths, days: deltaDays }
  );
  if (totalDays <= 0) return;

  // Batch the rollback snapshot across the whole run instead of once per day. enterDayBatch also
  // opens the history-mode bracket, so the stride below is already resolved by the time it runs.
  enterDayBatch(totalDays);
  let failed = false;
  try {
    for (let elapsed = 0; elapsed < totalDays; ) {
      // 1 for an ordinary advance; a whole month at a time under history mode (§4).
      const days = nextStrideDays(totalDays - elapsed);
      const commit = stepDaySimulation(days);
      if (!commit) return;
      elapsed += days;
      // notifyAfterDayStep's delta parameter already documents tolerance for a multi-day report.
      notifyAfterDayStep(0, 0, days);
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (failed) {
      exitDayBatchAfterFailure();
    } else {
      exitDayBatch();
      notifyAdvanceCompleted();
    }
  }
}

/**
 * Snapshot of live simulation + pack taken before a `simulation.stepDay` mutation.
 * On system failure the day is restored and no revision is published.
 * Options year/month/day are not part of the live clock and are not snapshotted.
 */
interface DaySnapshot {
  readonly simulation: SimulationContext;
  readonly pack: unknown;
  readonly rng: SimulationRngState | null;
}

function takeDaySnapshot(): DaySnapshot {
  syncSimulationRngToContext(simulationContext);
  return {
    simulation: structuredClone(simulationContext),
    pack: structuredClone(worldContext.pack),
    rng: simulationContext.rng
      ? {
          algorithm: simulationContext.rng.algorithm,
          seed: simulationContext.rng.seed,
          state: [...simulationContext.rng.state] as [number, number, number, number],
          streams: structuredClone(simulationContext.rng.streams ?? {})
        }
      : null
  };
}

function restoreDaySnapshot(snapshot: DaySnapshot): void {
  // In-place restore so existing context / pack object identities stay shared.
  const simTarget = simulationContext as unknown as Record<string, unknown>;
  const simSource = snapshot.simulation as unknown as Record<string, unknown>;
  for (const key of Object.keys(simTarget)) delete simTarget[key];
  Object.assign(simTarget, simSource);

  const packTarget = worldContext.pack as unknown as Record<string, unknown>;
  const packSource = snapshot.pack as Record<string, unknown>;
  for (const key of Object.keys(packTarget)) delete packTarget[key];
  Object.assign(packTarget, packSource);

  if (snapshot.rng) {
    simulationContext.rng = snapshot.rng;
    const seed =
      typeof worldContext.seed === "string" && worldContext.seed.length > 0 ? worldContext.seed : snapshot.rng.seed;
    restoreRngFromSimulation(seed, simulationContext);
  }
}

/**
 * Amortizes `takeDaySnapshot()`'s full `structuredClone(pack)` across a run of
 * consecutive `simulation.stepDay` commits (multi-day/month/year advances,
 * P2-5). Without this, every single day in e.g. an "Advance Year" run took its
 * own full-pack clone (~365 clones instead of 1), which is the dominant cost
 * of the visible slowdown on large maps. `enterDayBatch()`/`exitDayBatch()`
 * bracket a run; `stepDayMutation()` reuses the shared snapshot while a batch
 * is active instead of taking a fresh one.
 *
 * Trade-off: a mid-run system failure now rolls back to the start of the run
 * instead of just the failing day. This is acceptable because a throwing
 * system indicates a bug, not a normal simulation outcome. But some of the
 * run's earlier days may already have published their own commit (revision
 * bump) to RenderCoordinator/WebGL cache subscribers before the failure — the
 * in-place rollback then silently reverts data those subscribers already
 * observed, with no notification. `exitDayBatchAfterFailure()` covers that by
 * publishing one corrective commit so subscribers re-sync to the reverted
 * state instead of continuing to render/cache days that no longer exist.
 * Days already rendered before a manual stop (not a failure) are unaffected —
 * stopping does not throw, so this path never runs for it.
 *
 * Depth-counted so a batch entered by one caller is not closed early by a
 * nested caller (e.g. `runDaily` invoked from inside another batch); only the
 * outermost exit can trigger the correction.
 */
let activeDayBatchSnapshot: DaySnapshot | null = null;
let dayBatchDepth = 0;
let dayBatchCommittedDays = 0;
/** How many calendar days the outermost active batch spans; 1 outside any batch. */
let activeDayBatchTotalDays = 1;

/** True when the outermost batch opened a history-mode bracket that its exit must close. */
let dayBatchOpenedHistoryRun = false;

function enterDayBatch(totalDays = 1): void {
  dayBatchDepth++;
  if (dayBatchDepth === 1) {
    activeDayBatchSnapshot = takeDaySnapshot();
    dayBatchCommittedDays = 0;
    activeDayBatchTotalDays = totalDays;
    // Every multi-day entry point (advanceTime, the UI rAF loop, headless runDaily) opens its
    // batch here, so this is the one place that has to resolve history mode. A lone Advance Day
    // never qualifies, which is what keeps single-day stepping identical to before
    // (docs/plan/advance-time-history-mode.md §3.1, §9.2).
    const profile = totalDays > 1 ? resolveHistoryModeProfile() : null;
    dayBatchOpenedHistoryRun = profile !== null;
    if (profile) beginHistoryModeRun(profile);
  }
}

function exitDayBatch(): void {
  dayBatchDepth = Math.max(0, dayBatchDepth - 1);
  if (dayBatchDepth === 0) {
    activeDayBatchSnapshot = null;
    activeDayBatchTotalDays = 1;
    if (dayBatchOpenedHistoryRun) {
      endHistoryModeRun();
      dayBatchOpenedHistoryRun = false;
    }
  }
}

/**
 * True while inside a multi-day batch (Advance Week/Month/Year, or any multi-day
 * `advanceTime`/`runDaily` call) — false for a lone single-day step. See
 * `SimulationStepContext.isBulkAdvance`'s doc comment (docs/plan/advance-time-loop-reduction.md
 * Phase 1b) for what this is for.
 */
function isBulkTimeAdvance(): boolean {
  return dayBatchDepth > 0 && activeDayBatchTotalDays > 1;
}

function exitDayBatchAfterFailure(): void {
  const isOutermost = dayBatchDepth === 1;
  exitDayBatch();
  if (isOutermost && dayBatchCommittedDays > 0) publishDayBatchRollbackCorrection();
}

function collectExtensionTopics(): DataTopic[] {
  return Object.keys(simulationContext.extensions ?? {}).map(id => `extension.${id}` as DataTopic);
}

/**
 * Broad-invalidation commit published only after a batch rollback discards
 * already-committed days (see exitDayBatchAfterFailure). This is a correction
 * for a rare failure path, not a per-day operation, so reusing the full
 * "everything may have changed" topic set (rather than tracking exactly what
 * each already-committed day touched) keeps this safe and simple.
 */
function publishDayBatchRollbackCorrection(): void {
  legacyMutation(() => ({
    result: undefined,
    topics: [...FULL_REPLACE_TOPICS, ...collectExtensionTopics()]
  }));
}

/**
 * Forces one more coalesced extension draw-layer pass after a bulk
 * runTimeSimulation run ends (stop, completion, or failure). Extension draw
 * hooks that suppress decorative work while useTimeSimulationState.isRunning
 * is true (e.g. economy's Trade animation restart — see economy/index.tsx)
 * need this to actually resume once the run is over. Published through the
 * normal commit/topic path rather than calling a renderer directly, so
 * Generator/Renderer separation stays intact — RenderCoordinator decides what
 * to redraw, as usual.
 */
function publishBulkRunFinishedRedraw(): void {
  const extensionTopics = collectExtensionTopics();
  if (!extensionTopics.length) return;
  legacyMutation(() => ({ result: undefined, topics: extensionTopics }));
}

registerDayBatchController({
  enter: enterDayBatch,
  exit: exitDayBatch,
  exitAfterFailure: exitDayBatchAfterFailure,
  strideDays: nextStrideDays
});

/**
 * Canonical one-day command body. Snapshots before mutation so a throwing system
 * rolls back the day without publishing a revision (plan §5.2 / §6). Reuses the
 * active batch snapshot (see above) when called as part of a multi-day run.
 */
function stepDayMutation(days = 1): { result: SimulationStepResult; topics: readonly DataTopic[] } {
  const inBatch = activeDayBatchSnapshot !== null;
  const snapshot = activeDayBatchSnapshot ?? takeDaySnapshot();
  try {
    const outcome = advanceTimeMutation(0, 0, days);
    if (inBatch) dayBatchCommittedDays += days;
    if (!outcome.topics.length) {
      // advanceTimeMutation returns empty topics only for non-positive deltas; stepDay is always 1 day.
      return {
        result: {
          tickCount: simulationContext.tickCount,
          year: simulationContext.currentYear,
          month: simulationContext.currentMonth,
          day: simulationContext.currentDay
        },
        topics: []
      };
    }
    return {
      result: {
        tickCount: simulationContext.tickCount,
        year: simulationContext.currentYear,
        month: simulationContext.currentMonth,
        day: simulationContext.currentDay
      },
      topics: outcome.topics
    };
  } catch (error) {
    restoreDaySnapshot(snapshot);
    throw error;
  }
}

/**
 * Legacy synchronous simulation implementation. WorldRuntime owns the commit
 * around this function; it must not await or perform renderer work directly.
 * Multi-day bulk advances share this path; one-day advances use `stepDayMutation`
 * which wraps it with snapshot rollback.
 */
function advanceTimeMutation(deltaYears: number, deltaMonths: number, deltaDays: number) {
  if (deltaYears <= 0 && deltaMonths <= 0 && deltaDays <= 0) {
    return { result: undefined, topics: [] as DataTopic[] };
  }

  const topics: DataTopic[] = ["simulation.clock"];
  const rngBefore: SimulationRngState | undefined = simulationContext.rng
    ? {
        algorithm: simulationContext.rng.algorithm,
        seed: simulationContext.rng.seed,
        state: [...simulationContext.rng.state] as [number, number, number, number],
        streams: structuredClone(simulationContext.rng.streams ?? {})
      }
    : undefined;

  // Reset all regiments' action status to waiting before resolving events for the new tick
  for (const state of worldContext.pack.states) {
    if (state.i && !state.removed && state.military) {
      for (const reg of state.military) {
        reg.actionStatus = "waiting";
      }
    }
  }

  const targetMonth = simulationContext.currentMonth + deltaMonths;
  const addedYearsFromMonths = Math.floor((targetMonth - 1) / 12);

  const oldYear = simulationContext.currentYear;
  simulationContext.currentMonth = ((targetMonth - 1) % 12) + 1;
  simulationContext.currentYear += deltaYears + addedYearsFromMonths;

  simulationContext.currentDay += deltaDays;
  let dim = getDaysInMonth(simulationContext.currentYear, simulationContext.currentMonth);

  // If we just advanced years/months and landed on an invalid day (e.g. Feb 29 on non-leap), clamp it.
  if (deltaDays === 0 && simulationContext.currentDay > dim) {
    simulationContext.currentDay = dim;
  }

  while (simulationContext.currentDay > dim) {
    simulationContext.currentDay -= dim;
    simulationContext.currentMonth++;
    if (simulationContext.currentMonth > 12) {
      simulationContext.currentMonth = 1;
      simulationContext.currentYear++;
    }
    dim = getDaysInMonth(simulationContext.currentYear, simulationContext.currentMonth);
  }
  simulationContext.tickCount += 1;
  // Live calendar lives only on simulationContext (P2-10). Do not mirror into
  // worldContext.options / Options UI — those hold generation starting values.
  updateWorldSeason();

  const actualYearsAdvanced = simulationContext.currentYear - oldYear;

  // Increase yearsAgo for all events in diplomacy history so their absolute year remains static
  const chronicle = worldContext.pack.states[0]?.diplomacy as unknown[] | undefined;
  if (chronicle && actualYearsAdvanced > 0) {
    for (const group of chronicle) {
      if (Array.isArray(group)) {
        for (const entry of group) {
          if (
            typeof entry === "object" &&
            entry !== null &&
            "yearsAgo" in entry &&
            typeof (entry as { yearsAgo: unknown }).yearsAgo === "number"
          ) {
            (entry as { yearsAgo: number }).yearsAgo += actualYearsAdvanced;
          }
        }
      }
    }
  }

  // Prefer day-based elapsed time so Advance Day / Month(~30.5d) / Year(~365d) share one scale.
  const effectiveDeltaDays = deltaYears * DAYS_PER_YEAR + deltaMonths * DAYS_PER_MONTH + deltaDays;
  const effectiveDeltaYears = effectiveDeltaDays / DAYS_PER_YEAR;

  const sim = useOptionsState.getState();

  // Rolling death tallies (Population Overview) — advance clock before deaths are recorded this tick
  advancePopulationLossClock(effectiveDeltaDays);

  // 1) Demographics (aging, births, migration, and carrying-capacity losses)
  let result: DemographicsSimulationResult = {
    bordersChanged: false,
    newBurgsAdded: false,
    routesAdded: false,
    promotedSettlements: []
  };
  if (sim.simDemographics) {
    topics.push("simulation.cells", "simulation.states", "simulation.burgs");
    // Fast-Forward (docs/plan/advance-time-fast-forward.md §4.3(a)): during a multi-day batch with
    // Fast-Forward enabled, replace the real cohort-aging/births/migration model with a flat
    // annual growth rate. isBulkTimeAdvance() is already defined above this point in the file (the
    // `bulkAdvance` local a few lines down hasn't been computed yet), so call it directly here.
    result = measureTickStep("core:demographics", () =>
      isFastAdvanceActive(isBulkTimeAdvance())
        ? applyFastForwardPopulation(effectiveDeltaYears, resolveFastAdvanceRates(), appServices.rng)
        : simulateDemographics(effectiveDeltaYears)
    );
  }

  if (result.bordersChanged) topics.push("map.politics");
  if (result.newBurgsAdded) topics.push("map.settlements");
  if (result.routesAdded) topics.push("map.networks");
  for (const settlement of result.promotedSettlements) {
    document.dispatchEvent(new CustomEvent("fmg:settlement-promoted", { detail: settlement }));
  }

  const portDevelopments = advancePortDevelopment(worldContext, simulationContext);
  if (portDevelopments.length) {
    topics.push("simulation.states", "map.settlements");
    if (portDevelopments.some(development => development.routeAdded)) topics.push("map.networks");
  }

  // 3) Manpower ledger: now owned by the "manpower.tick" SimulationSystem registered near the top
  // of this file — self-gated on an accumulated-day counter instead of running unconditionally
  // every day (docs/plan/advance-time-loop-reduction.md Phase 1).

  const bulkAdvance = isBulkTimeAdvance();
  const systemContextBase = {
    tick: simulationContext.tickCount,
    delta: { years: deltaYears, months: deltaMonths, days: deltaDays },
    isBulkAdvance: bulkAdvance
  };
  const executedSystems = timeTickSystems.run(
    // Placeholder rng is replaced per system inside runWithSystemRng.
    { ...systemContextBase, rng: appServices.rng },
    (system, writer) =>
      measureTickStep(system.profileLabel ?? `system:${system.id}`, () =>
        runWithSystemRng(
          simulationContext,
          {
            systemId: system.id,
            tick: systemContextBase.tick,
            year: simulationContext.currentYear,
            month: simulationContext.currentMonth,
            day: simulationContext.currentDay
          },
          appServices,
          rng => {
            const systemContext: SimulationStepContext = { ...systemContextBase, rng };
            system.run(systemContext, writer);
          }
        )
      )
  );
  topics.push(...executedSystems.flatMap(entry => entry.topics));

  // Fallback: if Nobility extension is disabled, run the core military movement here.
  // (If Nobility is enabled, it handles this internally with additional siege/capture logic).
  const isNobilityEnabled = window.fmg?.extensionAPI?.isExtensionEnabled("nobility");
  if (!isNobilityEnabled) {
    measureTickStep("core:militaryFallback", () => {
      if (sim.simMilitaryRecovery) {
        Military.updateDynamic(worldContext, effectiveDeltaYears);
      }
      // Loop-reduction Phase 1b (docs/plan/advance-time-loop-reduction.md): during a multi-day
      // fast-forward under player-directed conflict policy, the user is explicitly not resolving
      // turn-by-turn warfare, so regiments do not need to move/react for those days — this also
      // skips advanceAllRegimentMovement's route-graph rebuild, the dominant cost of this block.
      // Advance Day (isBulkAdvance === false) and autonomous-policy maps are unaffected.
      const skipMovement =
        bulkAdvance && normalizeConflictAutonomy(worldContext.options.conflictAutonomy) === "playerDirected";
      if (skipMovement) return;
      const regimentsMoved = advanceAllRegimentMovement(worldContext.pack, worldContext, effectiveDeltaYears);
      if (regimentsMoved) topics.push("simulation.military");
    });
  }

  // Persist the live simulation PRNG so archive capture / world.replace can resume it.
  syncSimulationRngToContext(simulationContext);
  if (!simulationRngStatesEqual(rngBefore, simulationContext.rng)) {
    topics.push("simulation.rng");
  }

  return { result: undefined, topics };
}

export function runTimeSimulation(targetDeltaYears: number, targetDeltaMonths: number, targetDeltaDays: number): void {
  const store = useTimeSimulationState.getState();
  if (store.isRunning) return;

  // Same calendar expansion as public advanceTime / headless SimulationRunner.advance.
  const totalDays = durationToCalendarDays(
    {
      year: simulationContext.currentYear,
      month: simulationContext.currentMonth,
      day: simulationContext.currentDay
    },
    { years: targetDeltaYears, months: targetDeltaMonths, days: targetDeltaDays }
  );

  if (totalDays <= 0) return;

  store.setSimulationProgress(0, totalDays);
  // Reset so the summary logTickProfile() prints at the end of this run reflects only this
  // Advance Day/Month/Year batch, not stats carried over from a previous run.
  resetTickProfile();

  let currentProgress = 0;

  // Batch the rollback snapshot across the whole asynchronous run instead of once per
  // frame/day — the chunked stepping below reuses this shared snapshot while
  // the batch is active.
  enterDayBatch(totalDays);

  const loop = () => {
    const chunkStartedAt = performance.now();
    const currentState = useTimeSimulationState.getState();
    if (currentState.stopRequested || currentProgress >= totalDays) {
      exitDayBatch();
      logTickProfile();
      currentState.clearSimulation();
      // isRunning is now false; let suppressed decorative draw hooks catch up.
      publishBulkRunFinishedRedraw();
      // One completion signal per Advance Day/Month/Year button click, whether it ran to
      // completion or was stopped early — see notifyAdvanceCompleted()'s doc-comment.
      if (currentProgress > 0) notifyAdvanceCompleted();
      return;
    }

    // Advance as many days as fit in one chunk instead of one day per task.
    // RenderCoordinator already coalesces commits into a single animation-frame
    // redraw (P1-2). Yielding through a timer rather than requestAnimationFrame
    // keeps long advances progressing when SVG rendering, a background tab, or
    // a temporarily busy compositor delays frames. notifyAfterDayStep's delta
    // parameter already documents tolerance for a multi-day report, and no
    // listener depends on deltaDays being exactly 1.
    let daysThisFrame = 0;
    try {
      while (
        currentProgress + daysThisFrame < totalDays &&
        daysThisFrame < MAX_DAYS_PER_FRAME &&
        performance.now() - chunkStartedAt < FRAME_BUDGET_MS
      ) {
        // 1 for an ordinary advance; a whole month at a time under history mode (§4).
        const days = nextStrideDays(totalDays - currentProgress - daysThisFrame);
        const commit = stepDaySimulation(days);
        if (!commit) break; // e.g. blocked by a concurrent world.generate dispatch.
        daysThisFrame += days;
      }
    } catch (error) {
      exitDayBatchAfterFailure();
      logTickProfile();
      // Otherwise isRunning (and suppressed decorative draw hooks) stay stuck
      // forever after a system throws — nothing else clears it on this path.
      useTimeSimulationState.getState().clearSimulation();
      publishBulkRunFinishedRedraw();
      throw error;
    }

    currentProgress += daysThisFrame;
    if (daysThisFrame > 0) notifyAfterDayStep(0, 0, daysThisFrame);
    useTimeSimulationState.getState().setSimulationProgress(currentProgress, totalDays);

    window.setTimeout(loop, 0);
  };

  window.setTimeout(loop, 0);
}
