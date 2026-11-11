/**
 * Footwear and the other leather goods for the towns and the countryside (docs/plan/leather-uses.md §4).
 * A town's per-head floor of these goods counts its share of its market's farm families as well,
 * by its people among the market's towns.
 */
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getMarkets, getSimulationMonth, getSimulationYear, getWorldContext } from "../economyContext";
import { BOOTS_HIDES_PER_LOT } from "./leatherConstants";
import { getMarketRuralPopulation } from "./marketPopulation";
import type { Market } from "./marketTypes";

/** Pairs of shoes in a lot of Boots (goodsUnitFlavor.ts). */
export const BOOTS_PAIRS_PER_LOT = 20;

const FOOTWEAR_GOODS = new Set(["Boots", "Leather Goods"]);

export function isFootwearGood(goodName: string): boolean {
  return FOOTWEAR_GOODS.has(goodName);
}

/** Whether the countryside buys footwear and leather goods (setting `footwearDemand`). */
export function isFootwearForEveryone(): boolean {
  return getMarketSettings().footwearDemand === "everyone";
}

/**
 * Lots a person wears out a year when everyone buys: Boots by `footwearPairsPerPerson`, the leather
 * goods by `leatherGoodsShare` of the shoes' hides (a lot is a hide). Undefined for other goods or
 * when only the towns buy, so the authored rate applies.
 */
export function getFootwearAnnualLotsPerPerson(goodName: string): number | undefined {
  if (!isFootwearGood(goodName) || !isFootwearForEveryone()) return undefined;
  const settings = getMarketSettings();
  const bootLots = settings.footwearPairsPerPerson / BOOTS_PAIRS_PER_LOT;
  return goodName === "Boots" ? bootLots : bootLots * BOOTS_HIDES_PER_LOT * settings.leatherGoodsShare;
}

/** Work in a lot of Boots at the default rate: a pair a shoemaker a day, or a month (setting `bootsLabor`). */
export const BOOTS_LABOR_PER_LOT = { perDay: 0.001, legacy: 0.0202 } as const;

export function getBootsLaborPerLot(): number {
  return BOOTS_LABOR_PER_LOT[getMarketSettings().bootsLabor];
}

/**
 * Village shoemakers counted in a town: its share of its market's farm people
 * (`laborPeople` × (buyer factor − 1)) at `ruralShoemakersPerThousand`, when everyone buys
 * footwear (docs/plan/footwear-capacity.md §5.3).
 */
export function getRuralShoemakerPeople(laborPeople: number, market: Pick<Market, "i"> | undefined): number {
  if (!market || !isFootwearForEveryone()) return 0;
  const ruralPeople = laborPeople * Math.max(0, getMarketBuyerFactor(market) - 1);
  return (ruralPeople / 1000) * getMarketSettings().ruralShoemakersPerThousand;
}

let cacheKey = "";
const peopleFactor = new Map<number, number>();

/** The market's towns and countryside over its towns alone (1 with no town people). */
export function getMarketBuyerFactor(market: Pick<Market, "i"> | undefined): number {
  if (!market) return 1;
  const key = `${getSimulationYear()}:${getSimulationMonth()}:${getMarkets().length}`;
  if (key !== cacheKey) {
    cacheKey = key;
    peopleFactor.clear();
  }
  const cached = peopleFactor.get(market.i);
  if (cached !== undefined) return cached;
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1000);
  const urban = (world.pack.burgs ?? []).reduce(
    (sum, burg) => sum + (burg?.i && !burg.removed && burg.market === market.i ? Math.max(0, burg.population ?? 0) : 0),
    0
  );
  const urbanPeople = urban * rate;
  const factor = urbanPeople > 0 ? (urbanPeople + getMarketRuralPopulation(world, market.i)) / urbanPeople : 1;
  peopleFactor.set(market.i, factor);
  return factor;
}
