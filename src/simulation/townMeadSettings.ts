import { worldSettings } from "./worldSettings";

/**
 * Mead a town adult drinks in a year outside the wine country (docs/plan/mead.md §3). Muscovite
 * tavern farms of the 1620s sold about 4.4 L of mead a year to each tavern customer, half of the
 * townsfolk, against 79 L of beer (Liseitsev 2020), and the author reads the farms as understating
 * by up to 1.5 times: about 5 L an adult. Country people made theirs at home from their own honey,
 * within the household honey. 0 turns town mead off. Saved with the world; the Simulation settings
 * tab edits it.
 */
export const TOWN_MEAD_KEY = "fmg-town-mead-liters";

export const DEFAULT_TOWN_MEAD_LITERS = 5;

export const TOWN_MEAD_LITERS_LIMITS = { min: 0, max: 30, step: 0.5 } as const;

function clampLiters(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TOWN_MEAD_LITERS;
  return Math.max(TOWN_MEAD_LITERS_LIMITS.min, Math.min(TOWN_MEAD_LITERS_LIMITS.max, value));
}

export function getTownMeadLiters(): number {
  try {
    const stored = worldSettings.getItem(TOWN_MEAD_KEY);
    if (stored !== null) return clampLiters(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_TOWN_MEAD_LITERS;
}

export function setTownMeadLiters(value: number): number {
  const liters = clampLiters(value);
  worldSettings.setItem(TOWN_MEAD_KEY, String(liters));
  return liters;
}
