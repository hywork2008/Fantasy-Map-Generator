import { worldSettings } from "./worldSettings";

/**
 * Months of its own craft spending a town's workshops may owe its market's dealers (docs/plan/craft-book-credit.md).
 * Town trade ran on book credit reckoned at the quarter days (Lady Day, Midsummer, Michaelmas,
 * Christmas) and carried on from one reckoning to the next: three months is one quarter. 0 turns
 * the credit off: a town makes only what its purse pays for. Saved with the world; the Simulation
 * settings tab edits it.
 */
export const CRAFT_CREDIT_KEY = "fmg-craft-credit-months";

export const DEFAULT_CRAFT_CREDIT_MONTHS = 3;

export const CRAFT_CREDIT_MONTHS_LIMITS = { min: 0, max: 12, step: 0.5 } as const;

function clampMonths(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CRAFT_CREDIT_MONTHS;
  return Math.max(CRAFT_CREDIT_MONTHS_LIMITS.min, Math.min(CRAFT_CREDIT_MONTHS_LIMITS.max, value));
}

export function getCraftCreditMonths(): number {
  try {
    const stored = worldSettings.getItem(CRAFT_CREDIT_KEY);
    if (stored !== null) return clampMonths(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_CRAFT_CREDIT_MONTHS;
}

export function setCraftCreditMonths(value: number): number {
  const months = clampMonths(value);
  worldSettings.setItem(CRAFT_CREDIT_KEY, String(months));
  return months;
}
