import { isInitialLandUsePending, resolveStaticLandUseInputs } from "../../../generators/landUse";
import type { ClearanceCellInput } from "../../../generators/settlementClearance";
import { markRepairAtVersion } from "../../../simulation/loadRepairs";
import {
  applyRiverResidualFlows,
  Burgs,
  clearRiverResidualFlows,
  getFourCourseRotationEffect,
  optionsStore,
  reconcileSubsistenceCapacityFromFood,
  type WorldContext
} from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  ANNUAL_GATE,
  clearAnnualGateYear,
  getAnnualGateYear,
  getClimateFoodStress,
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFieldDrainage,
  getFishingWorkers,
  getFloodProtection,
  getFloweringForageArea,
  getFoodPotential,
  getGoods,
  getHouseholdTextileWorkers,
  getHuntingWorkers,
  getHusbandryRequiredWorkers,
  getHusbandryWorkers,
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
  getSettlementDevelopmentPotential,
  getSimulationYear,
  getSoilFertility,
  getStateAgriculturalProductivity,
  getViticultureWorkers,
  getWorldContext,
  getYieldPerArea,
  setAnnualGateYear,
  setClimateFoodStress,
  setCropLaborCoverage,
  setCultivableArea,
  setCultivatedArea,
  setFarmLaborRequired,
  setFieldDrainage,
  setFishingRequiredWorkers,
  setFishingWorkers,
  setFloodProtection,
  setFloweringForageArea,
  setFoodPotential,
  setHouseholdTextileWorkers,
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
import { calculateDesiredPastureAreaHectares, getHusbandryWorkerFactor, isGrazedLivestockGood } from "./husbandry";
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
 * Broadcasts each Market's potashFertilizerStock (docs/plan/fallow-reduction-fertilizer-rotation.md
 * §4) to its cells, same shape as resolveFertilizerStockByCell.
 */
