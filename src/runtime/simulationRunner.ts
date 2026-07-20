import { simulationContext } from "../context/simulationContext";
import { advanceTime } from "../generators/timeEngine";
import { getDaysInMonth, isLeapYear } from "../utils/seasonUtils";
import { advanceSimulation, stepDaySimulation } from "./worldRuntime";

/**
 * Headless simulation runner surface.
 *
 * Canonical day steps use `simulation.stepDay` (one command / one commit, with
 * failed-day rollback). Multi-day bulk still uses `simulation.advance` during
 * the compatibility period (P2-5 unifies UI + public action onto daily steps).
 *
 * Helpers do not require requestAnimationFrame, React stores, or a
 * RenderCoordinator subscription.
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
   * `notify: false` to only commit through `simulation.stepDay` / `simulation.advance`.
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

/**
 * One canonical calendar day via `simulation.stepDay` (failed-day rollback).
 * With `notify: true` (default) also runs the public advanceTime observers for
 * that day so UI-equivalent callers share the same command body.
 */
export function stepDay(options?: { readonly notify?: boolean }): boolean {
  const commit = stepDaySimulation();
  if (!commit) return false;
  if (options?.notify !== false) {
    // Observers only — the mutation already committed through stepDaySimulation.
    document.dispatchEvent(
      new CustomEvent("fmg:time-advanced", {
        detail: {
          deltaYears: 0,
          deltaMonths: 0,
          deltaDays: 1,
          currentYear: simulationContext.currentYear
        }
      })
    );
    document.dispatchEvent(
      new CustomEvent("fmg:simulation-updated", {
        detail: {
          currentYear: simulationContext.currentYear,
          currentMonth: simulationContext.currentMonth,
          currentDay: simulationContext.currentDay,
          era: simulationContext.era
        }
      })
    );
  }
  return true;
}

/**
 * Legacy daily path: one `simulation.stepDay` commit per calendar day.
 * This is the semantics of Tools → Advance Time buttons (day loop).
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
    if (!stepDay({ notify })) {
      return { daysRequested: totalDays, daysCompleted: completed, stopped: true };
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
