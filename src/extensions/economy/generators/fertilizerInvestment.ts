import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getCultivatedArea,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getWorldContext,
  settleAnnualOnce
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

/**
 * Rural fertilizer investment: Markets spend from their own treasury to buy Phosphate Fertilizer
 * for their cultivated land, building up a saturating adoption stock (Market.fertilizerStock)
 * that feeds calculateYieldKgPerHectare in agriculturalLandUse.ts. Same shape as
 * AgTechInvestment's Market-level layer (agTechInvestment.ts §3.3), but a separate account/stock
 * — the two investments share a market's treasury but never share a budget calculation. No
 * State-level layer (unlike AgTech's §6.1 stateAgriculturalProductivity): phosphate fertilizer is
 * a market-purchased consumable, not public infrastructure.
 * See docs/plan/phosphate-fertilizer-vertical-slice.md §3.8.
 */

/** "calibration TBD" — annual Phosphate Fertilizer spend per cultivated hectare for full (1.0) coverage. */
export const TARGET_FERTILIZER_PER_HECTARE = 0.01;
/** Share of a market's liquid treasury balance that may fund Phosphate Fertilizer purchases in one year. */
export const FERTILIZER_BUDGET_SHARE_OF_TREASURY = 0.12;
/** EWMA smoothing: ~7 simulated years of sustained full coverage to approach fertilizerStock = 1. */
export const FERTILIZER_ADOPTION_RATE = 0.15;

export class FertilizerInvestmentModule {
  /**
   * Runs at most once per simulation year; must be called after AgTechInvestment.settleAnnual()
   * (farm investment draws from the same treasury first) and before
   * DevelopmentPotential.updateAnnualAgriculture().
   */
  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.fertilizerInvestment)) return false;

    const fertilizerGood = getGoods().find(good => good.name === "Phosphate Fertilizer");
    if (!fertilizerGood || !isGoodEnabled(fertilizerGood)) return true;

    const cultivatedAreaByCell = getCultivatedArea();
    const marketCellColumn = getMarketCellColumn();
    if (!cultivatedAreaByCell.length || !marketCellColumn.length) return true;

    const cells = getWorldContext().pack.cells;
    const cultivatedHectaresByMarket = new Map<number, number>();
    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId];
      if (!marketId) continue;
      const hectares = cultivatedAreaByCell[cellId] || 0;
      if (hectares <= 0) continue;
      cultivatedHectaresByMarket.set(marketId, (cultivatedHectaresByMarket.get(marketId) ?? 0) + hectares);
    }

    for (const market of getMarkets()) {
      const cultivatedHectares = cultivatedHectaresByMarket.get(market.i) ?? 0;
      const previousStock = market.fertilizerStock ?? 0;

      if (cultivatedHectares <= 0) {
        // No farmland to invest in; let existing adoption decay toward 0 rather than freezing it.
        market.fertilizerStock = rn(previousStock * (1 - FERTILIZER_ADOPTION_RATE), 4);
        continue;
      }

      const requestedUnits = cultivatedHectares * TARGET_FERTILIZER_PER_HECTARE;
      const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
      const budget = Math.max(0, treasury.balance) * FERTILIZER_BUDGET_SHARE_OF_TREASURY;

      const { units: purchasedUnits, cost } = Markets.consumeForMarketInvestment(
        market.i,
        fertilizerGood.i,
        requestedUnits,
        budget
      );

      if (cost > 0) {
        treasury.balance = rn(treasury.balance - cost, 2);
        market.marketTreasury = treasury;
      }

      const coverageThisYear = requestedUnits > 0 ? Math.min(1, purchasedUnits / requestedUnits) : 0;
      market.fertilizerStock = rn(
        previousStock * (1 - FERTILIZER_ADOPTION_RATE) + coverageThisYear * FERTILIZER_ADOPTION_RATE,
        4
      );
    }

    return true;
  }
}

export const FertilizerInvestment = new FertilizerInvestmentModule();
