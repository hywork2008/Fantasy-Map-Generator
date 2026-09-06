import { simulationContext } from "../context/simulationContext";
import { type CalendarDuration, durationToCalendarDays } from "./calendarDuration";
import { stepDaySimulation } from "./worldRuntime";

export type { CalendarDuration, SimulationClockReading } from "./calendarDuration";
export { durationToCalendarDays } from "./calendarDuration";

/**
 * Headless / shared simulation runner (P2-5).
 *
 * Canonical time advance is always a sequence of `simulation.stepDay` commands
 * (one calendar day → one commit, failed-day rollback). UI progress loops and
 * `window.fmg.actions.advanceTime` share this semantics so tickCount, system
 * runs, RNG streams, and per-day events match.
 */

export interface DailyRunProgress {
  readonly day: number;
  readonly totalDays: number;
}

export interface DailyRunOptions {
  /** Invoked after each successfully committed day (1-based day index). */
  readonly onDayComplete?: (progress: DailyRunProgress) => void;
  /** Return true to stop before starting the next day. */
  readonly shouldStop?: () => boolean;
  /**
   * When true (default), run post-commit day observers (DOM events, telemetry).
   * Headless pure tests can set `notify: false` to only commit `simulation.stepDay`.
   */
  readonly notify?: boolean;
}

export interface DailyRunResult {
  readonly daysRequested: number;
  readonly daysCompleted: number;
  readonly stopped: boolean;
}

/** Optional host-provided observer hook to avoid a timeEngine ↔ runner cycle. */
let dayObserver: ((deltaYears: number, deltaMonths: number, deltaDays: number) => void) | null = null;

/**
 * Register the post-day observer used when `notify: true`. Called once from
 * timeEngine after it defines `notifyAfterDayStep`.
 */
export function registerDayStepObserver(
  observer: (deltaYears: number, deltaMonths: number, deltaDays: number) => void
): void {
  dayObserver = observer;
}

export interface DayBatchController {
  /**
   * Start (or extend, if already active) amortizing the rollback snapshot across a run.
   * `totalDays` (default 1) records how many calendar days this top-level advance spans, so
   * registered systems can distinguish a lone single-day step from a genuine multi-day
   * fast-forward via `SimulationStepContext.isBulkAdvance` — see
   * docs/plan/advance-time-loop-reduction.md Phase 1b.
   */
  enter(totalDays?: number): void;
  /** End one level of batching on a clean run; releases the shared snapshot once outermost. */
  exit(): void;
  /**
   * End one level of batching after a day threw. May publish a corrective
   * commit if earlier days in this run already committed before the failure.
   */
  exitAfterFailure(): void;
  /**
   * Calendar days the next step should cover, given how many remain. Always 1 for an ordinary
   * advance; Advance Time's history mode returns a whole month so a decades-long run costs 12
   * ticks a year instead of 365 (docs/plan/advance-time-history-mode.md §4). Optional so a host
   * that never installs history mode keeps the plain one-day-per-step contract.
   */
  strideDays?(remainingDays: number): number;
}

/**
 * Optional host-provided batch snapshot controller to avoid a timeEngine ↔
 * runner cycle. Registered once from timeEngine so `runDaily` can amortize
 * `simulation.stepDay`'s rollback snapshot across a multi-day run instead of
 * re-snapshotting the whole `pack` before every single day (see the "why"
 * note above `stepDayMutation` in timeEngine.ts).
 */
let dayBatchController: DayBatchController | null = null;

export function registerDayBatchController(controller: DayBatchController): void {
  dayBatchController = controller;
}

/**
 * One canonical calendar day via `simulation.stepDay` (failed-day rollback).
 * With `notify: true` (default) also runs the registered day observer.
 */
export function stepDay(options?: { readonly notify?: boolean; readonly days?: number }): boolean {
  const days = options?.days ?? 1;
  const commit = stepDaySimulation(days);
  if (!commit) return false;
  if (options?.notify !== false) {
    dayObserver?.(0, 0, days);
  }
  return true;
}

/**
 * Run `days` consecutive calendar days as one stepDay each.
 * Shared by UI batch loops (with progress) and public multi-day advances.
 */
export function runDaily(days: number, options: DailyRunOptions = {}): DailyRunResult {
  if (!Number.isFinite(days) || days <= 0) {
    return { daysRequested: 0, daysCompleted: 0, stopped: false };
  }
  const totalDays = Math.floor(days);
  const notify = options.notify !== false;
  let completed = 0;
  let failed = false;

  dayBatchController?.enter(totalDays);
  try {
    while (completed < totalDays) {
      if (options.shouldStop?.()) {
        return { daysRequested: totalDays, daysCompleted: completed, stopped: true };
      }
      const days = dayBatchController?.strideDays?.(totalDays - completed) ?? 1;
      if (!stepDay({ notify, days })) {
        return { daysRequested: totalDays, daysCompleted: completed, stopped: true };
      }
      completed += days;
      options.onDayComplete?.({ day: completed, totalDays });
    }

    return { daysRequested: totalDays, daysCompleted: completed, stopped: false };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (failed) dayBatchController?.exitAfterFailure();
    else dayBatchController?.exit();
  }
}

/**
 * Expand a calendar duration from the live clock and advance one stepDay per day.
 * This is the single multi-day entry point for public and headless callers.
 */
export function advance(duration: CalendarDuration, options: DailyRunOptions = {}): DailyRunResult {
  const totalDays = durationToCalendarDays(
    {
      year: simulationContext.currentYear,
      month: simulationContext.currentMonth,
      day: simulationContext.currentDay
    },
    duration
  );
  return runDaily(totalDays, options);
}

/**
 * @deprecated Use `runDaily`. Kept as an alias so older tests/docs keep compiling
 * during the P2-5 cutover.
 */
export const runLegacyDaily = runDaily;

/**
 * @deprecated Multi-day bulk single-commit path is retired (P2-5). Delegates to
 * the canonical daily sequence so tickCount / system runs match the UI path.
 */
export function advanceLegacyBulk(duration: CalendarDuration, options?: { readonly notify?: boolean }): boolean {
  const result = advance(duration, { notify: options?.notify });
  return result.daysCompleted > 0 && !result.stopped;
}
