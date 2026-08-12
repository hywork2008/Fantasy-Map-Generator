import { appServices, restoreRngFromSimulation } from "../context/appServices";
import {
  createEmptyFrontierSimulationState,
  createEmptyWildernessEcologyState,
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
import { useOptionsState } from "../store/optionsState";
import { useTimeSimulationState } from "../store/timeSimulationState";
import { captureSnapshotData, debugSnapshotsEnabled } from "../utils/aiDebugExporter";
import { getDaysInMonth, getSeason } from "../utils/seasonUtils";
import { type DemographicsSimulationResult, simulateDemographics } from "./demography-simulator";
import { advanceDungeonEcology } from "./dungeonEcology";
import { advanceFrontierExpansion } from "./frontierExpansion";
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
import { advanceWildernessEcology } from "./wildernessEcology";

/** Day is the base simulation unit. Month/Year UI buttons expand to ~this many days. */
const DAYS_PER_YEAR = 365.2425;
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12; // ≈ 30.436875

/**
 * Per-frame budget for `runTimeSimulation`'s rAF loop, in wall-clock ms. Days
 * are stepped in a tight loop until either this budget or MAX_DAYS_PER_FRAME
 * is hit, then the frame yields (progress update, cancel check, one redraw).
 * Leaves headroom under the ~16.6ms frame for the browser's own paint work.
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
let nextLegacyHookId = 0;
const legacyHookIds: string[] = [];

registerSimulationAdvanceHandler(({ deltaYears, deltaMonths, deltaDays }) =>
  advanceTimeMutation(deltaYears, deltaMonths, deltaDays)
);

registerSimulationStepDayHandler(() => stepDayMutation());

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

// Frontier projects are host-owned politics work. The module's annual guard
// keeps this registered daily system cheap while making Advance Day/Month/Year
// share identical calendar-boundary semantics.
registerSimulationSystem({
  id: "frontier-expansion.tick",
  phase: "politics",
  reads: ["map.politics", "simulation.cells", "simulation.states"],
  writes: ["simulation.cells", "simulation.states", "map.politics", "map.settlements"],
  cadence: { every: 1 },
  profileLabel: "frontierExpansion",
  run: (context, writer) => {
    const result = advanceFrontierExpansion({
      world: worldContext,
      simulation: simulationContext,
      rng: context.rng
    });
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
 * *day* (or per rAF frame's chunk of days for the UI loop), which is too fine-grained for
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

  // Batch the rollback snapshot across the whole run instead of once per day.
  enterDayBatch();
  let failed = false;
  try {
    for (let i = 0; i < totalDays; i++) {
      const commit = stepDaySimulation();
      if (!commit) return;
      // Always report a one-day delta so listeners match the UI daily path.
      notifyAfterDayStep(0, 0, 1);
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

function enterDayBatch(): void {
  dayBatchDepth++;
  if (dayBatchDepth === 1) {
    activeDayBatchSnapshot = takeDaySnapshot();
    dayBatchCommittedDays = 0;
  }
}

function exitDayBatch(): void {
  dayBatchDepth = Math.max(0, dayBatchDepth - 1);
  if (dayBatchDepth === 0) activeDayBatchSnapshot = null;
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
  exitAfterFailure: exitDayBatchAfterFailure
});

/**
 * Canonical one-day command body. Snapshots before mutation so a throwing system
 * rolls back the day without publishing a revision (plan §5.2 / §6). Reuses the
 * active batch snapshot (see above) when called as part of a multi-day run.
 */
function stepDayMutation(): { result: SimulationStepResult; topics: readonly DataTopic[] } {
  const inBatch = activeDayBatchSnapshot !== null;
  const snapshot = activeDayBatchSnapshot ?? takeDaySnapshot();
  try {
    const outcome = advanceTimeMutation(0, 0, 1);
    if (inBatch) dayBatchCommittedDays++;
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
    result = measureTickStep("core:demographics", () => simulateDemographics(effectiveDeltaYears));
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

  // 3) Manpower ledger: draft capacity + fill/demobilize from civilian males
  if (sim.simManpower && worldContext.pack?.states) {
    topics.push("simulation.states", "simulation.military");
    measureTickStep("core:manpower", () =>
      tickManpower(worldContext.pack, effectiveDeltaYears, worldContext.populationRate)
    );
  }

  const systemContextBase = {
    tick: simulationContext.tickCount,
    delta: { years: deltaYears, months: deltaMonths, days: deltaDays }
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

  // Batch the rollback snapshot across the whole rAF run instead of once per
  // frame/day — the chunked stepping below reuses this shared snapshot while
  // the batch is active.
  enterDayBatch();

  const loop = () => {
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

    // Advance as many days as fit in one frame's time budget instead of one
    // day per frame. RenderCoordinator already coalesces every commit that
    // lands in the same animation frame into a single redraw (P1-2); stepping
    // a whole chunk of days before yielding just gives it more than one
    // commit per frame to coalesce, so Trade animation / Military icons /
    // WebGL projection / 3D scene updates redraw once per chunk instead of
    // once per day. notifyAfterDayStep's delta parameter already documents
    // tolerance for a multi-day report, and no listener depends on deltaDays
    // being exactly 1 (they just re-read current state on the event).
    const frameStart = performance.now();
    let daysThisFrame = 0;
    try {
      while (
        currentProgress + daysThisFrame < totalDays &&
        daysThisFrame < MAX_DAYS_PER_FRAME &&
        performance.now() - frameStart < FRAME_BUDGET_MS
      ) {
        const commit = stepDaySimulation();
        if (!commit) break; // e.g. blocked by a concurrent world.generate dispatch.
        daysThisFrame++;
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

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}
