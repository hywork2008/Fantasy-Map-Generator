/**
 * Per-cell agricultural model columns: land, yield, irrigation, flood/drainage, climate stress, and
the rural occupation worker splits.
 *
 * Split out of the former single 2,452-line `economyContext.ts`, which had grown into a
 * 410-export module every one of this extension's ~180 files imported. `economyContext.ts` is now
 * a re-export barrel over these domain modules, so the public API is unchanged and no call site
 * moved. docs/plan/economy-coupling-audit.md T3.
 */

/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import {
  getEconomySlice,
  getSliceFloat32Column,
  registerContextFallbackReset,
  setSliceFloat32Column
} from "./economyApi";

let _foodPotentialFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _cultivableAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _yieldPerAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _ruralFoodCapacityFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _cultivatedAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _floweringForageAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _ruralHouseholdFoodStockFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _farmLaborRequiredFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _migratableAdultsFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _ruralReleasePressureFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _seasonalLaborShortageFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _soilFertilityFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _irrigationSalinityFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _irrigationDevelopmentFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _irrigationConveyanceEfficiencyFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _irrigatedAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _irrigationDeliveredWaterFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _irrigationWaterStressFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _riverResidualFlowFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _floodProtectionFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _fieldDrainageFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _settlementDevelopmentPotentialFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _huntingWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _fishingWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _fishingRequiredWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _viticultureWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _viticultureRequiredWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _husbandryWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _husbandryRequiredWorkersFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _stateAgriculturalProductivityFallback: Float32Array<ArrayBufferLike> = new Float32Array();

let _climateFoodStressFallback: Float32Array<ArrayBufferLike> = new Float32Array();

/** Environment-derived annual food output at full agricultural labour coverage, keyed by cell id. */
export function getFoodPotential(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("foodPotential", _foodPotentialFallback);
}

export function setFoodPotential(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("foodPotential", value, next => {
    _foodPotentialFallback = next;
  });
}

/** Maximum environmental cropland, current cultivation, yield, and labour columns keyed by cell id. */
export function getCultivableArea(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("cultivableArea", _cultivableAreaFallback);
}

export function setCultivableArea(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("cultivableArea", value, next => {
    _cultivableAreaFallback = next;
  });
}

export function getYieldPerArea(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("yieldPerArea", _yieldPerAreaFallback);
}

export function setYieldPerArea(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("yieldPerArea", value, next => {
    _yieldPerAreaFallback = next;
  });
}

export function getRuralFoodCapacity(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("ruralFoodCapacity", _ruralFoodCapacityFallback);
}

export function setRuralFoodCapacity(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("ruralFoodCapacity", value, next => {
    _ruralFoodCapacityFallback = next;
  });
}

export function getCultivatedArea(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("cultivatedArea", _cultivatedAreaFallback);
}

export function setCultivatedArea(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("cultivatedArea", value, next => {
    _cultivatedAreaFallback = next;
  });
}

/** Clover-ley area created by four-course rotation, keyed by cell id. */
export function getFloweringForageArea(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("floweringForageArea", _floweringForageAreaFallback);
}

export function setFloweringForageArea(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("floweringForageArea", value, next => {
    _floweringForageAreaFallback = next;
  });
}

/** Staple food held by rural households, aggregated per cell in annual food units. */
export function getRuralHouseholdFoodStock(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("ruralHouseholdFoodStock", _ruralHouseholdFoodStockFallback);
}

export function setRuralHouseholdFoodStock(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("ruralHouseholdFoodStock", value, next => {
    _ruralHouseholdFoodStockFallback = next;
  });
}

export function getFarmLaborRequired(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("farmLaborRequired", _farmLaborRequiredFallback);
}

export function setFarmLaborRequired(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("farmLaborRequired", value, next => {
    _farmLaborRequiredFallback = next;
  });
}

export function getMigratableAdults(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("migratableAdults", _migratableAdultsFallback);
}

export function setMigratableAdults(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("migratableAdults", value, next => {
    _migratableAdultsFallback = next;
  });
}

export function getRuralReleasePressure(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("ruralReleasePressure", _ruralReleasePressureFallback);
}

export function setRuralReleasePressure(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("ruralReleasePressure", value, next => {
    _ruralReleasePressureFallback = next;
  });
}

/** Monthly unmet rural work demand, flattened as `cellId * 12 + month` in real work-days. */
export function getSeasonalLaborShortage(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("seasonalLaborShortage", _seasonalLaborShortageFallback);
}

export function setSeasonalLaborShortage(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("seasonalLaborShortage", value, next => {
    _seasonalLaborShortageFallback = next;
  });
}

