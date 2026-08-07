/**
 * Balance History snapshot — captures a point-in-time reading of Population/Goods/Fauna (the
 * three figures asked for) plus a handful of derived indicators that are useful for balance
 * tuning but weren't tracked anywhere yet (treasury, nutrition coverage, urbanization, at-risk
 * fauna species). One snapshot is taken right after map generation and one after every completed
 * Advance Time action (`fmg:time-advance-completed`, see `src/generators/timeEngine.ts`), so a
 * downloaded CSV of the accumulated history reads as a time series a designer can eyeball for
 * shortages/surpluses — see `controllers/balance-history.ts` for the capture/export orchestration
 * and `store/balanceHistoryState.ts` for where the resulting snapshots live.
 */

import {
  getGoods,
  getSimulationContext,
  getSimulationDay,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { getAllStockData, getPopulationBreakdown } from "./economyTotals";
import { getWorldFaunaHeadcountSummary, WILD_SPECIES_KEY } from "./faunaPopulation";
import { isGoodEnabled } from "./goods-generator";
import { auditNutrition } from "./nutritionAudit";

/**
 * A species' world total below this absolute headcount is flagged "at risk" — an order-of-
 * magnitude placeholder (this project's §9.3 policy: calibration TBD, not a researched figure),
 * meant to catch "hunted/farmed to near-zero" rather than pin an exact extinction threshold.
 */
export const FAUNA_AT_RISK_HEADCOUNT_THRESHOLD = 20;

export interface BalanceSnapshot {
  /** Capture timestamp (`Date.now()`) — also doubles as a stable React/table key. */
  readonly id: number;
  readonly label: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly tickCount: number;
  readonly population: {
    readonly total: number;
    readonly urban: number;
    readonly rural: number;
    /** Urban share of total population, 0..1 — not tracked as a standalone figure anywhere else. */
    readonly urbanizationRate: number;
  };
  readonly goods: {
    readonly totalStock: number;
    /** Current world-wide stock per enabled Good, keyed by Good name. */
    readonly byGood: Readonly<Record<string, number>>;
  };
  readonly fauna: {
    readonly wildTotal: number;
    readonly domesticatedTotal: number;
    /** Current world-wide headcount per species, keyed by species name (`"Game"` for wild). */
    readonly bySpecies: Readonly<Record<string, number>>;
    /** Count of tracked species whose world total is below `FAUNA_AT_RISK_HEADCOUNT_THRESHOLD`. */
    readonly atRiskSpeciesCount: number;
  };
  /** Sum of every State's public treasury (`State.treasury`) — a headline economic-health figure. */
  readonly totalStateTreasury: number;
  readonly nutrition: {
    /** Population-wide caloric need covered by current Grain baseline + Milk/Cheese stock, 0..1+. */
    readonly kcalCoverageRatio: number;
    readonly proteinCoverageRatio: number;
  };
}

function getTotalStateTreasury(): number {
  const states = getWorldContext().pack.states ?? [];
  return states.reduce((sum, state) => sum + (!state?.i || state.removed ? 0 : (state.treasury ?? 0)), 0);
}

function sumByGoodName(): Record<string, number> {
  const stockData = getAllStockData();
  const byGood: Record<string, number> = {};
  for (const good of getGoods().filter(isGoodEnabled)) {
    byGood[good.name] = stockData[good.i]?.total ?? 0;
  }
  return byGood;
}

/** Captures the current Population/Goods/Fauna/extras state as one `BalanceSnapshot` row. */
export function captureBalanceSnapshot(label: string): BalanceSnapshot {
  const population = getPopulationBreakdown();
  const byGood = sumByGoodName();
  const totalStock = Object.values(byGood).reduce((sum, stock) => sum + stock, 0);

  const faunaSummary = getWorldFaunaHeadcountSummary();
  const atRiskSpeciesCount = Object.values(faunaSummary.bySpecies).filter(
    total => total < FAUNA_AT_RISK_HEADCOUNT_THRESHOLD
  ).length;

  // Nutrition audit (nutritionAudit.ts) was built to check Grain/Milk/Cheese against real
  // caloric/protein science but was never wired into a live report — feed it this snapshot's
  // already-computed population and Milk/Cheese stock rather than duplicating its math.
  const milkStock = byGood.Milk ?? 0;
  const cheeseStock = byGood.Cheese ?? 0;
  const nutritionReport = auditNutrition(population.total, milkStock, cheeseStock);
  const { need } = nutritionReport;
  const coveredKcal = need.kcal - nutritionReport.remainingAfterGrain.kcal + nutritionReport.dairyPotential.kcal;
  const coveredProteinKg =
    need.proteinKg - nutritionReport.remainingAfterGrain.proteinKg + nutritionReport.dairyPotential.proteinKg;

  const simulation = getSimulationContext();

  return {
    id: Date.now(),
    label,
    year: getSimulationYear(),
    month: getSimulationMonth(),
    day: getSimulationDay(),
    tickCount: simulation?.tickCount ?? 0,
    population: {
      total: population.total,
      urban: population.urban,
      rural: population.rural,
      urbanizationRate: population.total > 0 ? population.urban / population.total : 0
    },
    goods: { totalStock, byGood },
    fauna: {
      wildTotal: faunaSummary.bySpecies[WILD_SPECIES_KEY] ?? faunaSummary.wildTotal,
      domesticatedTotal: faunaSummary.domesticatedTotal,
      bySpecies: faunaSummary.bySpecies,
      atRiskSpeciesCount
    },
    totalStateTreasury: getTotalStateTreasury(),
    nutrition: {
      kcalCoverageRatio: need.kcal > 0 ? coveredKcal / need.kcal : 0,
      proteinCoverageRatio: need.proteinKg > 0 ? coveredProteinKg / need.proteinKg : 0
    }
  };
}
