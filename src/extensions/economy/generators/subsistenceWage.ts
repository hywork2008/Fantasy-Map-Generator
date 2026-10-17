import { DEFAULT_PEOPLE_PER_POPULATION_POINT } from "./craftScale";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { getStapleFoodGood } from "./foodProduction";
import type { Market } from "./marketTypes";

/**
 * Craft wage as a multiple of a worker's own food bill (docs/plan/craft-wage-subsistence-scale.md).
 * Calibrated in that document's §6.
 */
export const WAGE_SUBSISTENCE_MULTIPLE = 1.5;

const MONTHS_PER_YEAR = 12;

/**
 * Coins per labor point per month at the local grain retail price. A labor point is 1,000
 * person-months whatever the map's populationRate (`laborPointsForLots`), so this is a real-head
 * wage on the goods' price scale — the money scale K is deliberately not applied.
 */
export function getSubsistenceWage(market: Pick<Market, "goods"> | undefined): number {
  const staple = getStapleFoodGood();
  const basePrice = staple?.value ?? 1;
  const localPrice = staple && market ? market.goods?.[staple.i]?.price : undefined;
  const grainPrice = typeof localPrice === "number" && localPrice > 0 ? localPrice : basePrice;
  return (
    (WAGE_SUBSISTENCE_MULTIPLE * GROSS_FOOD_NEED * DEFAULT_PEOPLE_PER_POPULATION_POINT * grainPrice) / MONTHS_PER_YEAR
  );
}
