import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  getWorldContext,
  setMineOperations
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { MineOperation, MineralCommodity } from "./mineralResources";

/** Creates accessible mines and settles their monthly output into market stock. */
export class MineOperationsModule {
  generate(): void {
    const marketById = new Set(getMarkets().map(market => market.i));
    const marketColumn = getMarketCellColumn();
    const operations: MineOperation[] = [];

    for (const deposit of getMineralDeposits()) {
      const marketId = marketColumn[deposit.cell] ?? 0;
      if (deposit.exhausted || !marketId || !marketById.has(marketId)) continue;
      const burgId = this.findNearestBurgId(deposit.cell, marketId);
      if (!burgId) continue;

      deposit.discovered = true;
      operations.push({
        i: operations.length + 1,
        depositId: deposit.i,
        burgId,
        marketId,
        workers: 4 + deposit.richness * 6,
        technology: 1,
        drainage: deposit.depth === "surface" ? 1 : deposit.depth === "shallow" ? 0.75 : 0.5,
        fuelAccess: 0.65,
        annualOutputTons: {},
        active: true
      });
    }

    setMineOperations(operations);
  }

  clear(): void {
    setMineOperations([]);
  }

  /** Settles one Economy production month and decrements recoverable reserves. */
  produceMonth(): void {
    const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));

    for (const operation of getMineOperations()) {
      const deposit = depositsById.get(operation.depositId);
      if (!deposit || deposit.exhausted || !operation.active) {
        operation.active = false;
        continue;
      }

      const workerFactor = Math.min(1, operation.workers / (4 + deposit.richness * 6));
      const extractionFactor = Math.max(
        0,
        Math.min(
          1,
          workerFactor * operation.technology * operation.drainage * operation.fuelAccess * deposit.accessibility
        )
      );
      const annualOutput: Partial<Record<MineralCommodity, number>> = {};

      for (const yieldInfo of deposit.yields) {
        const good = goodsByName.get(yieldInfo.commodity);
        if (!good || !isGoodEnabled(good) || yieldInfo.reserveTons <= 0) continue;

        const potentialAnnual = yieldInfo.annualCapacityTons * extractionFactor;
        const supplied = Markets.addMineSupply(
          operation.marketId,
          good.i,
          Math.min(yieldInfo.reserveTons, potentialAnnual / 12)
        );
        if (supplied <= 0) continue;
        yieldInfo.reserveTons = rn(Math.max(0, yieldInfo.reserveTons - supplied), 4);
        annualOutput[yieldInfo.commodity] = rn(Math.min(yieldInfo.reserveTons + supplied, potentialAnnual), 4);
      }

      operation.annualOutputTons = annualOutput;
      deposit.exhausted = deposit.yields.every(yieldInfo => yieldInfo.reserveTons <= 0);
      if (deposit.exhausted) operation.active = false;
    }
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

export const MineOperations = new MineOperationsModule();
