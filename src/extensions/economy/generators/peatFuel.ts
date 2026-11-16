/** Peat as a fuel beside Wood (docs/plan/saltworks-fuel-procurement.md §2.3). */
import { pow } from "../../../simulation/deterministicMath";
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getGoods } from "../economyContext";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { WOOD_KG_PER_LOT } from "./woodRecipeContracts";

/** One Peat bale (200 kg) of air-dried sod peat gives about the heat of the same mass of air-dried Wood. */
export const PEAT_KG_PER_BALE = 200;
/** Wood piles of heat one Peat bale gives. */
export const PEAT_HEAT_PER_BALE = PEAT_KG_PER_BALE / WOOD_KG_PER_LOT;

export function getPeatGood(): Good | undefined {
  return getGoods().find(good => good.name === "Peat" && isGoodEnabled(good));
}

/** Wood a kilogram of boiled salt burns (salt-logistics.md). */
export const SALT_BOILING_WOOD_KG_PER_KG = 60 / 34.5;
/** Wood piles one 60 kg bag of boiled salt burns; Peat burns the same heat in bales. */
export const SALT_BOILING_WOOD_PILES_PER_BAG = (60 * SALT_BOILING_WOOD_KG_PER_KG) / WOOD_KG_PER_LOT;

/**
 * Each fuel's share of a heat need under `fuelChoice` priceShare (docs/plan/fuel-price-share.md):
 * price per heat to the power of -`fuelPriceElasticity`, over the fuels in stock. Undefined under
 * `cheapest`, where buyers take the cheaper fuel first for all of it.
 */
export function fuelPriceShares(fuels: readonly { costPerHeat: number; stock: number }[]): number[] | undefined {
  const settings = getMarketSettings();
  if (settings.fuelChoice !== "priceShare" || fuels.length < 2) return undefined;
  const weights = fuels.map(fuel =>
    fuel.stock > 0 && fuel.costPerHeat > 0 ? pow(fuel.costPerHeat, -settings.fuelPriceElasticity) : 0
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0) || !Number.isFinite(total)) return undefined;
  return weights.map(weight => weight / total);
}
