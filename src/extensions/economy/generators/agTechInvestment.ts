import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getCultivatedArea,
  getFieldDrainage,
  getFloodProtection,
  getGoods,
  getIrrigationDevelopment,
  getMarketCellColumn,
  getMarkets,
  getStateAgriculturalProductivity,
  getWorldContext,
  setFieldDrainage,
  setFloodProtection,
  setIrrigationConveyanceEfficiency,
  setIrrigationDevelopment,
  setStateAgriculturalProductivity,
  settleAnnualOnce
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

/**
 * Rural technology investment: Markets spend from their own treasury to buy Tools (the existing
 * Iron Ore -> Iron Ingot -> Tools chain's end product) for their cultivated land, building up a
 * saturating adoption stock that feeds cellAgriculturalModifier in agriculturalLandUse.ts.
 * States separately fund a slower, State-treasury-financed layer (stateAgriculturalProductivity)
 * and water works. Water works persist in independent irrigation, flood-protection, and field-drainage columns.
 * See docs/plan/rural-agtech-investment.md.
 */

/** "calibration TBD" — annual Tools spend per cultivated hectare that counts as full (1.0) coverage. */
export const TARGET_TOOLS_PER_HECTARE = 0.02;
/** Share of a market's liquid treasury balance that may fund Tools purchases in one year. */
export const AGTECH_BUDGET_SHARE_OF_TREASURY = 0.15;
/** EWMA smoothing: ~7 simulated years of sustained full coverage to approach agTechStock = 1. */
export const AGTECH_ADOPTION_RATE = 0.15;

/** Smaller than TARGET_TOOLS_PER_HECTARE — public infrastructure, not per-farmer tool ownership. */
export const STATE_TARGET_TOOLS_PER_HECTARE = 0.008;
/** Share of a State's treasury (not a Market's) that may fund this investment in one year. */
export const STATE_BUDGET_SHARE_OF_TREASURY = 0.1;
/** Slower institutional adoption than the market-level EWMA. */
export const STATE_ADOPTION_RATE = 0.1;

export class AgTechInvestmentModule {
  private get worldContext() {
    return getWorldContext();
  }

