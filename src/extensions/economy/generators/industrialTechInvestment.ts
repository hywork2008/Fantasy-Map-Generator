import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getGoods,
  getMarketById,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
  settleAnnualOnce
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import { getMineRequiredWorkers } from "./mineOperations";
import { getSmelterRequiredWorkers } from "./smelterOperations";

/**
 * Drives MineOperation.toolsInvestmentStock / SmelterOperation.toolsInvestmentStock from the
 * same Tools supply chain AgTechInvestment uses for farms, independent of the prospect()-derived
 * `technology` baseline. See docs/plan/rural-agtech-investment.md §6.2.
 */

/** "calibration TBD" — annual Tools spend per required-worker-point that counts as full (1.0) coverage. */
export const MINE_TARGET_TOOLS_PER_WORKER = 0.05;
export const MINE_BUDGET_SHARE_OF_TREASURY = 0.1;
export const MINE_ADOPTION_RATE = 0.12;

export const SMELTER_TARGET_TOOLS_PER_WORKER = 0.05;
export const SMELTER_BUDGET_SHARE_OF_TREASURY = 0.1;
export const SMELTER_ADOPTION_RATE = 0.12;

// MINE_TECH_BONUS_MAX / SMELTER_TECH_BONUS_MAX (how much toolsInvestmentStock raises
// extractionFactor/processingFactor) live in mineOperations.ts/smelterOperations.ts instead,
// co-located with the formulas that consume them — importing them back here would create a
// mineOperations.ts <-> industrialTechInvestment.ts cycle via getMineRequiredWorkers below.

export class IndustrialTechInvestmentModule {
  /**
   * Runs at most once per simulation year. Must run after AgTechInvestment.settleAnnual() within
   * the same year so farm investment claims each market's treasury first (docs/plan/rural-agtech-investment.md §6.3).
   */
  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.industrialTech)) return false;

    const toolsGood = getGoods().find(good => good.name === "Tools");
    if (!toolsGood || !isGoodEnabled(toolsGood)) return true;

    const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
    for (const mine of getMineOperations()) {
      const deposit = depositsById.get(mine.depositId);
      if (!mine.active || !deposit) {
        mine.toolsInvestmentStock = rn((mine.toolsInvestmentStock ?? 0) * (1 - MINE_ADOPTION_RATE), 4);
        continue;
      }
      const requestedUnits = getMineRequiredWorkers(deposit) * MINE_TARGET_TOOLS_PER_WORKER;
      mine.toolsInvestmentStock = this.invest(
        mine.marketId,
        toolsGood.i,
        requestedUnits,
        MINE_BUDGET_SHARE_OF_TREASURY,
        mine.toolsInvestmentStock ?? 0,
        MINE_ADOPTION_RATE
      );
    }

    for (const smelter of getSmelterOperations()) {
      if (!smelter.active) {
        smelter.toolsInvestmentStock = rn((smelter.toolsInvestmentStock ?? 0) * (1 - SMELTER_ADOPTION_RATE), 4);
        continue;
      }
      const requestedUnits = getSmelterRequiredWorkers(smelter) * SMELTER_TARGET_TOOLS_PER_WORKER;
      smelter.toolsInvestmentStock = this.invest(
        smelter.marketId,
        toolsGood.i,
        requestedUnits,
        SMELTER_BUDGET_SHARE_OF_TREASURY,
        smelter.toolsInvestmentStock ?? 0,
        SMELTER_ADOPTION_RATE
      );
    }

    return true;
  }

  /** Spends from the operation's own Market treasury; shared shape for mine and smelter investment. */
  private invest(
    marketId: number,
    toolsGoodId: number,
    requestedUnits: number,
    budgetShare: number,
    previousStock: number,
    adoptionRate: number
  ): number {
    const market = getMarketById(marketId);
    const treasury = market?.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    const budget = Math.max(0, treasury.balance) * budgetShare;

    const { units, cost } = Markets.consumeForMarketInvestment(marketId, toolsGoodId, requestedUnits, budget);
    if (cost > 0 && market) {
      treasury.balance = rn(treasury.balance - cost, 2);
      market.marketTreasury = treasury;
    }

    const coverageThisYear = requestedUnits > 0 ? Math.min(1, units / requestedUnits) : 0;
    return rn(previousStock * (1 - adoptionRate) + coverageThisYear * adoptionRate, 4);
  }
}

export const IndustrialTechInvestment = new IndustrialTechInvestmentModule();
