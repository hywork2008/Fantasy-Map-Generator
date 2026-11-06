import { REGIONAL_HOUSE_STOREYS, REGIONAL_HOUSES } from "../../../../buildings/houses/regionalHouseDimensions";
import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import { dwellingCapacity } from "../../residentialCapacityFormula";
export const VECTOR_HOUSE_FLOOR_AREA = REGIONAL_HOUSES.width * REGIONAL_HOUSES.depth;
export const VECTOR_HOUSE_STOREYS = REGIONAL_HOUSE_STOREYS;
export const VECTOR_HOUSE_SHARE = 0.85;
export function vectorPlacementDwellings(placement: VectorPlacement): number {
  return placement.building?.dwellings ?? 0;
}
export function vectorHouseDwellings(): number {
  return dwellingCapacity(VECTOR_HOUSE_FLOOR_AREA, VECTOR_HOUSE_STOREYS, VECTOR_HOUSE_SHARE);
}
/** Integer people, including the unplaced bucket, use the same largest-remainder allocation as legacy CE. */
export function allocateVectorResidents(doc: VectorCityDocument, ids: string[], required: number, population: number) {
  let remaining = required;
  const rows = ids.map(id => {
    const capacity = vectorPlacementDwellings(doc.placements[id]),
      assigned = Math.min(capacity, remaining);
    remaining -= assigned;
    return { placementId: id, dwellings: assigned, population: 0 };
  });
  const counts = [...rows.map(r => r.dwellings), remaining],
    sum = counts.reduce((a, b) => a + b, 0),
    exact = counts.map(n => (sum ? (n * population) / sum : 0)),
    people = exact.map(Math.floor);
  for (const i of exact
    .map((_, i) => i)
    .sort((a, b) => exact[b] - people[b] - (exact[a] - people[a]) || a - b)
    .slice(0, population - people.reduce((a, b) => a + b, 0)))
    people[i]++;
  rows.forEach((row, i) => {
    row.population = people[i];
  });
  return {
    assignments: rows,
    capacity: ids.reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0),
    assignedDwellings: required - remaining,
    unplacedDwellings: remaining,
    assignedPopulation: population - (people.at(-1) ?? population),
    unplacedPopulation: people.at(-1) ?? population
  };
}
