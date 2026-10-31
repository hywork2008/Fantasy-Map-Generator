/**
 * What people hold the first winter after the map is made (docs/plan/start-provisioning.md). The
 * towns and villages are already lived in: last year's salt, clothes and bedding sit in their
 * markets, they live in houses and farm the fields their forebears cleared, so the first months do not open on empty shelves and a doubled price. Runs once per
 * world, only before it is first advanced; an advanced world keeps the stock it has.
 */
import { rn } from "../../hostUtils";
import { getEconomySlice } from "../context/economyApi";
import { getGoods, getMarkets } from "../context/trade";
import { seedStartHousing } from "./constructionEmployment";
import { DevelopmentPotential } from "./developmentPotential";
import { isGoodEnabled } from "./goods-generator";
import { seedWorldBirthSaltStock } from "./saltLogistics";
import { getMarketBlanketDemandProfile, getMarketTextileDemandProfile } from "./textileDemand";
import { isUnadvancedWorld } from "./worldBirthHerds";

/** Saved in the economy slice once a world's start stock is seeded. */
export const START_PROVISIONING_KEY = "startProvisioning";
const START_PROVISIONING_VERSION = 2;
/** Months of household clothing and bedding replacement the markets hold at the start (provisional). */
export const START_TEXTILE_STOCK_MONTHS = 3;

/** Seeds the start stock once, on a world that has not been advanced. Returns true when it seeded. */
export function settleStartProvisioning(): boolean {
  const slice = getEconomySlice();
  if (!slice || slice[START_PROVISIONING_KEY] === START_PROVISIONING_VERSION) return false;
  slice[START_PROVISIONING_KEY] = START_PROVISIONING_VERSION;
  if (!isUnadvancedWorld()) return false;
  // A save made at world birth kept fields sized by an earlier, smaller plan (start-provisioning.md §4.2).
  DevelopmentPotential.replanWorldBirth();
  seedStartHousing();
  seedWorldBirthSaltStock();
  seedStartTextileStock();
  return true;
}

function seedStartTextileStock(): void {
  const enabled = (name: string) => getGoods().find(good => good.name === name && isGoodEnabled(good));
  // The ordinary household garment; dearer linen and wool clothes come from the textile chains.
  const garments = enabled("Garments") ?? enabled("Wool Garments") ?? enabled("Linen Garments");
  const blankets = enabled("Wool Blankets");
  for (const market of getMarkets()) {
    if (garments) {
      const units = getMarketTextileDemandProfile(market.i).monthlyDemand * START_TEXTILE_STOCK_MONTHS;
      seed(market, garments.i, garments.value, units);
    }
    if (blankets) {
      const units = getMarketBlanketDemandProfile(market.i).monthlyDemand * START_TEXTILE_STOCK_MONTHS;
      seed(market, blankets.i, blankets.value, units);
    }
  }
}

function seed(market: ReturnType<typeof getMarkets>[number], goodId: number, value: number, units: number): void {
  if (!(units > 0)) return;
  market.goods[goodId] ??= { stock: 0, price: value };
  market.goods[goodId].stock = rn(Math.max(market.goods[goodId].stock, units), 4);
}
