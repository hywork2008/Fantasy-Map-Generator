/**
 * The "a history-mode advance is in progress" flag (docs/plan/advance-time-history-mode.md §5).
 *
 * Same shape as fastAdvanceEconomyGuard.ts's tick flag, and for the same reason: the places that
 * need to know — the simulation registry's system filter, `shouldSuppressConflictAdvance()`,
 * `mayAdvanceAutonomousConflict()`, the stub-funding step — sit at very different depths and most
 * of them have no `SimulationStepContext` to consult. timeEngine brackets each run instead, so
 * every reader sees one resolved config for the whole advance and `null` at all other times.
 *
 * Outside a bracketed run this reads `null`, which is what makes `profile: "off"` (and every
 * ordinary Advance Day/Month/Year) byte-identical to pre-history-mode behaviour.
 */
import type { HistoryModeProfile } from "./historyModeProfiles";

export interface ActiveHistoryModeRun extends HistoryModeProfile {
  /** Lookup built once per run so the per-system filter is O(1) rather than a linear scan. */
  readonly disabledSystemIdSet: ReadonlySet<string>;
}

let activeRun: ActiveHistoryModeRun | null = null;
let depth = 0;

/**
 * Marks the start of a history-mode advance. Nested calls (a `runDaily` inside another batch)
 * only count depth; the outermost bracket owns the config.
 */
export function beginHistoryModeRun(profile: HistoryModeProfile): void {
  depth += 1;
  if (depth === 1) {
    activeRun = { ...profile, disabledSystemIdSet: new Set(profile.disabledSystemIds) };
  }
}

/** Marks the end of a history-mode advance. Safe to call when no run is active. */
export function endHistoryModeRun(): void {
  depth = Math.max(0, depth - 1);
  if (depth === 0) activeRun = null;
}

export function getActiveHistoryModeRun(): ActiveHistoryModeRun | null {
  return activeRun;
}

export function isHistoryModeRunActive(): boolean {
  return activeRun !== null;
}

/** True when this system is masked off for the duration of the current history-mode run. */
export function isSystemDisabledByHistoryMode(systemId: string): boolean {
  return activeRun?.disabledSystemIdSet.has(systemId) ?? false;
}

/**
 * True when the run is deliberately ignoring a player-directed conflict policy so that wars
 * actually resolve and leave a record (§5.4).
 */
export function historyModeForcesAutonomousConflict(): boolean {
  return activeRun?.forceAutonomousConflict ?? false;
}

/** Test-only escape hatch: drops any active run regardless of nesting depth. */
export function resetHistoryModeRunForTests(): void {
  activeRun = null;
  depth = 0;
}
