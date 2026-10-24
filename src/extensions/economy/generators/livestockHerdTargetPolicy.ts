/**
 * Mixed-farming herd scale (E1-2/E1-3, docs/plan/historical-economy-production-consumption-circulation.md §7.41).
 *
 * Herds are sized from the people and the ploughed land they serve, not from biome weights alone.
 * Product-by-product back-calculation (milk, cheese, hides) is not used for the target because those
 * per-capita demands are not calibrated (§7.36); summing them would scale herds by unverified numbers.
 *
 * Anchors are England c.1300 national reconstructions: Allen (2005), "English and Welsh Agriculture,
 * 1300-1850", Tables 2-3; Broadberry et al. (2010), Warwick WP 35.2010, Tables 1 and 4. They describe
 * one wool-exporting kingdom and are applied as model policy elsewhere.
 */
import { HISTORICAL_PERIODS, type HistoricalPeriod, historicalPeriodIndex } from "../../../types/historicalPeriod";

/**
 * Working beasts per hectare of maintained cropland, fallow included: England 1300 had 1.36 million
 * draught animals (Allen 2005, Table 2) on 11.52 million acres of arable (Broadberry et al. 2010,
 * Table 1), 0.29/ha.
 */
export const DRAUGHT_HEADS_PER_CULTIVATED_HA = 0.29;
/**
 * Ceiling per rural inhabitant, so fields kept beyond the staple need do not keep extra teams:
 * 1.36 million draught animals for 3.82 million agricultural people (Allen 2005, Tables 2-3).
 */
export const DRAUGHT_HEADS_PER_RURAL_PERSON_MAX = 0.36;

/** Horse share of farm draught: about 40% in 1300 and 50% in 1500 (Allen 2005 p.7, citing Langdon 1986 pp.205, 255). */
const HORSE_DRAUGHT_SHARE: Readonly<Record<HistoricalPeriod, number>> = {
  classicalAntiquity: 0.05,
  lateAntiquity: 0.05,
  earlyMedieval: 0.2,
  highMedieval: 0.4,
  lateMedieval: 0.45,
  ageOfExploration: 0.5,
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

/**
 * Cows, calves and beef cattle per draught ox: 1.67 million non-working cattle to 0.82 million oxen
 * in 1300 (Allen 2005, Table 2); Broadberry et al. Table 4 gives 1.97 million.
 */
export const CATTLE_FOLLOWERS_PER_DRAUGHT_OX = 2;
/**
 * Sheep for domestic wool, mutton and manure per rural inhabitant. England's 3.4-4.8 sheep per head
 * (Broadberry Table 4, Allen Table 2) carried the wool export; its home clip of about 0.84 kg a
 * person at 0.67 kg a fleece needs about 1.3. Export demand is left to the market.
 */
export const SHEEP_PER_RURAL_PERSON = 1.3;
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

/**
 * Yard animals kept by households wherever people live (E1 §7.43). Pigs: 0.92-0.95 million for
 * 4.73 million people in 1300 (Broadberry Table 4, Allen Table 2), about 0.2 a person; swine were
 * "a quintessentially peasant animal" fed on pannage and scraps. Hens have no national count in
 * these sources: one per person is an unverified placeholder for household flocks.
 */
export const YARD_HEADS_PER_RURAL_PERSON: Readonly<Record<string, number>> = {
  Pig: 0.2,
  Chicken: 1
};
