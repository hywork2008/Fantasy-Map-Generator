import { rn } from "../../hostUtils";
import {
  getApi,
  getGoods,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
  getWorldContext,
  setSmelterOperations
} from "../economyContext";
import { harvestWood } from "./forestStock";
import { isGoodEnabled } from "./goods-generator";
import { getGuildBonus } from "./guildKnowledge";
import { Markets } from "./markets-generator";
import { getIngotGoodName, ORE_COMMODITIES, type OreCommodity } from "./mineralResources";
import type { SmelterOperation } from "./smelterOperationsTypes";

export type { SmelterOperation } from "./smelterOperationsTypes";
export {
  GUILD_SITE_KNOWLEDGE_CAP_PEOPLE,
  getSmelterEmploymentPeople,
  SMELTER_EMPLOYMENT_BASE_PEOPLE,
  SMELTER_EMPLOYMENT_PEOPLE_PER_ANNUAL_TON
} from "./smelterOperationsTypes";

const DEFAULT_SMELTING_YIELD = 0.8;
const DEFAULT_SECURITY_INVESTMENT = 0;
const MARKET_SMELTING_STOCK_SHARE = 0.5;
/** Medieval ore reduction requires charcoal both as furnace fuel and as the reducing agent. */
const CHARCOAL_PER_ORE_UNIT = 1;
/** Gangue and furnace waste retained locally after each unit of ore is processed. */
const SLAG_PER_ORE_UNIT = 0.25;
const CHARCOAL_GOOD_NAME = "charcoal";
const SLAG_GOOD_NAME = "slag";
const BASE_THEFT_RISK = 0.008;
const SECURITY_UPKEEP_BASE = 0.1;
const SECURITY_UPKEEP_PER_ANNUAL_TON = 0.01;
const FRONTIER_WILDERNESS = 0;
const FRONTIER_OUTPOST = 1;
const FRONTIER_SETTLEMENT = 2;
const FRONTIER_INCORPORATED = 3;
/** How much toolsInvestmentStock=1 (IndustrialTechInvestment) raises processingFactor. */
const SMELTER_TECH_BONUS_MAX = 0.3;
/** Base workforce points for furnace tending, hauling, and charcoal handling. */
const REQUIRED_WORKERS_BASE = 0.5;
/**
 * Additional workforce points per annual tonne of geological capacity. Deposit capacity is far
 * larger than a single small burg's initial labour pool, so this must stay below mine staffing
 * scale or unprocessed Ore permanently accumulates while Ingots remain unavailable.
 */
const REQUIRED_WORKERS_PER_ANNUAL_TON = 0.0025;

/** An unfinished State military order that needs a particular refined Ingot. */
export interface StateMilitaryIngotShortage {
  stateId: number;
  ingotGoodId: number;
  requestedIngotUnits: number;
}

