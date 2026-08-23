import { rn } from "../../hostUtils";
import {
  getCultivatedArea,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getPotashFertilizerInvestmentLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setPotashFertilizerInvestmentLastSettledYear
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

/**
 * Rural Potash investment: Markets spend from their own treasury to buy Potash (the existing
 * wood-ash-derived Good, otherwise sold for glass/soap) for their cultivated land, building up a
 * saturating adoption stock (Market.potashFertilizerStock) that feeds calculateYieldKgPerHectare
 * in agriculturalLandUse.ts. Same shape as FertilizerInvestment/NitrogenFertilizerInvestment — a
 * separate account/stock, not a rewrite of either sibling. No State-level layer, same reasoning:
 * a market-purchased consumable, not public infrastructure.
 *
 * Unlike Phosphate/Nitrogen Fertilizer, Potash is not a new Good and carries no
 * requiredTechnology — wood-ash potash has been producible since antiquity — so isGoodEnabled()
 * is unconditionally true and this module has no technology gate, matching AgTechInvestment's
 * (Tools) precedent rather than the industrial-fertilizer siblings'.
 * See docs/plan/fallow-reduction-fertilizer-rotation.md §4.
 */

/** calibration TBD — smaller than TARGET_TOOLS_PER_HECTARE(0.02); a bulky, low-K-content wood-ash product. */
export const TARGET_POTASH_PER_HECTARE = 0.006;
/** Same treasury-priority tier as FertilizerInvestment/NitrogenFertilizerInvestment. */
export const POTASH_BUDGET_SHARE_OF_TREASURY = 0.12;
/** Same EWMA pace as FertilizerInvestment/NitrogenFertilizerInvestment/AgTechInvestment. */
export const POTASH_ADOPTION_RATE = 0.15;

export class PotashFertilizerInvestmentModule {
  /**
   * Runs at most once per simulation year; must be called after NitrogenFertilizerInvestment.settleAnnual()
   * (both farm-fertilizer investments keep priority over mine/smelter claims together) and before
   * DevelopmentPotential.updateAnnualAgriculture().
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getPotashFertilizerInvestmentLastSettledYear() === year) return false;
    setPotashFertilizerInvestmentLastSettledYear(year);

    const potashGood = getGoods().find(good => good.name === "Potash");
    if (!potashGood || !isGoodEnabled(potashGood)) return true;

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
      const previousStock = market.potashFertilizerStock ?? 0;

      if (cultivatedHectares <= 0) {
        // No farmland to invest in; let existing adoption decay toward 0 rather than freezing it.
        market.potashFertilizerStock = rn(previousStock * (1 - POTASH_ADOPTION_RATE), 4);
        continue;
      }

      const requestedUnits = cultivatedHectares * TARGET_POTASH_PER_HECTARE;
      const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
      const budget = Math.max(0, treasury.balance) * POTASH_BUDGET_SHARE_OF_TREASURY;

      const { units: purchasedUnits, cost } = Markets.consumeForMarketInvestment(
        market.i,
        potashGood.i,
        requestedUnits,
        budget
      );

      if (cost > 0) {
        treasury.balance = rn(treasury.balance - cost, 2);
        market.marketTreasury = treasury;
      }

      const coverageThisYear = requestedUnits > 0 ? Math.min(1, purchasedUnits / requestedUnits) : 0;
      market.potashFertilizerStock = rn(
        previousStock * (1 - POTASH_ADOPTION_RATE) + coverageThisYear * POTASH_ADOPTION_RATE,
        4
      );
    }

    return true;
  }
}

export const PotashFertilizerInvestment = new PotashFertilizerInvestmentModule();
