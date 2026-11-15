import { worldSettings } from "./worldSettings";

/**
 * Share of a town's people who are in work, for the per-thousand craft table
 * (docs/plan/urban-craft-staffing.md §4.3, §5.1). The table is authored at the default; a world
 * scales it by share / default. Saved with the world; the Simulation settings tab edits it.
 */
export const CRAFT_EMPLOYMENT_SHARE_KEY = "fmg-craft-employment-share";

/** 1379-81 English urban poll-tax occupations read against the over-14 share of the population. */
export const DEFAULT_CRAFT_EMPLOYMENT_SHARE = 0.45;

export const CRAFT_EMPLOYMENT_SHARE_LIMITS = { min: 0.3, max: 0.6, step: 0.01 } as const;

function clampShare(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CRAFT_EMPLOYMENT_SHARE;
  return Math.max(CRAFT_EMPLOYMENT_SHARE_LIMITS.min, Math.min(CRAFT_EMPLOYMENT_SHARE_LIMITS.max, value));
}

export function getCraftEmploymentShare(): number {
  try {
    const stored = worldSettings.getItem(CRAFT_EMPLOYMENT_SHARE_KEY);
    if (stored !== null) return clampShare(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_CRAFT_EMPLOYMENT_SHARE;
}

export function setCraftEmploymentShare(value: number): number {
  const share = clampShare(value);
  worldSettings.setItem(CRAFT_EMPLOYMENT_SHARE_KEY, String(share));
  return share;
}

/** Multiplier on the per-thousand craft table for this world. */
export function getCraftEmploymentScale(): number {
  return getCraftEmploymentShare() / DEFAULT_CRAFT_EMPLOYMENT_SHARE;
}
