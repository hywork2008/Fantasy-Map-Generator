import type { Good } from "./goodsGeneratorTypes";

/**
 * Precious metals are counted in kilograms so that a jewel's few hundred grams of gold stays above
 * the market's smallest lot while a tonne of silver carries its coin value
 * (docs/plan/money-supply-mint.md §11.1). Deposits, mines and smelters keep their tonnes.
 */
export const KILOGRAM_UNIT = "kg";

/** Market units of `good` in one tonne: 1000 for a kilogram-counted good, else 1 (tonne-counted). */
export function getGoodUnitsPerTon(good: Pick<Good, "unit">): number {
  return good.unit === KILOGRAM_UNIT ? 1000 : 1;
}
