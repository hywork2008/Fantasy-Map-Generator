/**
 * Characters of rank buy luxuries in their home town (docs/plan/luxury-value-demand.md §4). Part
 * of their living cost, and more of what they spend beyond their reserve, buys goods from the
 * market of the town they live in instead of passing to its households as cash. Dearest tier first;
 * within a tier, goods the character likes come first, then the market's largest stock by value.
 * Whatever finds no goods goes back to the caller, which hands it to the town as before.
 */
import { TASTE_GOOD_MATCH } from "../../characters/backstoryProfile";
import type { Character } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import type { LifestyleTier } from "./characterLivingCosts";
import { luxuryGoodsByTier } from "./luxuryDemand";
import { LUXURY_TIERS, type LuxuryTier } from "./luxuryTiers";
import { Markets } from "./markets-generator";

/** Share of the living cost spent on luxuries, by lifestyle tier (§4.1). */
export const LIFESTYLE_LUXURY_SHARE: Readonly<Partial<Record<LifestyleTier, number>>> = {
  ruler: 0.25,
  centralOffice: 0.2,
  provinceLord: 0.2,
  marketManager: 0.05,
  guildMaster: 0.05,
  fieldCommander: 0.05
};

/** Share of the spending beyond the reserve spent on luxuries, by lifestyle tier (§4.1). */
export const SURPLUS_LUXURY_SHARE: Readonly<Partial<Record<LifestyleTier, number>>> = {
  ruler: 0.4,
  centralOffice: 0.3,
  provinceLord: 0.3,
  marketManager: 0.05,
  guildMaster: 0.05,
  fieldCommander: 0.05
};

const COURT: Readonly<Record<LuxuryTier, number>> = { common: 0.1, fine: 0.3, precious: 0.6 };
const OFFICE: Readonly<Record<LuxuryTier, number>> = { common: 0.2, fine: 0.4, precious: 0.4 };
const BURGHER: Readonly<Record<LuxuryTier, number>> = { common: 0.3, fine: 0.5, precious: 0.2 };

/** Price-tier split of a character's luxury spending, by lifestyle tier (§4.1). */
export const CHARACTER_LUXURY_TIER_SHARES: Readonly<
  Partial<Record<LifestyleTier, Readonly<Record<LuxuryTier, number>>>>
> = {
  ruler: COURT,
  centralOffice: OFFICE,
  provinceLord: OFFICE,
  marketManager: BURGHER,
  guildMaster: BURGHER,
  fieldCommander: BURGHER
};

const PURCHASE_ORDER: readonly LuxuryTier[] = [...LUXURY_TIERS].reverse();

/** Luxury budget for this cycle's spending: part of the living cost and part of the surplus spend. */
export function characterLuxuryBudget(tier: LifestyleTier, livingCost: number, surplusSpend: number): number {
  const budget =
    livingCost * (LIFESTYLE_LUXURY_SHARE[tier] ?? 0) + Math.max(0, surplusSpend) * (SURPLUS_LUXURY_SHARE[tier] ?? 0);
  return rn(Math.max(0, budget), 2);
}

function likedGoodNames(character: Character): Set<string> {
  const names = new Set<string>();
  for (const taste of character.backstory?.tastes ?? []) {
    if (taste.polarity !== "like") continue;
    for (const name of TASTE_GOOD_MATCH[taste.id] ?? []) names.add(name.toLowerCase());
  }
  return names;
}

/**
 * Buys up to `budget` of luxuries at the character's home market. The caller has already taken
 * the money from the character; the market receives what is spent. Returns the amount spent.
 */
export function buyCharacterLuxuries(character: Character, tier: LifestyleTier, budget: number): number {
  const shares = CHARACTER_LUXURY_TIER_SHARES[tier];
  if (!shares || !(budget > 0.01) || !character.location) return 0;
  const burg = getWorldContext().pack.burgs?.[character.location];
  if (!burg?.i || burg.removed || !burg.market) return 0;
  const market = Markets.get(burg.market);
  if (!market) return 0;

  const liked = likedGoodNames(character);
  const byTier = luxuryGoodsByTier();
  let spent = 0;
  let carry = 0;
  for (const priceTier of PURCHASE_ORDER) {
    let tierBudget = budget * shares[priceTier] + carry;
    const candidates = byTier
      .get(priceTier)!
      .map(good => ({ good, row: market.goods[good.i] }))
      .filter(entry => (entry.row?.stock ?? 0) > 0.01)
      .map(({ good, row }) => ({
        good,
        liked: liked.has(good.name.toLowerCase()),
        stockValue: row.stock * row.price,
        unitPrice: Markets.customerBuyPrice(row.price, burg.i, good.i)
      }))
      .sort((a, b) => Number(b.liked) - Number(a.liked) || b.stockValue - a.stockValue);
    for (const { good, unitPrice } of candidates) {
      if (!(tierBudget > 0.01)) break;
      const units = Math.floor((tierBudget / unitPrice) * 100) / 100;
      if (units < 0.01) continue;
      const deal = Markets.buy({ burg, good, units, budget: tierBudget, flow: { category: "characterLuxury" } });
      if (!deal) continue;
      const cost = deal.units * deal.price;
      tierBudget -= cost;
      spent += cost;
    }
    carry = Math.max(0, tierBudget);
  }
  return rn(spent, 2);
}
