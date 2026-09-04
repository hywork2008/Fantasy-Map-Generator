import { minmax, rn } from "../../hostUtils";
import type { Good } from "./goodsGeneratorTypes";

/** Share of the gap to the demand/stock target closed each price-settlement cycle. */
export const PRICE_ADJUSTMENT_RATE = 0.4;
/** Default own-price elasticity for food-tagged / food-coverage goods. */
export const DEFAULT_FOOD_PRICE_ELASTICITY = -0.2;
/** Default own-price elasticity for luxury-tagged / luxury-coverage goods. */
export const DEFAULT_LUXURY_PRICE_ELASTICITY = -1.2;

/**
 * Explicit `priceElasticity` wins, including 0 (inelastic). Unset goods get the L1 tag
 * defaults so live catalogues pick up food/luxury feedback without editing every row.
 */
export function getPriceElasticity(good: Pick<Good, "priceElasticity" | "tags" | "demandCoverage">): number {
  if (typeof good.priceElasticity === "number" && Number.isFinite(good.priceElasticity)) {
    return good.priceElasticity;
  }
  if (good.tags?.includes("luxury") || (good.demandCoverage?.luxury ?? 0) > 0) {
    return DEFAULT_LUXURY_PRICE_ELASTICITY;
  }
  if (good.tags?.includes("food") || (good.demandCoverage?.food ?? 0) > 0) {
    return DEFAULT_FOOD_PRICE_ELASTICITY;
  }
  return 0;
}

/**
 * Scales a population-based demand quantity by `(price / value) ** elasticity`.
 * A 1-period lag is the caller's job: pass last cycle's price, not this cycle's target.
 * Elasticity 0 is a no-op (legacy demand).
 */
export function applyPriceElasticity(
  baseDemand: number,
  good: Pick<Good, "value" | "priceElasticity" | "tags" | "demandCoverage">,
  price: number | undefined
): number {
  if (!(baseDemand > 0)) return Math.max(0, baseDemand);
  const elasticity = getPriceElasticity(good);
  if (elasticity === 0) return baseDemand;
  const value = good.value > 0 ? good.value : 1;
  const current = typeof price === "number" && price > 0 ? price : value;
  const factor = (current / value) ** elasticity;
  if (!Number.isFinite(factor)) return baseDemand;
  return Math.max(0, baseDemand * factor);
}

/**
 * Move `prevPrice` a fraction of the way toward `targetPrice`, clamped to [floor, ceiling].
 * Missing/non-positive previous prices snap to the target (first listing of a good).
 */
export function relaxMarketPrice(
  prevPrice: number,
  targetPrice: number,
  floor: number,
  ceiling: number,
  rate = PRICE_ADJUSTMENT_RATE
): number {
  const prev = Number.isFinite(prevPrice) && prevPrice > 0 ? prevPrice : targetPrice;
  return rn(minmax(prev + (targetPrice - prev) * rate, floor, ceiling), 2);
}
