import { HISTORICAL_PERIODS, type HistoricalPeriod, historicalPeriodIndex } from "../../../types/historicalPeriod";

/** Fixed traded mass; fleece equivalents describe the lot, not a biological fleece weight. */
export const FLEECES_PER_WOOL_MARKET_LOT = 1_000;
export const WOOL_KG_PER_MARKET_LOT = 1_500;

/**
 * Greasy fleece per adult sheep per year by period (E1-4, historical-economy plan §7.41).
 * Medieval: English demesne fleeces of about 1.3-1.7 lb (0.6-0.8 kg) c.1300 (Stephenson 1988,
 * EcHR 41; Ryder 1983 for short-wool medieval types). Early modern: about 2 lb (0.9 kg), heavier on
 * longwools (Bowden 1962). Improved breeds of the late 18th-19th c. 3-5 lb and more. These are the
 * model's per-period anchors, not breed- or region-specific measurements; washed wool loses more.
 */
const ADULT_FLEECE_KG: Readonly<Record<HistoricalPeriod, number>> = {
  classicalAntiquity: 0.7,
  lateAntiquity: 0.7,
  earlyMedieval: 0.7,
  highMedieval: 0.7,
  lateMedieval: 0.75,
  ageOfExploration: 0.85,
  maritimeEra: 0.9,
  preIndustrialEra: 1.3,
  steamEra: 2,
  industrialChemistryEra: 2.5,
  petroleumEra: 2.5,
  rocketryEra: 2.5
};
/** The under-one-year cohort is mostly lambs, which give about a third to a half of a fleece. */
const YOUNG_FLEECE_SHARE = 0.4;

export interface SheepAnnualWoolKg {
  readonly young: number;
  readonly breeding: number;
  readonly old: number;
}

/** Old animals remain shearable: leaving the breeding cohort is not loss of fleece production. */
export function getSheepAnnualWoolKg(period: string | undefined): SheepAnnualWoolKg {
  const index = historicalPeriodIndex(period);
  const adult = ADULT_FLEECE_KG[HISTORICAL_PERIODS[index < 0 ? HISTORICAL_PERIODS.indexOf("highMedieval") : index]];
  return { young: adult * YOUNG_FLEECE_SHARE, breeding: adult, old: adult };
}

/** High-medieval default, for callers without a world context. */
export const SHEEP_ANNUAL_WOOL_KG: SheepAnnualWoolKg = getSheepAnnualWoolKg("highMedieval");
