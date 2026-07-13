import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import {
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  MilitaryRenderer,
  StateLabelsRenderer
} from "../renderers";
import { useDebugSnapshotState } from "../store/debugSnapshotState";
import { useOptionsState } from "../store/optionsState";
import { useTimeSimulationState } from "../store/timeSimulationState";
import { captureSnapshotData } from "../utils/aiDebugExporter";
import { layerIsOn } from "../utils/nodeUtils";
import { getDaysInMonth, getSeason, isLeapYear } from "../utils/seasonUtils";
import { tickAgriculturalCalendar } from "./agriculturalStress";
import { simulateDemographics } from "./demography-simulator";
import { tickManpower } from "./manpower";
import { Military } from "./military-generator";
import { advancePopulationLossClock, resetPopulationLossTracker } from "./populationLossTracker";
import { advanceAllRegimentMovement } from "./regimentMovement";

/** Day is the base simulation unit. Month/Year UI buttons expand to ~this many days. */
const DAYS_PER_YEAR = 365.2425;
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12; // ≈ 30.436875

export type TimeTickHook = (deltaYears: number, deltaMonths: number, deltaDays: number) => void;

const _tickHooks: TimeTickHook[] = [];

/**
 * Register a hook called on every advanceTime() call. Extensions use this via
 * ExtensionAPI.registerTimeTickHook() to run their own per-tick simulation logic
 * (e.g. ship production, forest regrowth). Hooks are permanent for the session —
 * gate extension-specific behavior with api.isExtensionEnabled() inside the hook.
 */
export function registerTimeTickHook(fn: TimeTickHook): void {
  _tickHooks.push(fn);
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
  resetPopulationLossTracker();
}

/**
 * Advances the world's simulation clock by deltaYears, runs every registered tick
 * hook, then dispatches fmg:time-advanced. Mirrors the new year into
 * worldContext.options.year so existing readers (military-generator.ts,
 * states-generator.ts, markers-generator.ts, battle-screen.ts) keep working unchanged.
 */
export function advanceTime(deltaYears: number, deltaMonths = 0, deltaDays = 0): void {
  if (deltaYears <= 0 && deltaMonths <= 0 && deltaDays <= 0) return;

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
    tickAgriculturalCalendar(
      worldContext.pack,
      effectiveDeltaDays,
      simulationContext.currentYear,
      simulationContext.currentMonth
    );
  }

  // 2) Demographics (aging/births + optional famine from foodStress)
  let result = { bordersChanged: false, newBurgsAdded: false };
  if (sim.simDemographics) {
    result = simulateDemographics(effectiveDeltaYears);
  }

  if (result.bordersChanged) {
    BordersRenderer.render(worldContext, viewContext, appServices);
    StateLabelsRenderer.render(worldContext, viewContext, appServices);
  }

  if (result.newBurgsAdded) {
    BurgIconsRenderer.render(worldContext, viewContext, appServices);
    BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  }

  // 3) Manpower ledger: draft capacity + fill/demobilize from civilian males
  if (sim.simManpower && worldContext.pack?.states) {
    tickManpower(worldContext.pack, effectiveDeltaYears, worldContext.populationRate);
  }

  for (const hook of _tickHooks) hook(deltaYears, deltaMonths, deltaDays);

  // Fallback: if Nobility extension is disabled, run the core military movement here.
  // (If Nobility is enabled, it handles this internally with additional siege/capture logic).
  const isNobilityEnabled = window.fmg?.extensionAPI?.isExtensionEnabled("nobility");
  if (!isNobilityEnabled) {
    if (sim.simMilitaryRecovery) {
      Military.updateDynamic(worldContext, effectiveDeltaYears);
    }
    const regimentsMoved = advanceAllRegimentMovement(worldContext.pack, worldContext, effectiveDeltaYears);
    if (regimentsMoved && layerIsOn("toggleMilitary")) {
      MilitaryRenderer.render(worldContext, viewContext, appServices);
    }
  }

  document.dispatchEvent(
    new CustomEvent("fmg:time-advanced", {
      detail: { deltaYears, deltaMonths, deltaDays, currentYear: simulationContext.currentYear }
    })
  );
  dispatchSimulationUpdated();

  if (import.meta.env.DEV) {
    useDebugSnapshotState.getState().addSnapshot({
      tickCount: simulationContext.tickCount,
      year: simulationContext.currentYear,
      label: `Advance Time +${deltaYears}`,
      data: captureSnapshotData()
    });
  }
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

  let currentProgress = 0;

  const loop = () => {
    const currentState = useTimeSimulationState.getState();
    if (currentState.stopRequested || currentProgress >= totalDays) {
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
