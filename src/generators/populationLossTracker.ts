/**
 * Rolling death tallies per state for the Population Overview dialog.
 * Stores only coarse daily buckets (max ~40 days) so Advance Day/Week/Month
 * queries stay O(days × states) and never grow without bound.
 *
 * All amounts are stored as *display people* (headcount), not population points.
 *
 * Combat deaths may also carry an optional battlefield `cellId` so the Combat
 * Deaths map layer can show where fighting happened (state totals still always
 * accumulate for the Overview dialog).
 */
import { simulationContext } from "../context/simulationContext";
import { telemetry } from "../services/simulationTelemetry";

export type DeathCause = "combat" | "famine" | "natural" | "other";

export interface StateDeathTotals {
  combat: number;
  famine: number;
  natural: number;
  other: number;
  total: number;
}

export interface RecordDeathsOptions {
  /** Battlefield packed-cell index (combat only; ignored for other causes). */
  cellId?: number;
}

interface DayBucket {
  /** Floor of simulation day index when the bucket was opened. */
  day: number;
  /** stateId → cause totals (people) */
  byState: Map<number, StateDeathTotals>;
  /** cellId → combat death headcount at that battlefield */
  combatByCell: Map<number, number>;
}

const MAX_HISTORY_DAYS = 40;

let simDay = 0;
let history: DayBucket[] = [];
let current: DayBucket | null = null;

function emptyTotals(): StateDeathTotals {
  return { combat: 0, famine: 0, natural: 0, other: 0, total: 0 };
}

function getOrCreateCurrentBucket(): DayBucket {
  const day = Math.floor(simDay);
  if (current && current.day === day) return current;
  current = { day, byState: new Map(), combatByCell: new Map() };
  history.push(current);
  pruneHistory();
  return current;
}

function pruneHistory(): void {
  const cutoff = simDay - MAX_HISTORY_DAYS;
  if (history.length > MAX_HISTORY_DAYS * 2) {
    history = history.filter(b => b.day >= cutoff);
  } else {
    while (history.length && history[0].day < cutoff) history.shift();
  }
}

function isValidCellId(cellId: number): boolean {
  return Number.isFinite(cellId) && cellId >= 0 && Number.isInteger(cellId);
}

/** Call at the start of each advanceTime with elapsed days (can be fractional). */
export function advancePopulationLossClock(deltaDays: number): void {
  if (deltaDays <= 0) return;
  simDay += deltaDays;
  // Force a new bucket on the next record so multi-day jumps don't merge into one blob
  // when the day floor changes; same-day ticks still share a bucket.
  if (current && Math.floor(simDay) !== current.day) {
    current = null;
  }
  pruneHistory();
}

/**
 * Record deaths for a state. `people` is headcount (already × populationRate when
 * converting from demographic points). No-op for non-positive amounts or invalid ids.
 * Optional `opts.cellId` records combat deaths at a battlefield cell for the map layer.
 */
export function recordDeaths(stateId: number, people: number, cause: DeathCause, opts?: RecordDeathsOptions): void {
  if (!stateId || people <= 0 || !Number.isFinite(people)) return;
  const bucket = getOrCreateCurrentBucket();
  let row = bucket.byState.get(stateId);
  if (!row) {
    row = emptyTotals();
    bucket.byState.set(stateId, row);
  }
  row[cause] += people;
  row.total += people;

  if (cause === "combat" && opts?.cellId !== undefined && isValidCellId(opts.cellId)) {
    const cellId = opts.cellId;
    bucket.combatByCell.set(cellId, (bucket.combatByCell.get(cellId) ?? 0) + people);
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
  const days = deathWindowDays(window);
  const cutoff = simDay - days;
  const result = new Map<number, StateDeathTotals>();

  for (const bucket of history) {
    // Include buckets that overlap the window (bucket.day is the open day)
    if (bucket.day + 1 <= cutoff) continue;
    for (const [stateId, totals] of bucket.byState) {
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
  const days = deathWindowDays(window);
  const cutoff = simDay - days;
  const result = new Map<number, number>();

  for (const bucket of history) {
    if (bucket.day + 1 <= cutoff) continue;
    for (const [cellId, people] of bucket.combatByCell) {
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
  return simDay;
}

/** Reset on map generation / load so tallies don't leak across worlds. */
export function resetPopulationLossTracker(): void {
  simDay = 0;
  history = [];
  current = null;
}
