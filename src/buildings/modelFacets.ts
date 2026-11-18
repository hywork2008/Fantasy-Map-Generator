import { HISTORICAL_PERIODS, type HistoricalPeriod, isHistoricalPeriod } from "../types/historicalPeriod";

/**
 * Catalogue attributes shared by every viewer model (docs/plan/model-viewer-rename-and-catalogue-facets.md).
 * Listings filter on these; they never change geometry or CE identities.
 */
export const MODEL_KINDS = [
  /** Buildings, walls, bridges, aqueducts and work yards. */
  "structure",
  /** Land vehicles: carts, wagons, carriages, tanks. */
  "vehicle",
  "ship",
  /** Siege engines, artillery and small arms. */
  "weapon",
  /** Trees and plants. */
  "flora",
  /** Containers, signs, square and churchyard furniture. */
  "prop"
] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

/** Coarse first-pass culture areas; "any" marks a model with no regional tradition and stands alone. */
export const MODEL_REGIONS = [
  "european",
  "mediterranean",
  "middle-eastern",
  "east-asian",
  "south-asian",
  "african",
  "american",
  "any"
] as const;
export type ModelRegion = (typeof MODEL_REGIONS)[number];

export interface ModelFacets {
  kind: ModelKind;
  /** Periods of use, oldest first; values come from the FMG Historical period option. */
  periods: readonly HistoricalPeriod[];
  /** Attested years of use, inclusive, when finer than the periods. */
  years?: readonly [number, number];
  regions: readonly ModelRegion[];
  /** Lower-case kebab-case use tags, e.g. "milling", "military". */
  uses: readonly string[];
}

const USE_TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Problems with a facet set, empty when valid. */
export function modelFacetErrors(facets: ModelFacets): string[] {
  const errors: string[] = [];
  if (!(MODEL_KINDS as readonly string[]).includes(facets.kind)) errors.push(`unknown kind ${facets.kind}`);
  if (!facets.periods.length) errors.push("periods is empty");
  for (const period of facets.periods) if (!isHistoricalPeriod(period)) errors.push(`unknown period ${period}`);
  const order = facets.periods.map(period => HISTORICAL_PERIODS.indexOf(period));
  if (new Set(order).size !== order.length || order.some((index, i) => i > 0 && index < order[i - 1]))
    errors.push("periods must be unique and oldest first");
  if (facets.years) {
    const [from, to] = facets.years;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from > to)
      errors.push("years must be an ordered integer range");
  }
  if (!facets.regions.length) errors.push("regions is empty");
  for (const region of facets.regions)
    if (!(MODEL_REGIONS as readonly string[]).includes(region)) errors.push(`unknown region ${region}`);
  if (new Set(facets.regions).size !== facets.regions.length) errors.push("regions must be unique");
  if (facets.regions.includes("any") && facets.regions.length > 1) errors.push('"any" cannot be combined with regions');
  for (const use of facets.uses) if (!USE_TAG.test(use)) errors.push(`use tag ${use} is not kebab-case`);
  if (new Set(facets.uses).size !== facets.uses.length) errors.push("uses must be unique");
  return errors;
}
