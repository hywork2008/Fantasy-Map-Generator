import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { BordersRenderer, BurgIconsRenderer, BurgLabelsRenderer, StateLabelsRenderer } from "../renderers";
import { useDebugSnapshotState } from "../store/debugSnapshotState";
import { useOptionsState } from "../store/optionsState";
import { captureSnapshotData } from "../utils/aiDebugExporter";
import { simulateDemographics } from "./demography-simulator";

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
  dispatchSimulationUpdated();
}

/**
 * Resets the simulation clock from the current map's generated year/era.
 * Called once from main.ts after core map generation completes.
 */
export function initSimulationClock(): void {
  syncSimulationClockFromOptions();
  simulationContext.tickCount = 0;
}

/**
 * Advances the world's simulation clock by deltaYears, runs every registered tick
 * hook, then dispatches fmg:time-advanced. Mirrors the new year into
 * worldContext.options.year so existing readers (military-generator.ts,
 * states-generator.ts, markers-generator.ts, battle-screen.ts) keep working unchanged.
 */
export function advanceTime(deltaYears: number, deltaMonths = 0, deltaDays = 0): void {
  if (deltaYears <= 0 && deltaMonths <= 0 && deltaDays <= 0) return;

  simulationContext.currentDay += deltaDays;
  while (simulationContext.currentDay > 30) {
    simulationContext.currentDay -= 30;
    deltaMonths++;
  }

  simulationContext.currentMonth += deltaMonths;
  while (simulationContext.currentMonth > 12) {
    simulationContext.currentMonth -= 12;
    deltaYears++;
  }

  simulationContext.currentYear += deltaYears;
  simulationContext.tickCount += 1;
  worldContext.options.year = simulationContext.currentYear;
  // Also save month and day to options so they are persisted across loads
  worldContext.options.month = simulationContext.currentMonth;
  worldContext.options.day = simulationContext.currentDay;

  useOptionsState.getState().setOption("year", simulationContext.currentYear);
  // Ideally useOptionsState should set month and day too, but keeping minimal changes here

  // Increase yearsAgo for all events in diplomacy history so their absolute year remains static
  const chronicle = worldContext.pack.states[0].diplomacy as unknown[];
  if (chronicle) {
    for (const group of chronicle) {
      if (Array.isArray(group)) {
        for (const entry of group) {
          if (
            typeof entry === "object" &&
            entry !== null &&
            "yearsAgo" in entry &&
            typeof (entry as { yearsAgo: unknown }).yearsAgo === "number"
          ) {
            (entry as { yearsAgo: number }).yearsAgo += deltaYears;
          }
        }
      }
    }
  }

  const result = simulateDemographics(deltaYears);

  if (result.bordersChanged) {
    BordersRenderer.render(worldContext, viewContext, appServices);
    StateLabelsRenderer.render(worldContext, viewContext, appServices);
  }

  if (result.newBurgsAdded) {
    BurgIconsRenderer.render(worldContext, viewContext, appServices);
    BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  }

  for (const hook of _tickHooks) hook(deltaYears, deltaMonths, deltaDays);

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