/** Dynamic field condition columns. A value of 1 fertility / 0 salinity is the fresh-map baseline. */
export function getSoilFertility(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("soilFertility", _soilFertilityFallback);
}

export function setSoilFertility(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("soilFertility", value, next => {
    _soilFertilityFallback = next;
  });
}

export function getIrrigationSalinity(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("irrigationSalinity", _irrigationSalinityFallback);
}

export function setIrrigationSalinity(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("irrigationSalinity", value, next => {
    _irrigationSalinityFallback = next;
  });
}

/** Irrigation, flood protection, and field drainage intentionally remain independent investments. */
export function getIrrigationDevelopment(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("irrigationDevelopment", _irrigationDevelopmentFallback);
}

export function setIrrigationDevelopment(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("irrigationDevelopment", value, next => {
    _irrigationDevelopmentFallback = next;
  });
}

export function getIrrigationConveyanceEfficiency(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("irrigationConveyanceEfficiency", _irrigationConveyanceEfficiencyFallback);
}

export function setIrrigationConveyanceEfficiency(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("irrigationConveyanceEfficiency", value, next => {
    _irrigationConveyanceEfficiencyFallback = next;
  });
}

export function getIrrigatedArea(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("irrigatedArea", _irrigatedAreaFallback);
}

export function setIrrigatedArea(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("irrigatedArea", value, next => {
    _irrigatedAreaFallback = next;
  });
}

export function getIrrigationDeliveredWater(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("irrigationDeliveredWater", _irrigationDeliveredWaterFallback);
}

export function setIrrigationDeliveredWater(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("irrigationDeliveredWater", value, next => {
    _irrigationDeliveredWaterFallback = next;
  });
}

export function getIrrigationWaterStress(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("irrigationWaterStress", _irrigationWaterStressFallback);
}

export function setIrrigationWaterStress(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("irrigationWaterStress", value, next => {
    _irrigationWaterStressFallback = next;
  });
}

export function getRiverResidualFlow(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("riverResidualFlow", _riverResidualFlowFallback);
}

export function setRiverResidualFlow(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("riverResidualFlow", value, next => {
    _riverResidualFlowFallback = next;
  });
}

export function getFloodProtection(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("floodProtection", _floodProtectionFallback);
}

export function setFloodProtection(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("floodProtection", value, next => {
    _floodProtectionFallback = next;
  });
}

/**
 * 0..1 this-year drought/heatwave stress broadcast from each State's ClimateDisasters.settleAnnual()
 * onto its cells, consumed by calculateClimateYield() the same way floodProtectionByCell is.
 * Design: docs/plan/climate-disaster-drought.md §3.1/§3.5.
 */
export function getClimateFoodStress(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("climateFoodStress", _climateFoodStressFallback);
}

export function setClimateFoodStress(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("climateFoodStress", value, next => {
    _climateFoodStressFallback = next;
  });
}

export function getFieldDrainage(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("fieldDrainage", _fieldDrainageFallback);
}

export function setFieldDrainage(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("fieldDrainage", value, next => {
    _fieldDrainageFallback = next;
  });
}

/**
 * Rural Occupation Allocator output (docs/plan/biome-goods-producer-ecosystem.md §3), keyed by
 * cell id. Hunting is a fixed subsistence headcount (no "required" counterpart — see
 * ruralOccupationAllocation.ts). Fishing/viticulture are gated the mineOperations way
 * (workerFactor = assigned/required); fishing's required/assigned columns are keyed by the
 * "holder" cell that actually carries the Fish bonus-good slot, which may be a water cell.
 */
export function getHuntingWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("huntingWorkers", _huntingWorkersFallback);
}

export function setHuntingWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("huntingWorkers", value, next => {
    _huntingWorkersFallback = next;
  });
}

export function getFishingWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("fishingWorkers", _fishingWorkersFallback);
}

export function setFishingWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("fishingWorkers", value, next => {
    _fishingWorkersFallback = next;
  });
}

export function getFishingRequiredWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("fishingRequiredWorkers", _fishingRequiredWorkersFallback);
}

export function setFishingRequiredWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("fishingRequiredWorkers", value, next => {
    _fishingRequiredWorkersFallback = next;
  });
}

export function getViticultureWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("viticultureWorkers", _viticultureWorkersFallback);
}

export function setViticultureWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("viticultureWorkers", value, next => {
    _viticultureWorkersFallback = next;
  });
}

export function getViticultureRequiredWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("viticultureRequiredWorkers", _viticultureRequiredWorkersFallback);
}

