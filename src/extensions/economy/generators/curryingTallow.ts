/**
 * Tallow the curriers stuff into the leather of shoes, leather goods and harness
 * (docs/plan/currying-tallow.md): `curryingTallowKgPerHide` a hide, by the recipe's Leather.
 */
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getGoods } from "../economyContext";
import { GOOD_MEASURES } from "./goodMeasureCatalog";
import type { Good } from "./goodsGeneratorTypes";

const CURRIED_GOODS = new Set(["Boots", "Leather Goods", "Harnesses"]);

/** Tallow units for `lots` of the good, or undefined when it takes none. */
export function getCurryingTallow(
  goodName: string,
  ingredients: readonly { goodId: number; amount: number }[],
  lots: number
): { tallow: Good; units: number } | undefined {
  const kgPerHide = getMarketSettings().curryingTallowKgPerHide;
  if (!CURRIED_GOODS.has(goodName) || !(kgPerHide > 0) || !(lots > 0)) return undefined;
  const goods = getGoods();
  const leather = goods.find(good => good.name === "Leather");
  const tallow = goods.find(good => good.name === "Tallow");
  if (!leather || !tallow) return undefined;
  const hides = ingredients.find(ingredient => ingredient.goodId === leather.i)?.amount ?? 0;
  if (!(hides > 0)) return undefined;
  const units = (lots * hides * kgPerHide) / GOOD_MEASURES.Tallow.kg;
  return units > 1e-9 ? { tallow, units } : undefined;
}
