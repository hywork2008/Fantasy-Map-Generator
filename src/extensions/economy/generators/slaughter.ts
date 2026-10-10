/**
 * Slaughter of the food herd (docs/plan/fmg-economy-to-city-editor.md §8.1).
 *
 * Cattle, sheep, pigs and goats reach the market as live heads. Tallow and Leather
 * already price a single-ingredient recipe for some of them, but those recipes lose
 * the labor ranking, so the heads are sold alive. This pass runs after that craft
 * and before household demand, and turns whatever heads remain into the products
 * those recipes already price.
 *
 * Yield per head is the inverse of the recipe coefficient: `{ Pig: 0.5 }` on Tallow
 * is two barrels per head. A species with both a Tallow recipe and a Leather recipe
 * yields both, because one carcass has both fat and a hide. Horses, camels and
 * other draft animals are not food-tagged and stay in the market. Chickens stay
 * too: their catalog product is eggs, not a hide or tallow.
 *
 * No catalog good states how much meat one head yields. Game is hunted meat.
 * This pass does not invent that ratio and does not add a Meat good.
 */

import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarkets,
  getOrCreateCumulativeGoodsSales,
  getOrCreateMarketGoodProductionTotals
} from "../economyContext";
import { recordFoodMarketIntake } from "./foodProcessingLedger";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Market } from "./marketTypes";

export interface SlaughterResult {
  heads: number;
  tallow: number;
  leather: number;
}

/** Heads of `animal` one unit of `output` consumes, when the recipe is that animal alone. */
export function singleIngredientHeads(output: Good, animalId: number): number | undefined {
  for (const recipe of output.recipes ?? []) {
    const keys = Object.keys(recipe);
    if (keys.length !== 1 || Number(keys[0]) !== animalId) continue;
    const heads = recipe[animalId];
    if (typeof heads === "number" && heads > 0) return heads;
  }
  return undefined;
}

function credit(market: Market, good: Good, units: number): void {
  if (!(units > 0) || !isGoodEnabled(good)) return;
  const row = market.goods[good.i] ?? { stock: 0, price: good.value };
  market.goods[good.i] = row;
  row.stock = rn(row.stock + units, 2);
  recordGoodFlow({
    direction: "source",
    category: "burgCraft",
    goodId: good.i,
    units,
    marketId: market.i,
    burgId: market.centerBurgId
  });
  recordFoodMarketIntake(market, good.name, units);
  const sales = getOrCreateCumulativeGoodsSales();
  if (sales) sales[good.i] = rn((sales[good.i] ?? 0) + units, 2);
  const produced = getOrCreateMarketGoodProductionTotals();
  if (produced) {
    const key = `${market.i}:${good.i}`;
    produced[key] = rn((produced[key] ?? 0) + units, 2);
  }
}

/**
 * Converts remaining food-herd stock into tallow and leather.
 * Returns the heads taken and the units credited.
 */
export function settleSlaughter(): SlaughterResult {
  const goods = getGoods();
  const tallow = goods.find(good => good.name === "Tallow");
  const leather = goods.find(good => good.name === "Leather");
  const animals = goods.filter(
    good => good.tags?.includes("liveAnimal") && good.tags.includes("food") && isGoodEnabled(good)
  );
  const result: SlaughterResult = { heads: 0, tallow: 0, leather: 0 };
  if (!animals.length || (!tallow && !leather)) return result;

  for (const market of getMarkets()) {
    for (const animal of animals) {
      const tallowHeads = tallow ? singleIngredientHeads(tallow, animal.i) : undefined;
      const leatherHeads = leather ? singleIngredientHeads(leather, animal.i) : undefined;
      if (tallowHeads === undefined && leatherHeads === undefined) continue;
      const row = market.goods[animal.i];
      const heads = row?.stock ?? 0;
      if (!(heads > 0.001)) continue;
      row!.stock = 0;
      recordGoodFlow({
        direction: "sink",
        category: "recipeInput",
        goodId: animal.i,
        units: heads,
        marketId: market.i,
        burgId: market.centerBurgId,
        relatedGoodId: tallowHeads !== undefined ? tallow?.i : leather?.i
      });
      const tallowUnits = tallow && tallowHeads ? rn(heads / tallowHeads, 2) : 0;
      const leatherUnits = leather && leatherHeads ? rn(heads / leatherHeads, 2) : 0;
      if (tallow) credit(market, tallow, tallowUnits);
      if (leather) credit(market, leather, leatherUnits);
      result.heads = rn(result.heads + heads, 2);
      result.tallow = rn(result.tallow + tallowUnits, 2);
      result.leather = rn(result.leather + leatherUnits, 2);
    }
  }
  return result;
}
