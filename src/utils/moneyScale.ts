import type { WorldOptions } from "../types/WorldState";

/**
 * Money scale (docs/plan/money-scale-calibration.md).
 *
 * Goods quantities and every amount derived from quantity × price are counted in real heads
 * (population points × populationRate), while fixed money constants — start-up grants, poll tax,
 * stipends, project costs, treasury thresholds — were tuned per population point. The money scale
 * lifts those fixed amounts onto the real-head scale. Ratios, shares and price-derived amounts
 * must not be scaled.
 *
 * Maps without `options.moneyScaleBase` (legacy saves, unit-test contexts) keep a scale of 1.
 */
export const DEFAULT_MONEY_SCALE_BASE = 16;

/** Population rate the per-point money constants were tuned against. */
const REFERENCE_POPULATION_RATE = 1000;

export function computeMoneyScale(
  options: Pick<WorldOptions, "moneyScaleBase"> | undefined,
  populationRate: number | undefined
): number {
  const base = options?.moneyScaleBase;
  if (!base || !(base > 0)) return 1;
  const rate = populationRate && populationRate > 0 ? populationRate : REFERENCE_POPULATION_RATE;
  return (base * rate) / REFERENCE_POPULATION_RATE;
}

/** Money scale of a world context (host generators receive the context as a parameter). */
export function getWorldMoneyScale(
  world: { options?: Pick<WorldOptions, "moneyScaleBase">; populationRate?: number } | undefined
): number {
  return computeMoneyScale(world?.options, world?.populationRate);
}
