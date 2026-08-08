/** The minimum post-tax value added required to fund one unit of food-processing craft work. */
export const FOOD_PROCESSING_MINIMUM_MARGIN_RATIO = 0.1;

const FOOD_PROCESSING_GOODS = new Set(["Cheese", "Wine", "Raisins"]);

export function hasViableFoodProcessingMargin(
  goodName: string,
  saleValue: number,
  ingredientCost: number,
  salesTaxRate: number
): boolean {
  if (!FOOD_PROCESSING_GOODS.has(goodName)) return saleValue > ingredientCost;
  const postTaxRevenue = saleValue * Math.max(0, 1 - salesTaxRate);
  return postTaxRevenue - ingredientCost >= postTaxRevenue * FOOD_PROCESSING_MINIMUM_MARGIN_RATIO;
}
