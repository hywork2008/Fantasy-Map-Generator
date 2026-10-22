/** Authored dry-matter and hand-harvest assumptions, not historical measurements. */
import type { WorldContext } from "../../hostCore";
import { readAgriculturalClimate } from "./seasonalCropClimate";

export const PASTURE_ANNUAL_DM_KG_PER_HECTARE = 1500;
export const FODDER_LOT_KG = 200;
export const FODDER_DRY_MATTER_SHARE = 0.85;
export const FODDER_DM_KG_PER_LOT = FODDER_LOT_KG * FODDER_DRY_MATTER_SHARE;
export const HAY_DRY_MATTER_RETENTION = 0.85;
export const HAY_STORAGE_LOSS_PER_MONTH = 0.01;
export const WINTER_HAY_PLAN_SHARE = 0.25;
export const HAY_WORK_DAYS_PER_TONNE_DM = 3;
export const HAY_RESERVE_MONTHS = 3;
export const LIVESTOCK_FEED_CASH_SHARE = 0.05;
export const ANNUAL_FEED_DM_KG_PER_HEAD: Readonly<Record<string, number>> = {
  Cattle: 3000,
  Sheep: 500,
  Goats: 600,
  Horses: 3500,
  Camels: 6000
};

export interface LivestockFeedSample {
  period: number;
  requiredKg: number;
  fedKg: number;
  purchasedKg: number;
  soldKg: number;
  harvestLossKg: number;
  storageLossKg?: number;
}
export interface LivestockFeedLedger {
  hayKg: number;
  harvestPeriod?: number;
  feedPeriod?: number;
  pastureGrownKg: number;
  grazingReservedKg: number;
  harvestedKg: number;
  harvestLossKg: number;
  storageLossKg: number;
  unharvestedKg: number;
  soldKg: number;
  purchasedKg: number;
  requiredKg: number;
  pastureConsumedKg: number;
  hayConsumedKg: number;
  unmetKg: number;
  coverage: number;
  spending: number;
  revenue: number;
  samples: LivestockFeedSample[];
}

/** Host climate normals supply hemisphere/seasonality. Minimal fixtures keep a constant climate. */
export function getPastureGrowth(
  world: Readonly<WorldContext>,
  cellId: number
): { annualKgPerHa: number; weights: number[] } {
  const temperatures = readAgriculturalClimate(world, cellId).monthlyMeanTemperatureC;
  const growth = Array.from({ length: 12 }, (_, month) => Math.max(0, (temperatures[month] ?? 0) - 2));
  const total = growth.reduce((sum, value) => sum + value, 0);
  return {
    annualKgPerHa: PASTURE_ANNUAL_DM_KG_PER_HECTARE * Math.min(1, total / 120),
    weights: growth.map(value => (total > 0 ? value / total : 0))
  };
}
