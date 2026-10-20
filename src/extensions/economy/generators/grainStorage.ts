import { minmax } from "../../hostUtils";

/**
 * Staple-food storage life (docs/plan/grain-storage-life.md). Grain is kept from one harvest to the
 * next and a little beyond; it is lost slowly to pests and decay rather than discarded on a date.
 */

/** Quarterly loss in a temperate granary: about 6% a year, from traditional-store surveys (§2.2). */
export const STORAGE_BASE_QUARTERLY_LOSS = 0.015;
/** Grain carried past the next harvest (Age3) loses quality and gains pests twice as fast. */
export const CARRYOVER_LOSS_MULTIPLIER = 2;
/** Grain heaped outside the granary over the storage cap rots a quarter at a time. */
export const OVERFLOW_QUARTERLY_LOSS = 0.25;

const COLD_LOSS_MULTIPLIER = 0.7;
const HOT_DRY_LOSS_MULTIPLIER = 1.3;
const HOT_HUMID_LOSS_MULTIPLIER = 2;
const COLD_MEAN_TEMPERATURE_C = 5;
const HOT_MEAN_TEMPERATURE_C = 25;
/** Host precipitation of the driest and wettest biome moisture bands. */
const DRY_PRECIPITATION = 1;
const WET_PRECIPITATION = 16;

/**
 * Insects and moulds multiply with warmth and damp: cold stores keep best, hot dry pits keep
 * well, hot humid stores keep worst (FAO). Temperate (~15 °C, middling rain) is about 1.
 */
export function getStorageClimateLossMultiplier(meanTemperatureC: number, precipitation: number): number {
  const warmth = Number.isFinite(meanTemperatureC)
    ? minmax((meanTemperatureC - COLD_MEAN_TEMPERATURE_C) / (HOT_MEAN_TEMPERATURE_C - COLD_MEAN_TEMPERATURE_C), 0, 1)
    : 0.5;
  const damp = Number.isFinite(precipitation)
    ? minmax((precipitation - DRY_PRECIPITATION) / (WET_PRECIPITATION - DRY_PRECIPITATION), 0, 1)
    : 0.5;
  return (
    COLD_LOSS_MULTIPLIER +
    (HOT_DRY_LOSS_MULTIPLIER - COLD_LOSS_MULTIPLIER) * warmth +
    (HOT_HUMID_LOSS_MULTIPLIER - HOT_DRY_LOSS_MULTIPLIER) * warmth * damp
  );
}

/** Quarterly loss shares for Age0-2 and for carried-over Age3 grain. */
export function getQuarterlyStorageLoss(climateMultiplier: number): {
  fresh: number;
  carryover: number;
} {
  const fresh = minmax(STORAGE_BASE_QUARTERLY_LOSS * climateMultiplier, 0, 1);
  return { fresh, carryover: minmax(fresh * CARRYOVER_LOSS_MULTIPLIER, 0, 1) };
}

/**
 * Stock to keep back from export: the largest shortfall between this market's demand and the grain
 * farmers are expected to offer before the next harvest, looking up to a year ahead from `month`.
 * A market with one harvest a year keeps nearly a year's demand just after harvest; an evenly
 * supplied market keeps only `floorMonths`. Until a whole year of offers is known the floor applies.
 */
export function getHarvestBridgeReserve(
  annualDemand: number,
  offeredIntakeByMonth: readonly number[] | undefined,
  month: number,
  floorMonths: number
): number {
  const monthlyDemand = Math.max(0, annualDemand) / 12;
  const floor = monthlyDemand * floorMonths;
  if (offeredIntakeByMonth?.length !== 12 || offeredIntakeByMonth.some(offer => !(offer >= 0))) return floor;

  let shortfall = 0;
  let worst = 0;
  // This month's offer has already landed; consumption of this month and the next eleven is
  // bridged only by later months' offers.
  for (let ahead = 0; ahead < 12; ahead++) {
    if (ahead > 0) shortfall -= offeredIntakeByMonth[(month - 1 + ahead) % 12];
    shortfall += monthlyDemand;
    if (shortfall > worst) worst = shortfall;
  }
  return Math.min(Math.max(floor, worst), Math.max(0, annualDemand));
}
