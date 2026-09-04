import type { Burg } from "../../hostTypes";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import { type LaborMarket, STRATEGIC_OCCUPATIONS, type StrategicOccupation } from "./strategicLaborMarketsTypes";
import type { ProcurementOrder } from "./strategicProcurementTypes";
import {
  getStrategicDemandMultiplier,
  getStrategicProductionDemandByGood,
  type StrategicProductionDemand
} from "./strategicProductionDemand";

export type { LaborMarket, StrategicOccupation } from "./strategicLaborMarketsTypes";
export { STRATEGIC_OCCUPATIONS } from "./strategicLaborMarketsTypes";

export interface StrategicLaborMarketInputs {
  markets: readonly Market[];
  burgs: readonly Burg[];
  goods: readonly Good[];
  orders: readonly ProcurementOrder[];
}

const OCCUPATION_BY_GOOD_NAME: Readonly<Record<string, StrategicOccupation>> = {
  Wood: "forestry",
  Sails: "sailmaking",
  Ropes: "ropeMaking",
  Tar: "tarBurning"
};
const WORKFORCE_SHARE = 0.3;
const MAX_TRANSFER_SHARE_PER_CYCLE = 0.05;
const MIN_SKILL = 0.75;
const MAX_SKILL = 1.5;
const MAX_CAPACITY_PER_WORKER = 1.5;
/**
 * Cargo units of `Market.caravanArrivalVolume` worth one point of demand multiplier above
 * baseline, capped the same way `getStrategicDemandMultiplier`'s outstanding-priority term is
 * (docs/plan/urban-employment-demand.md §5.1-6: Caravan arrivals only, calibration TBD).
 */
const TRADE_VOLUME_UNITS_PER_DEMAND_POINT = 20;
const MAX_TRADE_DEMAND_BONUS = 3;

export function getStrategicOccupation(good: Pick<Good, "name">): StrategicOccupation | undefined {
  return OCCUPATION_BY_GOOD_NAME[good.name];
}

/** `"trade"` has no matching Good/recipe — its demand comes from recent caravan cargo instead. */
function getTradeDemandMultiplier(market: Pick<Market, "caravanArrivalVolume">): number {
  return 1 + Math.min(MAX_TRADE_DEMAND_BONUS, (market.caravanArrivalVolume ?? 0) / TRADE_VOLUME_UNITS_PER_DEMAND_POINT);
}

/** One demand multiplier per occupation: goods-order demand for the craft occupations, caravan-volume demand for `"trade"`. */
function getDemandMultiplierByOccupation(
  market: Market,
  demandByGood: ReadonlyMap<number, StrategicProductionDemand>,
  goodById: ReadonlyMap<number, Good>
): Record<StrategicOccupation, number> {
  const demandMultiplierByOccupation = {} as Record<StrategicOccupation, number>;
  for (const occupation of STRATEGIC_OCCUPATIONS) {
    if (occupation === "trade") {
      demandMultiplierByOccupation[occupation] = getTradeDemandMultiplier(market);
      continue;
    }
    const good = findOccupationGood(occupation, goodById);
    const demand = good ? demandByGood.get(good.i) : undefined;
    demandMultiplierByOccupation[occupation] = getStrategicDemandMultiplier(demand, false);
  }
  return demandMultiplierByOccupation;
}

/**
 * Reconciles the saved cohort for every live market. The update is deliberately
 * incremental: one production cycle can move at most five percent of the market's
 * strategic workforce, while skills and equipment capacity converge more slowly.
 */
export function reconcileStrategicLaborMarkets(
  inputs: StrategicLaborMarketInputs,
  existing: readonly LaborMarket[]
): LaborMarket[] {
  const existingByMarket = new Map(existing.map(laborMarket => [laborMarket.marketId, laborMarket]));
  const goodById = new Map(inputs.goods.map(good => [good.i, good]));

  return inputs.markets.map(market => {
    const workforce = getMarketPopulation(market.i, inputs.burgs) * WORKFORCE_SHARE;
    const prior = existingByMarket.get(market.i);
    const laborMarket = createLaborMarket(market.i, workforce, prior);
    const demandByGood = getStrategicProductionDemandByGood(inputs.orders, market.i);
    const demandMultiplierByOccupation = getDemandMultiplierByOccupation(market, demandByGood, goodById);
    const desiredWorkers = getDesiredWorkers(workforce, demandMultiplierByOccupation);

    moveWorkersTowardDemand(laborMarket, desiredWorkers, workforce);
    updateWagesSkillsAndCapacity(laborMarket, demandMultiplierByOccupation, goodById, workforce);
    return laborMarket;
  });
}

/**
 * Coins per population-point of manufacturing labor (docs/plan/economy-coupling-audit.md L2 Phase 1).
 *
 * Strategic goods (Wood/Sails/Ropes/Tar) use that occupation's live `wageByOccupation`.
 * Other crafts use the local forestry wage as the unskilled baseline, so a tight labor
 * market still raises general manufacturing cost. Missing labor market → 0, matching
 * tests and Economy-off paths that never reconciled a cohort.
 */
export function getManufactureWageRate(laborMarket: LaborMarket | undefined, good: Pick<Good, "name">): number {
  if (!laborMarket) return 0;
  const occupation = getStrategicOccupation(good);
  const occupied = occupation ? laborMarket.wageByOccupation[occupation] : undefined;
  if (typeof occupied === "number" && Number.isFinite(occupied) && occupied > 0) return occupied;
  const baseline = laborMarket.wageByOccupation.forestry ?? 1;
  return typeof baseline === "number" && Number.isFinite(baseline) && baseline > 0 ? baseline : 0;
}

