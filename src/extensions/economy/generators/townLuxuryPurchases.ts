/**
 * Town luxury purchases from the budget in luxuryDemand.ts (docs/plan/luxury-value-demand.md §3.2–3.3):
 * dearest tier first, and a tier the market cannot fill passes its money down to the next cheaper
 * tier. What no tier can spend stays in the treasury.
 */
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { LUXURY_TIER_SHARES, luxuryBudget, luxuryGoodsByTier, townStanding } from "./luxuryDemand";
import { LUXURY_TIERS, type LuxuryTier, luxuryCoverageOf } from "./luxuryTiers";
import { Markets } from "./markets-generator";
import type { Deal } from "./marketTypes";

/** Dearest first: an unfilled tier's money moves down to the next cheaper one. */
const PURCHASE_ORDER: readonly LuxuryTier[] = [...LUXURY_TIERS].reverse();

export interface LuxuryPurchaseResult {
  deals: Deal[];
  spent: number;
  /** Budget no tier could spend (stock missing); it stays in the treasury. */
  unspent: number;
}

/**
 * Spends the town's luxury budget from its treasury, dearest tier first. Within a tier the cheapest
 * coverage is bought first, as in the unit-count demand.
 */
export function buyTownLuxuries(burg: Burg): LuxuryPurchaseResult {
  const result: LuxuryPurchaseResult = { deals: [], spent: 0, unspent: 0 };
  const market = Markets.get(burg.market);
  if (!market) return result;
  const budget = Math.min(luxuryBudget(burg), Math.max(0, burg.treasury ?? 0));
  if (!(budget > 0.01)) return result;

  const shares = LUXURY_TIER_SHARES[townStanding(burg)];
  const byTier = luxuryGoodsByTier();
  let carry = 0;
  for (const tier of PURCHASE_ORDER) {
    let tierBudget = budget * shares[tier] + carry;
    const candidates = byTier
      .get(tier)!
      .filter(good => (market.goods[good.i]?.stock ?? 0) > 0.01)
      .map(good => {
        const unitPrice = Markets.customerBuyPrice(market.goods[good.i].price, burg.i, good.i);
        return { good, unitPrice, costPerCoverage: unitPrice / luxuryCoverageOf(good) };
      })
      .sort((a, b) => a.costPerCoverage - b.costPerCoverage);
    for (const { good, unitPrice } of candidates) {
      const cash = Math.min(tierBudget, burg.treasury ?? 0);
      if (!(cash > 0.01)) break;
      // Markets.buy rounds units to 0.01; round down so a dear good cannot overrun the budget.
      const units = Math.floor((cash / unitPrice) * 100) / 100;
      if (units < 0.01) continue;
      const deal = Markets.buy({ burg, good, units, budget: cash, flow: { category: "luxuryPurchase" } });
      if (!deal) continue;
      const cost = deal.units * deal.price;
      burg.treasury = rn((burg.treasury ?? 0) - cost, 2);
      tierBudget -= cost;
      result.spent += cost;
      result.deals.push(deal);
    }
    carry = Math.max(0, tierBudget);
  }
  result.spent = rn(result.spent, 2);
  result.unspent = rn(carry, 2);
  return result;
}
