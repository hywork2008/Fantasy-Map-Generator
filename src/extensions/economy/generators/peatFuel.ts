/** Peat as a fuel beside Wood (docs/plan/saltworks-fuel-procurement.md §2.3). */
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
