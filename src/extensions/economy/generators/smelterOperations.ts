import {
  getGoods,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
  getWorldContext,
  setSmelterOperations
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import { getIngotGoodName, ORE_COMMODITIES, type OreCommodity } from "./mineralResources";

export interface SmelterOperation {
  i: number;
  depositId: number;
  cell: number;
  burgId: number;
  marketId: number;
  waterPower: number;
  fuelAccess: number;
  technology: number;
  smeltingYield: number;
  annualCapacityTons: number;
  /** Reserved for the Phase-C site-security system. */
  securityInvestment: number;
  active: boolean;
}

const DEFAULT_SMELTING_YIELD = 0.8;
const DEFAULT_SECURITY_INVESTMENT = 0;
const MARKET_SMELTING_STOCK_SHARE = 0.5;

/** Creates one independently sited smelter for each active metal mine and settles monthly refining. */
export class SmelterOperationsModule {
  generate(): void {
    const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
    const previousByDeposit = new Map(getSmelterOperations().map(operation => [operation.depositId, operation]));
    const operations: SmelterOperation[] = [];

    for (const mine of getMineOperations()) {
      const deposit = depositsById.get(mine.depositId);
      if (!mine.active || !deposit || deposit.exhausted || !this.hasMetalOre(deposit.yields)) continue;

      const site = this.selectSite(deposit.cell);
      const burgId = this.findNearestBurgId(site.cell, mine.marketId);
      if (!burgId) continue;

      const previous = previousByDeposit.get(deposit.i);
      operations.push({
        i: operations.length + 1,
        depositId: deposit.i,
        cell: site.cell,
        burgId,
        marketId: mine.marketId,
        waterPower: site.waterPower,
        fuelAccess: site.fuelAccess,
        technology: previous?.technology ?? mine.technology,
        smeltingYield: previous?.smeltingYield ?? DEFAULT_SMELTING_YIELD,
        annualCapacityTons: this.getAnnualCapacity(deposit.yields),
        securityInvestment: previous?.securityInvestment ?? DEFAULT_SECURITY_INVESTMENT,
        active: true
      });
    }

    setSmelterOperations(operations);
  }

  clear(): void {
    setSmelterOperations([]);
  }

  /** Converts each metal Ore's retained local-market stock into its matching Ingot. */
  produceMonth(): void {
    const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
    const minesByDeposit = new Map(getMineOperations().map(operation => [operation.depositId, operation]));
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));

    for (const smelter of getSmelterOperations()) {
      const deposit = depositsById.get(smelter.depositId);
      const mine = minesByDeposit.get(smelter.depositId);
      if (!smelter.active || !deposit || deposit.exhausted || !mine?.active) {
        smelter.active = false;
        continue;
      }

      const oreYields = deposit.yields.filter(yieldInfo => this.isOreCommodity(yieldInfo.commodity));
      const totalAnnualOreCapacity = this.getAnnualCapacity(oreYields);
      if (!totalAnnualOreCapacity) continue;

      const processingFactor = Math.min(1, smelter.waterPower * smelter.fuelAccess * smelter.technology);
      const monthlyCapacity = (smelter.annualCapacityTons * processingFactor) / 12;
      if (monthlyCapacity <= 0) continue;

      for (const yieldInfo of oreYields) {
        const commodity = yieldInfo.commodity;
        if (!this.isOreCommodity(commodity)) continue;
        const ore = goodsByName.get(`${commodity} ore`);
        const ingot = goodsByName.get(getIngotGoodName(commodity));
        if (!ore || !ingot || !isGoodEnabled(ore) || !isGoodEnabled(ingot)) continue;

        const capacityShare = monthlyCapacity * (yieldInfo.annualCapacityTons / totalAnnualOreCapacity);
        const oreConsumed = Markets.consumeForSmelting(
          smelter.marketId,
          ore.i,
          capacityShare,
          MARKET_SMELTING_STOCK_SHARE
        );
        if (!oreConsumed) continue;
        Markets.addSmelterSupply(smelter.marketId, ingot.i, oreConsumed * smelter.smeltingYield);
      }
    }
  }

  private hasMetalOre(yields: readonly { commodity: string }[]): boolean {
    return yields.some(yieldInfo => this.isOreCommodity(yieldInfo.commodity));
  }

  private isOreCommodity(commodity: string): commodity is OreCommodity {
    return (ORE_COMMODITIES as readonly string[]).includes(commodity);
  }

  private getAnnualCapacity(yields: readonly { annualCapacityTons: number }[]): number {
    return yields.reduce((sum, yieldInfo) => sum + yieldInfo.annualCapacityTons, 0);
  }

  private selectSite(depositCell: number): { cell: number; waterPower: number; fuelAccess: number } {
    const cells = getWorldContext().pack.cells;
    const candidateIds = [...new Set([depositCell, ...(cells.c?.[depositCell] ?? [])])].sort((a, b) => a - b);
    let best: { cell: number; waterPower: number; fuelAccess: number; score: number } | null = null;

    for (const cell of candidateIds) {
      const waterPower = cells.r[cell] ? 1 : cells.haven?.[cell] ? 0.75 : 0.4;
      const nearbyCells = [cell, ...(cells.c?.[cell] ?? [])];
      const isForest = (candidate: number) =>
        Boolean(getWorldContext().biomesData.tags?.[cells.biomeCode[candidate]]?.includes("forest"));
      const fuelAccess = isForest(cell) ? 1 : nearbyCells.some(isForest) ? 0.75 : 0.4;
      const score = waterPower * 0.65 + fuelAccess * 0.35;
      if (!best || score > best.score) best = { cell, waterPower, fuelAccess, score };
    }

    return best ?? { cell: depositCell, waterPower: 0.4, fuelAccess: 0.4 };
  }

  private findNearestBurgId(cellId: number, marketId: number): number {
    const { burgs, cells } = getWorldContext().pack;
    const point = cells.p[cellId];
    let nearestId = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const burg of burgs) {
      if (!burg.i || burg.removed || burg.market !== marketId) continue;
      if (!point) return burg.i;
      const dx = burg.x - point[0];
      const dy = burg.y - point[1];
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = burg.i;
      }
    }
    return nearestId;
  }
}

export const SmelterOperations = new SmelterOperationsModule();
