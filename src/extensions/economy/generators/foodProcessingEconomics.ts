/** The minimum post-tax value added required to fund one unit of food-processing craft work. */
export const FOOD_PROCESSING_MINIMUM_MARGIN_RATIO = 0.1;

const FOOD_PROCESSING_GOODS = new Set(["Cheese", "Wine", "Raisins", "Cider", "Perry", "Mead"]);

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

/**
 * Goods whose recipes are the same drink from interchangeable grains, priced from the grain a
 * market's brewers can actually buy. The Assize of Ale set the price of ale by the price of the grain
 * it was brewed from; averaging all four grains priced wheat ale before the harvest, when only wheat
 * was left, below its malt (docs/analytics/beer-other-20261107.md §2.4).
 */
const STOCKED_RECIPE_PRICED_GOODS = new Set(["Beer"]);

/**
 * The ingredient cost a manufactured good's price is built on: the mean over its recipes, or for a
 * good priced by its stocked recipe, the cheapest recipe whose every ingredient the market holds a
 * lot of (the mean again when none is).
 */
export function getRecipeCostBasis(
  goodName: string,
  recipes: readonly (readonly { goodId: number; amount: number }[])[],
  priceOf: (goodId: number) => number,
  stockOf: (goodId: number) => number
): number {
  if (!recipes.length) return 0;
  const costs = recipes.map(recipe => recipe.reduce((total, entry) => total + entry.amount * priceOf(entry.goodId), 0));
  const mean = costs.reduce((total, cost) => total + cost, 0) / costs.length;
  if (!STOCKED_RECIPE_PRICED_GOODS.has(goodName)) return mean;
  const stocked = costs.filter((_, index) => recipes[index].every(entry => stockOf(entry.goodId) >= entry.amount));
  return stocked.length ? Math.min(...stocked) : mean;
}
