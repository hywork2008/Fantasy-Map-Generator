import type { Burg } from "../../hostTypes";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import type { ProcurementOrder } from "./strategicProcurement";
import {
  getStrategicDemandMultiplier,
  getStrategicProductionDemandByGood,
  type StrategicProductionDemand
} from "./strategicProductionDemand";

export const STRATEGIC_OCCUPATIONS = ["forestry", "sailmaking", "ropeMaking", "tarBurning"] as const;
export type StrategicOccupation = (typeof STRATEGIC_OCCUPATIONS)[number];

export interface LaborMarket {
  marketId: number;
  workersByOccupation: Partial<Record<StrategicOccupation, number>>;
  wageByOccupation: Partial<Record<StrategicOccupation, number>>;
  skillByOccupation: Partial<Record<StrategicOccupation, number>>;
  capacityByOccupation: Partial<Record<StrategicOccupation, number>>;
}

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

export function getStrategicOccupation(good: Pick<Good, "name">): StrategicOccupation | undefined {
  return OCCUPATION_BY_GOOD_NAME[good.name];
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
    const desiredWorkers = getDesiredWorkers(workforce, demandByGood, goodById);

    moveWorkersTowardDemand(laborMarket, desiredWorkers, workforce);
    updateWagesSkillsAndCapacity(laborMarket, demandByGood, goodById, workforce);
    return laborMarket;
  });
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
  demandByGood: ReadonlyMap<number, StrategicProductionDemand>,
  goodById: ReadonlyMap<number, Good>
): Record<StrategicOccupation, number> {
  const weights = {} as Record<StrategicOccupation, number>;
  let totalWeight = 0;

  for (const occupation of STRATEGIC_OCCUPATIONS) {
    const good = findOccupationGood(occupation, goodById);
    const demand = good ? demandByGood.get(good.i) : undefined;
    const demandMultiplier = getStrategicDemandMultiplier(demand, false);
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
  demandByGood: ReadonlyMap<number, StrategicProductionDemand>,
  goodById: ReadonlyMap<number, Good>,
  workforce: number
): void {
  for (const occupation of STRATEGIC_OCCUPATIONS) {
    const good = findOccupationGood(occupation, goodById);
    const demand = good ? demandByGood.get(good.i) : undefined;
    const demandMultiplier = getStrategicDemandMultiplier(demand, false);
    const workers = laborMarket.workersByOccupation[occupation] ?? 0;
    const workforceShare = workforce > 0 ? workers / workforce : 0;
    const existingSkill = laborMarket.skillByOccupation[occupation] ?? 1;
    const skillChange = demand ? 0.02 * workforceShare : -0.01;
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
