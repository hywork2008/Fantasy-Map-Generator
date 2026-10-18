/**
 * Town luxury demand by budget and price tier (docs/plan/luxury-value-demand.md §3). The
 * unit-count demand bought the cheapest coverage first, so furs and incense met the whole target and
 * precious goods were never bought. With the world setting on, a town instead spends a budget that
 * follows its size and wealth, split across price tiers by the town's standing. Purchases are in
 * townLuxuryPurchases.ts; the trade demand reads the same budgets.
 */
import { worldSettings } from "../../../simulation/worldSettings";
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods, getWorldContext } from "../economyContext";
import { getEconomyStartProfile } from "./economyStartMode";
import { isGoodEnabled } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import { LUXURY_TIERS, type LuxuryTier, luxuryCoverageOf, luxuryTierOf } from "./luxuryTiers";
import type { Market } from "./marketTypes";
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

let coverageByTier = new Map<LuxuryTier, number>();

/** Enabled goods serving luxury demand, by price tier (cached per catalogue). */
export function luxuryGoodsByTier(): Map<LuxuryTier, Good[]> {
  const goods = getGoods();
  if (goods !== catalogue) {
    catalogue = goods;
    goodsByTier = new Map(LUXURY_TIERS.map(tier => [tier, [] as Good[]]));
    for (const good of goods) {
      if (!isGoodEnabled(good) || !(luxuryCoverageOf(good) > 0)) continue;
      goodsByTier.get(luxuryTierOf(good))!.push(good);
    }
    coverageByTier = new Map(
      LUXURY_TIERS.map(tier => [tier, goodsByTier.get(tier)!.reduce((sum, good) => sum + luxuryCoverageOf(good), 0)])
    );
  }
  return goodsByTier;
}

/** A good's share of its tier's budget in the trade demand: its coverage against the tier's (§3.5). */
export function luxuryShareInTier(good: Good): number {
  luxuryGoodsByTier();
  const coverage = luxuryCoverageOf(good);
  if (!(coverage > 0) || !isGoodEnabled(good)) return 0;
  return coverage / (coverageByTier.get(luxuryTierOf(good)) || 1);
}

/**
 * Production cycles of town luxury buying a market's merchants keep in stock. One cycle of a single
 * precious good is a few hundredths of a lot, under the smallest trade lot, so merchants bring a
 * half year's custom at once.
 */
export const LUXURY_STOCK_CYCLES = 6;

/** Units of a luxury a market's merchants keep for its towns: LUXURY_STOCK_CYCLES of their budgets. */
export function luxuryStockTarget(budgets: Record<LuxuryTier, number> | undefined, good: Good, price: number): number {
  if (!budgets || !(price > 0)) return 0;
  const share = luxuryShareInTier(good);
  return share > 0 ? (budgets[luxuryTierOf(good)] * share * LUXURY_STOCK_CYCLES) / price : 0;
}

/** The luxury whose stock falls furthest short of its target, by value; null when none is short. */
export function largestLuxuryShortfall(
  market: Pick<Market, "goods">,
  budgets: Record<LuxuryTier, number> | undefined
): { good: Good; price: number; value: number } | null {
  let best: { good: Good; price: number; value: number } | null = null;
  for (const goods of luxuryGoodsByTier().values())
    for (const good of goods) {
      const price = market.goods[good.i]?.price || good.value;
      const shortUnits = luxuryStockTarget(budgets, good, price) - (market.goods[good.i]?.stock ?? 0);
      const value = shortUnits * price;
      if (value > 0 && (!best || value > best.value)) best = { good, price, value };
    }
  return best;
}

/** Each market's luxury budget per price tier and production cycle, summed over its towns (§3.5). */
export function luxuryBudgetByMarketTier(
  burgs: readonly (Burg | undefined)[]
): Map<number, Record<LuxuryTier, number>> {
  const byMarket = new Map<number, Record<LuxuryTier, number>>();
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    const budget = luxuryBudget(burg);
    if (!(budget > 0)) continue;
    const shares = LUXURY_TIER_SHARES[townStanding(burg)];
    let row = byMarket.get(burg.market);
    if (!row) {
      row = { common: 0, fine: 0, precious: 0 };
      byMarket.set(burg.market, row);
    }
    for (const tier of LUXURY_TIERS) row[tier] += budget * shares[tier];
  }
  return byMarket;
}
