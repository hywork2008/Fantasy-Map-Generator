import type { HistoricalPeriod } from "../types/historicalPeriod";
import { placeableFacets } from "./catalogueFacets";
import { PLACEABLE_OBJECTS, type PlaceableObject } from "./placeableObjects";

/**
 * Placeable objects offered for a city of the given period. Without a period, or when the period is ignored,
 * every object is offered, so a B-2 can stand in a medieval town on request.
 */
export function placeableObjectsFor(
  period: HistoricalPeriod | undefined,
  ignorePeriod = false
): readonly PlaceableObject[] {
  if (!period || ignorePeriod) return PLACEABLE_OBJECTS;
  return PLACEABLE_OBJECTS.filter(object => placeableFacets(object).periods.includes(period));
}
