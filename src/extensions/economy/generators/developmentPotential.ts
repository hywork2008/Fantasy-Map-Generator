import { Burgs, useOptionsState, type WorldContext } from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  clearSettlementDevelopmentLastEvaluatedYear,
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFoodPotential,
  getGoods,
  getIrrigationSalinity,
  getMarketCellColumn,
  getMarkets,
  getMigratableAdults,
  getMineralDeposits,
  getRuralFoodCapacity,
  getRuralReleasePressure,
  getSettlementDevelopmentLastEvaluatedYear,
  getSettlementDevelopmentPotential,
  getSimulationYear,
  getSoilFertility,
  getStateAgriculturalProductivity,
  getWorldContext,
  getYieldPerArea,
  setCultivableArea,
  setCultivatedArea,
  setFarmLaborRequired,
  setFishingRequiredWorkers,
  setFishingWorkers,
  setFoodPotential,
  setHuntingWorkers,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers,
  setIrrigationSalinity,
  setMigratableAdults,
  setRuralFoodCapacity,
  setRuralReleasePressure,
  setSettlementDevelopmentLastEvaluatedYear,
  setSettlementDevelopmentPotential,
  setSoilFertility,
  setViticultureRequiredWorkers,
  setViticultureWorkers,
  setYieldPerArea
} from "../economyContext";
import {
  type AgriculturalConditions,
  advanceAgriculturalSoils,
  calculateAgriculturalLandProfile,
  reconcileForestClearanceForAgriculture
} from "./agriculturalLandUse";
import { isGoodEnabled } from "./goods-generator";
import { allocateRuralOccupations, type RuralOccupationAllocation } from "./ruralOccupationAllocation";

/**
 * Broadcasts each Market's agTechStock (docs/plan/rural-agtech-investment.md) to its cells so
 * calculateAgriculturalLandProfile can stay Market-unaware. Cells with no market yet (fresh
 * territory, or economy not producing) resolve to 0, matching the function's untouched default.
 */
function resolveAgTechStockByCell(cellCount: number): Float32Array {
  const stockByCell = new Float32Array(cellCount);
  const marketCellColumn = getMarketCellColumn();
  if (!marketCellColumn.length) return stockByCell;

  const stockByMarketId = new Map(getMarkets().map(market => [market.i, market.agTechStock ?? 0]));
  for (let cellId = 0; cellId < cellCount; cellId++) {
    const marketId = marketCellColumn[cellId];
    if (!marketId) continue;
    stockByCell[cellId] = stockByMarketId.get(marketId) ?? 0;
  }
  return stockByCell;
}

/**
 * Broadcasts each State's stateAgriculturalProductivity (docs/plan/rural-agtech-investment.md
 * §6.1) to its cells via cells.state, so calculateAgriculturalLandProfile stays State-unaware.
 */
function resolveStateProductivityByCell(cells: WorldContext["pack"]["cells"]): Float32Array {
  const cellCount = cells?.i?.length ?? 0;
  const stockByCell = new Float32Array(cellCount);
  const stateColumn = cells?.state;
  if (!stateColumn) return stockByCell;

  const productivityByState = getStateAgriculturalProductivity();
  if (!productivityByState.length) return stockByCell;

  for (let cellId = 0; cellId < cellCount; cellId++) {
    const stateId = stateColumn[cellId];
    if (!stateId) continue;
    stockByCell[cellId] = productivityByState[stateId] ?? 0;
  }
  return stockByCell;
}

const LAND_HEIGHT = 20;

