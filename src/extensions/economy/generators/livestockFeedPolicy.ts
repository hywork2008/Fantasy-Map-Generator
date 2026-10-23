/** Authored dry-matter and hand-harvest assumptions, not historical measurements. */
import type { WorldContext } from "../../hostCore";
import { readAgriculturalClimate } from "./seasonalCropClimate";

export const PASTURE_ANNUAL_DM_KG_PER_HECTARE = 1500;
export const FODDER_LOT_KG = 200;
export const FODDER_DRY_MATTER_SHARE = 0.85;
export const FODDER_DM_KG_PER_LOT = FODDER_LOT_KG * FODDER_DRY_MATTER_SHARE;
export const HAY_DRY_MATTER_RETENTION = 0.85;
export const HAY_STORAGE_LOSS_PER_MONTH = 0.01;
export const HAY_WORK_DAYS_PER_TONNE_DM = 3;
export const HAY_RESERVE_MONTHS = 3;
export const LIVESTOCK_FEED_CASH_SHARE = 0.05;

export interface LivestockHayPlan {
  readonly seasonalGapKg: number;
  readonly rawHarvestKg: number;
  readonly harvestWeights: readonly number[];
  /** Desired hay remaining AFTER this month's feeding, including the existing buffer floor. */
  readonly reserveAfterMonthKg: readonly number[];
}

/**
 * Plan from the current agricultural climate normals, not future inventories or purchases.
 * Each pasture kilogram is either grazed or available to cut; drying and storage are losses.
 * The existing three-month buffer remains a floor, not a universal winter length.
 */
export function calculateLivestockHayPlan(
  annualNeedKg: number,
  annualForageKg: number,
  growthWeights: readonly number[]
): LivestockHayPlan {
  const need = Math.max(0, annualNeedKg) / 12;
  const grown = Array.from({ length: 12 }, (_, month) => Math.max(0, annualForageKg * (growthWeights[month] ?? 0)));
  const gaps = grown.map(kg => Math.max(0, need - kg));
  const surplus = grown.map(kg => Math.max(0, kg - need));
  const available = surplus.reduce((sum, kg) => sum + kg, 0);
  const seasonalGapKg = gaps.reduce((sum, kg) => sum + kg, 0);
  const reserveAfterMonthKg = grown.map((_, month) => {
    let required = 0;
    // Without a local harvest season, keep the existing purchase buffer rather than
    // ordering a year of permanent deficits as though a later local harvest would repay it.
    if (available > 0) {
      for (let ahead = 12; ahead >= 1; ahead--) {
        const index = (month + ahead) % 12;
        required = Math.max(
          0,
          (required + gaps[index] - surplus[index] * HAY_DRY_MATTER_RETENTION) / (1 - HAY_STORAGE_LOSS_PER_MONTH)
        );
      }
    }
    return Math.max(need * HAY_RESERVE_MONTHS, required);
  });
  const storageAllowance = reserveAfterMonthKg.reduce((sum, kg) => sum + kg * HAY_STORAGE_LOSS_PER_MONTH, 0);
  const retainedTarget = Math.max(need * HAY_RESERVE_MONTHS, seasonalGapKg) + storageAllowance;
  return {
    seasonalGapKg,
    rawHarvestKg: Math.min(available, retainedTarget / HAY_DRY_MATTER_RETENTION),
    harvestWeights: surplus.map(kg => (available > 0 ? kg / available : 0)),
    reserveAfterMonthKg
  };
}

const hayPlans = new WeakMap<object, Map<number, { key: string; plan: LivestockHayPlan }>>();

/** Number-keyed memoization only; a change in herd, land or any climate weight invalidates it. */
export function getLivestockHayPlan(
  world: Readonly<WorldContext>,
  cellId: number,
  annualNeedKg: number,
  pastureHa: number
): LivestockHayPlan {
  const growth = getPastureGrowth(world, cellId);
  const annualForageKg = pastureHa * growth.annualKgPerHa;
  const key = [annualNeedKg, annualForageKg, ...growth.weights].join(":");
  let cells = hayPlans.get(world);
  if (!cells) {
    cells = new Map();
    hayPlans.set(world, cells);
  }
  const cached = cells.get(cellId);
  if (cached?.key === key) return cached.plan;
  const plan = calculateLivestockHayPlan(annualNeedKg, annualForageKg, growth.weights);
  cells.set(cellId, { key, plan });
  return plan;
}
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
  cropResidueFeedKg?: number;
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
  /** Quality-discounted feed equivalent, distinct from physical residue DM. */
  cropResidueFeedKg?: number;
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
