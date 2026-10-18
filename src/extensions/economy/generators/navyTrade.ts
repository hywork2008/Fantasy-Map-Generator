/**
 * State navy ships trading under a merchant flag while on patrol (docs/plan/ships.md §4.5,
 * docs/plan/initial-wealth-calibration.md §8). Replaces the old abstract voyage income, which
 * created money with nothing moving:
 *
 * - The treasury buys export goods from the ship's home-port market (money stays in the economy).
 * - The goods leave; the ship returns with luxuries, which that market buys at a markup.
 * - The treasury keeps the markup. Domestic goods out, foreign luxuries in, no money from nowhere.
 * - Crew wages are a separate charge on the treasury, paid into the home port's households.
 */

import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext, isEconomyContextReady } from "../economyContext";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import { spendInBurg } from "./householdWealth";
import { isLuxuryValueDemandEnabled, largestLuxuryShortfall, luxuryBudgetByMarketTier } from "./luxuryDemand";
import { isLuxuryDemandGood, luxuryTierOf } from "./luxuryTiers";
import type { Market } from "./marketTypes";
import { nominal } from "./moneyScale";

/** Goods value a ship of one build point trades per year (sloop 10 pt → 160). */
export const NAVY_TRADE_VALUE_PER_BUILD_POINT_PER_YEAR = 16;
/** Markup the home market pays on the luxuries brought back; the treasury's gross profit. */
export const NAVY_TRADE_MARKUP = 0.25;
/** Share of one good's stock a single voyage may take. */
const EXPORT_STOCK_SHARE = 0.1;
/** Crew wage per crew place per year (sloop 100 crew → 25). */
export const NAVY_CREW_WAGE_PER_YEAR = 0.25;

const isFood = (good: Good) => good.tags.some(tag => tag === "food" || tag === "freshFood" || tag === "stapleFood");
const isLuxury = (good: Good) => good.tags.some(tag => tag === "luxury" || tag === "art" || tag === "gift");
/** Luxuries a voyage may bring home under the value demand; cheap ones (furs, resin) still sail out. */
const isKeptLuxury = (good: Good) => isLuxury(good) || (isLuxuryDemandGood(good) && luxuryTierOf(good) !== "common");

function homeMarket(homeBurgId: number): Market | undefined {
  const burg = getWorldContext().pack.burgs?.[homeBurgId];
  if (!burg?.i || burg.removed || !burg.market) return undefined;
  return getMarkets().find(market => market.i === burg.market);
}

export interface NavyTradeResult {
  exported: number;
  imported: number;
  profit: number;
}

/** One ship's trade for `deltaYears`. Returns zeros when there is nothing to sell or no buyer. */
export function settleNavyVoyageTrade(
  stateId: number,
  homeBurgId: number,
  buildPoints: number,
  deltaYears: number
): NavyTradeResult {
  const none = { exported: 0, imported: 0, profit: 0 };
  if (!isEconomyContextReady() || !(buildPoints > 0) || !(deltaYears > 0)) return none;
  const state = getWorldContext().pack.states?.[stateId];
  const market = homeMarket(homeBurgId);
  if (!state?.i || state.removed || !market?.marketTreasury) return none;

  const goods = getGoods();
  const byId = new Map(goods.map(good => [good.i, good]));
  // Export: the market's largest non-food surpluses by value, paid for by the treasury.
  let budget = Math.min(
    nominal(NAVY_TRADE_VALUE_PER_BUILD_POINT_PER_YEAR) * buildPoints * deltaYears,
    Math.max(0, state.treasury ?? 0)
  );
  const keepLuxuries = isLuxuryValueDemandEnabled();
  // Under the luxury value demand a voyage sails only for the luxury the home towns' budgets are
  // shortest of, and loads no more than that shortfall can repay with the markup. Otherwise the
  // treasury would buy exports with nothing coming back, draining it into the port market.
  const shortfall = keepLuxuries
    ? largestLuxuryShortfall(market, luxuryBudgetByMarketTier(getWorldContext().pack.burgs ?? []).get(market.i))
    : null;
  if (keepLuxuries) {
    if (!shortfall) return none;
    budget = Math.min(budget, shortfall.value / (1 + NAVY_TRADE_MARKUP));
  }
  let exported = 0;
  const offers = Object.entries(market.goods)
    .map(([id, row]) => ({ good: byId.get(Number(id)), row }))
    // Under the luxury value demand the ship does not carry back out the luxuries it brought in
    // (docs/plan/luxury-value-demand.md §12): they wait for the towns' budgets instead.
    .filter(entry => entry.good && !isFood(entry.good) && !(keepLuxuries && isKeptLuxury(entry.good)))
    .filter(entry => entry.row.stock > 0 && entry.row.price > 0)
    .sort((a, b) => b.row.stock * b.row.price - a.row.stock * a.row.price);
  for (const { good, row } of offers) {
    if (!(budget > 1e-6)) break;
    const units = Math.min(row.stock * EXPORT_STOCK_SHARE, budget / row.price);
    if (!(units > 0)) continue;
    row.stock = rn(row.stock - units, 4);
    recordGoodFlow({ direction: "sink", category: "navyExport", goodId: good!.i, units, marketId: market.i });
    exported += units * row.price;
    budget -= units * row.price;
  }
  exported = rn(exported, 4);
  if (!(exported > 0)) return none;
  state.treasury = rn((state.treasury ?? 0) - exported, 4);
  market.marketTreasury.balance = rn(market.marketTreasury.balance + exported, 4);

  // Import: luxuries, the dearest at home first (under the value demand, the shortfall found above),
  // bought by the market as far as its cash allows.
  const luxuries = goods
    .filter(good => isLuxury(good) && !isFood(good))
    .map(good => ({ good, price: market.goods[good.i]?.price ?? good.value }))
    .filter(entry => entry.price > 0)
    .sort((a, b) => b.price - a.price);
  const target = keepLuxuries ? shortfall : luxuries[0];
  let imported = 0;
  if (target) {
    const wanted = exported * (1 + NAVY_TRADE_MARKUP);
    imported = rn(
      Math.min(shortfall ? Math.min(wanted, shortfall.value) : wanted, Math.max(0, market.marketTreasury.balance)),
      4
    );
    const row = market.goods[target.good.i] ?? { stock: 0, price: target.price };
    row.stock = rn(row.stock + imported / target.price, 4);
    recordGoodFlow({
      direction: "source",
      category: "navyImport",
      goodId: target.good.i,
      units: imported / target.price,
      marketId: market.i
    });
    market.goods[target.good.i] = row;
    market.marketTreasury.balance = rn(market.marketTreasury.balance - imported, 4);
    state.treasury = rn((state.treasury ?? 0) + imported, 4);
  }
  return { exported, imported, profit: rn(imported - exported, 4) };
}

/** Crew wages for one ship: from the treasury into the home port's households. Returns the amount paid. */
export function payNavyCrew(stateId: number, homeBurgId: number, crew: number, deltaYears: number): number {
  if (!isEconomyContextReady() || !(crew > 0) || !(deltaYears > 0)) return 0;
  const state = getWorldContext().pack.states?.[stateId];
  if (!state?.i || state.removed) return 0;
  const wage = rn(Math.min(crew * NAVY_CREW_WAGE_PER_YEAR * deltaYears, Math.max(0, state.treasury ?? 0)), 4);
  if (!(wage > 0) || !spendInBurg(homeBurgId, wage)) return 0;
  state.treasury = rn((state.treasury ?? 0) - wage, 4);
  return wage;
}
