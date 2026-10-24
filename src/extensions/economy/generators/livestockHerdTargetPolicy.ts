/**
 * Mixed-farming herd scale (E1-2/E1-3, docs/plan/historical-economy-production-consumption-circulation.md §7.41).
 *
 * Herds are sized from the people and the ploughed land they serve, not from biome weights alone.
 * Product-by-product back-calculation (milk, cheese, hides) is not used for the target because those
 * per-capita demands are not calibrated (§7.36); summing them would scale herds by unverified numbers.
 *
 * Order-of-magnitude anchors (England c.1300, Langdon 1986; Campbell 2000; Broadberry et al. 2015 ch.3):
 * roughly one working beast per 4-6 sown hectares on demesnes, fewer per hectare on peasant land; about
 * 0.3-0.4 cattle and 0.1-0.15 horses per inhabitant; sheep 2-3 per inhabitant where wool was exported.
 * Coefficients below are model policy inside those ranges, not page-verified measurements.
 */
import { HISTORICAL_PERIODS, type HistoricalPeriod, historicalPeriodIndex } from "../../../types/historicalPeriod";

/** Working beasts per hectare of maintained cropland, fallow included. */
export const DRAUGHT_HEADS_PER_CULTIVATED_HA = 0.08;

/** Horse share of farm draught. Langdon: rising from about a fifth (c.1200) to a third (c.1400). */
const HORSE_DRAUGHT_SHARE: Readonly<Record<HistoricalPeriod, number>> = {
  classicalAntiquity: 0.05,
  lateAntiquity: 0.05,
  earlyMedieval: 0.1,
  highMedieval: 0.25,
  lateMedieval: 0.35,
  ageOfExploration: 0.45,
  maritimeEra: 0.5,
  preIndustrialEra: 0.6,
  steamEra: 0.7,
  industrialChemistryEra: 0.75,
  petroleumEra: 0.75,
  rocketryEra: 0.75
};

export function getHorseDraughtShare(period: string | undefined): number {
  const index = historicalPeriodIndex(period);
  return HORSE_DRAUGHT_SHARE[HISTORICAL_PERIODS[index < 0 ? HISTORICAL_PERIODS.indexOf("highMedieval") : index]];
}

/** Cows, calves and followers kept to breed and replace each draught ox; also the dairy herd. */
export const CATTLE_FOLLOWERS_PER_DRAUGHT_OX = 1;
/** Mixed-farming sheep per rural inhabitant (meat, wool, manure). Wool-export regions ran higher. */
export const SHEEP_PER_RURAL_PERSON = 1;
/** Where goats are suited, this share of the sheep allowance is kept as goats instead. */
export const GOAT_SHARE_OF_SMALL_STOCK_IN_BROWSE = 0.3;
/** Pack and riding camels per rural inhabitant where camels are suited. */
export const CAMELS_PER_RURAL_PERSON = 0.1;
/** Additional herds per rural inhabitant on open grassland/steppe, where livestock is the livelihood. */
export const PASTORAL_HEADS_PER_RURAL_PERSON: Readonly<Record<string, number>> = {
  Cattle: 0.5,
  Sheep: 2,
  Horses: 0.2
};

/** Share of annual pasture growth an extensive system can turn into feed (trampling, hay losses). */
export const PASTURE_FEED_UTILIZATION = 0.8;
/** Weedy fallow grazing, dry matter per hectare per year; a fraction of permanent pasture. */
export const FALLOW_GRAZING_DM_KG_PER_HA = 400;
/** Share of maintained cropland sown in a year; the rest is grazed fallow. Matches landUseActivities. */
export const DEFAULT_ANNUAL_SOWN_SHARE = 0.67;
