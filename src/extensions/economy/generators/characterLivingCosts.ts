import { getSimulationCharacters as getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { Character, CharacterRole, TitleHolding } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getMarkets } from "../economyContext";
import { buyCharacterLuxuries, characterLuxuryBudget } from "./characterLuxuryPurchases";
import { payStateHouseholds, spendInBurg } from "./householdWealth";
import { isLuxuryValueDemandEnabled } from "./luxuryDemand";
import type { Market } from "./marketTypes";
import { CHARACTER_TRADE_INVEST_SHARE, isLongDistanceTradeEnabled, MerchantTradeCapital } from "./merchantTradeCapital";
import { nominal } from "./moneyScale";

/**
 * Personal living-cost sink for Character.wealth.
 *
 * Stipends alone made purses grow forever (no food, housing, status maintenance). This pass
 * runs once per production cycle after stipends (taxes-generator collectTaxes) and deducts a
 * lifestyle cost from every living character who still holds cash. Money is consumed (not
 * transferred to a treasury) — it represents private spending leaving the personal ledger.
 *
 * Scale is anchored to the stipend ladder in character-wealth-balance.md and the About-tab
 * subsistence research (docs/analytics/cost-of-living.md): bare urban food was ~0.05 SP/cycle at
 * original calibration. Ranked lifestyles sit below typical pay so roles still save slowly; a
 * small wealth-linked upkeep drains oversized seed piles without bankrupting mid-tier officers.
 *
 * ×3-rescaled 2026-08-06 together with the stipend ladder (characterStipends.ts) and
 * `DEFAULT_TAX_BY_FORM.*.pollTax` (taxes-generator.ts) — net take-home pay (stipend − living
 * cost) was landing around 2 copper/cycle for common paid roles, barely a single "meal + drink"
 * per docs/plan/goods-unit-scale.md's flavor reference. A uniform factor preserves every ratio in
 * this tier table (and the `stipend ≈ lifestyle × 2.5` no-infinite-growth invariant) exactly.
 */

const CENTRAL_OFFICE_TITLES = new Set(CENTRAL_OFFICES.map(office => office.title));
const FIELD_COMMANDER_TITLES = new Set(["Commander", "Admiral"]);

/** Lifestyle tiers ordered from cheapest to dearest (used as rank for multi-role characters). */
export type LifestyleTier =
  | "apprenticeBoarded"
  | "common"
  | "marketRival"
  | "guildMaster"
  | "marketManager"
  | "fieldCommander"
  | "provinceLord"
  | "centralOffice"
  | "ruler";

/**
 * Fixed personal living cost (silver pieces / production cycle) by lifestyle tier.
 * Intentionally below typical stipend so characters still accumulate slowly when paid.
 */
export const LIVING_COST_BY_TIER: Record<LifestyleTier, number> = {
  /** Board + training from master; cash pocket money is discretionary. */
  apprenticeBoarded: 0.03,
  /** Bare urban subsistence-ish cash spend for titled-less cash holders. */
  common: 0.15,
  marketRival: 0.36,
  guildMaster: 0.45,
  marketManager: 0.9,
  /** Camp, kit refresh, small retinue share — under commander floor pay (1.5). */
  fieldCommander: 1.05,
  provinceLord: 1.65,
  /** Under central-office floor pay (2.4) so minimum stipend still nets non-negative. */
  centralOffice: 2.1,
  /** Court cash outlay; under household floor (3.0) so small realms still scrape by. */
  ruler: 2.55
};

const TIER_RANK: Record<LifestyleTier, number> = {
  apprenticeBoarded: 0,
  common: 1,
  marketRival: 2,
  guildMaster: 3,
  marketManager: 4,
  fieldCommander: 5,
  provinceLord: 6,
  centralOffice: 7,
  ruler: 8
};

/**
 * Extra upkeep as a fraction of current wealth (status, gifts, retainers). Capped relative to
 * base lifestyle so a middle officer is not wiped solely by a large seed.
 */
export const WEALTH_UPKEEP_RATE = 0.02;
/** Status upkeep cannot exceed this multiple of the base lifestyle cost. */
export const WEALTH_UPKEEP_MAX_MULT = 1.5;

function activeTitles(character: Character): TitleHolding[] {
  return (character.titles ?? []).filter(t => t.endYear === undefined);
}

function activeRoles(character: Character): CharacterRole[] {
  return (character.roles ?? []).filter(r => r.endYear === undefined);
}

/**
 * Highest-status lifestyle tier for a living character. Multi-role people pay the dearest
 * lifestyle they currently hold (a Marshal who is also a guild master lives as an officer).
 * Guild apprentices without a higher office/title use the boarded tier (near-zero cash cost).
 */
