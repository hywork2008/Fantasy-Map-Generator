/**
 * Options → Simulation multiplier for knowledge/technology accumulation.
 * 1× is the historical annual pace; 100× compresses a century of stock growth
 * into a single simulation year so Age-of-Exploration maps can reach steam
 * without waiting out the full pre-industrial accumulation.
 */

import { useOptionsState } from "../store/optionsState";

export const MIN_TECHNOLOGY_DEVELOPMENT_SPEED = 1;
export const MAX_TECHNOLOGY_DEVELOPMENT_SPEED = 1000;
export const DEFAULT_TECHNOLOGY_DEVELOPMENT_SPEED = 1;

export function clampTechnologyDevelopmentSpeed(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TECHNOLOGY_DEVELOPMENT_SPEED;
  return Math.min(MAX_TECHNOLOGY_DEVELOPMENT_SPEED, Math.max(MIN_TECHNOLOGY_DEVELOPMENT_SPEED, Math.round(n)));
}

export function getTechnologyDevelopmentSpeed(): number {
  return clampTechnologyDevelopmentSpeed(useOptionsState.getState().technologyDevelopmentSpeed);
}

/**
 * Apply `years` of EWMA toward `target` with annual rate `rate` (0..1).
 * `years` defaults to the live Options multiplier so a 100× setting is
 * equivalent to a century of the same annual coverage/decay.
 */
export function applyKnowledgeEwma(
  previous: number,
  target: number,
  rate: number,
  years = getTechnologyDevelopmentSpeed()
): number {
  const steps = Math.max(0, years);
  if (steps === 0) return previous;
  const r = Math.max(0, Math.min(1, rate));
  if (r === 0) return previous;
  if (r === 1) return target;
  const remaining = (1 - r) ** steps;
  return previous * remaining + target * (1 - remaining);
}
