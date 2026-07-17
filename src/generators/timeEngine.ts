import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { type DataTopic, legacyMutation } from "../runtime/worldRuntime";
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

export type TimeTickHook = (deltaYears: number, deltaMonths: number, deltaDays: number) => void;
const timeTickSystems = createSimulationSystemRegistry();
let nextLegacyHookId = 0;
const legacyHookIds: string[] = [];

/**
 * Compatibility registration for the old hook API. The hook becomes a
 * phase-aware system while retaining registration order and "once per
 * advanceTime call" semantics. Like the previous API, compatibility hooks
 * remain registered for the session. New systems should declare their reads
 * and writes with registerSimulationSystem().
 */
export function registerTimeTickHook(fn: TimeTickHook, label = "unlabeled", writes?: readonly DataTopic[]): void {
  const previousId = legacyHookIds.at(-1);
  const id = `legacy-hook:${nextLegacyHookId++}`;
  timeTickSystems.register({
    id,
    phase: "politics",
    reads: [],
    writes: writes?.length ? [...new Set(writes)] : [label === "unlabeled" ? "extension.legacy" : `extension.${label}`],
    after: previousId ? [previousId] : undefined,
    cadence: { every: 1 },
    profileLabel: `hook:${label}`,
    run: context => fn(context.delta.years, context.delta.months, context.delta.days)
  });
  legacyHookIds.push(id);
}

/** Registers a synchronous, DOM-free simulation system for legacy ticks. */
export function registerSimulationSystem(system: SimulationSystem): () => void {
  return timeTickSystems.register(system);
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
  resetPopulationLossTracker();
}

/**
 * Advances the world's simulation clock by deltaYears, runs every registered tick
 * hook, then dispatches fmg:time-advanced. Mirrors the new year into
 * worldContext.options.year so existing readers (military-generator.ts,
 * states-generator.ts, markers-generator.ts, battle-screen.ts) keep working unchanged.
 */
export function advanceTime(deltaYears: number, deltaMonths = 0, deltaDays = 0): void {
  const commit = legacyMutation(() => advanceTimeMutation(deltaYears, deltaMonths, deltaDays));
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
 * Legacy synchronous simulation implementation. WorldRuntime owns the commit
 * around this function; it must not await or perform renderer work directly.
 */
function advanceTimeMutation(deltaYears: number, deltaMonths: number, deltaDays: number) {
  if (deltaYears <= 0 && deltaMonths <= 0 && deltaDays <= 0) {
    return { result: undefined, topics: [] };
  }

  const topics: DataTopic[] = ["simulation.clock", "simulation.military"];

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
  const chronicle = worldContext.pack.states[0].diplomacy as unknown[];
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

  const systemContext: SimulationStepContext = {
    tick: simulationContext.tickCount,
    delta: { years: deltaYears, months: deltaMonths, days: deltaDays }
  };
  const executedSystems = timeTickSystems.run(systemContext, system =>
    measureTickStep(system.profileLabel ?? `system:${system.id}`, () => system.run(systemContext))
  );
  topics.push(...executedSystems.flatMap(system => system.writes));

  // Fallback: if Nobility extension is disabled, run the core military movement here.
  // (If Nobility is enabled, it handles this internally with additional siege/capture logic).
  const isNobilityEnabled = window.fmg?.extensionAPI?.isExtensionEnabled("nobility");
  if (!isNobilityEnabled) {
    measureTickStep("core:militaryFallback", () => {
      if (sim.simMilitaryRecovery) {
        Military.updateDynamic(worldContext, effectiveDeltaYears);
      }
      advanceAllRegimentMovement(worldContext.pack, worldContext, effectiveDeltaYears);
    });
  }

  return { result: undefined, topics };
}

export function runTimeSimulation(targetDeltaYears: number, targetDeltaMonths: number, targetDeltaDays: number): void {
  const store = useTimeSimulationState.getState();
  if (store.isRunning) return;

  let y = simulationContext.currentYear;
  let m = simulationContext.currentMonth;
  let totalDays = 0;

  for (let i = 0; i < targetDeltaYears; i++) {
    totalDays += isLeapYear(y) ? 366 : 365;
    y++;
  }
  for (let i = 0; i < targetDeltaMonths; i++) {
    totalDays += getDaysInMonth(y, m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  totalDays += targetDeltaDays;

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

    // Advance 1 day per tick
    advanceTime(0, 0, 1);
    currentProgress++;
    useTimeSimulationState.getState().setSimulationProgress(currentProgress, totalDays);

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}
