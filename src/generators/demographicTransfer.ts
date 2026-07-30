import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../types/models";

/** The four age/sex population buckets tracked on both rural cells and Burgs. */
export interface DemographicBuckets {
  children: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
}

export function demographicTotal(buckets: DemographicBuckets): number {
  return buckets.children + buckets.maleAdults + buckets.femaleAdults + buckets.elders;
}

/** Splits buckets by a 0..1 ratio; `moved` and `remaining` always sum back to the input. */
export function splitDemographicBuckets(
  buckets: DemographicBuckets,
  ratio: number
): { moved: DemographicBuckets; remaining: DemographicBuckets } {
  const clamped = Math.max(0, Math.min(1, ratio));
  const moved: DemographicBuckets = {
    children: buckets.children * clamped,
    maleAdults: buckets.maleAdults * clamped,
    femaleAdults: buckets.femaleAdults * clamped,
    elders: buckets.elders * clamped
  };
  const remaining: DemographicBuckets = {
    children: buckets.children - moved.children,
    maleAdults: buckets.maleAdults - moved.maleAdults,
    femaleAdults: buckets.femaleAdults - moved.femaleAdults,
    elders: buckets.elders - moved.elders
  };
  return { moved, remaining };
}

export function addDemographicBuckets(a: DemographicBuckets, b: DemographicBuckets): DemographicBuckets {
  return {
    children: a.children + b.children,
    maleAdults: a.maleAdults + b.maleAdults,
    femaleAdults: a.femaleAdults + b.femaleAdults,
    elders: a.elders + b.elders
  };
}

/** Reads one rural cell's four buckets as a single value, matching pack.cells' column-of-arrays layout. */
export function getCellDemographics(cells: WorldContext["pack"]["cells"], cellId: number): DemographicBuckets {
  return {
    children: cells.children[cellId] ?? 0,
    maleAdults: cells.maleAdults[cellId] ?? 0,
    femaleAdults: cells.femaleAdults[cellId] ?? 0,
    elders: cells.elders[cellId] ?? 0
  };
}

/** Writes one rural cell's four buckets and keeps `cells.pop` (the cached total) in sync. */
export function setCellDemographics(
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  buckets: DemographicBuckets
): void {
  cells.children[cellId] = buckets.children;
  cells.maleAdults[cellId] = buckets.maleAdults;
  cells.femaleAdults[cellId] = buckets.femaleAdults;
  cells.elders[cellId] = buckets.elders;
  cells.pop[cellId] = demographicTotal(buckets);
}

/** Reads a Burg's four buckets; missing `demographics` (e.g. an unpopulated Burg stub) reads as all-zero. */
export function getBurgDemographics(burg: Pick<Burg, "demographics">): DemographicBuckets {
  const d = burg.demographics;
  return {
    children: d?.children ?? 0,
    maleAdults: d?.maleAdults ?? 0,
    femaleAdults: d?.femaleAdults ?? 0,
    elders: d?.elders ?? 0
  };
}

/** Writes a Burg's four buckets and keeps `burg.population` (the cached total) in sync. No-op without `demographics`. */
export function setBurgDemographics(burg: Burg, buckets: DemographicBuckets): void {
  if (!burg.demographics) return;
  burg.demographics.children = buckets.children;
  burg.demographics.maleAdults = buckets.maleAdults;
  burg.demographics.femaleAdults = buckets.femaleAdults;
  burg.demographics.elders = buckets.elders;
  burg.population = demographicTotal(buckets);
}
