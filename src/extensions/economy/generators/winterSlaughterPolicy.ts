import type { CarcassProfile } from "./slaughterTransactions";

/** Explicit simulation assumptions, not verified medieval measurements. See the design's section 20. */
export const WINTER_SLAUGHTER_POLICY = {
  id: "temperate-household-experiment-v1",
  firstYear: 1200,
  lastYear: 1700,
  forecastMonths: 3,
  preparationMaxC: 15,
  coldSeasonC: 8,
  minimumSeasonalRangeC: 5,
  youngRetainedPerBreeder: 0.5,
  youngYieldFactor: 0.5,
  freshKgPerPersonMonth: 0.5,
  reserveKgPerPerson: 3,
  workDaysPerKg: 0.025,
  handlingKgPerWorkerMonth: 100,
  storageKgPerWorker: 150,
  saltKgPerInputKg: 1 / 6,
  smokingWoodKgPerInputKg: 0.5,
  curingPeriods: 1,
  smokingPeriods: 2,
  saltedMeatRetention: 0.75,
  smokedMeatRetention: 0.65,
  preservedShelfPeriods: 6,
  preservedStorageLoss: 0.02,
  materialCashShare: 0.05,
  // Separate dietary observation. These values never replace staple ration units.
  dietaryKcalPerKg: 2000,
  dietaryProteinKgPerKg: 0.18
} as const;

const lb = 0.45359237;
const reference = (species: string, carcass: number, lean: number, fat: number): CarcassProfile => ({
  id: `experimental-temperate-${species.toLowerCase()}`,
  version: 1,
  species,
  calibration: "experimental",
  carcassKgPerHead: carcass * lb,
  leanKgPerHead: lean * lb,
  edibleFatKgPerHead: fat * lb,
  otherCarcassKgPerHead: (carcass - lean - fat) * lb
});

/** Scottish adult reference estimates; pig split is an authored decomposition of a diagnostic mean. */
export const EXPERIMENTAL_CARCASS_PROFILES: Readonly<Record<string, CarcassProfile>> = {
  Cattle: reference("Cattle", 310, 206, 36),
  Sheep: reference("Sheep", 30, 20, 3.5),
  Pig: reference("Pig", 42280 / 656, (42280 / 656) * 0.6, (42280 / 656) * 0.1)
};

export type WinterPreservationMethod = "salted" | "smoked";
