/**
 * Generation Settings "Historical period" values, oldest first. Single source for the option's
 * type and ordering (docs/plan/classical-antiquity-historical-period.md §4). Older periods are
 * added at the front, so compare by index rather than by position constants.
 */
export const HISTORICAL_PERIODS = [
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
] as const;

export type HistoricalPeriod = (typeof HISTORICAL_PERIODS)[number];

export function isHistoricalPeriod(value: unknown): value is HistoricalPeriod {
  return typeof value === "string" && (HISTORICAL_PERIODS as readonly string[]).includes(value);
}

/** Position in HISTORICAL_PERIODS; -1 for unknown values. */
export function historicalPeriodIndex(period: string | undefined): number {
  return period === undefined ? -1 : (HISTORICAL_PERIODS as readonly string[]).indexOf(period);
}