  /** Runs at most once per simulation year; must be called before DevelopmentPotential.updateAnnualAgriculture(). */
  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.agTech)) return false;

    const toolsGood = getGoods().find(good => good.name === "Tools");
    if (!toolsGood || !isGoodEnabled(toolsGood)) return true;

    const cultivatedAreaByCell = getCultivatedArea();
    const marketCellColumn = getMarketCellColumn();
    if (!cultivatedAreaByCell.length || !marketCellColumn.length) return true;

    const cells = this.worldContext.pack.cells;
    const cultivatedHectaresByMarket = new Map<number, number>();
    // stateId -> marketId -> hectares, so State investment (§6.1) buys from the same market's
    // Tools stock its farmers use, apportioned to whichever state actually owns each cell.
    const hectaresByStateAndMarket = new Map<number, Map<number, number>>();

    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId];
      if (!marketId) continue;
      const hectares = cultivatedAreaByCell[cellId] || 0;
      if (hectares <= 0) continue;
      cultivatedHectaresByMarket.set(marketId, (cultivatedHectaresByMarket.get(marketId) ?? 0) + hectares);

      const stateId = cells.state?.[cellId] ?? 0;
      if (!stateId) continue;
      const byMarket = hectaresByStateAndMarket.get(stateId) ?? new Map<number, number>();
      byMarket.set(marketId, (byMarket.get(marketId) ?? 0) + hectares);
      hectaresByStateAndMarket.set(stateId, byMarket);
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

    this.settleStates(toolsGood.i, hectaresByStateAndMarket);

    return true;
  }

  /** State-treasury-funded public agricultural infrastructure (§6.1); a separate pool from Markets'. */
  private settleStates(toolsGoodId: number, hectaresByStateAndMarket: Map<number, Map<number, number>>): void {
    const states = this.worldContext.pack.states ?? [];
    const stockByState = getStateAgriculturalProductivity();
    const nextStockByState =
      stockByState.length >= states.length ? stockByState.slice() : new Float32Array(states.length);
    const coverageByState = new Float32Array(states.length);

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const byMarket = hectaresByStateAndMarket.get(state.i);
      const totalHectares = byMarket ? [...byMarket.values()].reduce((sum, hectares) => sum + hectares, 0) : 0;
      const previousStock = nextStockByState[state.i] ?? 0;

      if (!byMarket || totalHectares <= 0) {
        nextStockByState[state.i] = rn(previousStock * (1 - STATE_ADOPTION_RATE), 4);
        continue;
      }

      const totalBudget = Math.max(0, state.treasury ?? 0) * STATE_BUDGET_SHARE_OF_TREASURY;
      let purchasedTotal = 0;
      let requestedTotal = 0;

      for (const [marketId, hectares] of byMarket) {
        const requestedUnits = hectares * STATE_TARGET_TOOLS_PER_HECTARE;
        const marketBudget = totalBudget * (hectares / totalHectares);
        const { units, cost } = Markets.consumeForMarketInvestment(marketId, toolsGoodId, requestedUnits, marketBudget);
        purchasedTotal += units;
        requestedTotal += requestedUnits;
        if (cost > 0) state.treasury = rn((state.treasury ?? 0) - cost, 2);
      }

      const coverageThisYear = requestedTotal > 0 ? Math.min(1, purchasedTotal / requestedTotal) : 0;
      coverageByState[state.i] = coverageThisYear;
      nextStockByState[state.i] = rn(
        previousStock * (1 - STATE_ADOPTION_RATE) + coverageThisYear * STATE_ADOPTION_RATE,
        4
      );
    }

    setStateAgriculturalProductivity(nextStockByState);
    this.settleWaterWorks(coverageByState);
  }

  /**
   * The initial public-works budget is settled with the State's infrastructure purchase, but its
   * effects are stored independently. Future policy can fund these columns with distinct budgets
   * without changing agriculture's water-allocation interface.
   */
  private settleWaterWorks(coverageByState: Float32Array): void {
    const cells = this.worldContext.pack.cells;
    const count = cells.i.length;
    const irrigation = getIrrigationDevelopment();
    const drainage = getFieldDrainage();
    const floodProtection = getFloodProtection();
    const nextIrrigation = irrigation.length === count ? irrigation.slice() : new Float32Array(count);
    const nextDrainage = drainage.length === count ? drainage.slice() : new Float32Array(count);
    const nextFloodProtection = floodProtection.length === count ? floodProtection.slice() : new Float32Array(count);
    const conveyance = new Float32Array(count);

    for (const cellId of cells.i) {
      const stateId = cells.state?.[cellId] ?? 0;
      const coverage = coverageByState[stateId] ?? 0;
      const hasRiverAccess =
        Boolean(cells.r?.[cellId]) || (cells.c?.[cellId] ?? []).some(neighbor => Boolean(cells.r?.[neighbor]));
      const irrigationTarget = hasRiverAccess ? coverage : 0;
      nextIrrigation[cellId] = rn(nextIrrigation[cellId]! * 0.9 + irrigationTarget * 0.1, 4);
      nextDrainage[cellId] = rn(nextDrainage[cellId]! * 0.9 + coverage * 0.06, 4);
      nextFloodProtection[cellId] = rn(nextFloodProtection[cellId]! * 0.9 + coverage * 0.07, 4);
      conveyance[cellId] = rn(0.35 + nextIrrigation[cellId]! * 0.5, 4);
    }

    setIrrigationDevelopment(nextIrrigation);
    setIrrigationConveyanceEfficiency(conveyance);
    setFieldDrainage(nextDrainage);
    setFloodProtection(nextFloodProtection);
  }
}

export const AgTechInvestment = new AgTechInvestmentModule();
