import {
  applyRiverResidualFlows,
  Burgs,
  clearRiverResidualFlows,
  getFourCourseRotationEffect,
  reconcileSubsistenceCapacityFromFood,
  useOptionsState,
  type WorldContext
} from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  clearSettlementDevelopmentLastEvaluatedYear,
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFieldDrainage,
  getFloweringForageArea,
  getFoodPotential,
  getGoods,
  getIrrigationConveyanceEfficiency,
  getIrrigationDevelopment,
  getIrrigationSalinity,
  getMarketCellColumn,
  getMarkets,
  getMigratableAdults,
  getMineralDeposits,
  getRuralFoodCapacity,
  getRuralReleasePressure,
  getSeasonalLaborShortage,
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
  setFieldDrainage,
  setFishingRequiredWorkers,
  setFishingWorkers,
  setFloodProtection,
  setFloweringForageArea,
  setFoodPotential,
  setHuntingWorkers,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers,
  setIrrigatedArea,
  setIrrigationConveyanceEfficiency,
  setIrrigationDeliveredWater,
  setIrrigationDevelopment,
  setIrrigationSalinity,
  setIrrigationWaterStress,
  setMigratableAdults,
  setRiverResidualFlow,
  setRuralFoodCapacity,
  setRuralReleasePressure,
  setSeasonalLaborShortage,
  setSettlementDevelopmentLastEvaluatedYear,
  setSettlementDevelopmentPotential,
  setSoilFertility,
  setViticultureRequiredWorkers,
  setViticultureWorkers,
  setYieldPerArea
} from "../economyContext";
import {
  type AgriculturalConditions,
  type AgriculturalLandProfile,
  advanceAgriculturalSoils,
  calculateAgriculturalLandProfile,
  IRRIGATION_ANNUAL_WATER_PER_FLUX,
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
 * Broadcasts each Market's fertilizerStock (docs/plan/phosphate-fertilizer-vertical-slice.md §3.8)
 * to its cells, same shape as resolveAgTechStockByCell.
 */
function resolveFertilizerStockByCell(cellCount: number): Float32Array {
  const stockByCell = new Float32Array(cellCount);
  const marketCellColumn = getMarketCellColumn();
  if (!marketCellColumn.length) return stockByCell;

  const stockByMarketId = new Map(getMarkets().map(market => [market.i, market.fertilizerStock ?? 0]));
  for (let cellId = 0; cellId < cellCount; cellId++) {
    const marketId = marketCellColumn[cellId];
    if (!marketId) continue;
    stockByCell[cellId] = stockByMarketId.get(marketId) ?? 0;
  }
  return stockByCell;
}

/**
 * Broadcasts each Market's nitrogenFertilizerStock (docs/plan/synthetic-ammonia-vertical-slice.md
 * §3.7) to its cells, same shape as resolveFertilizerStockByCell.
 */
function resolveNitrogenFertilizerStockByCell(cellCount: number): Float32Array {
  const stockByCell = new Float32Array(cellCount);
  const marketCellColumn = getMarketCellColumn();
  if (!marketCellColumn.length) return stockByCell;

  const stockByMarketId = new Map(getMarkets().map(market => [market.i, market.nitrogenFertilizerStock ?? 0]));
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

/** Resolves state-level four-course adoption once, keeping land-use calculations context-free. */
function resolveFourCourseRotationByCell(cells: WorldContext["pack"]["cells"]): Float32Array {
  const cellCount = cells?.i?.length ?? 0;
  const effectByCell = new Float32Array(cellCount);
  const stateColumn = cells?.state;
  if (!stateColumn) return effectByCell;

  for (let cellId = 0; cellId < cellCount; cellId++) {
    const stateId = stateColumn[cellId];
    if (!stateId) continue;
    effectByCell[cellId] = getFourCourseRotationEffect(stateId);
  }
  return effectByCell;
}

const LAND_HEIGHT = 20;

export interface DevelopmentPotentials {
  readonly foodPotential: Float32Array;
  readonly cultivableArea: Float32Array;
  readonly yieldPerArea: Float32Array;
  readonly ruralFoodCapacity: Float32Array;
  readonly cultivatedArea: Float32Array;
  readonly floweringForageArea: Float32Array;
  readonly farmLaborRequired: Float32Array;
  readonly migratableAdults: Float32Array;
  readonly ruralReleasePressure: Float32Array;
  /** Monthly unmet work demand, flattened as `cellId * 12 + month`. */
  readonly seasonalLaborShortage: Float32Array;
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
    const megacity = useOptionsState.getState().ruralUrbanMigration === "megacity";
    const demandOptions = { includeUrbanFoodDemand: !megacity, reserveLaborForUrbanExport: megacity };
    const conditions = this.getAgriculturalConditions(world);
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
    return {
      ...agriculture,
      farmLaborRequired: occupations.farmLaborRequired,
      migratableAdults: occupations.migratableAdults,
      ruralReleasePressure: occupations.ruralReleasePressure,
      seasonalLaborShortage: occupations.seasonalLaborShortage,
      settlementDevelopmentPotential
    };
  }

  getPotentials(): DevelopmentPotentials {
    return {
      foodPotential: getFoodPotential(),
      cultivableArea: getCultivableArea(),
      yieldPerArea: getYieldPerArea(),
      ruralFoodCapacity: getRuralFoodCapacity(),
      cultivatedArea: getCultivatedArea(),
      floweringForageArea: getFloweringForageArea(),
      farmLaborRequired: getFarmLaborRequired(),
      migratableAdults: getMigratableAdults(),
      ruralReleasePressure: getRuralReleasePressure(),
      seasonalLaborShortage: getSeasonalLaborShortage(),
      settlementDevelopmentPotential: getSettlementDevelopmentPotential()
    };
  }

  clear(): void {
    clearRiverResidualFlows(getWorldContext());
    setFoodPotential(new Float32Array());
    setCultivableArea(new Float32Array());
    setYieldPerArea(new Float32Array());
    setRuralFoodCapacity(new Float32Array());
    setCultivatedArea(new Float32Array());
    setFloweringForageArea(new Float32Array());
    setFarmLaborRequired(new Float32Array());
    setMigratableAdults(new Float32Array());
    setRuralReleasePressure(new Float32Array());
    setSeasonalLaborShortage(new Float32Array());
    setSoilFertility(new Float32Array());
    setIrrigationSalinity(new Float32Array());
    setIrrigationDevelopment(new Float32Array());
    setIrrigationConveyanceEfficiency(new Float32Array());
    setIrrigatedArea(new Float32Array());
    setIrrigationDeliveredWater(new Float32Array());
    setIrrigationWaterStress(new Float32Array());
    setRiverResidualFlow(new Float32Array());
    setFieldDrainage(new Float32Array());
    setFloodProtection(new Float32Array());
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
    const megacity = useOptionsState.getState().ruralUrbanMigration === "megacity";
    const demandOptions = { includeUrbanFoodDemand: !megacity, reserveLaborForUrbanExport: megacity };
    const conditions = this.advanceSoilConditions(world);
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

  private storeAgriculture(world: WorldContext, agriculture: AgriculturalLandProfile): RuralOccupationAllocation {
    setFoodPotential(agriculture.foodPotential);
    setCultivableArea(agriculture.cultivableArea);
    setYieldPerArea(agriculture.yieldPerArea);
    setRuralFoodCapacity(agriculture.ruralFoodCapacity);
    setCultivatedArea(agriculture.cultivatedArea);
    setFloweringForageArea(agriculture.floweringForageArea);
    setIrrigatedArea(agriculture.irrigation.irrigatedAreaHa);
    setIrrigationDeliveredWater(agriculture.irrigation.irrigationDeliveredWater);
    setIrrigationWaterStress(agriculture.irrigation.irrigationWaterStress);
    setRiverResidualFlow(agriculture.irrigation.residualFlowByCell);
    applyRiverResidualFlows(world, {
      residualFlowByCell: agriculture.irrigation.residualFlowByCell,
      annualWaterPerFlux: IRRIGATION_ANNUAL_WATER_PER_FLUX
    });
    reconcileSubsistenceCapacityFromFood(world.pack.cells, agriculture.ruralFoodCapacity);

    // The calendar allocator combines staple fields and all resident rural occupations before it
    // derives migration surplus, so these columns are not a second annual deduction from Grain.
    const occupations = allocateRuralOccupations(world, agriculture);
    setHuntingWorkers(occupations.huntingWorkers);
    setFishingWorkers(occupations.fishingWorkers);
    setFishingRequiredWorkers(occupations.fishingRequiredWorkers);
    setViticultureWorkers(occupations.viticultureWorkers);
    setViticultureRequiredWorkers(occupations.viticultureRequiredWorkers);
    setHusbandryWorkers(occupations.husbandryWorkers);
    setHusbandryRequiredWorkers(occupations.husbandryRequiredWorkers);
    setFarmLaborRequired(occupations.farmLaborRequired);
    setMigratableAdults(occupations.migratableAdults);
    setRuralReleasePressure(occupations.ruralReleasePressure);
    setSeasonalLaborShortage(occupations.seasonalLaborShortage);
    return occupations;
  }

  private getAgriculturalConditions(world: Readonly<WorldContext>): AgriculturalConditions {
    const cellCount = world.pack.cells.i.length;
    const existingFertility = getSoilFertility();
    const existingSalinity = getIrrigationSalinity();
    if (existingFertility.length !== cellCount) {
      const fertility = new Float32Array(cellCount);
      fertility.fill(1);
      setSoilFertility(fertility);
    }
    if (existingSalinity.length !== cellCount) setIrrigationSalinity(new Float32Array(cellCount));
    if (getIrrigationDevelopment().length !== cellCount) setIrrigationDevelopment(new Float32Array(cellCount));
    if (getIrrigationConveyanceEfficiency().length !== cellCount) {
      setIrrigationConveyanceEfficiency(new Float32Array(cellCount));
    }
    if (getFieldDrainage().length !== cellCount) setFieldDrainage(new Float32Array(cellCount));
    return {
      cropGoods: getGoods().filter(good => Boolean(good.crop) && isGoodEnabled(good)),
      soilFertilityByCell: getSoilFertility(),
      irrigationSalinityByCell: getIrrigationSalinity(),
      fourCourseRotationByCell: resolveFourCourseRotationByCell(world.pack.cells),
      irrigationDevelopmentByCell: getIrrigationDevelopment(),
      irrigationConveyanceEfficiencyByCell: getIrrigationConveyanceEfficiency(),
      fieldDrainageByCell: getFieldDrainage(),
      fertilizerStockByCell: resolveFertilizerStockByCell(cellCount),
      nitrogenFertilizerStockByCell: resolveNitrogenFertilizerStockByCell(cellCount)
    };
  }

  private advanceSoilConditions(world: Readonly<WorldContext>): AgriculturalConditions {
    const conditions = this.getAgriculturalConditions(world);
    const next = advanceAgriculturalSoils(
      world,
      conditions.cropGoods ?? [],
      conditions.soilFertilityByCell,
      conditions.irrigationSalinityByCell,
      conditions
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
    const locationAdvantage =
      routeConnections * 2 + (cells.r[cellId] ? 3 : 0) + (cells.conf[cellId] ? 2 : 0) + (cells.harbor[cellId] ? 4 : 0);
    const terrainCapacity = cells.capacity[cellId] ?? 0;
    const localFoodCapacity = cells.subsistenceCapacity?.[cellId];
    // Sparse pastoral, fishing, and foraging regions can still develop a port
    // or crossroads, but their smaller food surplus limits sustained growth.
    const subsistenceFactor =
      localFoodCapacity === undefined || terrainCapacity <= 0
        ? 1
        : 0.2 + 0.8 * Math.min(1, Math.max(0, localFoodCapacity / terrainCapacity));
    potential[cellId] = locationAdvantage * subsistenceFactor;
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
