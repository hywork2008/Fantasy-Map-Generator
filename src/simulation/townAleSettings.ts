import { worldSettings } from "./worldSettings";

/**
 * Woodland share of a market's land from which its towns drink the full town ale
 * (docs/plan/low-habitability-site-bonus.md §4). Below it, town ale falls linearly to the
 * country level: treeless pastoral lands drank whey and buttermilk ("bland", "blanda") and kept
 * ale for feasts. 0 turns the reduction off. Saved with the world; the Simulation settings tab
 * edits it.
 */
export const TREELESS_TOWN_ALE_KEY = "fmg-treeless-town-ale-woodland";

/** Iceland, Orkney, Shetland and the Hebrides lay near 0%; ale-drinking Scotland near 4% woodland. */
export const DEFAULT_TREELESS_TOWN_ALE_WOODLAND = 0.05;

export const TREELESS_TOWN_ALE_WOODLAND_LIMITS = { min: 0, max: 0.3, step: 0.01 } as const;

function clampShare(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TREELESS_TOWN_ALE_WOODLAND;
  return Math.max(TREELESS_TOWN_ALE_WOODLAND_LIMITS.min, Math.min(TREELESS_TOWN_ALE_WOODLAND_LIMITS.max, value));
}

export function getTreelessTownAleWoodland(): number {
  try {
    const stored = worldSettings.getItem(TREELESS_TOWN_ALE_KEY);
    if (stored !== null) return clampShare(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_TREELESS_TOWN_ALE_WOODLAND;
}

export function setTreelessTownAleWoodland(value: number): number {
  const share = clampShare(value);
  worldSettings.setItem(TREELESS_TOWN_ALE_KEY, String(share));
  return share;
}