export function resolveLifestyleTier(character: Character): LifestyleTier {
  let best: LifestyleTier = "common";
  let hasApprenticeRole = false;

  for (const title of activeTitles(character)) {
    let tier: LifestyleTier | null = null;
    if (title.landed && title.entityType === "state") tier = "ruler";
    else if (CENTRAL_OFFICE_TITLES.has(title.title)) tier = "centralOffice";
    else if (FIELD_COMMANDER_TITLES.has(title.title)) tier = "fieldCommander";
    else if (title.entityType === "province" || (title.entityType === "holding" && title.landed)) tier = "provinceLord";

    if (tier && TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }

  for (const role of activeRoles(character)) {
    if (role.kind === "guildApprentice") {
      hasApprenticeRole = true;
      continue;
    }

    let tier: LifestyleTier | null = null;
    switch (role.kind) {
      case "guildMaster":
        tier = "guildMaster";
        break;
      case "marketManager":
      case "merchantOrganizationHead":
        tier = "marketManager";
        break;
      case "marketRivalMerchant":
        tier = "marketRival";
        break;
      default:
        break;
    }
    if (tier && TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }

  // Apprentice rank is below "common" in TIER_RANK, so it cannot win the max-rank pass —
  // apply it only when nothing higher (title/office/merchant) was found.
  if (hasApprenticeRole && best === "common") return "apprenticeBoarded";

  return best;
}

/** Years of living costs a character keeps before spending the rest. */
export const WEALTH_RESERVE_YEARS = 5;
/** Share of wealth above that reserve spent each production cycle. */
export const SURPLUS_WEALTH_SPEND_SHARE = 0.1;
const CYCLES_PER_YEAR = 12;

/**
 * Full living cost for this cycle: base lifestyle + capped wealth-linked status upkeep.
 * Never exceeds current wealth when applied (caller clamps).
 */
export function computeLivingCost(character: Character): number {
  const tier = resolveLifestyleTier(character);
  const lifestyle = nominal(LIVING_COST_BY_TIER[tier]);
  const wealth = character.wealth || 0;
  if (!(wealth > 0) && lifestyle <= 0) return 0;

  const statusUpkeep = Math.min(wealth * WEALTH_UPKEEP_RATE, lifestyle * WEALTH_UPKEEP_MAX_MULT);
  return rn(lifestyle + statusUpkeep, 2);
}

export interface LivingCostSummary {
  charactersCharged: number;
  totalSpent: number;
}

/**
 * Deducts living costs from every living character with positive wealth. Characters at 0 stay
 * at 0 (no debt). Safe no-op when Characters is disabled or the roster is empty.
 */
export function applyCharacterLivingCosts(): LivingCostSummary {
  if (!hasCharactersContext()) return { charactersCharged: 0, totalSpent: 0 };

  const characters = getCharacters();
  const buysLuxuries = isLuxuryValueDemandEnabled();
  const houseOf = isLongDistanceTradeEnabled() ? houseMarketsByMerchant() : null;
  let charactersCharged = 0;
  let totalSpent = 0;

  for (const character of characters) {
    if (!character || character.dead || character.cashAccountId?.startsWith("person:")) continue;
    const wealth = character.wealth || 0;
    if (!(wealth > 0)) continue;

    const lifestyleCost = computeLivingCost(character);
    if (!(lifestyleCost > 0)) continue;
    // Beyond a few years' living, a household of means spends on building, retainers, gifts and
    // fine goods in its town rather than hoarding (docs/plan/initial-wealth-calibration.md §8).
    const reserve = lifestyleCost * CYCLES_PER_YEAR * WEALTH_RESERVE_YEARS;
    let surplusSpend = Math.max(0, wealth - lifestyleCost - reserve) * SURPLUS_WEALTH_SPEND_SHARE;
    // A market's merchants put part of it into their own house while it is short of capital
    // (commenda, docs/plan/long-distance-merchant-reach-capital.md §5.2).
    const house = houseOf?.get(character.i);
    if (house && surplusSpend > 0) {
      const invested = MerchantTradeCapital.investFromCharacter(
        house,
        character.i,
        rn(Math.min(wealth, surplusSpend * CHARACTER_TRADE_INVEST_SHARE), 2)
      );
      if (invested > 0) {
        character.wealth = rn(wealth - invested, 2);
        surplusSpend = Math.max(0, surplusSpend - invested);
      }
    }
    const cost = lifestyleCost + surplusSpend;

    const paid = rn(Math.min(character.wealth || 0, cost), 2);
    if (!(paid > 0)) continue;

    character.wealth = rn((character.wealth || 0) - paid, 2);
    // Under the luxury value demand, part of it buys fine goods at the home market
    // (docs/plan/luxury-value-demand.md §4); the rest stays the town's income as before.
    let cash = paid;
    if (buysLuxuries) {
      const tier = resolveLifestyleTier(character);
      const budget = Math.min(paid, characterLuxuryBudget(tier, lifestyleCost, surplusSpend));
      cash = rn(paid - buyCharacterLuxuries(character, tier, budget), 2);
    }
    // Board, servants and clothes are bought in the town the character lives in.
    if (cash > 0 && !spendInBurg(character.location, cash) && character.state)
      payStateHouseholds(character.state, cash);
    charactersCharged += 1;
    totalSpent = rn(totalSpent + paid, 2);
  }

  return { charactersCharged, totalSpent };
}

/** The market whose house each market manager and rival merchant belongs to. */
function houseMarketsByMerchant(): Map<number, Market> {
  const houses = new Map<number, Market>();
  for (const market of getMarkets()) {
    if (!market) continue;
    for (const id of [market.managerCharacterId, ...(market.rivalCharacterIds ?? [])])
      if (typeof id === "number" && !houses.has(id)) houses.set(id, market);
  }
  return houses;
}
