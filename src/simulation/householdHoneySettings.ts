import { worldSettings } from "./worldSettings";

/**
 * Honey a person eats in a year, town or country (docs/plan/honey-forage-lands.md §6). Honey was
 * the everyday sweetener before sugar: Crane guessed about 2 kg a head for medieval England, a
 * gentry household of 1412-13 used 0.3 kg with sugar on its table. The rest of the harvest is left
 * for mead, vinegar and medicines. 0 turns household honey off. Saved with the
 * world; the Simulation settings tab edits it.
 */
export const HOUSEHOLD_HONEY_KEY = "fmg-household-honey-kg";

export const DEFAULT_HOUSEHOLD_HONEY_KG = 1;

export const HOUSEHOLD_HONEY_KG_LIMITS = { min: 0, max: 3, step: 0.1 } as const;

function clampKilograms(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_HOUSEHOLD_HONEY_KG;
  return Math.max(HOUSEHOLD_HONEY_KG_LIMITS.min, Math.min(HOUSEHOLD_HONEY_KG_LIMITS.max, value));
}

export function getHouseholdHoneyKilograms(): number {
  try {
    const stored = worldSettings.getItem(HOUSEHOLD_HONEY_KEY);
    if (stored !== null) return clampKilograms(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_HOUSEHOLD_HONEY_KG;
}

export function setHouseholdHoneyKilograms(value: number): number {
  const kilograms = clampKilograms(value);
  worldSettings.setItem(HOUSEHOLD_HONEY_KEY, String(kilograms));
  return kilograms;
}
