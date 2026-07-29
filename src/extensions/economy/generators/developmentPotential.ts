import { Burgs, type WorldContext } from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  clearSettlementDevelopmentLastEvaluatedYear,
  getFoodPotential,
  getMineralDeposits,
  getSettlementDevelopmentLastEvaluatedYear,
  getSettlementDevelopmentPotential,
  getSimulationYear,
  getWorldContext,
  setFoodPotential,
  setSettlementDevelopmentLastEvaluatedYear,
  setSettlementDevelopmentPotential
} from "../economyContext";

const LAND_HEIGHT = 20;
const FOOD_NEED_PER_PERSON = 0.43;

export interface DevelopmentPotentials {
  readonly foodPotential: Float32Array;
  readonly settlementDevelopmentPotential: Float32Array;
}

/**
 * Owns economy-only environmental potential columns. The interface is intentionally small:
 * callers can rebuild the two deterministic columns and request annual group reevaluation
 * without knowing how terrain, routes, or mineral deposits are weighted.
 */
export class DevelopmentPotentialModule {
  generate(): DevelopmentPotentials {
    const world = getWorldContext();
    const foodPotential = calculateFoodPotential(world);
    const settlementDevelopmentPotential = calculateSettlementDevelopmentPotential(world, getMineralDeposits());
    setFoodPotential(foodPotential);
    setSettlementDevelopmentPotential(settlementDevelopmentPotential);
    return { foodPotential, settlementDevelopmentPotential };
  }

  getPotentials(): DevelopmentPotentials {
    return {
      foodPotential: getFoodPotential(),
      settlementDevelopmentPotential: getSettlementDevelopmentPotential()
    };
  }

  clear(): void {
    setFoodPotential(new Float32Array());
    setSettlementDevelopmentPotential(new Float32Array());
    clearSettlementDevelopmentLastEvaluatedYear();
  }

  /** Reclassifies unlocked burgs at most once per simulation year. */
  updateAnnualBurgGroups(): boolean {
    const year = getSimulationYear();
    if (getSettlementDevelopmentLastEvaluatedYear() === year) return false;

    let changed = false;
    for (const burg of getWorldContext().pack.burgs) {
      if (!burg?.i || burg.removed || burg.lock) continue;
      const before = burg.group;
      Burgs.changeGroup(burg);
      changed ||= burg.group !== before;
    }
    setSettlementDevelopmentLastEvaluatedYear(year);
    return changed;
  }
}

/**
 * Calculates annual food potential without reading population or carrying capacity.
 * The resulting scale is calibrated from map population density, but an individual cell's
 * value depends only on its environment and remains stable as its residents migrate.
 */
export function calculateFoodPotential(world: Readonly<WorldContext>): Float32Array {
  const { cells } = world.pack;
  const cellCount = cells?.i?.length ?? 0;
  const potential = new Float32Array(cellCount);
  if (!cellCount) return potential;

  const meanLandArea = getMeanLandArea(cells);
  const maxFlux = getMaximum(cells.fl);
  const baseline = Math.max(1, world.populationRate) * FOOD_NEED_PER_PERSON;

  for (const cellId of cells.i) {
    if (cells.h[cellId] < LAND_HEIGHT) continue;
    const habitability = Math.max(0, world.biomesData.habitability[cells.biomeCode[cellId]] ?? 0);
    if (habitability === 0) continue;

    const areaFactor = Math.max(0.1, (cells.area[cellId] ?? meanLandArea) / meanLandArea);
    const biomeYield = 0.25 + (0.75 * Math.min(100, habitability)) / 100;
    const waterAccess =
      1 +
      (cells.r[cellId] ? 0.2 : 0) +
      (cells.conf[cellId] ? 0.12 : 0) +
      (maxFlux > 0 ? Math.min(0.18, ((cells.fl[cellId] ?? 0) / maxFlux) * 0.18) : 0);
    const elevation = cells.h[cellId] ?? LAND_HEIGHT;
    const terrainYield = elevation <= 50 ? 1 : Math.max(0.25, 1 - (elevation - 50) / 150);

    potential[cellId] = baseline * areaFactor * biomeYield * waterAccess * terrainYield;
  }
  return potential;
}

/**
 * Scores location advantages that can later rank both migration destinations and new-burg
 * promotion candidates. It deliberately does not inspect current population or burg group.
 */
export function calculateSettlementDevelopmentPotential(
  world: Readonly<WorldContext>,
  mineralDeposits: readonly { cell: number; richness: number; exhausted: boolean }[]
): Float32Array {
  const { cells } = world.pack;
  const potential = new Float32Array(cells?.i?.length ?? 0);
  if (!cells?.i?.length) return potential;

  for (const cellId of cells.i) {
    if (cells.h[cellId] < LAND_HEIGHT) continue;
    const routeConnections = Object.keys(cells.routes?.[cellId] ?? {}).length;
    potential[cellId] =
      routeConnections * 2 + (cells.r[cellId] ? 3 : 0) + (cells.conf[cellId] ? 2 : 0) + (cells.harbor[cellId] ? 4 : 0);
  }

  for (const deposit of mineralDeposits) {
    if (deposit.exhausted || !Number.isInteger(deposit.cell) || deposit.cell < 0 || deposit.cell >= potential.length)
      continue;
    potential[deposit.cell] += Math.max(0, deposit.richness);
  }

  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed || burg.cell < 0 || burg.cell >= potential.length) continue;
    potential[burg.cell] += getBurgLocationBonus(burg);
  }
  return potential;
}

function getMeanLandArea(cells: WorldContext["pack"]["cells"]): number {
  let total = 0;
  let count = 0;
  for (const cellId of cells.i) {
    if (cells.h[cellId] < LAND_HEIGHT) continue;
    total += cells.area[cellId] ?? 0;
    count++;
  }
  return count && total > 0 ? total / count : 1;
}

function getMaximum(values: ArrayLike<number>): number {
  let maximum = 0;
  for (let index = 0; index < values.length; index++) maximum = Math.max(maximum, values[index] ?? 0);
  return maximum;
}

function getBurgLocationBonus(burg: Burg): number {
  return (burg.capital ? 5 : 0) + (burg.port ? 4 : 0) + (burg.plaza ? 3 : 0);
}

export const DevelopmentPotential = new DevelopmentPotentialModule();
