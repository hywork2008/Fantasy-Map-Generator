import { rn } from "../../hostUtils";
import {
  getApi,
  getGoods,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
  getWorldContext,
  setSmelterOperations
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { getGuildBonus } from "./guildKnowledge";
import { Markets } from "./markets-generator";
import { getIngotGoodName, ORE_COMMODITIES, type OreCommodity } from "./mineralResources";
import type { SmelterOperation } from "./smelterOperationsTypes";

export type { SmelterOperation } from "./smelterOperationsTypes";

const DEFAULT_SMELTING_YIELD = 0.8;
const DEFAULT_SECURITY_INVESTMENT = 0;
const MARKET_SMELTING_STOCK_SHARE = 0.5;
const BASE_THEFT_RISK = 0.008;
const SECURITY_UPKEEP_BASE = 0.1;
const SECURITY_UPKEEP_PER_ANNUAL_TON = 0.01;
const FRONTIER_WILDERNESS = 0;
const FRONTIER_OUTPOST = 1;
const FRONTIER_SETTLEMENT = 2;
const FRONTIER_INCORPORATED = 3;
/** How much toolsInvestmentStock=1 (IndustrialTechInvestment) raises processingFactor. */
const SMELTER_TECH_BONUS_MAX = 0.3;
/** Base headcount a smelter needs even at minimal throughput (furnace tending, hauling). */
const REQUIRED_WORKERS_BASE = 4;
/** Additional headcount per annual tonne of ore capacity to run at full processingFactor (calibration TBD). */
const REQUIRED_WORKERS_PER_ANNUAL_TON = 0.05;

/**
 * Headcount needed to run a smelter's processing at full capacity. Reused by
 * `produceMonth()` (as `workerFactor`'s denominator) and by the annual Burg-anchored
 * employment reconciliation in `basicEmployment.ts` (docs/plan/urban-employment-demand.md §3.2).
 */
export function getSmelterRequiredWorkers(smelter: Pick<SmelterOperation, "annualCapacityTons">): number {
  return REQUIRED_WORKERS_BASE + smelter.annualCapacityTons * REQUIRED_WORKERS_PER_ANNUAL_TON;
}

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
      const annualCapacityTons = this.getAnnualCapacity(deposit.yields);
      operations.push({
        i: operations.length + 1,
        depositId: deposit.i,
        cell: site.cell,
        burgId,
        marketId: mine.marketId,
        waterPower: site.waterPower,
        fuelAccess: site.fuelAccess,
        technology: previous?.technology ?? mine.technology,
        toolsInvestmentStock: previous?.toolsInvestmentStock ?? 0,
        smeltingYield: previous?.smeltingYield ?? DEFAULT_SMELTING_YIELD,
        annualCapacityTons,
        // A newly built smelter staffs up immediately; annual reconciliation (basicEmployment.ts)
        // pulls this back down toward the Burg's actually-available adults over subsequent years.
        workers: previous?.workers ?? getSmelterRequiredWorkers({ annualCapacityTons }),
        securityInvestment: previous?.securityInvestment ?? DEFAULT_SECURITY_INVESTMENT,
        lastSecurityUpkeep: 0,
        lastTheftLoss: 0,
        lastTheftRisk: 0,
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
      smelter.lastSecurityUpkeep = 0;
      smelter.lastTheftLoss = 0;
      smelter.lastTheftRisk = 0;
      const deposit = depositsById.get(smelter.depositId);
      const mine = minesByDeposit.get(smelter.depositId);
      if (!smelter.active || !deposit || deposit.exhausted || !mine?.active) {
        smelter.active = false;
        continue;
      }

      const effectiveSecurity = this.settleSecurityUpkeep(smelter);

      const oreYields = deposit.yields.filter(yieldInfo => this.isOreCommodity(yieldInfo.commodity));
      const totalAnnualOreCapacity = this.getAnnualCapacity(oreYields);
      if (!totalAnnualOreCapacity) continue;

      const workerFactor = Math.min(1, smelter.workers / getSmelterRequiredWorkers(smelter));
      // toolsInvestmentStock (IndustrialTechInvestment.settleAnnual()) applies as its own
      // multiplier, independent of the prospect()-derived `technology` — docs/plan/rural-agtech-investment.md §6.2.
      const investmentBonus = 1 + SMELTER_TECH_BONUS_MAX * (smelter.toolsInvestmentStock ?? 0);
      // The Burg's Metallurgy guild technique (GuildKnowledge.settleAnnual()) applies as a third,
      // independent multiplier — docs/plan/knowledge-guild-system.md §6, §9 Phase 1.
      const guildBonus = getGuildBonus(smelter.burgId, "metallurgy");
      const processingFactor = Math.min(
        1,
        smelter.waterPower * smelter.fuelAccess * smelter.technology * investmentBonus * guildBonus * workerFactor
      );
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
        const refinedIngots = oreConsumed * smelter.smeltingYield;
        const theftLoss = this.rollTheft(smelter, deposit.accessibility, refinedIngots, effectiveSecurity);
        const deliveredIngots = Math.max(0, refinedIngots - theftLoss);
        if (deliveredIngots > 0) Markets.addSmelterSupply(smelter.marketId, ingot.i, deliveredIngots);
      }
    }
  }

  /**
   * Deducts site security from the owning state's treasury. If that treasury cannot
   * cover the configured level, the site keeps its configured investment but the
   * current month's theft protection is reduced proportionally.
   */
  private settleSecurityUpkeep(smelter: SmelterOperation): number {
    const securityInvestment = this.clampUnit(smelter.securityInvestment);
    smelter.securityInvestment = securityInvestment;
    if (securityInvestment <= 0) return 0;

    const burg = getWorldContext().pack.burgs[smelter.burgId];
    const state = burg?.state ? getWorldContext().pack.states[burg.state] : undefined;
    if (!state || state.removed) return 0;

    const requestedUpkeep =
      (SECURITY_UPKEEP_BASE + smelter.annualCapacityTons * SECURITY_UPKEEP_PER_ANNUAL_TON) * securityInvestment;
    const treasury = Math.max(0, state.treasury ?? 0);
    const paidUpkeep = Math.min(treasury, requestedUpkeep);
    state.treasury = rn(treasury - paidUpkeep, 2);
    smelter.lastSecurityUpkeep = rn(paidUpkeep, 2);
    return requestedUpkeep > 0 ? securityInvestment * (paidUpkeep / requestedUpkeep) : 0;
  }

  /** Rolls theft against refined, not-yet-marketed Ingots. */
  private rollTheft(
    smelter: SmelterOperation,
    accessibility: number,
    refinedIngots: number,
    effectiveSecurity: number
  ): number {
    if (refinedIngots <= 0) return 0;
    const risk = this.getTheftRisk(smelter, accessibility, effectiveSecurity);
    smelter.lastTheftRisk = Math.max(smelter.lastTheftRisk, risk);
    if (Math.random() >= risk) return 0;

    // A raid takes a material share of the just-refined batch, never the market's stock.
    const loss = rn(refinedIngots * (0.25 + Math.random() * 0.5), 4);
    smelter.lastTheftLoss = rn(smelter.lastTheftLoss + loss, 4);
    return loss;
  }

  private getTheftRisk(smelter: SmelterOperation, accessibility: number, effectiveSecurity: number): number {
    const { cells, burgs, states } = getWorldContext().pack;
    const cell = smelter.cell;
    const stage = this.getFrontierStage(cell, cells.state?.[cell] ?? 0);
    const frontierMultiplier =
      stage >= FRONTIER_INCORPORATED
        ? 0.05
        : stage === FRONTIER_SETTLEMENT
          ? 0.35
          : stage === FRONTIER_OUTPOST
            ? 0.75
            : 1.25;
    const danger = Math.max(0, Math.min(255, cells.danger?.[cell] ?? 0));
    const dangerMultiplier = 1 + (3 * danger) / 255;
    const stateId = burgs[smelter.burgId]?.state ?? 0;
    const supplyStrain = this.clampUnit(states[stateId]?.supplyStrain ?? 0);
    const warMultiplier = 1 + supplyStrain;
    const isolationMultiplier = 1 + (1 - this.clampUnit(accessibility));
    const securityMultiplier = 1 - this.clampUnit(effectiveSecurity);
    return this.clampUnit(
      BASE_THEFT_RISK * frontierMultiplier * dangerMultiplier * warMultiplier * isolationMultiplier * securityMultiplier
    );
  }

  /** State-owned ordinary map cells are treated as incorporated even before frontier data exists. */
  private getFrontierStage(cell: number, stateId: number): number {
    if (stateId) return FRONTIER_INCORPORATED;
    const stage = getApi().simulationContext?.frontier?.cellStages?.[cell];
    return typeof stage === "number" ? stage : FRONTIER_WILDERNESS;
  }

  private clampUnit(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
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
