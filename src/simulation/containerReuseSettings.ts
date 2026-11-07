import { worldSettings } from "./worldSettings";

/**
 * What refilling an empty cask, pot or bottle costs, as a share of a new one's value: washing,
 * scalding and the cooper's small mends (docs/plan/returnable-drink-containers.md §3). A brewer's
 * broad-cooper cleaned the butts and carried them into the victuallers' cellars for a weekly wage
 * (Pryor 2015); a modern brewery puts cleaning at about 2% of a new cask. The containers lost on a
 * trip are the recipe's, not this. Saved with the world; the Simulation settings tab edits it.
 */
export const CONTAINER_REUSE_COST_KEY = "fmg-container-reuse-cost";

export const DEFAULT_CONTAINER_REUSE_COST = 0.05;

export const CONTAINER_REUSE_COST_LIMITS = { min: 0, max: 0.5, step: 0.01 } as const;

function clampShare(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CONTAINER_REUSE_COST;
  return Math.max(CONTAINER_REUSE_COST_LIMITS.min, Math.min(CONTAINER_REUSE_COST_LIMITS.max, value));
}

export function getContainerReuseCost(): number {
  try {
    const stored = worldSettings.getItem(CONTAINER_REUSE_COST_KEY);
    if (stored !== null) return clampShare(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_CONTAINER_REUSE_COST;
}

export function setContainerReuseCost(value: number): number {
  const share = clampShare(value);
  worldSettings.setItem(CONTAINER_REUSE_COST_KEY, String(share));
  return share;
}
