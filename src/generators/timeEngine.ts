import { appServices, restoreRngFromSimulation } from "../context/appServices";
import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import {
  runWithSystemRng,
  type SimulationRngState,
  simulationRngStatesEqual,
  syncSimulationRngToContext
} from "../runtime/simulationRng";
import {
  advanceSimulation,
  type DataTopic,
  registerSimulationAdvanceHandler,
  registerSimulationStepDayHandler,
  type SimulationStepResult
} from "../runtime/worldRuntime";
import { telemetry } from "../services/simulationTelemetry";
import { useDebugSnapshotState } from "../store/debugSnapshotState";
import { useOptionsState } from "../store/optionsState";
import { useTimeSimulationState } from "../store/timeSimulationState";
import { captureSnapshotData } from "../utils/aiDebugExporter";
import { getDaysInMonth, getSeason, isLeapYear } from "../utils/seasonUtils";
import { tickAgriculturalCalendar } from "./agriculturalStress";
import { simulateDemographics } from "./demography-simulator";
import { tickManpower } from "./manpower";
import { Military } from "./military-generator";
import { advancePopulationLossClock, resetPopulationLossTracker } from "./populationLossTracker";
import { advanceAllRegimentMovement } from "./regimentMovement";
import { createSimulationSystemRegistry, type SimulationStepContext, type SimulationSystem } from "./simulationSystem";
import { logTickProfile, measureTickStep, resetTickProfile } from "./tickProfiler";

/** Day is the base simulation unit. Month/Year UI buttons expand to ~this many days. */
const DAYS_PER_YEAR = 365.2425;
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12; // ≈ 30.436875

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
 * Re-reads currentYear/era from worldContext.options without touching tickCount.
 * Called from src/controllers/options.ts whenever the user edits Year/Era in the
 * Options Generation tab post-generation, so simulationContext (the live clock
 * advanceTime() actually mutates) doesn't drift from the mirror in worldContext.options.
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
 * Resets the simulation clock from the current map's generated year/era.
 * Called once from main.ts after core map generation completes.
 */
export function initSimulationClock(): void {
  syncSimulationClockFromOptions();
  simulationContext.tickCount = 0;
  simulationContext.intelligence = {};
  simulationContext.strategicGoals = {};
  simulationContext.navalTechBonus = {};
  resetPopulationLossTracker();
}

/**
 * Advances the world's simulation clock by deltaYears, runs every registered tick
 * hook, then dispatches fmg:time-advanced. Mirrors the new year into
 * worldContext.options.year so existing readers (military-generator.ts,
 * states-generator.ts, markers-generator.ts, battle-screen.ts) keep working unchanged.
 */
export function advanceTime(deltaYears: number, deltaMonths = 0, deltaDays = 0): void {
  const commit = advanceSimulation({ deltaYears, deltaMonths, deltaDays });
  if (!commit) return;

  // These observers run after the mutation has one revision and renderer
  // subscribers have seen its complete change set.
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

  if (import.meta.env.DEV) {
    useDebugSnapshotState.getState().addSnapshot({
      tickCount: simulationContext.tickCount,
      year: simulationContext.currentYear,
      label: `Advance Time +${deltaYears}`,
      data: captureSnapshotData()
    });
  }
}

/**
 * Snapshot of live simulation + pack taken before a `simulation.stepDay` mutation.
 * On system failure the day is restored and no revision is published.
 */
interface DaySnapshot {
  readonly simulation: SimulationContext;
  readonly pack: unknown;
  readonly options: { readonly year: number; readonly month: number; readonly day: number };
  readonly rng: SimulationRngState | null;
}

function takeDaySnapshot(): DaySnapshot {
  syncSimulationRngToContext(simulationContext);
  return {
    simulation: structuredClone(simulationContext),
    pack: structuredClone(worldContext.pack),
    options: {
      year: worldContext.options.year ?? 0,
      month: worldContext.options.month ?? 1,
      day: worldContext.options.day ?? 1
    },
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

  worldContext.options.year = snapshot.options.year;
  worldContext.options.month = snapshot.options.month;
  worldContext.options.day = snapshot.options.day;
  useOptionsState.getState().setOption("year", snapshot.options.year);

  if (snapshot.rng) {
    simulationContext.rng = snapshot.rng;
    const seed =
      typeof worldContext.seed === "string" && worldContext.seed.length > 0 ? worldContext.seed : snapshot.rng.seed;
    restoreRngFromSimulation(seed, simulationContext);
  }
}

/**
 * Canonical one-day command body. Snapshots before mutation so a throwing system
 * rolls back the day without publishing a revision (plan §5.2 / §6).
 */
function stepDayMutation(): { result: SimulationStepResult; topics: readonly DataTopic[] } {
  const snapshot = takeDaySnapshot();
  try {
    const outcome = advanceTimeMutation(0, 0, 1);
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
  worldContext.options.year = simulationContext.currentYear;
  // Also save month and day to options so they are persisted across loads
  worldContext.options.month = simulationContext.currentMonth;
  worldContext.options.day = simulationContext.currentDay;
  updateWorldSeason();

  useOptionsState.getState().setOption("year", simulationContext.currentYear);
  // Ideally useOptionsState should set month and day too, but keeping minimal changes here

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

  // 1) Agricultural calendar (spring/autumn war exposure → foodStress on year roll)
  if (sim.simAgriculture && worldContext.pack?.states) {
    topics.push("simulation.cells", "simulation.states");
    measureTickStep("core:agriculturalStress", () =>
      tickAgriculturalCalendar(
        worldContext.pack,
        effectiveDeltaDays,
        simulationContext.currentYear,
        simulationContext.currentMonth
      )
    );
  }

  // 2) Demographics (aging/births + optional famine from foodStress)
  let result = { bordersChanged: false, newBurgsAdded: false };
  if (sim.simDemographics) {
    topics.push("simulation.cells", "simulation.states", "simulation.burgs");
    result = measureTickStep("core:demographics", () => simulateDemographics(effectiveDeltaYears));
  }

  if (result.bordersChanged) topics.push("map.politics");
  if (result.newBurgsAdded) topics.push("map.settlements");

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

  // Shared day-count rules with the headless SimulationRunner (durationToCalendarDays).
  const totalDays =
    // Inline the calendar expansion so UI keeps working even if the runner module is tree-shaken
    // in a future split. Semantics must stay aligned with runtime/simulationRunner.ts.
    (() => {
      let y = simulationContext.currentYear;
      let m = simulationContext.currentMonth;
      let days = 0;
      for (let i = 0; i < targetDeltaYears; i++) {
        days += isLeapYear(y) ? 366 : 365;
        y++;
      }
      for (let i = 0; i < targetDeltaMonths; i++) {
        days += getDaysInMonth(y, m);
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }
      return days + targetDeltaDays;
    })();

  if (totalDays <= 0) return;

  store.setSimulationProgress(0, totalDays);
  // Reset so the summary logTickProfile() prints at the end of this run reflects only this
  // Advance Day/Month/Year batch, not stats carried over from a previous run.
  resetTickProfile();

  let currentProgress = 0;

  const loop = () => {
    const currentState = useTimeSimulationState.getState();
    if (currentState.stopRequested || currentProgress >= totalDays) {
      logTickProfile();
      currentState.clearSimulation();
      return;
    }

    // Legacy daily path: one day per frame so the UI can paint progress / accept cancel.
    // Headless callers should use runtime/simulationRunner.runLegacyDaily instead.
    advanceTime(0, 0, 1);
    currentProgress++;
    useTimeSimulationState.getState().setSimulationProgress(currentProgress, totalDays);

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}
