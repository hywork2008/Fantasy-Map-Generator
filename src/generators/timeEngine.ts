import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";

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
 * Resets the simulation clock from the current map's generated year/era.
 * Called once from main.ts after core map generation completes.
 */
export function initSimulationClock(): void {
  simulationContext.currentYear = worldContext.options.year ?? 0;
  simulationContext.era = worldContext.options.era ?? "";
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

  for (const hook of _tickHooks) hook(deltaYears);

  document.dispatchEvent(
    new CustomEvent("fmg:time-advanced", {
      detail: { deltaYears, currentYear: simulationContext.currentYear }
    })
  );
}
