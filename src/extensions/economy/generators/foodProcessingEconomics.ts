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
 * Glass is priced from the alkali its makers can buy: wood ash in the north, barilla in the warm
 * ports. Averaging in the barilla of the far salt shores priced every inland market's glass as if
 * it were melted with dear imported ash (docs/plan/barilla.md §3.3). A market holding no full lot of
 * any alkali prices it from the cheapest alkali known, as glass made there would be.
 */
const STOCKED_RECIPE_PRICED_GOODS = new Set(["Beer", "Glass"]);
const CHEAPEST_RECIPE_FALLBACK_GOODS = new Set(["Glass"]);

import { cheapestContainerChoiceCosts } from "./returnableContainers";

/**
 * The ingredient cost a manufactured good's price is built on: the mean over its recipes, or for a
 * good priced by its stocked recipe, the cheapest recipe whose every ingredient the market holds a
 * lot of (when none is, the mean, or for Glass the cheapest makeable recipe). `makeable[k]` false
 * marks a recipe with an ingredient not yet known to the world, dropped from its entries: it is
 * never chosen, as production skips it (Glass's Soda Ash before industrial alkali would otherwise
 * price glass as sand alone).
 */
export function getRecipeCostBasis(
  goodName: string,
  recipes: readonly (readonly { goodId: number; amount: number }[])[],
  priceOf: (goodId: number) => number,
  stockOf: (goodId: number) => number,
  isContainer?: (goodId: number) => boolean,
  makeable?: readonly boolean[]
): number {
  if (!recipes.length) return 0;
  const costs = recipes.map(recipe => recipe.reduce((total, entry) => total + entry.amount * priceOf(entry.goodId), 0));
  // A drink's casks, pots and bottles are one choice, priced at the cheapest container.
  const choices = isContainer ? cheapestContainerChoiceCosts(recipes, costs, isContainer) : costs;
  const mean = choices.reduce((total, cost) => total + cost, 0) / choices.length;
  if (!STOCKED_RECIPE_PRICED_GOODS.has(goodName)) return mean;
  const usable = (index: number) => makeable?.[index] !== false && recipes[index].length > 0;
  const stocked = costs.filter(
    (_, index) => usable(index) && recipes[index].every(entry => stockOf(entry.goodId) >= entry.amount)
  );
  if (stocked.length) return Math.min(...stocked);
  if (!CHEAPEST_RECIPE_FALLBACK_GOODS.has(goodName)) return mean;
  const known = costs.filter((_, index) => usable(index));
  return known.length ? Math.min(...known) : mean;
}
