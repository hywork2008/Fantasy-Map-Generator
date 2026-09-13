import type { RNGService } from "../../utils/probabilityUtils";

/**
 * Shared Fast-Forward math (docs/plan/advance-time-fast-forward.md §4.4–4.5).
 *
 * User-facing name is Fast-Forward; code keeps the `fastAdvance*` identifier used by the store
 * and dialogs. Coarse-gate systems (manpower, hiring, population injection) share one day count
 * so a Fast-Forward year doesn't apply each approximation on a different calendar.
 */

/**
 * Days of simulated time a Fast-Forward bulk advance accumulates before running a coarsened
 * system (manpower.tick, economy.dailyHiring, applyFastForwardPopulation). ~one month; the
 * linear/exponential bodies are associative in deltaYears, so one 30-day slice equals thirty
 * 1-day slices aside from jitter draw count.
 */
export const FAST_ADVANCE_COARSE_GATE_DAYS = 30;

export function annualGrowthFactor(pctPerYear: number, years: number): number {
  return (1 + pctPerYear / 100) ** years;
}

/**
 * Amplitude of a mean-1 multiplicative jitter whose fully-compounded variance matches a
 * one-shot annual draw at `variancePct`, however many calls a year is split across.
 * See docs/plan/advance-time-fast-forward.md §9.2.
 */
export function jitterAmplitude(variancePct: number, years: number): number {
  return (variancePct / 100) * Math.sqrt(Math.max(0, years));
}

export function jitterFactor(rng: RNGService, variancePct: number, years: number): number {
  return 1 + (rng.rand() * 2 - 1) * jitterAmplitude(variancePct, years);
}
