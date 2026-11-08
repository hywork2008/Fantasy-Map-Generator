import { REGIONAL_HOUSE_STOREYS, REGIONAL_HOUSES } from "../../../../buildings/houses/regionalHouseDimensions";
import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import { dwellingCapacity } from "../../residentialCapacityFormula";
export const VECTOR_HOUSE_FLOOR_AREA = REGIONAL_HOUSES.width * REGIONAL_HOUSES.depth;
export const VECTOR_HOUSE_STOREYS = REGIONAL_HOUSE_STOREYS;
export const VECTOR_HOUSE_SHARE = 0.85;
export function vectorPlacementDwellings(placement: VectorPlacement): number {
  return placement.building?.dwellings ?? placement.display?.dwellings ?? 0;
}
export function vectorHouseDwellings(): number {
  return dwellingCapacity(VECTOR_HOUSE_FLOOR_AREA, VECTOR_HOUSE_STOREYS, VECTOR_HOUSE_SHARE);
}
/** Dwellings of every adopted fabric house, street blocks inside the town wall first. */
export function vectorFabricUnits(doc: Readonly<VectorCityDocument>): number[] {
  const cells = Object.values(doc.fabric?.cells ?? {});
  const ordered = [...cells.filter(c => c.inside), ...cells.filter(c => !c.inside)];
  return ordered.flatMap(cell => {
    const detached = new Set(cell.detached);
    return cell.houses.dwellings.filter((_, i) => !detached.has(i));
  });
}
export const vectorFabricDwellings = (doc: Readonly<VectorCityDocument>) =>
  vectorFabricUnits(doc).reduce((n, d) => n + d, 0);

/** Integer people, including the unplaced bucket, use the same largest-remainder allocation as legacy CE.
 * With `fabric`, generated houses follow the placements; only placements are returned as assignments, because
 * a house's share is always recomputed from the adopted records. */
export function allocateVectorResidents(
  doc: Readonly<VectorCityDocument>,
  ids: string[],
  required: number,
  population: number,
  fabric = false
) {
  let remaining = required;
  const units = [
    ...ids.map(id => vectorPlacementDwellings(doc.placements[id])),
    ...(fabric ? vectorFabricUnits(doc) : [])
  ];
  const rows = units.map(capacity => {
    const assigned = Math.min(capacity, remaining);
    remaining -= assigned;
    return { dwellings: assigned, population: 0 };
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
    assignments: ids.map((placementId, i) => ({ placementId, ...rows[i] })),
    capacity: units.reduce((n, d) => n + d, 0),
    assignedDwellings: required - remaining,
    unplacedDwellings: remaining,
    assignedPopulation: population - (people.at(-1) ?? population),
    unplacedPopulation: people.at(-1) ?? population
  };
}
