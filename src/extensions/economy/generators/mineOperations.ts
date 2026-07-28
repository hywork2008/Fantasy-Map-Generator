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
import { getMinedGoodName, type MineOperation, type MineralCommodity } from "./mineralResources";

const INITIAL_OPERATION_ACCESSIBILITY = 0.5;
const PROSPECTING_ACCESSIBILITY = 0.35;

/** Creates accessible mines and settles their monthly output into market stock. */
export class MineOperationsModule {
  generate(): void {
    const marketById = new Set(getMarkets().map(market => market.i));
    const marketColumn = getMarketCellColumn();
    const operations: MineOperation[] = [];

    for (const deposit of getMineralDeposits()) {
      const marketId = marketColumn[deposit.cell] ?? 0;
      if (
        deposit.exhausted ||
        deposit.accessibility < INITIAL_OPERATION_ACCESSIBILITY ||
        !marketId ||
        !marketById.has(marketId)
      ) {
        continue;
      }
      const burgId = this.findNearestBurgId(deposit.cell, marketId);
      if (!burgId) continue;

      deposit.discovered = true;
      operations.push(this.createOperation(operations.length + 1, deposit.i, burgId, marketId));
    }

    setMineOperations(operations);
  }

  clear(): void {
    setMineOperations([]);
  }

  /**
   * Opens deposits that became reachable through roads, rivers, or ports after
   * initial generation. Deep deposits receive a modest technology and drainage
   * uplift instead of being treated as surface mines.
   */
  prospect(): { discovered: number; upgraded: number } {
    const marketById = new Set(getMarkets().map(market => market.i));
    const marketColumn = getMarketCellColumn();
    const operations = getMineOperations();
    const operationByDeposit = new Map(operations.map(operation => [operation.depositId, operation]));
    let discovered = 0;
    let upgraded = 0;

    for (const deposit of getMineralDeposits()) {
      if (deposit.exhausted) continue;
      deposit.accessibility = this.getAccessibility(deposit.cell);
      const operation = operationByDeposit.get(deposit.i);
      if (operation) {
        if (deposit.depth !== "deep") continue;
        const updatedDrainage = this.getDrainage(deposit.depth, true);
        if (operation.drainage < updatedDrainage || operation.technology < 1.1) {
          operation.drainage = Math.max(operation.drainage, updatedDrainage);
          operation.technology = Math.max(operation.technology, 1.1);
          operation.fuelAccess = Math.max(operation.fuelAccess, deposit.accessibility >= 0.6 ? 0.8 : 0.7);
          upgraded += 1;
        }
        continue;
      }
      if (deposit.discovered || deposit.accessibility < PROSPECTING_ACCESSIBILITY) continue;

      const marketId = marketColumn[deposit.cell] ?? 0;
      if (!marketId || !marketById.has(marketId)) continue;
      const burgId = this.findNearestBurgId(deposit.cell, marketId);
      if (!burgId) continue;

      deposit.discovered = true;
      operations.push(this.createOperation(operations.length + 1, deposit.i, burgId, marketId, true));
      discovered += 1;
    }

    setMineOperations(operations);
    return { discovered, upgraded };
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
        const good = goodsByName.get(getMinedGoodName(yieldInfo.commodity));
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

  private createOperation(
    id: number,
    depositId: number,
    burgId: number,
    marketId: number,
    developed = false
  ): MineOperation {
    const deposit = getMineralDeposits().find(candidate => candidate.i === depositId);
    if (!deposit) throw new Error(`Cannot create mine operation for missing deposit ${depositId}`);
    return {
      i: id,
      depositId,
      burgId,
      marketId,
      workers: 4 + deposit.richness * 6,
      technology: developed ? 1.1 : 1,
      drainage: this.getDrainage(deposit.depth, developed),
      fuelAccess: developed ? (deposit.accessibility >= 0.6 ? 0.8 : 0.7) : 0.65,
      annualOutputTons: {},
      active: true
    };
  }

  private getDrainage(depth: "surface" | "shallow" | "deep", developed: boolean): number {
    if (depth === "surface") return 1;
    if (depth === "shallow") return developed ? 0.9 : 0.75;
    return developed ? 0.7 : 0.5;
  }

  private getAccessibility(cell: number): number {
    const cells = getWorldContext().pack.cells;
    const hasRiver = Boolean(cells.r[cell]);
    const hasRoute = Boolean(cells.routes?.[cell] && Object.keys(cells.routes[cell]).length);
    const hasHaven = Boolean(cells.haven?.[cell]);
    return Math.min(1, 0.35 + (hasRiver ? 0.15 : 0) + (hasRoute ? 0.25 : 0) + (hasHaven ? 0.15 : 0));
  }
}

export const MineOperations = new MineOperationsModule();
