import { rn } from "../../hostUtils";
import {
  getAgTechLastSettledYear,
  getCultivatedArea,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getSimulationYear,
  getWorldContext,
  setAgTechLastSettledYear
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

/**
 * Rural technology investment: Markets spend from their own treasury to buy Tools (the existing
 * Iron Ore -> Iron Ingot -> Tools chain's end product) for their cultivated land, building up a
 * saturating adoption stock that feeds cellAgriculturalModifier in agriculturalLandUse.ts.
 * See docs/plan/rural-agtech-investment.md.
 */

/** "calibration TBD" — annual Tools spend per cultivated hectare that counts as full (1.0) coverage. */
export const TARGET_TOOLS_PER_HECTARE = 0.02;
/** Share of a market's liquid treasury balance that may fund Tools purchases in one year. */
export const AGTECH_BUDGET_SHARE_OF_TREASURY = 0.15;
/** EWMA smoothing: ~7 simulated years of sustained full coverage to approach agTechStock = 1. */
export const AGTECH_ADOPTION_RATE = 0.15;

export class AgTechInvestmentModule {
  private get worldContext() {
    return getWorldContext();
  }

  /** Runs at most once per simulation year; must be called before DevelopmentPotential.updateAnnualAgriculture(). */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getAgTechLastSettledYear() === year) return false;
    setAgTechLastSettledYear(year);

    const toolsGood = getGoods().find(good => good.name === "Tools");
    if (!toolsGood || !isGoodEnabled(toolsGood)) return true;

    const cultivatedAreaByCell = getCultivatedArea();
    const marketCellColumn = getMarketCellColumn();
    if (!cultivatedAreaByCell.length || !marketCellColumn.length) return true;

    const cultivatedHectaresByMarket = new Map<number, number>();
    const cells = this.worldContext.pack.cells;
    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId];
      if (!marketId) continue;
      const hectares = cultivatedAreaByCell[cellId] || 0;
      if (hectares <= 0) continue;
      cultivatedHectaresByMarket.set(marketId, (cultivatedHectaresByMarket.get(marketId) ?? 0) + hectares);
    }

    for (const market of getMarkets()) {
      const cultivatedHectares = cultivatedHectaresByMarket.get(market.i) ?? 0;
      const previousStock = market.agTechStock ?? 0;

      if (cultivatedHectares <= 0) {
        // No farmland to invest in; let existing adoption decay toward 0 rather than freezing it.
        market.agTechStock = rn(previousStock * (1 - AGTECH_ADOPTION_RATE), 4);
        continue;
      }

      const requestedUnits = cultivatedHectares * TARGET_TOOLS_PER_HECTARE;
      const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
      const budget = Math.max(0, treasury.balance) * AGTECH_BUDGET_SHARE_OF_TREASURY;

      const { units: purchasedUnits, cost } = Markets.consumeForMarketInvestment(
        market.i,
        toolsGood.i,
        requestedUnits,
        budget
      );

      if (cost > 0) {
        treasury.balance = rn(treasury.balance - cost, 2);
        market.marketTreasury = treasury;
      }

      const coverageThisYear = requestedUnits > 0 ? Math.min(1, purchasedUnits / requestedUnits) : 0;
      market.agTechStock = rn(previousStock * (1 - AGTECH_ADOPTION_RATE) + coverageThisYear * AGTECH_ADOPTION_RATE, 4);
    }

    return true;
  }
}

export const AgTechInvestment = new AgTechInvestmentModule();