/** Charcoal that must be available at a specific State-owned smelter market. */
export interface SmelterFuelProcurementDemand {
  stateId: number;
  destinationMarketId: number;
  goodId: number;
  requestedUnits: number;
}

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
      const relocated = previous !== undefined && (previous.marketId !== mine.marketId || previous.burgId !== burgId);
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
        // A newly built or relocated smelter staffs up immediately; annual reconciliation
        // (basicEmployment.ts) pulls this back down toward the Burg's actually-available
        // adults over subsequent years. Keep the previous crew only while the site stays put.
        workers: previous && !relocated ? previous.workers : getSmelterRequiredWorkers({ annualCapacityTons }),
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

  /**
   * Converts State military Ingot shortages into local Charcoal reserve targets at the smelters
   * that can refine the corresponding Ore. This is intentionally demand-limited: an idle iron
   * district receives fuel for the current military gap, not an arbitrary fill of its geological
   * capacity. The reserve accounts for `MARKET_SMELTING_STOCK_SHARE`, which keeps half of a
   * market's fuel stock available to ordinary users while the furnace operates.
   */
  getStateMilitaryFuelDemands(
    shortages: readonly StateMilitaryIngotShortage[]
  ): readonly SmelterFuelProcurementDemand[] {
    const goodsById = new Map(getGoods().map(good => [good.i, good]));
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const charcoal = getGoods().find(good => good.name.toLowerCase() === CHARCOAL_GOOD_NAME);
    if (!charcoal) return [];

    const shortagesByCommodity = new Map<string, number>();
    for (const shortage of shortages) {
      if (!(shortage.requestedIngotUnits > 0)) continue;
      const ingot = goodsById.get(shortage.ingotGoodId);
      const commodity = ingot && this.getCommodityForIngot(ingot.name);
      if (!commodity) continue;
      const key = `${shortage.stateId}:${commodity}`;
      shortagesByCommodity.set(key, (shortagesByCommodity.get(key) ?? 0) + shortage.requestedIngotUnits);
    }

    const depositsById = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
    const marketsById = new Map(getMarkets().map(market => [market.i, market]));
    const requiredOreByMarket = new Map<number, { stateId: number; units: number }>();
    const { burgs } = getWorldContext().pack;

    for (const [key, requestedIngotUnits] of shortagesByCommodity) {
      const separator = key.indexOf(":");
      const stateId = Number(key.slice(0, separator));
      const commodity = key.slice(separator + 1) as OreCommodity;
      const ore = goodsByName.get(`${commodity} ore`);
      if (!ore) continue;
      const eligibleSmelters = getSmelterOperations().flatMap(smelter => {
        const deposit = depositsById.get(smelter.depositId);
        const market = marketsById.get(smelter.marketId);
        const yieldInfo = deposit?.yields.find(yieldCandidate => yieldCandidate.commodity === commodity);
        if (
          !smelter.active ||
          !deposit ||
          !market ||
          !yieldInfo ||
          burgs[smelter.burgId]?.state !== stateId ||
          !((market.goods[ore.i]?.stock ?? 0) > 0)
        ) {
          return [];
        }
        const monthlyOreCapacity = this.getMonthlyOreCapacity(smelter, deposit, yieldInfo);
        return monthlyOreCapacity > 0 ? [{ smelter, monthlyOreCapacity }] : [];
      });
      const totalOreCapacity = eligibleSmelters.reduce((sum, entry) => sum + entry.monthlyOreCapacity, 0);
      if (!(totalOreCapacity > 0)) continue;

      const weightedYield =
        eligibleSmelters.reduce((sum, entry) => sum + entry.monthlyOreCapacity * entry.smelter.smeltingYield, 0) /
        totalOreCapacity;
      const oreNeeded = requestedIngotUnits / Math.max(0.0001, weightedYield);
      const plannedOre = Math.min(oreNeeded, totalOreCapacity);
      for (const entry of eligibleSmelters) {
        const allocatedOre = plannedOre * (entry.monthlyOreCapacity / totalOreCapacity);
        const existing = requiredOreByMarket.get(entry.smelter.marketId);
        if (existing) existing.units += allocatedOre;
        else requiredOreByMarket.set(entry.smelter.marketId, { stateId, units: allocatedOre });
      }
    }

    return Array.from(requiredOreByMarket, ([destinationMarketId, requirement]) => {
      const market = marketsById.get(destinationMarketId)!;
      const availableFuel = market.goods[charcoal.i]?.stock ?? 0;
      const targetFuelStock = (requirement.units * CHARCOAL_PER_ORE_UNIT) / MARKET_SMELTING_STOCK_SHARE;
      return {
        stateId: requirement.stateId,
        destinationMarketId,
        goodId: charcoal.i,
        requestedUnits: Math.max(0, targetFuelStock - availableFuel)
      };
    }).filter(demand => demand.requestedUnits > 0.0001);
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

      const charcoal = goodsByName.get(CHARCOAL_GOOD_NAME);
      if (!charcoal || !isGoodEnabled(charcoal)) continue;
      const slag = goodsByName.get(SLAG_GOOD_NAME);

      const processingFactor = this.getProcessingFactor(smelter);
      const monthlyCapacity = (smelter.annualCapacityTons * processingFactor) / 12;
      if (monthlyCapacity <= 0) continue;
      this.ensureLocalCharcoalReserve(smelter, monthlyCapacity, goodsByName);

      for (const yieldInfo of oreYields) {
        const commodity = yieldInfo.commodity;
        if (!this.isOreCommodity(commodity)) continue;
        const ore = goodsByName.get(`${commodity} ore`);
        const ingot = goodsByName.get(getIngotGoodName(commodity));
        if (!ore || !ingot || !isGoodEnabled(ore) || !isGoodEnabled(ingot)) continue;

        const market = Markets.get(smelter.marketId);
        const availableCharcoal = market?.goods[charcoal.i]?.stock ?? 0;
        const charcoalBoundCapacity = (availableCharcoal * MARKET_SMELTING_STOCK_SHARE) / CHARCOAL_PER_ORE_UNIT;
        const capacityShare = Math.min(
          monthlyCapacity * (yieldInfo.annualCapacityTons / totalAnnualOreCapacity),
          charcoalBoundCapacity
        );
        const oreConsumed = Markets.consumeForSmelting(
          smelter.marketId,
          ore.i,
          capacityShare,
          MARKET_SMELTING_STOCK_SHARE
        );
        if (!oreConsumed) continue;

        // Ore is only drawn after the available Charcoal reserve has bounded capacity above, so
        // this second market draw is exact and prevents a fuel-free Ingot from being created.
        const charcoalConsumed = Markets.consumeForSmelting(
          smelter.marketId,
          charcoal.i,
          oreConsumed * CHARCOAL_PER_ORE_UNIT,
          MARKET_SMELTING_STOCK_SHARE
        );
        if (charcoalConsumed < oreConsumed * CHARCOAL_PER_ORE_UNIT - 0.0001) continue;

        const refinedIngots = oreConsumed * smelter.smeltingYield;
        const theftLoss = this.rollTheft(smelter, deposit.accessibility, refinedIngots, effectiveSecurity);
        const deliveredIngots = Math.max(0, refinedIngots - theftLoss);
        if (deliveredIngots > 0) Markets.addSmelterSupply(smelter.marketId, ingot.i, deliveredIngots);
        if (slag && isGoodEnabled(slag)) {
          Markets.addSmelterSupply(smelter.marketId, slag.i, oreConsumed * SLAG_PER_ORE_UNIT);
        }
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

  private getMonthlyOreCapacity(
    smelter: SmelterOperation,
    deposit: { yields: readonly { commodity: string; annualCapacityTons: number }[] },
    yieldInfo: { annualCapacityTons: number }
  ): number {
    const totalAnnualOreCapacity = this.getAnnualCapacity(
      deposit.yields.filter(candidate => this.isOreCommodity(candidate.commodity))
    );
    if (!(totalAnnualOreCapacity > 0)) return 0;
    return (
      (smelter.annualCapacityTons *
        this.getProcessingFactor(smelter) *
        (yieldInfo.annualCapacityTons / totalAnnualOreCapacity)) /
      12
    );
  }

  /**
   * A forest-sited furnace burns local timber into Charcoal when the market has none.
   * Frontier mining towns often have no spare burg labour for the Charcoal recipe, so
   * the smelter's own fuelAccess is what actually feeds the bloomery.
   */
  private ensureLocalCharcoalReserve(
    smelter: SmelterOperation,
    monthlyOreCapacity: number,
    goodsByName: ReadonlyMap<string, { i: number; name: string; recipes?: readonly Record<number, number>[] }>
  ): void {
    if (smelter.fuelAccess < 0.75 || monthlyOreCapacity <= 0) return;
    const charcoal = goodsByName.get(CHARCOAL_GOOD_NAME);
    const wood = goodsByName.get("wood");
    if (!charcoal || !wood || !isGoodEnabled(charcoal) || !isGoodEnabled(wood)) return;

    const market = Markets.get(smelter.marketId);
    if (!market) return;
    const available = market.goods[charcoal.i]?.stock ?? 0;
    const needed = (monthlyOreCapacity * CHARCOAL_PER_ORE_UNIT) / MARKET_SMELTING_STOCK_SHARE;
    const shortfall = needed - available;
    if (shortfall <= 0.0001) return;

    const woodPerCharcoal = charcoal.recipes?.[0]?.[wood.i] ?? 1.5;
    const harvestedWood = this.harvestLocalWood(smelter.cell, shortfall * woodPerCharcoal);
    if (harvestedWood <= 0) return;
    Markets.addSmelterSupply(smelter.marketId, charcoal.i, harvestedWood / Math.max(0.0001, woodPerCharcoal));
  }

  private harvestLocalWood(cellId: number, requestedWood: number): number {
    const cells = getWorldContext().pack.cells;
    const candidateIds = [...new Set([cellId, ...(cells.c?.[cellId] ?? [])])];
    let remaining = requestedWood;
    let harvested = 0;
    for (const candidate of candidateIds) {
      if (remaining <= 0) break;
      const taken = harvestWood(candidate, remaining);
      harvested += taken;
      remaining -= taken;
    }
    return harvested;
  }

  private getProcessingFactor(smelter: SmelterOperation): number {
    const workerFactor = Math.min(1, smelter.workers / getSmelterRequiredWorkers(smelter));
    // toolsInvestmentStock (IndustrialTechInvestment.settleAnnual()) applies as its own
    // multiplier, independent of the prospect()-derived `technology` — docs/plan/rural-agtech-investment.md §6.2.
    const investmentBonus = 1 + SMELTER_TECH_BONUS_MAX * (smelter.toolsInvestmentStock ?? 0);
    // The Burg's Metallurgy guild technique (GuildKnowledge.settleAnnual()) applies as a third,
    // independent multiplier — docs/plan/knowledge-guild-system.md §6, §9 Phase 1.
    const guildBonus = getGuildBonus(smelter.burgId, "metallurgy");
    return Math.min(
      1,
      smelter.waterPower * smelter.fuelAccess * smelter.technology * investmentBonus * guildBonus * workerFactor
    );
  }

  private getCommodityForIngot(ingotName: string): OreCommodity | undefined {
    const normalized = ingotName.toLowerCase();
    return ORE_COMMODITIES.find(commodity => getIngotGoodName(commodity) === normalized);
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
