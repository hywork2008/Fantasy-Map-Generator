/**
 * The towns' soap (docs/plan/town-soap.md). A town person uses a set weight of soap a year
 * (townSoapSettings.ts); the better-off share of the town buys the white hard soap (Castile Soap)
 * and the rest the soft soap (Soap). White soap the market lacks is made up with soft soap, as the
 * households still washed. Country households boiled their own soft soap and buy none.
 */
import { getTownSoapKilograms } from "../../../simulation/townSoapSettings";
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

function townPeople(burg: Pick<Burg, "population">): number {
  const world = getWorldContext();
  return (burg.population ?? 0) * Math.max(1, world.populationRate || 1) * (world.urbanization ?? 1);
}

/** Barrels of white (Castile) or soft soap the market's towns use in a month. */
export function getMonthlyTownSoapDemand(market: Pick<Market, "i">, goodName: TownSoapGood): number {
  const kilograms = getTownSoapKilograms();
  if (!(kilograms > 0)) return 0;
  let people = 0;
  for (const burg of getWorldContext().pack.burgs) {
    if (!burg.i || burg.removed || burg.market !== market.i) continue;
    const white = WHITE_SOAP_SHARES[townStanding(burg)];
    people += townPeople(burg) * (goodName === WHITE_SOAP ? white : 1 - white);
  }
  return (people * kilograms) / 12 / GOOD_MEASURES[goodName].kg;
}
