/**
 * Town luxury demand by budget and price tier (docs/plan/luxury-value-demand.md §3). The
 * unit-count demand bought the cheapest coverage first, so furs and incense met the whole target and
 * precious goods were never bought. With the world setting on, a town instead spends a budget that
 * follows its size and wealth, split across price tiers by the town's standing; a tier it cannot fill
 * passes its money down to the next cheaper tier, and what is left stays in the treasury.
 */
import { worldSettings } from "../../../simulation/worldSettings";
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods, getWorldContext } from "../economyContext";
import { getEconomyStartProfile } from "./economyStartMode";
import { isGoodEnabled } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import { LUXURY_TIERS, type LuxuryTier, luxuryCoverageOf, luxuryTierOf } from "./luxuryTiers";
import { Markets } from "./markets-generator";
import type { Deal } from "./marketTypes";
import { nominal } from "./moneyScale";

export const LUXURY_VALUE_DEMAND_SETTING = "fmg-luxury-value-demand";

/** "on" switches town luxury demand to the budget model; anything else keeps the unit-count demand. */
export function isLuxuryValueDemandEnabled(): boolean {
  try {
    return worldSettings.getItem(LUXURY_VALUE_DEMAND_SETTING) === "on";
  } catch {
    return false;
  }
}

/** Luxury budget per population point and production cycle, before the money scale. */
export const LUXURY_SPEND_PER_POP = 0.03;
/** Bounds of the wealth index (treasury per population point against the start endowment). */
export const LUXURY_WEALTH_INDEX_MIN = 0.25;
export const LUXURY_WEALTH_INDEX_MAX = 3;
/** Below this population a burg is a small town; from the large threshold (or a port) a large one. */
export const SMALL_TOWN_MAX_POPULATION = 5;
export const LARGE_TOWN_MIN_POPULATION = 20;

export type TownStanding = "small" | "town" | "large" | "capital";

/** Share of the luxury budget for each price tier, by the town's standing (§3.3). */
export const LUXURY_TIER_SHARES: Readonly<Record<TownStanding, Readonly<Record<LuxuryTier, number>>>> = {
  small: { common: 0.7, fine: 0.3, precious: 0 },
  town: { common: 0.5, fine: 0.35, precious: 0.15 },
  large: { common: 0.4, fine: 0.35, precious: 0.25 },
  capital: { common: 0.3, fine: 0.35, precious: 0.35 }
};

/** Dearest first: an unfilled tier's money moves down to the next cheaper one. */
const PURCHASE_ORDER: readonly LuxuryTier[] = [...LUXURY_TIERS].reverse();

export function townStanding(burg: Pick<Burg, "population" | "capital" | "port">): TownStanding {
  if (burg.capital) return "capital";
  const population = burg.population ?? 0;
  if (population >= LARGE_TOWN_MIN_POPULATION || burg.port) return "large";
  if (population < SMALL_TOWN_MAX_POPULATION) return "small";
  return "town";
}

/** Tier shares relative to the town's largest share; production weights its luxury boost by them (§3.4). */
export function luxuryTierWeights(burg: Pick<Burg, "population" | "capital" | "port">): Record<LuxuryTier, number> {
  const shares = LUXURY_TIER_SHARES[townStanding(burg)];
  const top = Math.max(...LUXURY_TIERS.map(tier => shares[tier])) || 1;
  return Object.fromEntries(LUXURY_TIERS.map(tier => [tier, shares[tier] / top])) as Record<LuxuryTier, number>;
}

export function luxuryBudget(burg: Pick<Burg, "population" | "treasury">): number {
  const population = burg.population ?? 0;
  if (!(population > 0)) return 0;
  const endowment = getEconomyStartProfile(getWorldContext().options ?? {}).burgTreasuryPerPopulation;
  const perPop = (burg.treasury ?? 0) / population;
  const wealthIndex =
    endowment > 0
      ? Math.min(LUXURY_WEALTH_INDEX_MAX, Math.max(LUXURY_WEALTH_INDEX_MIN, perPop / endowment))
      : LUXURY_WEALTH_INDEX_MIN;
  return rn(population * nominal(LUXURY_SPEND_PER_POP) * wealthIndex, 2);
}

let catalogue: readonly Good[] | null = null;
let goodsByTier = new Map<LuxuryTier, Good[]>();

function luxuryGoodsByTier(): Map<LuxuryTier, Good[]> {
  const goods = getGoods();
  if (goods !== catalogue) {
    catalogue = goods;
    goodsByTier = new Map(LUXURY_TIERS.map(tier => [tier, [] as Good[]]));
    for (const good of goods) {
      if (!isGoodEnabled(good) || !(luxuryCoverageOf(good) > 0)) continue;
      goodsByTier.get(luxuryTierOf(good))!.push(good);
    }
  }
  return goodsByTier;
}

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
