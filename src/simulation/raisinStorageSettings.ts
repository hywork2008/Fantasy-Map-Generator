import { worldSettings } from "./worldSettings";

/**
 * Share of a market's raisins lost in a month in a temperate store (docs/plan/raisin-trade.md §3.2).
 * Warmth and damp raise it as for grain (getStorageClimateLossMultiplier); raisins kept from one
 * vintage to the next browned and drew insects in the warm months. No source gives a monthly
 * rate, so the default was set by measurement. Saved with the world; the Simulation settings tab edits it.
 */
export const RAISIN_STORAGE_LOSS_KEY = "fmg-raisin-storage-loss";

export const DEFAULT_RAISIN_STORAGE_LOSS = 0.015;

export const RAISIN_STORAGE_LOSS_LIMITS = { min: 0, max: 0.1, step: 0.005 } as const;

function clampLoss(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_RAISIN_STORAGE_LOSS;
  return Math.max(RAISIN_STORAGE_LOSS_LIMITS.min, Math.min(RAISIN_STORAGE_LOSS_LIMITS.max, value));
}

export function getRaisinStorageLoss(): number {
  try {
    const stored = worldSettings.getItem(RAISIN_STORAGE_LOSS_KEY);
    if (stored !== null) return clampLoss(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_RAISIN_STORAGE_LOSS;
}

export function setRaisinStorageLoss(value: number): number {
  const loss = clampLoss(value);
  worldSettings.setItem(RAISIN_STORAGE_LOSS_KEY, String(loss));
  return loss;
}
