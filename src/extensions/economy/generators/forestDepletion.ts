/**
 * Tracks logging pressure reported by the Shipbuilding extension's
 * fmg:shipbuilding-log-harvested event (see economy/index.tsx's listener).
 * Reduces the affected cell's Wood good output — see getDepletionMultiplier()
 * in production-utils.ts. Economy has no dependency on Shipbuilding: if it's
 * never enabled, this map simply stays empty.
 */

const _depletion = new Map<number, number>();
let _dirty = false;

const DEPLETION_PER_LOG_UNIT = 0.05;
const MAX_DEPLETION = 0.9;

export function registerLogHarvest(cellId: number, amount: number): void {
  if (amount <= 0) return;
  const current = _depletion.get(cellId) ?? 0;
  const next = Math.min(MAX_DEPLETION, current + amount * DEPLETION_PER_LOG_UNIT);
  if (next === current) return;
  _depletion.set(cellId, next);
  _dirty = true;
}

export function getDepletionFactor(cellId: number): number {
  return _depletion.get(cellId) ?? 0;
}

/** Returns whether any depletion changed since the last call, and clears the flag. */
export function consumeDirtyFlag(): boolean {
  const wasDirty = _dirty;
  _dirty = false;
  return wasDirty;
}

export function clearForestDepletion(): void {
  _depletion.clear();
  _dirty = false;
}
