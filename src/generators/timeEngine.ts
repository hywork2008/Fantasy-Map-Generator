import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { BordersRenderer, BurgIconsRenderer, BurgLabelsRenderer, StateLabelsRenderer } from "../renderers";
import { simulateDemographics } from "./demography-simulator";

export type TimeTickHook = (deltaYears: number) => void;

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
      detail: { currentYear: simulationContext.currentYear, era: simulationContext.era }
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
export function advanceTime(deltaYears: number): void {
  if (deltaYears <= 0) return;

  simulationContext.currentYear += deltaYears;
  simulationContext.tickCount += 1;
  worldContext.options.year = simulationContext.currentYear;

  const result = simulateDemographics(deltaYears);

  if (result.bordersChanged) {
    BordersRenderer.render(worldContext, viewContext, appServices);
    StateLabelsRenderer.render(worldContext, viewContext, appServices);
  }

  if (result.newBurgsAdded) {
    BurgIconsRenderer.render(worldContext, viewContext, appServices);
    BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  }

  for (const hook of _tickHooks) hook(deltaYears);

  document.dispatchEvent(
    new CustomEvent("fmg:time-advanced", {
      detail: { deltaYears, currentYear: simulationContext.currentYear }
    })
  );
  dispatchSimulationUpdated();
}
