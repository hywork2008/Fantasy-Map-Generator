/**
 * The towns' soap (docs/plan/town-soap.md). A town person uses a set weight of soap a year
 * (townSoapSettings.ts); the better-off share of the town buys the white hard soap (Castile Soap)
 * and the rest the soft soap (Soap). White soap the market lacks is made up with soft soap, as the
 * households still washed. Country households boiled their own soft soap and buy none.
 */
import { getTownSoapKilograms } from "../../../simulation/townSoapSettings";
import type { HistoricalPeriod } from "../../../types/historicalPeriod";
import type { Burg } from "../../hostTypes";
import { getWorldContext } from "../economyContext";
import { GOOD_MEASURES } from "./goodMeasureCatalog";
import type { Good } from "./goodsGeneratorTypes";
import { LUXURY_TIER_SHARES, type TownStanding, townStanding } from "./luxuryDemand";
import type { Market } from "./marketTypes";

export const WHITE_SOAP = "Castile Soap";
export const SOFT_SOAP = "Soap";
export type TownSoapGood = typeof WHITE_SOAP | typeof SOFT_SOAP;

export function isTownSoapGood(name: string): name is TownSoapGood {
  return name === WHITE_SOAP || name === SOFT_SOAP;
}

/** On while the town soap need is above nothing; off, soap is a luxury of the budget as before. */
export function isTownSoapEnabled(): boolean {
  return getTownSoapKilograms() > 0;
}

/** True for the two soaps while the town soap need is on: they leave the luxury and per-head demand. */
export function isTownSoapDemandGood(good: Pick<Good, "name">): boolean {
  return isTownSoapGood(good.name) && isTownSoapEnabled();
}

/**
 * Share of a town's soap that is white, by its standing: the share of its luxury budget above the
 * common tier (luxuryDemand.ts). No source gives the split; see docs/plan/town-soap.md §3.2.
 */
export const WHITE_SOAP_SHARES: Readonly<Record<TownStanding, number>> = Object.fromEntries(
  Object.entries(LUXURY_TIER_SHARES).map(([standing, shares]) => [standing, 1 - shares.common])
) as Record<TownStanding, number>;

/**
 * Share of the 1790s town soap (townSoapSettings.ts) a town person used, by the map's historical
 * period (docs/plan/soap-by-period.md §3.1). Medieval laundry was bucked in wood-ash lye, soap was
 * bought by the households that paid washerwomen and by the cloth trades, and the poorest rarely used
 * it; Provence's soap in 1754 was about 0.6 kg a head of France. Only the 1754 and 1793 levels have
 * a source; the older shares are assumptions.
 */
export const TOWN_SOAP_PERIOD_SHARES: Readonly<Record<HistoricalPeriod, number>> = {
  classicalAntiquity: 0.05,
  lateAntiquity: 0.05,
  earlyMedieval: 0.05,
  highMedieval: 0.1,
  lateMedieval: 0.15,
  ageOfExploration: 0.2,
  maritimeEra: 0.3,
  preIndustrialEra: 1,
  steamEra: 1,
  industrialChemistryEra: 1,
  petroleumEra: 1,
  rocketryEra: 1
};

/** Kilograms of soap a town person uses in a year on this map: the 1790s setting times its period's share. */
export function getTownSoapKilogramsForPeriod(): number {
  // Undefined is a legacy map, read as "highMedieval" (WorldState.historicalPeriod).
  const period = getWorldContext().options?.historicalPeriod ?? "highMedieval";
  return getTownSoapKilograms() * (TOWN_SOAP_PERIOD_SHARES[period] ?? 1);
}

function townPeople(burg: Pick<Burg, "population">): number {
  const world = getWorldContext();
  return (burg.population ?? 0) * Math.max(1, world.populationRate || 1) * (world.urbanization ?? 1);
}

/** Barrels of white (Castile) or soft soap the market's towns use in a month. */
export function getMonthlyTownSoapDemand(market: Pick<Market, "i">, goodName: TownSoapGood): number {
  const kilograms = getTownSoapKilogramsForPeriod();
  if (!(kilograms > 0)) return 0;
  let people = 0;
  for (const burg of getWorldContext().pack.burgs) {
    if (!burg.i || burg.removed || burg.market !== market.i) continue;
    const white = WHITE_SOAP_SHARES[townStanding(burg)];
    people += townPeople(burg) * (goodName === WHITE_SOAP ? white : 1 - white);
  }
  return (people * kilograms) / 12 / GOOD_MEASURES[goodName].kg;
}

/** True when the market holds some of every ingredient of one of the good's recipes. */
function stocksRecipe(market: Pick<Market, "goods">, good: Pick<Good, "recipes"> | undefined): boolean {
  return (good?.recipes ?? []).some(recipe => Object.keys(recipe).every(id => (market.goods[+id]?.stock ?? 0) > 0.01));
}

/**
 * Barrels of a soap the market's soap boilers make in a month (docs/plan/town-soap.md §3.4): its
 * own share of the towns' need, and for the soft soap also the white share while the market lacks
 * the white soap's ingredients, as its households make that up with soft soap.
 */
export function getMonthlyTownSoapFloor(
  market: Pick<Market, "i" | "goods">,
  goodName: TownSoapGood,
  whiteSoap: Pick<Good, "recipes"> | undefined
): number {
  const own = getMonthlyTownSoapDemand(market, goodName);
  if (goodName === WHITE_SOAP || stocksRecipe(market, whiteSoap)) return own;
  return own + getMonthlyTownSoapDemand(market, WHITE_SOAP);
}

/**
 * Barrels of potash the market's soft soap floor boils in a month (docs/plan/town-soap.md §3.5):
 * the floor times the least potash a soft soap recipe takes. Glass and the market's own trade are
 * left to the ordinary production steps.
 */
export function getMonthlySoapPotashFloor(
  market: Pick<Market, "i" | "goods">,
  softSoap: Pick<Good, "recipes"> | undefined,
  whiteSoap: Pick<Good, "recipes"> | undefined,
  potashId: number
): number {
  let perBarrel = Number.POSITIVE_INFINITY;
  for (const recipe of softSoap?.recipes ?? []) {
    const amount = recipe[potashId];
    if (amount != null && amount > 0) perBarrel = Math.min(perBarrel, amount);
  }
  if (!Number.isFinite(perBarrel)) return 0;
  return getMonthlyTownSoapFloor(market, SOFT_SOAP, whiteSoap) * perBarrel;
}