/** Returns the output multiplier earned by an established strategic cohort. */
export function getStrategicLaborProductivity(
  laborMarket: LaborMarket | undefined,
  occupation: StrategicOccupation | undefined
): number {
  if (!laborMarket || !occupation) return 1;

  const workers = laborMarket.workersByOccupation[occupation] ?? 0;
  if (workers <= 0.001) return 1;

  const skill = clamp(laborMarket.skillByOccupation[occupation] ?? 1, MIN_SKILL, MAX_SKILL);
  const capacityPerWorker = clamp(
    (laborMarket.capacityByOccupation[occupation] ?? workers) / workers,
    MIN_SKILL,
    MAX_CAPACITY_PER_WORKER
  );
  return skill * capacityPerWorker;
}

function createLaborMarket(marketId: number, workforce: number, prior: LaborMarket | undefined): LaborMarket {
  const laborMarket: LaborMarket = {
    marketId,
    workersByOccupation: { ...prior?.workersByOccupation },
    wageByOccupation: { ...prior?.wageByOccupation },
    skillByOccupation: { ...prior?.skillByOccupation },
    capacityByOccupation: { ...prior?.capacityByOccupation }
  };
  const initialWorkers = workforce / STRATEGIC_OCCUPATIONS.length;

  for (const occupation of STRATEGIC_OCCUPATIONS) {
    laborMarket.workersByOccupation[occupation] ??= initialWorkers;
    laborMarket.wageByOccupation[occupation] ??= 1;
    laborMarket.skillByOccupation[occupation] ??= 1;
    laborMarket.capacityByOccupation[occupation] ??= laborMarket.workersByOccupation[occupation];
  }
  return laborMarket;
}

function getDesiredWorkers(
  workforce: number,
  demandMultiplierByOccupation: Record<StrategicOccupation, number>
): Record<StrategicOccupation, number> {
  const weights = {} as Record<StrategicOccupation, number>;
  let totalWeight = 0;

  for (const occupation of STRATEGIC_OCCUPATIONS) {
    const demandMultiplier = demandMultiplierByOccupation[occupation];
    // Retain a small baseline cohort so a market can answer a new order without
    // creating trained specialists from nothing.
    const weight = 1 + (demandMultiplier - 1) * 2;
    weights[occupation] = weight;
    totalWeight += weight;
  }

  const desired = {} as Record<StrategicOccupation, number>;
  for (const occupation of STRATEGIC_OCCUPATIONS) {
    desired[occupation] = totalWeight > 0 ? (workforce * weights[occupation]) / totalWeight : 0;
  }
  return desired;
}

function moveWorkersTowardDemand(
  laborMarket: LaborMarket,
  desiredWorkers: Record<StrategicOccupation, number>,
  workforce: number
): void {
  let transferBudget = workforce * MAX_TRANSFER_SHARE_PER_CYCLE;
  if (transferBudget <= 0.001) return;

  for (const target of STRATEGIC_OCCUPATIONS) {
    let needed = Math.max(0, desiredWorkers[target] - (laborMarket.workersByOccupation[target] ?? 0));
    if (needed <= 0.001 || transferBudget <= 0.001) continue;

    for (const source of STRATEGIC_OCCUPATIONS) {
      if (source === target || needed <= 0.001 || transferBudget <= 0.001) continue;
      const sourceWorkers = laborMarket.workersByOccupation[source] ?? 0;
      const available = Math.max(0, sourceWorkers - desiredWorkers[source]);
      const moved = Math.min(available, needed, transferBudget);
      if (moved <= 0.001) continue;

      laborMarket.workersByOccupation[source] = sourceWorkers - moved;
      laborMarket.workersByOccupation[target] = (laborMarket.workersByOccupation[target] ?? 0) + moved;
      needed -= moved;
      transferBudget -= moved;
    }
  }
}

function updateWagesSkillsAndCapacity(
  laborMarket: LaborMarket,
  demandMultiplierByOccupation: Record<StrategicOccupation, number>,
  goodById: ReadonlyMap<number, Good>,
  workforce: number
): void {
  for (const occupation of STRATEGIC_OCCUPATIONS) {
    const good = findOccupationGood(occupation, goodById);
    const demandMultiplier = demandMultiplierByOccupation[occupation];
    const workers = laborMarket.workersByOccupation[occupation] ?? 0;
    const workforceShare = workforce > 0 ? workers / workforce : 0;
    const existingSkill = laborMarket.skillByOccupation[occupation] ?? 1;
    const skillChange = demandMultiplier > 1 ? 0.02 * workforceShare : -0.01;
    const skill = clamp(existingSkill + skillChange, MIN_SKILL, MAX_SKILL);
    const currentCapacity = laborMarket.capacityByOccupation[occupation] ?? workers;
    const desiredCapacity = workers * (1 + Math.min(0.5, (demandMultiplier - 1) * 0.15));
    const capacityChange = clamp(desiredCapacity - currentCapacity, -workforce * 0.02, workforce * 0.05);

    laborMarket.wageByOccupation[occupation] = (good?.value ?? 1) * demandMultiplier;
    laborMarket.skillByOccupation[occupation] = skill;
    laborMarket.capacityByOccupation[occupation] = Math.max(0, currentCapacity + capacityChange);
  }
}

function findOccupationGood(occupation: StrategicOccupation, goodById: ReadonlyMap<number, Good>): Good | undefined {
  for (const good of goodById.values()) {
    if (getStrategicOccupation(good) === occupation) return good;
  }
  return undefined;
}

function getMarketPopulation(marketId: number, burgs: readonly Burg[]): number {
  return burgs.reduce((sum, burg) => sum + (burg.market === marketId && !burg.removed ? (burg.population ?? 0) : 0), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