function resolvePotashFertilizerStockByCell(cellCount: number): Float32Array {
  const stockByCell = new Float32Array(cellCount);
  const marketCellColumn = getMarketCellColumn();
  if (!marketCellColumn.length) return stockByCell;

  const stockByMarketId = new Map(getMarkets().map(market => [market.i, market.potashFertilizerStock ?? 0]));
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
/**
 * Load repair id/version (simulation/loadRepairs.ts): a load rebuilds the columns only for a world
 * last built by an older version. Bump when the columns' formula changes.
 */
export const DEVELOPMENT_POTENTIAL_LOAD_REPAIR = "economy.developmentPotential";
export const DEVELOPMENT_POTENTIAL_LOAD_REPAIR_VERSION = 3;

/**
 * Share of each cell's crop work-days actually done. The monthly shortage left after peak-month
 * hours, household help and neighbour aid (allocateRuralOccupations) leaves that part of the
 * existing fields unharvested; new clearance has its own labour budget (settlementClearance.ts).
 * Shortage is charged to crops first (docs/plan/farm-labour-calibration.md §3 proposal 4).
 */
export function getCropLaborCoverageByCell(
  cropLaborDaysByMonth: ArrayLike<number>,
  seasonalLaborShortage: ArrayLike<number>
): Float32Array {
  const count = Math.floor(cropLaborDaysByMonth.length / 12);
  const coverage = new Float32Array(count).fill(1);
  if (seasonalLaborShortage.length !== cropLaborDaysByMonth.length) return coverage;
  for (let cellId = 0; cellId < count; cellId++) {
    let required = 0;
    let unworked = 0;
    for (let month = 0; month < 12; month++) {
      const days = Math.max(0, cropLaborDaysByMonth[cellId * 12 + month] ?? 0);
      required += days;
      unworked += Math.min(days, Math.max(0, seasonalLaborShortage[cellId * 12 + month] ?? 0));
    }
    if (required > 0) coverage[cellId] = 1 - unworked / required;
  }
  return coverage;
}

/** Share of the gap between the pasture kept and the pasture its herders can work closed in one year (§23). */
export const PASTURE_ANNUAL_ADJUSTMENT = 0.25;

export class DevelopmentPotentialModule {
  generate(): DevelopmentPotentials {
    const world = getWorldContext();
    // Columns built by this version need no rebuild when the world is loaded again.
    markRepairAtVersion(world.options, DEVELOPMENT_POTENTIAL_LOAD_REPAIR, DEVELOPMENT_POTENTIAL_LOAD_REPAIR_VERSION);
    const agTechStockByCell = resolveAgTechStockByCell(world.pack.cells?.i?.length ?? 0);
    const stateProductivityByCell = resolveStateProductivityByCell(world.pack.cells);
    const megacity = optionsStore.getState().ruralUrbanMigration === "megacity";
    const demandOptions = {
      includeUrbanFoodDemand: !megacity,
      preserveLegacyStock: !world.pack.landUse && !isInitialLandUsePending(world)
    };
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
    setCropLaborCoverage(new Float32Array());
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
    setClimateFoodStress(new Float32Array());
    setHuntingWorkers(new Float32Array());
    setFishingWorkers(new Float32Array());
    setFishingRequiredWorkers(new Float32Array());
    setViticultureWorkers(new Float32Array());
    setViticultureRequiredWorkers(new Float32Array());
    setHusbandryWorkers(new Float32Array());
    setHouseholdTextileWorkers(new Float32Array());
    setHusbandryRequiredWorkers(new Float32Array());
    setSettlementDevelopmentPotential(new Float32Array());
    clearAnnualGateYear(ANNUAL_GATE.settlementDevelopment);
  }

  /** Recomputes current crop area and farm labour once per year before food ledgers settle. */
  updateAnnualAgriculture(): boolean {
    const year = getSimulationYear();
    if (getAnnualGateYear(ANNUAL_GATE.settlementDevelopment) === year) return false;
    const world = getWorldContext();
    const agTechStockByCell = resolveAgTechStockByCell(world.pack.cells?.i?.length ?? 0);
    const stateProductivityByCell = resolveStateProductivityByCell(world.pack.cells);
    const megacity = optionsStore.getState().ruralUrbanMigration === "megacity";
    const demandOptions = {
      includeUrbanFoodDemand: !megacity,
      year,
      annual: true
    };
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
    if (getAnnualGateYear(ANNUAL_GATE.settlementDevelopment) === year) return false;

    let changed = false;
    for (const burg of getWorldContext().pack.burgs) {
      if (!burg?.i || burg.removed || burg.lock) continue;
      const before = burg.group;
      Burgs.changeGroup(burg);
      changed ||= burg.group !== before;
    }
    setAnnualGateYear(ANNUAL_GATE.settlementDevelopment, year);
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
    // Only the fields the residents can work feed a settled rural population
    // (docs/plan/farm-labour-calibration.md §9).
    reconcileSubsistenceCapacityFromFood(world.pack.cells, agriculture.labourLimitedFoodCapacity);

    // The calendar allocator combines staple fields and all resident rural occupations before it
    // derives migration surplus, so these columns are not a second annual deduction from Grain.
    const occupations = allocateRuralOccupations(world, agriculture);
    setHuntingWorkers(occupations.huntingWorkers);
    setFishingWorkers(occupations.fishingWorkers);
    setFishingRequiredWorkers(occupations.fishingRequiredWorkers);
    setViticultureWorkers(occupations.viticultureWorkers);
    setViticultureRequiredWorkers(occupations.viticultureRequiredWorkers);
    setHusbandryWorkers(occupations.husbandryWorkers);
    setHouseholdTextileWorkers(occupations.householdTextileWorkers);
    setHusbandryRequiredWorkers(occupations.husbandryRequiredWorkers);
    setFarmLaborRequired(occupations.farmLaborRequired);
    setMigratableAdults(occupations.migratableAdults);
    setRuralReleasePressure(occupations.ruralReleasePressure);
    setSeasonalLaborShortage(occupations.seasonalLaborShortage);
    setCropLaborCoverage(
      getCropLaborCoverageByCell(agriculture.cropLaborDaysByMonth, occupations.seasonalLaborShortage)
    );
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
    if (getFloodProtection().length !== cellCount) setFloodProtection(new Float32Array(cellCount));
    if (getClimateFoodStress().length !== cellCount) setClimateFoodStress(new Float32Array(cellCount));
    const goods = getGoods().filter(isGoodEnabled);
    const landUseByCell: Record<number, Partial<ClearanceCellInput>> = {};
    const occupationDays = [
      getHuntingWorkers(),
      getFishingWorkers(),
      getViticultureWorkers(),
      getHusbandryWorkers(),
      getHouseholdTextileWorkers()
    ];
    for (const input of resolveStaticLandUseInputs(world)) {
      const settings =
        world.pack.burgs?.[world.pack.cells.burg?.[input.id] ?? 0]?.landUseSettings ??
        world.pack.cultures?.[world.pack.cells.culture?.[input.id] ?? 0]?.landUseSettings;
      const previous = world.pack.landUse?.cells[input.id];
      const hasGrazed = goods.some(g => isGrazedLivestockGood(g.name));
      const pasture = hasGrazed ? calculateDesiredPastureAreaHectares(world, input.id, true) : 0;
      const workersKnown = getHusbandryWorkers().length === cellCount;
      const staffedPasture =
        pasture *
        (workersKnown && (getHusbandryRequiredWorkers()[input.id] ?? 0) > 0 ? getHusbandryWorkerFactor(input.id) : 1);
      // Herds grow and shrink over years, not all at once. Without this the pasture flipped every
      // year: with no pasture the cell needed no herders, so the next plan laid the full pasture;
      // then the fields took the labour, no herder was hired, and the pasture went again. Each time
      // it came back it was counted as newly cleared forest (docs/plan/farm-labour-calibration.md §23).
      const previousPasture = previous?.diagnostics.includes("resolved-livestock-land")
        ? previous.patches
            .filter(patch => patch.kind === "pasture" || patch.kind === "wood_pasture")
            .reduce((sum, patch) => sum + patch.areaHa, 0)
        : undefined;
      const maintainedPasture =
        previousPasture === undefined
          ? staffedPasture
          : previousPasture + (staffedPasture - previousPasture) * PASTURE_ANNUAL_ADJUSTMENT;
      landUseByCell[input.id] = {
        livestock: input.livestock ?? { grazingAreaHa: maintainedPasture },
        workforce: {
          ...input.workforce!,
          otherOccupationDays:
            settings?.otherOccupationDays ??
            occupationDays.reduce((s, a) => s + (a[input.id] ?? 0) * (world.populationRate || 1) * 140, 0)
        },
        // Forestry profiles use an explicit estimated compartment area when no wood plan is supplied.
        managedForestAreaHa:
          settings?.managedForestAreaHa ??
          (input.profile === "forestry"
            ? Math.max(0, input.physicalLandAreaHa * input.forestCover - (previous?.convertedForestAreaHa ?? 0)) * 0.5
            : undefined)
      };
    }
    return {
      landUseByCell,
      cropGoods: getGoods().filter(good => Boolean(good.crop) && isGoodEnabled(good)),
      soilFertilityByCell: getSoilFertility(),
      irrigationSalinityByCell: getIrrigationSalinity(),
      fourCourseRotationByCell: resolveFourCourseRotationByCell(world.pack.cells),
      irrigationDevelopmentByCell: getIrrigationDevelopment(),
      irrigationConveyanceEfficiencyByCell: getIrrigationConveyanceEfficiency(),
      fieldDrainageByCell: getFieldDrainage(),
      floodProtectionByCell: getFloodProtection(),
      climateFoodStressByCell: getClimateFoodStress(),
      fertilizerStockByCell: resolveFertilizerStockByCell(cellCount),
      nitrogenFertilizerStockByCell: resolveNitrogenFertilizerStockByCell(cellCount),
      potashFertilizerStockByCell: resolvePotashFertilizerStockByCell(cellCount)
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
