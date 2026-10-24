/** Authored yields; not region/breed/period-calibrated historical measurements. */
export const ANNUAL_LITERS_PER_LACTATING_FEMALE: Readonly<Record<string, number>> = {
  Cattle: 500,
  Goats: 150,
  Sheep: 75
};

/** The breeding cohort includes both sexes and females outside lactation. */
export const LACTATING_SHARE_OF_BREEDING_COHORT = 0.375;
