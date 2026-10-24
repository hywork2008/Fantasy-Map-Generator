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
/** Monthly loss of grass left standing on a meadow shut up for the main cut (authored). */
export const STANDING_GRASS_LOSS_PER_MONTH = 0.1;
export const LIVESTOCK_FEED_CASH_SHARE = 0.05;

export interface LivestockHayPlan {
  readonly seasonalGapKg: number;
  readonly rawHarvestKg: number;
  readonly harvestWeights: readonly number[];
  /** Month whose uncut surplus stays standing for the next month's main cut; -1 without one. */
  readonly shutUpMonth: number;
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
  const seasonalGapKg = gaps.reduce((sum, kg) => sum + kg, 0);
  // The main cut comes in the month before peak growth, ahead of the grain harvest (E1 §7.46);
  // the meadow is shut up for one month before it. Later surplus is cut as it grows, earliest first.
  const peak = grown.indexOf(Math.max(...grown));
  const mainCut = (peak + 11) % 12;
  const shutUpMonth = seasonalGapKg > 0 && surplus[mainCut] > 0 ? (mainCut + 11) % 12 : -1;
  const cuttable = [...surplus];
  if (shutUpMonth >= 0) {
    cuttable[mainCut] += surplus[shutUpMonth] * (1 - STANDING_GRASS_LOSS_PER_MONTH);
    cuttable[shutUpMonth] = 0;
  }
  const available = cuttable.reduce((sum, kg) => sum + kg, 0);
  const reserveAfterMonthKg = grown.map((_, month) => {
    let required = 0;
    // Without a local harvest season, keep the existing purchase buffer rather than
    // ordering a year of permanent deficits as though a later local harvest would repay it.
    if (available > 0) {
      for (let ahead = 12; ahead >= 1; ahead--) {
        const index = (month + ahead) % 12;
        required = Math.max(
          0,
          (required + gaps[index] - cuttable[index] * HAY_DRY_MATTER_RETENTION) / (1 - HAY_STORAGE_LOSS_PER_MONTH)
        );
      }
    }
    return Math.max(need * HAY_RESERVE_MONTHS, required);
  });
  const storageAllowance = reserveAfterMonthKg.reduce((sum, kg) => sum + kg * HAY_STORAGE_LOSS_PER_MONTH, 0);
  const retainedTarget = Math.max(need * HAY_RESERVE_MONTHS, seasonalGapKg) + storageAllowance;
  const rawHarvestKg = Math.min(available, retainedTarget / HAY_DRY_MATTER_RETENTION);
  const harvested = new Array<number>(12).fill(0);
  if (shutUpMonth >= 0) {
    let remaining = rawHarvestKg;
    for (let step = 0; step < 12 && remaining > 0; step++) {
      const month = (mainCut + step) % 12;
      harvested[month] = Math.min(cuttable[month], remaining);
      remaining -= harvested[month];
    }
  } else {
    for (let month = 0; month < 12; month++)
      harvested[month] = available > 0 ? (rawHarvestKg * cuttable[month]) / available : 0;
  }
  return {
    seasonalGapKg,
    rawHarvestKg,
    harvestWeights: harvested.map(kg => (rawHarvestKg > 0 ? kg / rawHarvestKg : 0)),
    shutUpMonth,
    reserveAfterMonthKg
  };
}

/**
 * Largest share of a planned herd that its own forage can carry through the lean season: summer
 * surplus cut as hay, after drying and storage losses, must cover the months when grass does not
 * grow. Above it, keepers slaughter or sell before winter (E1 §7.45). Bisection over the share;
 * a smaller herd both eats less in winter and leaves more summer grass to cut.
 */
export function calculateWinterFeedShare(
  annualNeedKg: number,
  annualForageKg: number,
  growthWeights: readonly number[]
): number {
  const carried = (share: number) => {
    const plan = calculateLivestockHayPlan(annualNeedKg * share, annualForageKg, growthWeights);
    const storedKg =
      plan.rawHarvestKg * HAY_DRY_MATTER_RETENTION * (1 - HAY_STORAGE_LOSS_PER_MONTH * HAY_RESERVE_MONTHS);
    return storedKg >= plan.seasonalGapKg - 1e-6;
  };
  if (!(annualNeedKg > 0) || carried(1)) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step++) {
    const mid = (low + high) / 2;
    if (carried(mid)) low = mid;
    else high = mid;
  }
  return low;
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
  /** Grass carried in from the shut-up month, after standing losses. */
  standingInKg?: number;
  /** Uncut growth left standing for next month's main cut. */
  standingKg?: number;
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
