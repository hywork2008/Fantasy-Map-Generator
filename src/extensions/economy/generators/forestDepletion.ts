/**
 * Tracks logging pressure reported by the Shipbuilding extension's
 * fmg:shipbuilding-log-harvested event (see economy/index.tsx's listener), and its
 * natural regrowth over time (see economy/index.tsx's registerTimeTickHook).
 * Reduces the affected cell's Wood good output — see getDepletionMultiplier()
 * in production-utils.ts. Economy has no dependency on Shipbuilding: if it's
 * never enabled, this map simply stays empty and regrowth is a no-op.
 *
 * Canonical storage is `simulation.extensions.economy.forestDepletion` (sparse
 * cellId → factor). A module fallback is used only when the economy ExtensionAPI
 * is not initialized (unit tests without a full host).
 */

import { getOrCreateForestDepletionTable } from "../economyContext";

/** Fallback when `simulationContext` is unavailable (minimal unit tests). */
let _fallback: Record<number, number> = {};
let _dirty = false;

const DEPLETION_PER_LOG_UNIT = 0.05;
const MAX_DEPLETION = 0.9;
/** Recovers 2% of depletion per year — full recovery from MAX_DEPLETION takes ~45 years without further logging. */
const REGROWTH_PER_YEAR = 0.02;

function getTable(): Record<number, number> {
  return getOrCreateForestDepletionTable() ?? _fallback;
}

export function registerLogHarvest(cellId: number, amount: number): void {
  if (amount <= 0) return;
  const table = getTable();
  const current = table[cellId] ?? 0;
  const next = Math.min(MAX_DEPLETION, current + amount * DEPLETION_PER_LOG_UNIT);
  if (next === current) return;
  table[cellId] = next;
  _dirty = true;
}

/**
 * Called on every advanceTime() tick. Lets every depleted cell recover a little,
 * independent of whether that cell is still being logged this tick. Returns
 * whether anything changed, so the caller can decide whether to refresh production.
 */
export function tickForestRegrowth(deltaYears: number): boolean {
  const table = getTable();
  const keys = Object.keys(table);
  if (deltaYears <= 0 || keys.length === 0) return false;

  const recovery = REGROWTH_PER_YEAR * deltaYears;
  for (const rawId of keys) {
    const cellId = Number(rawId);
    if (!Number.isInteger(cellId) || String(cellId) !== rawId) continue;
    const value = table[cellId];
    if (value === undefined) continue;
    const next = value - recovery;
    if (next <= 0) delete table[cellId];
    else table[cellId] = next;
  }
  _dirty = true;
  return true;
}

export function getDepletionFactor(cellId: number): number {
  return getTable()[cellId] ?? 0;
}

/** Sparse read-only view used by rural production aggregation to adjust only logged cells. */
export function getDepletedCells(): ReadonlyMap<number, number> {
  const table = getTable();
  const map = new Map<number, number>();
  for (const [rawId, value] of Object.entries(table)) {
    const cellId = Number(rawId);
    if (!Number.isInteger(cellId) || String(cellId) !== rawId) continue;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      map.set(cellId, value);
    }
  }
  return map;
}

/** Returns whether any depletion changed since the last call, and clears the flag. */
export function consumeDirtyFlag(): boolean {
  const wasDirty = _dirty;
  _dirty = false;
  return wasDirty;
}

export function clearForestDepletion(): void {
  const table = getOrCreateForestDepletionTable();
  if (table) {
    for (const key of Object.keys(table)) delete table[Number(key)];
  }
  _fallback = {};
  _dirty = false;
}
