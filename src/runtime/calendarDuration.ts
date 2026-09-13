import { getDaysInMonth, isLeapYear } from "../utils/seasonUtils";

/**
 * Mean Gregorian year length used to convert a count of simulated calendar days into
 * `deltaYears` for rate-driven systems (manpower, Fast-Forward growth, hiring). Distinct
 * from `durationToCalendarDays`, which walks the real civil calendar including leap days.
 */
export const MEAN_DAYS_PER_YEAR = 365.2425;
export const MEAN_DAYS_PER_MONTH = MEAN_DAYS_PER_YEAR / 12;

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

/**
 * Expand a calendar duration into whole days walked from `clock`, matching
 * Tools → Advance Time leap-year / month-length rules (runTimeSimulation).
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
