/**
 * Tracks logging pressure reported by the Shipbuilding extension's
 * fmg:shipbuilding-log-harvested event (see economy/index.tsx's listener), and its
 * natural regrowth over time (see economy/index.tsx's registerTimeTickHook).
 * Reduces the affected cell's Wood good output — see getDepletionMultiplier()
 * in production-utils.ts. Economy has no dependency on Shipbuilding: if it's
 * never enabled, this map simply stays empty and regrowth is a no-op.
 */

const _depletion = new Map<number, number>();
let _dirty = false;

const DEPLETION_PER_LOG_UNIT = 0.05;
const MAX_DEPLETION = 0.9;
/** Recovers 2% of depletion per year — full recovery from MAX_DEPLETION takes ~45 years without further logging. */
const REGROWTH_PER_YEAR = 0.02;

export function registerLogHarvest(cellId: number, amount: number): void {
  if (amount <= 0) return;
  const current = _depletion.get(cellId) ?? 0;
  const next = Math.min(MAX_DEPLETION, current + amount * DEPLETION_PER_LOG_UNIT);
  if (next === current) return;
  _depletion.set(cellId, next);
  _dirty = true;
}

/**
 * Called on every advanceTime() tick. Lets every depleted cell recover a little,
 * independent of whether that cell is still being logged this tick. Returns
 * whether anything changed, so the caller can decide whether to refresh production.
 */
export function tickForestRegrowth(deltaYears: number): boolean {
  if (deltaYears <= 0 || _depletion.size === 0) return false;

  const recovery = REGROWTH_PER_YEAR * deltaYears;
  for (const [cellId, value] of _depletion) {
    const next = value - recovery;
    if (next <= 0) _depletion.delete(cellId);
    else _depletion.set(cellId, next);
  }
  _dirty = true;
  return true;
}

export function getDepletionFactor(cellId: number): number {
  return _depletion.get(cellId) ?? 0;
}

/** Sparse read-only view used by rural production aggregation to adjust only logged cells. */
export function getDepletedCells(): ReadonlyMap<number, number> {
  return _depletion;
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
