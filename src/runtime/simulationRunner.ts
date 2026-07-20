import { simulationContext } from "../context/simulationContext";
import { advanceTime } from "../generators/timeEngine";
import { getDaysInMonth, isLeapYear } from "../utils/seasonUtils";
import { advanceSimulation } from "./worldRuntime";

/**
 * Headless simulation runner surface.
 *
 * These helpers share the same `simulation.advance` command as the UI and
 * `window.fmg.actions.advanceTime`, but they do not require requestAnimationFrame,
 * React stores, or a RenderCoordinator subscription. Unit tests and batch hosts
 * can step the calendar without mounting the map.
 *
 * Compatibility note (unite-data-and-map §6.2): the UI daily path and the public
 * bulk path still differ in hook count / tickCount / RNG consumption. Keep both
 * entry points so characterization tests can pin each semantics independently.
 */

export interface CalendarDuration {
  readonly years?: number;
  readonly months?: number;
  readonly days?: number;
}

export interface SimulationClockReading {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

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
   * When true (default), also run the post-commit observers used by the public
   * `advanceTime` action (DOM events, telemetry). Headless pure tests can set
   * `notify: false` to only commit through `simulation.advance`.
   */
  readonly notify?: boolean;
}

export interface DailyRunResult {
  readonly daysRequested: number;
  readonly daysCompleted: number;
  readonly stopped: boolean;
}

/**
 * Expand a calendar duration into the number of whole days the UI would walk
 * from `clock`, matching `runTimeSimulation`'s leap-year / month-length rules.
 */
export function durationToCalendarDays(clock: SimulationClockReading, duration: CalendarDuration): number {
  let y = clock.year;
  let m = clock.month;
  let totalDays = 0;

  for (let i = 0; i < (duration.years ?? 0); i++) {
    totalDays += isLeapYear(y) ? 366 : 365;
    y++;
  }
  for (let i = 0; i < (duration.months ?? 0); i++) {
    totalDays += getDaysInMonth(y, m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  totalDays += duration.days ?? 0;
  return totalDays;
}

/** One calendar day via the same command the UI loop uses. Returns false on no-op. */
export function stepDay(options?: { readonly notify?: boolean }): boolean {
  if (options?.notify === false) {
    return advanceSimulation({ deltaYears: 0, deltaMonths: 0, deltaDays: 1 }) !== null;
  }
  const tickBefore = simulationContext.tickCount;
  advanceTime(0, 0, 1);
  return simulationContext.tickCount > tickBefore;
}

/**
 * Legacy daily path: one `advance(0,0,1)` commit per calendar day.
 * This is the semantics of Tools → Advance Time buttons.
 */
export function runLegacyDaily(days: number, options: DailyRunOptions = {}): DailyRunResult {
  if (!Number.isFinite(days) || days <= 0) {
    return { daysRequested: 0, daysCompleted: 0, stopped: false };
  }
  const totalDays = Math.floor(days);
  const notify = options.notify !== false;
  let completed = 0;

  for (let i = 0; i < totalDays; i++) {
    if (options.shouldStop?.()) {
      return { daysRequested: totalDays, daysCompleted: completed, stopped: true };
    }
    if (notify) {
      advanceTime(0, 0, 1);
    } else {
      const commit = advanceSimulation({ deltaYears: 0, deltaMonths: 0, deltaDays: 1 });
      if (!commit) {
        return { daysRequested: totalDays, daysCompleted: completed, stopped: true };
      }
    }
    completed++;
    options.onDayComplete?.({ day: completed, totalDays });
  }

  return { daysRequested: totalDays, daysCompleted: completed, stopped: false };
}

/**
 * Legacy bulk path: a single multi-day/month/year `simulation.advance` commit.
 * This is the semantics of `window.fmg.actions.advanceTime`.
 */
export function advanceLegacyBulk(duration: CalendarDuration, options?: { readonly notify?: boolean }): boolean {
  const years = duration.years ?? 0;
  const months = duration.months ?? 0;
  const days = duration.days ?? 0;
  if (years <= 0 && months <= 0 && days <= 0) return false;

  if (options?.notify === false) {
    return advanceSimulation({ deltaYears: years, deltaMonths: months, deltaDays: days }) !== null;
  }
  advanceTime(years, months, days);
  return true;
}