export function setViticultureRequiredWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("viticultureRequiredWorkers", value, next => {
    _viticultureRequiredWorkersFallback = next;
  });
}

/** Husbandry (docs/plan/biome-goods-producer-ecosystem.md §5.4, Phase 3) — same workerFactor pattern as viticulture. */
export function getHusbandryWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("husbandryWorkers", _husbandryWorkersFallback);
}

export function setHusbandryWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("husbandryWorkers", value, next => {
    _husbandryWorkersFallback = next;
  });
}

export function getHusbandryRequiredWorkers(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("husbandryRequiredWorkers", _husbandryRequiredWorkersFallback);
}

export function setHusbandryRequiredWorkers(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("husbandryRequiredWorkers", value, next => {
    _husbandryRequiredWorkersFallback = next;
  });
}

/** Geographic and economic suitability for settlement growth, keyed by cell id. */
export function getSettlementDevelopmentPotential(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("settlementDevelopmentPotential", _settlementDevelopmentPotentialFallback);
}

export function setSettlementDevelopmentPotential(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("settlementDevelopmentPotential", value, next => {
    _settlementDevelopmentPotentialFallback = next;
  });
}

/**
 * 0..1 saturating EWMA of State-funded agricultural infrastructure investment, indexed by
 * state.i (docs/plan/rural-agtech-investment.md §6.1). Kept in the economy extension's own
 * slice rather than as a new `State` field, since `State` is a host type whose dynamic fields
 * require also updating StateSimulationState/SIMULATION_STATE_FIELDS
 * (src/runtime/simulationStateState.ts) — this value is purely an economy-extension artifact.
 */
export function getStateAgriculturalProductivity(): Float32Array<ArrayBufferLike> {
  return getSliceFloat32Column("stateAgriculturalProductivity", _stateAgriculturalProductivityFallback);
}

export function setStateAgriculturalProductivity(value: Float32Array<ArrayBufferLike>): void {
  setSliceFloat32Column("stateAgriculturalProductivity", value, next => {
    _stateAgriculturalProductivityFallback = next;
  });
}

/**
 * Sparse "burgId:goodName" → smoothed 0..1 preference share, owned by the economy slice
 * (docs/plan/biome-goods-producer-ecosystem.md §9.4, Phase 5). Tracks how a Burg's craft output is
 * currently leaning between Grapes-derived conversion goods (Wine/Raisins) that compete for the
 * same harvested Grapes stock and craft labour, so production-generator.ts's per-cycle winner-take-
 * all decision doesn't flip abruptly — see viticultureAllocation.ts.
 */
export function getOrCreateViticultureAllocationShares(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.viticultureAllocationShares;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.viticultureAllocationShares = table;
  return table;
}

registerContextFallbackReset(() => {
  _foodPotentialFallback = new Float32Array();
  _cultivableAreaFallback = new Float32Array();
  _yieldPerAreaFallback = new Float32Array();
  _ruralFoodCapacityFallback = new Float32Array();
  _cultivatedAreaFallback = new Float32Array();
  _floweringForageAreaFallback = new Float32Array();
  _ruralHouseholdFoodStockFallback = new Float32Array();
  _farmLaborRequiredFallback = new Float32Array();
  _migratableAdultsFallback = new Float32Array();
  _ruralReleasePressureFallback = new Float32Array();
  _seasonalLaborShortageFallback = new Float32Array();
  _soilFertilityFallback = new Float32Array();
  _irrigationSalinityFallback = new Float32Array();
  _irrigationDevelopmentFallback = new Float32Array();
  _irrigationConveyanceEfficiencyFallback = new Float32Array();
  _irrigatedAreaFallback = new Float32Array();
  _irrigationDeliveredWaterFallback = new Float32Array();
  _irrigationWaterStressFallback = new Float32Array();
  _riverResidualFlowFallback = new Float32Array();
  _floodProtectionFallback = new Float32Array();
  _fieldDrainageFallback = new Float32Array();
  _settlementDevelopmentPotentialFallback = new Float32Array();
  _huntingWorkersFallback = new Float32Array();
  _fishingWorkersFallback = new Float32Array();
  _fishingRequiredWorkersFallback = new Float32Array();
  _viticultureWorkersFallback = new Float32Array();
  _viticultureRequiredWorkersFallback = new Float32Array();
  _husbandryWorkersFallback = new Float32Array();
  _husbandryRequiredWorkersFallback = new Float32Array();
  _stateAgriculturalProductivityFallback = new Float32Array();
  _climateFoodStressFallback = new Float32Array();
});
