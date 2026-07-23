/**
 * Rolling death tallies per state for the Population Overview dialog.
 * Stores only coarse daily buckets (max ~40 days) so Advance Day/Week/Month
 * queries stay O(days × states) and never grow without bound.
 *
 * Canonical storage lives on `simulationContext.populationLoss` so `.fmg`
 * archive round-trips and headless day steps share one source of truth.
 *
 * All amounts are stored as *display people* (headcount), not population points.
 *
 * Combat deaths may also carry an optional battlefield `cellId` so the Combat
 * Deaths map layer can show where fighting happened (state totals still always
 * accumulate for the Overview dialog).
 */
import {
  createEmptyPopulationLossState,
  type PopulationLossDayBucket,
  type PopulationLossDeathTotals,
  type PopulationLossState,
  simulationContext
} from "../context/simulationContext";
import { telemetry } from "../services/simulationTelemetry";

export type DeathCause = "combat" | "famine" | "natural" | "other";

export type StateDeathTotals = PopulationLossDeathTotals;

export interface RecordDeathsOptions {
  /** Battlefield packed-cell index (combat only; ignored for other causes). */
  cellId?: number;
}

const MAX_HISTORY_DAYS = 40;

function emptyTotals(): PopulationLossDeathTotals {
  return { combat: 0, famine: 0, natural: 0, other: 0, total: 0 };
}

function getState(): PopulationLossState {
  const existing = simulationContext.populationLoss;
  if (existing && typeof existing === "object" && Array.isArray(existing.history)) {
    if (!Number.isFinite(existing.simDay)) existing.simDay = 0;
    return existing;
  }
  const created = createEmptyPopulationLossState();
  simulationContext.populationLoss = created;
  return created;
}

function getOrCreateCurrentBucket(state: PopulationLossState): PopulationLossDayBucket {
  const day = Math.floor(state.simDay);
  const last = state.history.length > 0 ? state.history[state.history.length - 1] : undefined;
  if (last && last.day === day) return last;
  const bucket: PopulationLossDayBucket = { day, byState: {}, combatByCell: {} };
  state.history.push(bucket);
  pruneHistory(state);
  return bucket;
}

function pruneHistory(state: PopulationLossState): void {
  const cutoff = state.simDay - MAX_HISTORY_DAYS;
  if (state.history.length > MAX_HISTORY_DAYS * 2) {
    state.history = state.history.filter(b => b.day >= cutoff);
  } else {
    while (state.history.length && state.history[0].day < cutoff) state.history.shift();
  }
}

function isValidCellId(cellId: number): boolean {
  return Number.isFinite(cellId) && cellId >= 0 && Number.isInteger(cellId);
}

function entityIdEntries<T>(record: Record<number, T>): Array<[number, T]> {
  const out: Array<[number, T]> = [];
  for (const [rawId, value] of Object.entries(record)) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || String(id) !== rawId) continue;
    out.push([id, value]);
  }
  return out;
}

/** Call at the start of each advanceTime with elapsed days (can be fractional). */
export function advancePopulationLossClock(deltaDays: number): void {
  if (deltaDays <= 0) return;
  const state = getState();
  state.simDay += deltaDays;
  pruneHistory(state);
}

/**
 * Record deaths for a state. `people` is headcount (already × populationRate when
 * converting from demographic points). No-op for non-positive amounts or invalid ids.
 * Optional `opts.cellId` records combat deaths at a battlefield cell for the map layer.
 */
export function recordDeaths(stateId: number, people: number, cause: DeathCause, opts?: RecordDeathsOptions): void {
  if (!stateId || people <= 0 || !Number.isFinite(people)) return;
  const state = getState();
  const bucket = getOrCreateCurrentBucket(state);
  let row = bucket.byState[stateId];
  if (!row) {
    row = emptyTotals();
    bucket.byState[stateId] = row;
  }
  row[cause] += people;
  row.total += people;

  if (cause === "combat" && opts?.cellId !== undefined && isValidCellId(opts.cellId)) {
    const cellId = opts.cellId;
    bucket.combatByCell[cellId] = (bucket.combatByCell[cellId] ?? 0) + people;
  }

  telemetry()?.onDeath?.({
    tick: simulationContext.tickCount,
    cal: {
      y: simulationContext.currentYear,
      m: simulationContext.currentMonth,
      d: simulationContext.currentDay,
      era: simulationContext.era
    },
    stateId,
    people,
    cause,
    ...(cause === "combat" && opts?.cellId !== undefined && isValidCellId(opts.cellId) ? { cellId: opts.cellId } : {})
  });
}

export type DeathWindow = "day" | "week" | "month";

export function deathWindowDays(window: DeathWindow): number {
  if (window === "day") return 1;
  if (window === "week") return 7;
  return 30;
}

/** Sum deaths for all states over the last `window` (inclusive of current day). */
export function getDeathsByState(window: DeathWindow): Map<number, StateDeathTotals> {
  const state = getState();
  const days = deathWindowDays(window);
  const cutoff = state.simDay - days;
  const result = new Map<number, StateDeathTotals>();

  for (const bucket of state.history) {
    // Include buckets that overlap the window (bucket.day is the open day)
    if (bucket.day + 1 <= cutoff) continue;
    for (const [stateId, totals] of entityIdEntries(bucket.byState)) {
      let row = result.get(stateId);
      if (!row) {
        row = emptyTotals();
        result.set(stateId, row);
      }
      row.combat += totals.combat;
      row.famine += totals.famine;
      row.natural += totals.natural;
      row.other += totals.other;
      row.total += totals.total;
    }
  }
  return result;
}

/**
 * Sum combat deaths per battlefield cell over the last `window`.
 * Only cells that recorded combat in the window are present.
 */
export function getCombatDeathsByCell(window: DeathWindow): Map<number, number> {
  const state = getState();
  const days = deathWindowDays(window);
  const cutoff = state.simDay - days;
  const result = new Map<number, number>();

  for (const bucket of state.history) {
    if (bucket.day + 1 <= cutoff) continue;
    for (const [cellId, people] of entityIdEntries(bucket.combatByCell)) {
      result.set(cellId, (result.get(cellId) ?? 0) + people);
    }
  }
  return result;
}

/** Combat deaths recorded for a single cell over the window (0 if none). */
export function getCombatDeathsAtCell(cellId: number, window: DeathWindow): number {
  if (!isValidCellId(cellId)) return 0;
  return getCombatDeathsByCell(window).get(cellId) ?? 0;
}

export function getPopulationLossSimDay(): number {
  return getState().simDay;
}

/** Reset on map generation / load so tallies don't leak across worlds. */
export function resetPopulationLossTracker(): void {
  simulationContext.populationLoss = createEmptyPopulationLossState();
}
