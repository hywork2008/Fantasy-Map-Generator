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
 * Rural nitrogen-fertilizer investment: Markets spend from their own treasury to buy Nitrogen
 * Fertilizer for their cultivated land, building up a saturating adoption stock
 * (Market.nitrogenFertilizerStock) that feeds calculateYieldKgPerHectare in
 * agriculturalLandUse.ts. Same shape as FertilizerInvestment (Phosphate Fertilizer) — a separate
 * account/stock, not a rewrite of it. No State-level layer, same reasoning as
 * FertilizerInvestment: a market-purchased consumable, not public infrastructure.
 * See docs/plan/synthetic-ammonia-vertical-slice.md §3.7.
 */

/** calibration TBD — smaller physical volume than Phosphate Fertilizer's 0.01 (higher N-content-per-mass concentration). */
export const TARGET_NITROGEN_FERTILIZER_PER_HECTARE = 0.008;
/** Same treasury-priority tier as FertilizerInvestment. */
export const NITROGEN_FERTILIZER_BUDGET_SHARE_OF_TREASURY = 0.12;
/** Same EWMA pace as FertilizerInvestment/AgTechInvestment. */
export const NITROGEN_FERTILIZER_ADOPTION_RATE = 0.15;

export class NitrogenFertilizerInvestmentModule {
  /**
   * Runs at most once per simulation year; must be called after FertilizerInvestment.settleAnnual()
   * (both farm-fertilizer investments keep priority over mine/smelter claims together) and before
   * DevelopmentPotential.updateAnnualAgriculture().
   */
  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.nitrogenFertilizerInvestment)) return false;

    const fertilizerGood = getGoods().find(good => good.name === "Nitrogen Fertilizer");
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
      const previousStock = market.nitrogenFertilizerStock ?? 0;

      if (cultivatedHectares <= 0) {
        // No farmland to invest in; let existing adoption decay toward 0 rather than freezing it.
        market.nitrogenFertilizerStock = rn(previousStock * (1 - NITROGEN_FERTILIZER_ADOPTION_RATE), 4);
        continue;
      }

      const requestedUnits = cultivatedHectares * TARGET_NITROGEN_FERTILIZER_PER_HECTARE;
      const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
      const budget = Math.max(0, treasury.balance) * NITROGEN_FERTILIZER_BUDGET_SHARE_OF_TREASURY;

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
      market.nitrogenFertilizerStock = rn(
        previousStock * (1 - NITROGEN_FERTILIZER_ADOPTION_RATE) + coverageThisYear * NITROGEN_FERTILIZER_ADOPTION_RATE,
        4
      );
    }

    return true;
  }
}

export const NitrogenFertilizerInvestment = new NitrogenFertilizerInvestmentModule();
