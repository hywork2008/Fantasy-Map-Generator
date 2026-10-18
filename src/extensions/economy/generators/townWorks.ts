import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext, isEconomyContextReady } from "../economyContext";
import { creditHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { getStapleFoodGood } from "./foodProduction";

/**
 * Months of the town's food bill its households should hold before the town stops hiring for
 * works (docs/plan/farm-labour-calibration.md §12).
 */
export const TOWN_WORKS_TARGET_MONTHS = 2;
/** Share of the treasury above its reserve a town may spend on works wages in one month. */
export const TOWN_WORKS_TREASURY_SHARE = 0.1;
/** Treasury the town keeps for its own trades and production, in months of its food bill. */
export const TOWN_WORKS_RESERVE_MONTHS = 2;

/**
 * Towns hire their own poor for works — walls, paving, wells, the watch, carting for the granary —
 * when household cash runs below the target. The money is the town's dues and trade income,
 * which used to sit in `burg.treasury` (a town with nine months of food money in the treasury and
 * three weeks in its households) until the annual sweep sent it to the market and the State.
 * Returns the wages paid.
 */
export function payTownWorks(): number {
  if (!isEconomyContextReady()) return 0;
  const world = getWorldContext();
  const staple = getStapleFoodGood();
  const priceByMarket = new Map<number, number>();
  for (const market of getMarkets()) {
    const price = staple ? market.goods?.[staple.i]?.price : undefined;
    priceByMarket.set(market.i, typeof price === "number" && price > 0 ? price : (staple?.value ?? 1));
  }
  const peoplePerPoint = (world.populationRate ?? 1000) * (world.urbanization ?? 1);
  let paid = 0;
  for (const burg of world.pack.burgs ?? []) {
    const population = burg?.population ?? 0;
    if (!burg?.i || burg.removed || !(population > 0)) continue;
    const price = priceByMarket.get(burg.market ?? -1) ?? staple?.value ?? 1;
    const monthlyFoodBill = (population * peoplePerPoint * GROSS_FOOD_NEED * price) / 12;
    const shortfall = monthlyFoodBill * TOWN_WORKS_TARGET_MONTHS - getHouseholdWealth(burg.i);
    if (!(shortfall > 0)) continue;
    const reserve = monthlyFoodBill * TOWN_WORKS_RESERVE_MONTHS;
    const spendable = ((burg.treasury ?? 0) - reserve) * TOWN_WORKS_TREASURY_SHARE;
    const wages = rn(Math.min(shortfall, spendable), 2);
    if (!(wages > 0)) continue;
    burg.treasury = rn((burg.treasury ?? 0) - wages, 2);
    creditHouseholdWealth(burg.i, wages);
    paid += wages;
  }
  return rn(paid, 2);
}
