/** Fixed traded mass; fleece equivalents describe the lot, not a biological fleece weight. */
export const FLEECES_PER_WOOL_MARKET_LOT = 1_000;
export const WOOL_KG_PER_MARKET_LOT = 1_500;

/**
 * Authored annual greasy-wool yields, not region/breed/period-calibrated measurements.
 * Adults retain the former 0.08 fleece-equivalent/month * 1.5 kg * 12 = 1.44 kg/year.
 * The under-one-year cohort receives half an adult year's growth as a uniform-age approximation.
 * Old animals remain shearable: leaving the breeding cohort is not loss of fleece production.
 * FAO v9384e, chapter 1 documents lamb shearing, but does not establish this half-year coefficient.
 */
export const SHEEP_ANNUAL_WOOL_KG = {
  young: 0.72,
  breeding: 1.44,
  old: 1.44
} as const;
