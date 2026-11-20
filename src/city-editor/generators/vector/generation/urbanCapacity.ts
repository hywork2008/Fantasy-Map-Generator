import { REGIONAL_HOUSE_STOREYS, REGIONAL_HOUSES } from "../../../../buildings/houses/regionalHouseDimensions";
import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import { dwellingCapacity } from "../../residentialCapacityFormula";
import { indexedContains } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
export const VECTOR_HOUSE_FLOOR_AREA = REGIONAL_HOUSES.width * REGIONAL_HOUSES.depth;
export const VECTOR_HOUSE_STOREYS = REGIONAL_HOUSE_STOREYS;
export const VECTOR_HOUSE_SHARE = 0.85;
export function vectorPlacementDwellings(placement: VectorPlacement): number {
  return placement.building?.dwellings ?? placement.display?.dwellings ?? 0;
}
/** Dwellings of a CE perimeter house. A built house holds at least one household: a narrow 15–21 m²
 * footprint on the period's standard storeys is a 45–63 m² home, which the floor-area formula rounds to zero. */
export function perimeterHouseDwellings(footprintM2: number, storeys: number, residentialShare = 0.85): number {
  return Math.max(1, dwellingCapacity(footprintM2, storeys, residentialShare));
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

export interface VectorWallShare {
  houses: number;
  facilities: number;
  dwellings: number;
  population: number;
}
/**
 * Buildings, housed dwellings and residents inside and beyond the outer town wall, as the residents are allocated:
 * placements first, then the fabric houses, each list inside the wall first. Undefined for a town without a wall.
 */
export function vectorWallShares(
  doc: Readonly<VectorCityDocument>
): { inside: VectorWallShare; outside: VectorWallShare } | undefined {
  const report = doc.urban?.report;
  const walls = Object.values(doc.connections.circuits)
    .filter(c => !c.parentCircuitId && doc.paths[c.pathId])
    .map(c => ({ outer: sampledClosedRing(doc, c.pathId), holes: [] }));
  if (!report || !walls.length) return undefined;
  const inWalls = indexedContains(walls),
    blank = (): VectorWallShare => ({ houses: 0, facilities: 0, dwellings: 0, population: 0 }),
    share = { inside: blank(), outside: blank() },
    units: { inner: boolean; dwellings: number }[] = [];
  const placements = Object.values(doc.placements)
    .filter(p => p.building?.kind === "housing" || p.building?.kind === "facility")
    .map(p => ({ p, inner: inWalls(p.position) }))
    .sort((a, b) => Number(b.inner) - Number(a.inner));
  for (const { p, inner } of placements) {
    // A shop-house's rear works is its facility's second building (docs/plan/ce-town-trade-rear-works.md R2).
    if (!p.building!.annexOf)
      share[inner ? "inside" : "outside"][p.building!.kind === "facility" ? "facilities" : "houses"]++;
    units.push({ inner, dwellings: vectorPlacementDwellings(p) });
  }
  const cells = Object.values(doc.fabric?.cells ?? {});
  for (const cell of [...cells.filter(c => c.inside), ...cells.filter(c => !c.inside)]) {
    const detached = new Set(cell.detached);
    cell.houses.dwellings.forEach((d, i) => {
      if (detached.has(i)) return;
      share[cell.inside ? "inside" : "outside"].houses++;
      units.push({ inner: !!cell.inside, dwellings: d });
    });
  }
  let remaining = report.requiredDwellings;
  for (const u of units) {
    const assigned = Math.min(u.dwellings, remaining);
    remaining -= assigned;
    share[u.inner ? "inside" : "outside"].dwellings += assigned;
  }
  // Residents follow the housed dwellings, as the allocation shares them out.
  const perDwelling = report.requiredDwellings ? report.targetPopulation / report.requiredDwellings : 0;
  share.inside.population = Math.round(share.inside.dwellings * perDwelling);
  share.outside.population = Math.round(share.outside.dwellings * perDwelling);
  return share;
}
