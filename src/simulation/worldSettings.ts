import { type SimulationContext, simulationContext } from "../context/simulationContext";
import { simulationSettings } from "./ports";

/**
 * World-scoped simulation settings (docs/plan/simulation-core-separation.md §16.3, §18).
 *
 * These settings change simulation results, so they belong to the world and are saved in the .fmg
 * (`simulation.worldSettings`), not only in the browser. The browser value remains the default for
 * a newly generated world, and the fallback for an archive saved before this field existed.
 *
 * Once a world has `worldSettings`, a missing key means "the code default" — the browser is no
 * longer consulted for that world, so the same .fmg runs the same way in any browser or in Node.
 */
export const WORLD_SETTING_KEYS = [
  /** Caravan land/sea/river speeds, sea current, wind and grade effect (economy caravanMovement). */
  "caravan-movement",
  /** Grade effect strength shared by caravans and military marches. */
  "fmg-grade-effect-strength",
  /** Merchant route preference (speed vs. avoiding hard passes). */
  "fmg-merchant-route-preference",
  /** Trade logistics: load targets, maximum waiting days, sailing days. */
  "fmg-trade-logistics-settings",
  /** "on": town luxury demand by budget and price tier (docs/plan/luxury-value-demand.md §3). */
  "fmg-luxury-value-demand",
  /** "on": the mint issues real coin and prices follow the money stock (docs/plan/money-supply-mint.md §4.1, §4.3). */
  "fmg-money-supply"
] as const;

export type WorldSettingKey = (typeof WORLD_SETTING_KEYS)[number];

/** Snapshot of the host's current values (the defaults a new world starts from). */
export function captureHostWorldSettings(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of WORLD_SETTING_KEYS) {
    try {
      const value = simulationSettings.getItem(key);
      if (value !== null) values[key] = value;
    } catch {
      // Blocked storage: the code defaults apply.
    }
  }
  return values;
}

/** Gives a world without saved settings (new map, older archive) the host's current values. */
export function materializeWorldSettings(simulation: SimulationContext = simulationContext): void {
  if (simulation.worldSettings === undefined) simulation.worldSettings = captureHostWorldSettings();
}

/**
 * Values a newly generated world starts with when the host has none. Worlds saved before a key
 * existed keep the code default (absent), so turning a behaviour on for new maps leaves old saves
 * running as they did.
 */
export const NEW_WORLD_SETTING_DEFAULTS: Readonly<Partial<Record<WorldSettingKey, string>>> = {
  "fmg-luxury-value-demand": "on"
};

/** Starts a newly generated world from the host's current values. */
export function resetWorldSettingsFromHost(simulation: SimulationContext = simulationContext): void {
  simulation.worldSettings = { ...NEW_WORLD_SETTING_DEFAULTS, ...captureHostWorldSettings() };
}

/** Same contract as `localStorage`, scoped to the live world. */
export const worldSettings = {
  getItem(key: WorldSettingKey): string | null {
    const values = simulationContext.worldSettings;
    if (values === undefined) return simulationSettings.getItem(key);
    return Object.hasOwn(values, key) ? values[key] : null;
  },
  /** Writes the world's value and remembers it in the host as the default for new worlds. */
  setItem(key: WorldSettingKey, value: string): void {
    materializeWorldSettings();
    (simulationContext.worldSettings as Record<string, string>)[key] = value;
    simulationSettings.setItem(key, value);
  }
};
