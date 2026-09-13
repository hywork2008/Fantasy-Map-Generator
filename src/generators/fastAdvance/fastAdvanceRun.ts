/**
 * The "a Fast-Forward advance is in progress" flag (docs/plan/advance-time-fast-forward.md §4.2).
 *
 * Same shape as historyModeRun.ts: timeEngine brackets each multi-day batch so every reader —
 * core:demographics, manpower.tick, economy ticks, debitTreasury() — sees one resolved config
 * for the whole advance and `null` at all other times. Rates are captured at begin so a ⚙
 * change mid-run cannot mix two presets into one batch.
 *
 * A lone Advance Day never opens a run, which is what keeps single-day stepping identical to
 * Fast-Forward-off behaviour.
 */
import type { FastAdvanceRates } from "./fastAdvancePresets";

export interface ActiveFastAdvanceRun {
  readonly rates: FastAdvanceRates;
}

let activeRun: ActiveFastAdvanceRun | null = null;
let depth = 0;

/**
 * Marks the start of a Fast-Forward advance. Nested calls (a `runDaily` inside another batch)
 * only count depth; the outermost bracket owns the captured rates.
 */
export function beginFastAdvanceRun(rates: FastAdvanceRates): void {
  depth += 1;
  if (depth === 1) {
    activeRun = { rates: { ...rates } };
  }
}

/** Marks the end of a Fast-Forward advance. Safe to call when no run is active. */
export function endFastAdvanceRun(): void {
  depth = Math.max(0, depth - 1);
  if (depth === 0) activeRun = null;
}

export function getActiveFastAdvanceRun(): ActiveFastAdvanceRun | null {
  return activeRun;
}

export function isFastAdvanceRunActive(): boolean {
  return activeRun !== null;
}

/** Test-only escape hatch: drops any active run regardless of nesting depth. */
export function resetFastAdvanceRunForTests(): void {
  activeRun = null;
  depth = 0;
}