export interface DevelopmentPotentials {
  readonly foodPotential: Float32Array;
  readonly cultivableArea: Float32Array;
  readonly yieldPerArea: Float32Array;
  readonly ruralFoodCapacity: Float32Array;
  readonly cultivatedArea: Float32Array;
  readonly farmLaborRequired: Float32Array;
  readonly migratableAdults: Float32Array;
  readonly ruralReleasePressure: Float32Array;
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
    const agTechStockByCell = resolveAgTechStockByCell(world.pack.cells?.i?.length ?? 0);
    const stateProductivityByCell = resolveStateProductivityByCell(world.pack.cells);
    const demandOptions = { includeUrbanFoodDemand: useOptionsState.getState().ruralUrbanMigration !== "megacity" };
    const conditions = this.getAgriculturalConditions(world.pack.cells.i.length);
    reconcileForestClearanceForAgriculture(
      world,
      agTechStockByCell,
      stateProductivityByCell,
      demandOptions,
      conditions
    );
    const agriculture = calculateAgriculturalLandProfile(
      world,
      agTechStockByCell,
      stateProductivityByCell,
      demandOptions,
      conditions
    );
    const settlementDevelopmentPotential = calculateSettlementDevelopmentPotential(world, getMineralDeposits());
    const occupations = this.storeAgriculture(world, agriculture);
    setSettlementDevelopmentPotential(settlementDevelopmentPotential);
    return { ...agriculture, ruralReleasePressure: occupations.ruralReleasePressure, settlementDevelopmentPotential };
  }

  getPotentials(): DevelopmentPotentials {
    return {
      foodPotential: getFoodPotential(),
      cultivableArea: getCultivableArea(),
      yieldPerArea: getYieldPerArea(),
      ruralFoodCapacity: getRuralFoodCapacity(),
      cultivatedArea: getCultivatedArea(),
      farmLaborRequired: getFarmLaborRequired(),
      migratableAdults: getMigratableAdults(),
      ruralReleasePressure: getRuralReleasePressure(),
      settlementDevelopmentPotential: getSettlementDevelopmentPotential()
    };
  }

  clear(): void {
    setFoodPotential(new Float32Array());
    setCultivableArea(new Float32Array());
    setYieldPerArea(new Float32Array());
    setRuralFoodCapacity(new Float32Array());
    setCultivatedArea(new Float32Array());
    setFarmLaborRequired(new Float32Array());
    setMigratableAdults(new Float32Array());
    setRuralReleasePressure(new Float32Array());
    setSoilFertility(new Float32Array());
    setIrrigationSalinity(new Float32Array());
    setHuntingWorkers(new Float32Array());
    setFishingWorkers(new Float32Array());
    setFishingRequiredWorkers(new Float32Array());
    setViticultureWorkers(new Float32Array());
    setViticultureRequiredWorkers(new Float32Array());
    setHusbandryWorkers(new Float32Array());
    setHusbandryRequiredWorkers(new Float32Array());
    setSettlementDevelopmentPotential(new Float32Array());
    clearSettlementDevelopmentLastEvaluatedYear();
  }

  /** Recomputes current crop area and farm labour once per year before food ledgers settle. */
  updateAnnualAgriculture(): boolean {
    const year = getSimulationYear();
    if (getSettlementDevelopmentLastEvaluatedYear() === year) return false;
    const world = getWorldContext();
    const agTechStockByCell = resolveAgTechStockByCell(world.pack.cells?.i?.length ?? 0);
    const stateProductivityByCell = resolveStateProductivityByCell(world.pack.cells);
    const demandOptions = { includeUrbanFoodDemand: useOptionsState.getState().ruralUrbanMigration !== "megacity" };
    const conditions = this.advanceSoilConditions(world.pack.cells.i.length);
    reconcileForestClearanceForAgriculture(
      world,
      agTechStockByCell,
      stateProductivityByCell,
      demandOptions,
      conditions
    );
    this.storeAgriculture(
      world,
      calculateAgriculturalLandProfile(world, agTechStockByCell, stateProductivityByCell, demandOptions, conditions)
    );
    return true;
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

  private storeAgriculture(
    world: Readonly<WorldContext>,
    agriculture: Omit<DevelopmentPotentials, "settlementDevelopmentPotential">
  ): RuralOccupationAllocation {
    setFoodPotential(agriculture.foodPotential);
    setCultivableArea(agriculture.cultivableArea);
    setYieldPerArea(agriculture.yieldPerArea);
    setRuralFoodCapacity(agriculture.ruralFoodCapacity);
    setCultivatedArea(agriculture.cultivatedArea);
    setFarmLaborRequired(agriculture.farmLaborRequired);
    setMigratableAdults(agriculture.migratableAdults);

    // Rural Occupation Allocator (docs/plan/biome-goods-producer-ecosystem.md §3) claims hunting/
    // fishing/viticulture labour out of migratableAdults before anything is released toward urban
    // migration, so the persisted ruralReleasePressure is the post-claim residual, not
    // agriculture's own occupation-unaware figure (§2.2's "triple claim" problem).
    const occupations = allocateRuralOccupations(world, agriculture.migratableAdults);
    setHuntingWorkers(occupations.huntingWorkers);
    setFishingWorkers(occupations.fishingWorkers);
    setFishingRequiredWorkers(occupations.fishingRequiredWorkers);
    setViticultureWorkers(occupations.viticultureWorkers);
    setViticultureRequiredWorkers(occupations.viticultureRequiredWorkers);
    setHusbandryWorkers(occupations.husbandryWorkers);
    setHusbandryRequiredWorkers(occupations.husbandryRequiredWorkers);
    setRuralReleasePressure(occupations.ruralReleasePressure);
    return occupations;
  }

  private getAgriculturalConditions(cellCount: number): AgriculturalConditions {
    const existingFertility = getSoilFertility();
    const existingSalinity = getIrrigationSalinity();
    if (existingFertility.length !== cellCount) {
      const fertility = new Float32Array(cellCount);
      fertility.fill(1);
      setSoilFertility(fertility);
    }
    if (existingSalinity.length !== cellCount) setIrrigationSalinity(new Float32Array(cellCount));
    return {
      cropGoods: getGoods().filter(good => Boolean(good.crop) && isGoodEnabled(good)),
      soilFertilityByCell: getSoilFertility(),
      irrigationSalinityByCell: getIrrigationSalinity()
    };
  }

  private advanceSoilConditions(cellCount: number): AgriculturalConditions {
    const conditions = this.getAgriculturalConditions(cellCount);
    const next = advanceAgriculturalSoils(
      getWorldContext(),
      conditions.cropGoods ?? [],
      conditions.soilFertilityByCell,
      conditions.irrigationSalinityByCell
    );
    setSoilFertility(next.soilFertility);
    setIrrigationSalinity(next.irrigationSalinity);
    return {
      ...conditions,
      soilFertilityByCell: next.soilFertility,
      irrigationSalinityByCell: next.irrigationSalinity
    };
  }
}

/**
 * Calculates annual food potential without reading population or carrying capacity.
 * The resulting scale is calibrated from map population density, but an individual cell's
 * value depends only on its environment and remains stable as its residents migrate.
 */
export function calculateFoodPotential(world: Readonly<WorldContext>): Float32Array {
  return calculateAgriculturalLandProfile(world).foodPotential;
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

function getBurgLocationBonus(burg: Burg): number {
  return (burg.capital ? 5 : 0) + (burg.port ? 4 : 0) + (burg.plaza ? 3 : 0);
}

export const DevelopmentPotential = new DevelopmentPotentialModule();
