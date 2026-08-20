/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";
import type { Burg } from "../../types/models";
import { addFrontierApplicants as addFrontierApplicantsToPool } from "../hostCore";
import type { AcademyKnowledgeStock } from "./generators/academyKnowledgeTypes";
import type { AdministrationEmploymentRecord } from "./generators/administrationEmployment";
import type { BurgMarketLedger } from "./generators/burgMarketLedgersTypes";
import type { CellFoodReserve } from "./generators/cellFoodRescueTypes";
import type {
  AcidPlant,
  ApothecaryWorkshop,
  ChemistryTrial,
  ChemMedPracticeRecord,
  ChlorinePlant,
  ExperimentalWorkshop,
  HospitalInstallation,
  MedicalCareReliefRow,
  MercuryPlant,
  OilRefineryPlant,
  PhosphateFertilizerPlant,
  SyntheticAmmoniaPlant
} from "./generators/chemistryTypes";
import type { ConstructionOperation } from "./generators/constructionEmploymentTypes";
import type { ConstructionHireApplication, ConstructionNamedSeat } from "./generators/constructionHireTypes";
import type { CraftEmploymentRecord } from "./generators/craftEmployment";
import type { Dam, DamSite } from "./generators/damTypes";
import type { PowerStation, TelegraphLine } from "./generators/electricalTypes";
import type { ChlorAlkaliPlant, ElectrolysisPlant } from "./generators/electrolysisTypes";
import type {
  EscortActiveContract,
  EscortCooldowns,
  EscortHireApplication,
  EscortJobPosting
} from "./generators/escortHireTypes";
import type { FaunaCohorts } from "./generators/faunaPopulationTypes";
import type { Good } from "./generators/goodsGeneratorTypes";
import type { GreatLibraryProject } from "./generators/greatLibraryTypes";
import type { GuildChapter } from "./generators/guildChapterTypes";
import type { CraftDomainEmploymentRecord, GuildKnowledgeStock } from "./generators/guildKnowledgeTypes";
import type { CharacterDomainSkill } from "./generators/individualSkillTypes";
import {
  type InnConstructionOrder,
  type InnFacility,
  type InnStayLedger,
  LODGING_STYLES,
  type LodgingStyle
} from "./generators/innFacilityTypes";
import type { Levee, LeveeSite } from "./generators/leveeTypes";
import type { FlowCycleSnapshot } from "./generators/marketFlowTypes";
import type {
  Caravan,
  Deal,
  ExportStagingLot,
  Market,
  MerchantTransportLedger,
  TransportAssetOrder,
  TransportReservation
} from "./generators/marketTypes";
import type { MartialDisciplineStock } from "./generators/martialDisciplineTypes";
import type { MerchantOrganization } from "./generators/merchantOrganizationsTypes";
import type {
  MetallurgAssetLedger,
  MetallurgMaterialForecast,
  MetallurgWorkOrder
} from "./generators/metallurgWorkTypes";
import type { MilitaryResourceLedger } from "./generators/militaryResourcesTypes";
import type {
  MineOperation,
  MineralDeposit,
  MineralDistrict,
  MineralGeologicalProvince
} from "./generators/mineralResourcesTypes";
import type { MintLedger } from "./generators/mintingTypes";
import type { ProductionRecord } from "./generators/productionRecordTypes";
import type { QuarryOperation } from "./generators/quarryOperationsTypes";
import type {
  BurgRetailInventory,
  BurgWholesaleInventory,
  CharacterInventoryCostBasis,
  MarketMerchantPortfolio,
  MarketShipment,
  MerchantGoodSalesLedger,
  PlayerMarketTransaction
} from "./generators/retailInventoryTypes";
import type { SaltShipment, Saltworks, StateSaltLedger } from "./generators/saltLogisticsTypes";
import type { BasicEmploymentSummaryRecord } from "./generators/serviceEmployment";
import type { SmelterOperation } from "./generators/smelterOperationsTypes";
import type { SmithingWorkshopLedger } from "./generators/smithingWorkshopLedgerTypes";
import type { StateSecretStock } from "./generators/stateSecretTypes";
import type { RailwayLink, SteamInstallation, SteamPumpTrial } from "./generators/steamTypes";
import type { SteelConverterPlant } from "./generators/steelConverterTypes";
import type { LaborMarket } from "./generators/strategicLaborMarketsTypes";
import type { StrategicGoodsPolicy } from "./generators/strategicProcurementPolicy";
import type { ProcurementOrder } from "./generators/strategicProcurementTypes";
import type {
  InstructionResidue,
  PatronageDeposit,
  ResearchHireApplication,
  ResearchNamedSeat,
  TechnologyHint,
  TechnologyInstructMission
} from "./generators/technologyBiasTypes";
import type {
  CullActiveContract,
  CullCooldowns,
  CullHireApplication,
  CullJobPosting
} from "./generators/threatCullHireTypes";
import type { TradeSecurityLedger } from "./generators/tradeSecurityTypes";
import type { BanditCohort, MobileAdultCohort, UrbanLaborIntake } from "./generators/urbanLaborIntakeTypes";
import type { UrbanPregnancyRecord } from "./generators/urbanPregnancyTypes";
import type { UrbanWaterSystem } from "./generators/urbanWaterTypes";
import type { MerchantVesselOwnership } from "./generators/vesselOwnershipTypes";
import type { VolcanicOperation } from "./generators/volcanicOperationsTypes";

let _api: ExtensionAPI | null = null;
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
let _settlementDevelopmentLastEvaluatedYearFallback: number | null = null;
let _agTechLastSettledYearFallback: number | null = null;
let _industrialTechLastSettledYearFallback: number | null = null;
let _guildKnowledgeLastSettledYearFallback: number | null = null;
let _guildChaptersLastSettledYearFallback: number | null = null;
let _academyKnowledgeLastSettledYearFallback: number | null = null;
let _stateSecretLastSettledYearFallback: number | null = null;
let _martialDisciplineLastSettledYearFallback: number | null = null;
let _martialIndividualMasteryLastSettledYearFallback: number | null = null;
let _guildSuccessionLastSettledYearFallback: number | null = null;
let _burgTreasuryLastSettledYearFallback: number | null = null;
let _innFacilitiesLastSettledYearFallback: number | null = null;
let _urbanWaterLastSettledYearFallback: number | null = null;
let _steamInstallationsLastSettledYearFallback: number | null = null;
let _apothecaryWorkshopsLastSettledYearFallback: number | null = null;
let _experimentalWorkshopsLastSettledYearFallback: number | null = null;
let _hospitalInstallationsLastSettledYearFallback: number | null = null;
let _acidPlantsLastSettledYearFallback: number | null = null;
let _chlorinePlantsLastSettledYearFallback: number | null = null;
let _phosphateFertilizerPlantsLastSettledYearFallback: number | null = null;
let _steelConverterPlantsLastSettledYearFallback: number | null = null;
let _fertilizerInvestmentLastSettledYearFallback: number | null = null;
let _syntheticAmmoniaPlantsLastSettledYearFallback: number | null = null;
let _nitrogenFertilizerInvestmentLastSettledYearFallback: number | null = null;
let _powerStationsLastSettledYearFallback: number | null = null;
let _telegraphLinesLastSettledYearFallback: number | null = null;
let _electrolysisPlantsLastSettledYearFallback: number | null = null;
let _chlorAlkaliPlantsLastSettledYearFallback: number | null = null;
let _mercuryPlantsLastSettledYearFallback: number | null = null;
let _oilRefineryPlantsLastSettledYearFallback: number | null = null;
let _powerGridInvestmentLastSettledYearFallback: number | null = null;
let _damsLastSettledYearFallback: number | null = null;
let _leveesLastSettledYearFallback: number | null = null;
let _faunaPopulationLastSettledYearFallback: number | null = null;
let _greatLibraryLastSettledYearFallback: number | null = null;
let _climateDisastersLastSettledYearFallback: number | null = null;
let _stateAgriculturalProductivityFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _climateFoodStressFallback: Float32Array<ArrayBufferLike> = new Float32Array();

export function initEconomyContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearEconomyContext(): void {
  _api = null;
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
  _settlementDevelopmentLastEvaluatedYearFallback = null;
  _agTechLastSettledYearFallback = null;
  _industrialTechLastSettledYearFallback = null;
  _guildKnowledgeLastSettledYearFallback = null;
  _guildChaptersLastSettledYearFallback = null;
  _academyKnowledgeLastSettledYearFallback = null;
  _stateSecretLastSettledYearFallback = null;
  _martialDisciplineLastSettledYearFallback = null;
  _martialIndividualMasteryLastSettledYearFallback = null;
  _guildSuccessionLastSettledYearFallback = null;
  _burgTreasuryLastSettledYearFallback = null;
  _innFacilitiesLastSettledYearFallback = null;
  _urbanWaterLastSettledYearFallback = null;
  _steamInstallationsLastSettledYearFallback = null;
  _apothecaryWorkshopsLastSettledYearFallback = null;
  _experimentalWorkshopsLastSettledYearFallback = null;
  _hospitalInstallationsLastSettledYearFallback = null;
  _acidPlantsLastSettledYearFallback = null;
  _chlorinePlantsLastSettledYearFallback = null;
  _phosphateFertilizerPlantsLastSettledYearFallback = null;
  _steelConverterPlantsLastSettledYearFallback = null;
  _fertilizerInvestmentLastSettledYearFallback = null;
  _syntheticAmmoniaPlantsLastSettledYearFallback = null;
  _nitrogenFertilizerInvestmentLastSettledYearFallback = null;
  _powerStationsLastSettledYearFallback = null;
  _telegraphLinesLastSettledYearFallback = null;
  _electrolysisPlantsLastSettledYearFallback = null;
  _chlorAlkaliPlantsLastSettledYearFallback = null;
  _mercuryPlantsLastSettledYearFallback = null;
  _oilRefineryPlantsLastSettledYearFallback = null;
  _powerGridInvestmentLastSettledYearFallback = null;
  _damsLastSettledYearFallback = null;
  _leveesLastSettledYearFallback = null;
  _faunaPopulationLastSettledYearFallback = null;
  _greatLibraryLastSettledYearFallback = null;
  _climateDisastersLastSettledYearFallback = null;
  _stateAgriculturalProductivityFallback = new Float32Array();
  _climateFoodStressFallback = new Float32Array();
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[economy] Extension context not initialized — call init(api) first");
  return _api;
}

/**
 * True once init(api) has run. For cross-extension reads only (e.g. Nobility's
 * commanderPowerMultiplier reading getMartialDisciplineMultiplier, docs/plan/
 * knowledge-guild-system.md §9 Phase 5) — those callers may run before, or entirely without,
 * this extension's own init having been called (economy disabled, or a Nobility unit test that
 * only sets up its own context), and must degrade to "no bonus" instead of throwing. Economy's
 * own modules should keep using getApi()/getWorldContext() directly so a real init-ordering bug
 * still throws loudly.
 */
export function isEconomyContextReady(): boolean {
  return _api !== null;
}

export function getWorldContext() {
  return getApi().worldContext;
}

/**
 * Live simulation year/month. Falls back to generation options only when a
 * minimal test double omits simulationContext.
 */
export function getSimulationYear(): number {
  const year = _api?.simulationContext?.currentYear;
  if (typeof year === "number" && Number.isFinite(year)) return year;
  return Number(getWorldContext().options?.year) || 0;
}

export function getSimulationMonth(): number {
  const month = _api?.simulationContext?.currentMonth;
  if (typeof month === "number" && Number.isFinite(month) && month >= 1 && month <= 12) return month;
  const fallback = Number(getWorldContext().options?.month);
  return Number.isFinite(fallback) && fallback >= 1 && fallback <= 12 ? fallback : 1;
}

export function getSimulationDay(): number {
  const day = _api?.simulationContext?.currentDay;
  if (typeof day === "number" && Number.isFinite(day) && day >= 1) return Math.floor(day);
  const fallback = Number(getWorldContext().options?.day);
  return Number.isFinite(fallback) && fallback >= 1 ? Math.floor(fallback) : 1;
}

/** Live simulation context (wilderness cull projects, clock). Null only in minimal tests. */
export function getSimulationContext() {
  return _api?.simulationContext ?? null;
}

/**
 * Hands displaced adults to the host's (extension-agnostic) frontier applicant pool instead of
 * economy-only bookkeeping, so `advanceFrontierExpansion` can draw on them directly
 * (docs/plan/megacity-food-import-economy.md §4.1).
 */
export function addFrontierApplicants(stateId: number, maleAdults: number, femaleAdults: number): void {
  const frontier = _api?.simulationContext?.frontier;
  if (!frontier) return;
  addFrontierApplicantsToPool(frontier, stateId, maleAdults, femaleAdults);
}

function getProductionTable(): Record<number, ProductionRecord[]> | null {
  const simulation = _api?.simulationContext;
  if (!simulation?.extensions) return null;
  const economy = simulation.extensions.economy ?? {};
  simulation.extensions.economy = economy;
  const existing = economy.productionByBurg;
  if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
    return existing as Record<number, ProductionRecord[]>;
  }
  const productionByBurg: Record<number, ProductionRecord[]> = {};
  economy.productionByBurg = productionByBurg;
  return productionByBurg;
}

/** Economy-owned production records keyed by stable burg id. */
export function getBurgProductionRecords(burg: Burg): ProductionRecord[] {
  const table = getProductionTable();
  if (burg.i && table) return table[burg.i] ?? [];
  return ((burg as unknown as Record<string, unknown>).production ?? []) as ProductionRecord[];
}

export function setBurgProductionRecords(burg: Burg, records: ProductionRecord[]): void {
  const table = getProductionTable();
  if (burg.i && table) {
    table[burg.i] = records;
    return;
  }
  (burg as unknown as Record<string, unknown>).production = records;
}

type EconomySlice = Record<string, unknown>;

/**
 * The economy extension's namespaced simulation slice, created on first access.
 * Returns null when `simulationContext` isn't provided (e.g. minimal `ExtensionAPI` test
 * doubles) — callers fall back to `pack`/`pack.cells` directly, mirroring
 * `getProductionTable()`'s fallback above.
 */
function getEconomySlice(): EconomySlice | null {
  const simulation = _api?.simulationContext;
  if (!simulation) return null;
  if (!simulation.extensions) simulation.extensions = {};
  const existing = simulation.extensions.economy;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) return existing as EconomySlice;
  const slice: EconomySlice = {};
  simulation.extensions.economy = slice;
  return slice;
}

function getLegacyPackFields(): Record<string, unknown> {
  return getWorldContext().pack as unknown as Record<string, unknown>;
}

function getLegacyCellFields(): Record<string, unknown> {
  return getWorldContext().pack.cells as unknown as Record<string, unknown>;
}

function getSliceArray<T>(field: string): T[] {
  const slice = getEconomySlice();
  const value = slice ? slice[field] : getLegacyPackFields()[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

function setSliceArray<T>(field: string, value: readonly T[]): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  getLegacyPackFields()[field] = value;
}

function getSliceNumber(field: string): number {
  const slice = getEconomySlice();
  const value = slice ? slice[field] : getLegacyPackFields()[field];
  return typeof value === "number" ? value : 0;
}

function setSliceNumber(field: string, value: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  getLegacyPackFields()[field] = value;
}

function getSliceCellColumn(field: string): Uint16Array {
  const slice = getEconomySlice();
  const value = slice ? slice[field] : getLegacyCellFields()[field];
  return value instanceof Uint16Array ? value : new Uint16Array();
}

function setSliceCellColumn(field: string, value: Uint16Array): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  getLegacyCellFields()[field] = value;
}

function getSliceFloat32Column(field: string, fallback: Float32Array<ArrayBufferLike>): Float32Array<ArrayBufferLike> {
  const slice = getEconomySlice();
  const value = slice?.[field];
  return value instanceof Float32Array ? value : fallback;
}

function setSliceFloat32Column(
  field: string,
  value: Float32Array<ArrayBufferLike>,
  setFallback: (value: Float32Array<ArrayBufferLike>) => void
): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  setFallback(value);
}

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

export function getSettlementDevelopmentLastEvaluatedYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.settlementDevelopmentLastEvaluatedYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _settlementDevelopmentLastEvaluatedYearFallback;
}
export function setSettlementDevelopmentLastEvaluatedYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.settlementDevelopmentLastEvaluatedYear = year;
    return;
  }
  _settlementDevelopmentLastEvaluatedYearFallback = year;
}

export function clearSettlementDevelopmentLastEvaluatedYear(): void {
  const slice = getEconomySlice();
  if (slice) {
    delete slice.settlementDevelopmentLastEvaluatedYear;
    return;
  }
  _settlementDevelopmentLastEvaluatedYearFallback = null;
}

/**
 * Guards AgTechInvestment.settleAnnual() to run at most once per simulation year, the same way
 * getSettlementDevelopmentLastEvaluatedYear guards updateAnnualAgriculture (docs/plan/rural-agtech-investment.md §3.3).
 */
export function getAgTechLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.agTechLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _agTechLastSettledYearFallback;
}
export function setAgTechLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.agTechLastSettledYear = year;
    return;
  }
  _agTechLastSettledYearFallback = year;
}

/** Same guard as getAgTechLastSettledYear, for IndustrialTechInvestment.settleAnnual() (docs/plan/rural-agtech-investment.md §6.2). */
export function getIndustrialTechLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.industrialTechLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _industrialTechLastSettledYearFallback;
}
export function setIndustrialTechLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.industrialTechLastSettledYear = year;
    return;
  }
  _industrialTechLastSettledYearFallback = year;
}

/** Same guard as getAgTechLastSettledYear, for GuildKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 1). */
export function getGuildKnowledgeLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.guildKnowledgeLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _guildKnowledgeLastSettledYearFallback;
}
export function setGuildKnowledgeLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.guildKnowledgeLastSettledYear = year;
    return;
  }
  _guildKnowledgeLastSettledYearFallback = year;
}

/** Independent annual guard for formal GuildChapter placement. */
export function getGuildChaptersLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.guildChaptersLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _guildChaptersLastSettledYearFallback;
}
export function setGuildChaptersLastSettledYear(year: number | null): void {
  const slice = getEconomySlice();
  if (slice) {
    if (year === null) delete slice.guildChaptersLastSettledYear;
    else slice.guildChaptersLastSettledYear = year;
    return;
  }
  _guildChaptersLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for AcademyKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 3). */
export function getAcademyKnowledgeLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.academyKnowledgeLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _academyKnowledgeLastSettledYearFallback;
}
export function setAcademyKnowledgeLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.academyKnowledgeLastSettledYear = year;
    return;
  }
  _academyKnowledgeLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for StateSecretKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 4). */
export function getStateSecretLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.stateSecretLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _stateSecretLastSettledYearFallback;
}
export function setStateSecretLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.stateSecretLastSettledYear = year;
    return;
  }
  _stateSecretLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for MartialDisciplineKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 5). */
export function getMartialDisciplineLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.martialDisciplineLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _martialDisciplineLastSettledYearFallback;
}
export function setMartialDisciplineLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.martialDisciplineLastSettledYear = year;
    return;
  }
  _martialDisciplineLastSettledYearFallback = year;
}

/** Once-per-year guard for individual commander practice, after MartialDisciplineStock settles. */
export function getMartialIndividualMasteryLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.martialIndividualMasteryLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _martialIndividualMasteryLastSettledYearFallback;
}
export function setMartialIndividualMasteryLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.martialIndividualMasteryLastSettledYear = year;
    return;
  }
  _martialIndividualMasteryLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for GuildSuccession.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 6). */
export function getGuildSuccessionLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.guildSuccessionLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _guildSuccessionLastSettledYearFallback;
}
export function setGuildSuccessionLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.guildSuccessionLastSettledYear = year;
    return;
  }
  _guildSuccessionLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for GuildTreasury.settleAnnual() (docs/plan/burg-treasury-equilibrium.md §3.3). */
export function getBurgTreasuryLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.burgTreasuryLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _burgTreasuryLastSettledYearFallback;
}
export function setBurgTreasuryLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.burgTreasuryLastSettledYear = year;
    return;
  }
  _burgTreasuryLastSettledYearFallback = year;
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

/** Yearly burg-level intake ledgers; these model only new worker acceptance, not incumbent occupations. */
export function getUrbanLaborIntakes(): UrbanLaborIntake[] {
  return getSliceArray<UrbanLaborIntake>("urbanLaborIntakes");
}
export function setUrbanLaborIntakes(value: readonly UrbanLaborIntake[]): void {
  setSliceArray("urbanLaborIntakes", value);
}

/** Rural adult cohorts that have left their origin but have not yet found a permanent outcome. */
export function getMobileAdultCohorts(): MobileAdultCohort[] {
  return getSliceArray<MobileAdultCohort>("mobileAdultCohorts");
}
export function setMobileAdultCohorts(value: readonly MobileAdultCohort[]): void {
  setSliceArray("mobileAdultCohorts", value);
}

/** Settlers awaiting a Frontier Expansion project; they remain population accounted for in the extension slice. */
export function getFrontierAdultCohorts(): MobileAdultCohort[] {
  return getSliceArray<MobileAdultCohort>("frontierAdultCohorts");
}
export function setFrontierAdultCohorts(value: readonly MobileAdultCohort[]): void {
  setSliceArray("frontierAdultCohorts", value);
}

/** Aggregate outlaw cohorts. Their per-state pressure is consumed by TradeSecurity. */
export function getBanditCohorts(): BanditCohort[] {
  return getSliceArray<BanditCohort>("banditCohorts");
}
export function setBanditCohorts(value: readonly BanditCohort[]): void {
  setSliceArray("banditCohorts", value);
}

/** Good catalog owned by the economy extension. */
export function getGoods(): Good[] {
  return getSliceArray<Good>("goods");
}
export function setGoods(goods: readonly Good[]): void {
  setSliceArray("goods", goods);
}

/** Markets owned by the economy extension. */
export function getMarkets(): Market[] {
  return getSliceArray<Market>("markets");
}
export function setMarkets(markets: readonly Market[]): void {
  setSliceArray("markets", markets);
}

let _marketByIdCache: { source: readonly Market[]; byId: Map<number, Market> } | null = null;

/**
 * `getMarkets().find(market => market.i === id)` shows up on hot per-day paths (Shipbuilding's
 * daily procurement demand, strategic procurement route-building) where it re-scans the whole
 * market array on every call. The backing array reference only changes at
 * generation/regeneration/disable (see setMarkets/getSliceArray), so a Map keyed by id, rebuilt
 * only when that reference changes, is safe to reuse across calls within a session — market
 * objects mutate in place, so lookups stay live.
 */
export function getMarketById(id: number): Market | undefined {
  const markets = getMarkets();
  if (!_marketByIdCache || _marketByIdCache.source !== markets) {
    const byId = new Map<number, Market>();
    for (const market of markets) byId.set(market.i, market);
    _marketByIdCache = { source: markets, byId };
  }
  return _marketByIdCache.byId.get(id);
}

/** Active trade deals owned by the economy extension. */
export function getDeals(): Deal[] {
  return getSliceArray<Deal>("deals");
}
export function setDeals(deals: readonly Deal[]): void {
  setSliceArray("deals", deals);
}

/**
 * Export warehouse lots: booked market↔market cargo held between retail deduction and caravan load.
 * Persists across production cycles (unlike deals, which are wiped each cycle for UI history).
 */
export function getExportStagingLots(): ExportStagingLot[] {
  return getSliceArray<ExportStagingLot>("exportStagingLots");
}
export function setExportStagingLots(lots: readonly ExportStagingLot[]): void {
  setSliceArray("exportStagingLots", lots);
}
export function getNextExportStagingLotId(): number {
  return getSliceNumber("nextExportStagingLotId");
}
export function setNextExportStagingLotId(id: number): void {
  setSliceNumber("nextExportStagingLotId", id);
}

/** 1 once merchant export warehouses were seeded with inherited pre-start stock. */
export function getExportWarehouseSeeded(): boolean {
  return getSliceNumber("exportWarehouseSeeded") === 1;
}
export function setExportWarehouseSeeded(seeded: boolean): void {
  setSliceNumber("exportWarehouseSeeded", seeded ? 1 : 0);
}

/**
 * Rolling A0 flow diagnostics: last ~12 production-cycle snapshots (market×good P/S/D/trade).
 * @see docs/plan/market-goods-flow-budget.md
 */
export function getFlowCycleHistory(): FlowCycleSnapshot[] {
  return getSliceArray<FlowCycleSnapshot>("flowCycleHistory");
}
export function setFlowCycleHistory(history: readonly FlowCycleSnapshot[]): void {
  setSliceArray("flowCycleHistory", history);
}

/** In-transit caravans owned by the economy extension. */
export function getCaravans(): Caravan[] {
  return getSliceArray<Caravan>("caravans");
}
export function setCaravans(caravans: readonly Caravan[]): void {
  setSliceArray("caravans", caravans);
}

export function getNextCaravanId(): number {
  return getSliceNumber("nextCaravanId");
}
export function setNextCaravanId(id: number): void {
  setSliceNumber("nextCaravanId", id);
}

/** Durable merchant transport assets, keyed by market id. */
export function getMerchantTransportLedgers(): MerchantTransportLedger[] {
  return getSliceArray<MerchantTransportLedger>("merchantTransportLedgers");
}
export function setMerchantTransportLedgers(ledgers: readonly MerchantTransportLedger[]): void {
  setSliceArray("merchantTransportLedgers", ledgers);
}

/** Reservations tie a transient caravan to a market-owned transport asset. */
export function getTransportReservations(): TransportReservation[] {
  return getSliceArray<TransportReservation>("transportReservations");
}
export function setTransportReservations(reservations: readonly TransportReservation[]): void {
  setSliceArray("transportReservations", reservations);
}

export function getNextTransportReservationId(): number {
  return getSliceNumber("nextTransportReservationId");
}
export function setNextTransportReservationId(id: number): void {
  setSliceNumber("nextTransportReservationId", id);
}

/** Market-funded durable transport-asset orders. */
export function getTransportAssetOrders(): TransportAssetOrder[] {
  return getSliceArray<TransportAssetOrder>("transportAssetOrders");
}
export function setTransportAssetOrders(orders: readonly TransportAssetOrder[]): void {
  setSliceArray("transportAssetOrders", orders);
}
export function getNextTransportAssetOrderId(): number {
  return getSliceNumber("nextTransportAssetOrderId");
}
export function setNextTransportAssetOrderId(id: number): void {
  setSliceNumber("nextTransportAssetOrderId", id);
}

/** Per-burg market ledgers owned by the economy extension. */
export function getBurgMarketLedgers(): BurgMarketLedger[] {
  return getSliceArray<BurgMarketLedger>("burgMarketLedgers");
}
export function setBurgMarketLedgers(ledgers: readonly BurgMarketLedger[]): void {
  setSliceArray("burgMarketLedgers", ledgers);
}

/** Per-burg shelves available to player commerce. */
export function getBurgRetailInventories(): BurgRetailInventory[] {
  return getSliceArray<BurgRetailInventory>("burgRetailInventories");
}
export function setBurgRetailInventories(inventories: readonly BurgRetailInventory[]): void {
  setSliceArray("burgRetailInventories", inventories);
}

/** Per-burg collection and wholesale stock that backs the retail shelves. */
export function getBurgWholesaleInventories(): BurgWholesaleInventory[] {
  return getSliceArray<BurgWholesaleInventory>("burgWholesaleInventories");
}
export function setBurgWholesaleInventories(inventories: readonly BurgWholesaleInventory[]): void {
  setSliceArray("burgWholesaleInventories", inventories);
}

/** Aggregated same-market cargo that has left an origin depot but has not yet arrived. */
export function getMarketShipments(): MarketShipment[] {
  return getSliceArray<MarketShipment>("marketShipments");
}
export function setMarketShipments(shipments: readonly MarketShipment[]): void {
  setSliceArray("marketShipments", shipments);
}
export function getNextMarketShipmentId(): number {
  return getSliceNumber("nextMarketShipmentId");
}
export function setNextMarketShipmentId(id: number): void {
  setSliceNumber("nextMarketShipmentId", id);
}

export function getMarketMerchantPortfolios(): MarketMerchantPortfolio[] {
  return getSliceArray<MarketMerchantPortfolio>("marketMerchantPortfolios");
}
export function setMarketMerchantPortfolios(portfolios: readonly MarketMerchantPortfolio[]): void {
  setSliceArray("marketMerchantPortfolios", portfolios);
}

export function getMerchantGoodSalesLedgers(): MerchantGoodSalesLedger[] {
  return getSliceArray<MerchantGoodSalesLedger>("merchantGoodSalesLedgers");
}
export function setMerchantGoodSalesLedgers(ledgers: readonly MerchantGoodSalesLedger[]): void {
  setSliceArray("merchantGoodSalesLedgers", ledgers);
}

export function getPlayerMarketTransactions(): PlayerMarketTransaction[] {
  return getSliceArray<PlayerMarketTransaction>("playerMarketTransactions");
}
export function setPlayerMarketTransactions(transactions: readonly PlayerMarketTransaction[]): void {
  setSliceArray("playerMarketTransactions", transactions);
}
/** Known average acquisition costs for Character-held Goods. */
export function getCharacterInventoryCostBases(): CharacterInventoryCostBasis[] {
  return getSliceArray<CharacterInventoryCostBasis>("characterInventoryCostBases");
}
export function setCharacterInventoryCostBases(bases: readonly CharacterInventoryCostBasis[]): void {
  setSliceArray("characterInventoryCostBases", bases);
}
export function getNextPlayerMarketTransactionId(): number {
  return getSliceNumber("nextPlayerMarketTransactionId");
}
export function setNextPlayerMarketTransactionId(id: number): void {
  setSliceNumber("nextPlayerMarketTransactionId", id);
}

/** Merchant organizations owned by the economy extension. */
export function getMerchantOrganizations(): MerchantOrganization[] {
  return getSliceArray<MerchantOrganization>("merchantOrganizations");
}
export function setMerchantOrganizations(organizations: readonly MerchantOrganization[]): void {
  setSliceArray("merchantOrganizations", organizations);
}

/** Economic owners of completed merchant hulls; Shipbuilding keeps their physical state. */
export function getMerchantVesselOwnerships(): MerchantVesselOwnership[] {
  return getSliceArray<MerchantVesselOwnership>("merchantVesselOwnerships");
}
export function setMerchantVesselOwnerships(ownerships: readonly MerchantVesselOwnership[]): void {
  setSliceArray("merchantVesselOwnerships", ownerships);
}

/** State-funded strategic procurement orders owned by the economy extension. */
export function getStrategicProcurementOrders(): ProcurementOrder[] {
  return getSliceArray<ProcurementOrder>("strategicProcurementOrders");
}
export function setStrategicProcurementOrders(orders: readonly ProcurementOrder[]): void {
  setSliceArray("strategicProcurementOrders", orders);
}

/** Per-state strategic goods policies owned by the economy extension. */
export function getStrategicGoodsPolicies(): StrategicGoodsPolicy[] {
  return getSliceArray<StrategicGoodsPolicy>("strategicGoodsPolicies");
}
export function setStrategicGoodsPolicies(policies: readonly StrategicGoodsPolicy[]): void {
  setSliceArray("strategicGoodsPolicies", policies);
}

export function getNextStrategicProcurementOrderId(): number {
  return getSliceNumber("nextStrategicProcurementOrderId");
}
export function setNextStrategicProcurementOrderId(id: number): void {
  setSliceNumber("nextStrategicProcurementOrderId", id);
}

/** Strategic labor markets owned by the economy extension. */
export function getStrategicLaborMarkets(): LaborMarket[] {
  return getSliceArray<LaborMarket>("strategicLaborMarkets");
}
export function setStrategicLaborMarkets(markets: readonly LaborMarket[]): void {
  setSliceArray("strategicLaborMarkets", markets);
}

/** Static geological groundwork for future mine operations. */
export function getMineralGeologicalProvinces(): MineralGeologicalProvince[] {
  return getSliceArray<MineralGeologicalProvince>("mineralGeologicalProvinces");
}
export function setMineralGeologicalProvinces(provinces: readonly MineralGeologicalProvince[]): void {
  setSliceArray("mineralGeologicalProvinces", provinces);
}
export function getMineralDistricts(): MineralDistrict[] {
  return getSliceArray<MineralDistrict>("mineralDistricts");
}
export function setMineralDistricts(districts: readonly MineralDistrict[]): void {
  setSliceArray("mineralDistricts", districts);
}
export function getMineralDeposits(): MineralDeposit[] {
  return getSliceArray<MineralDeposit>("mineralDeposits");
}
export function setMineralDeposits(deposits: readonly MineralDeposit[]): void {
  setSliceArray("mineralDeposits", deposits);
}
export function getMineOperations(): MineOperation[] {
  return getSliceArray<MineOperation>("mineOperations");
}
export function setMineOperations(operations: readonly MineOperation[]): void {
  setSliceArray("mineOperations", operations);
}

/** Burg-anchored quarry sites (docs/plan/urban-construction-industry.md §3.2, Phase 1). */
export function getQuarryOperations(): QuarryOperation[] {
  return getSliceArray<QuarryOperation>("quarryOperations");
}
export function setQuarryOperations(operations: readonly QuarryOperation[]): void {
  setSliceArray("quarryOperations", operations);
}

/** State-owned salt sources and their latest monthly allocation records. */
export function getSaltworks(): Saltworks[] {
  return getSliceArray<Saltworks>("saltworks");
}
export function setSaltworks(operations: readonly Saltworks[]): void {
  setSliceArray("saltworks", operations);
}
export function getSaltShipments(): SaltShipment[] {
  return getSliceArray<SaltShipment>("saltShipments");
}
export function setSaltShipments(shipments: readonly SaltShipment[]): void {
  setSliceArray("saltShipments", shipments);
}
export function getStateSaltLedgers(): StateSaltLedger[] {
  return getSliceArray<StateSaltLedger>("stateSaltLedgers");
}
export function setStateSaltLedgers(ledgers: readonly StateSaltLedger[]): void {
  setSliceArray("stateSaltLedgers", ledgers);
}

/** Burg-anchored construction industry (docs/plan/urban-construction-industry.md §3.3, Phase 2). */
export function getConstructionOperations(): ConstructionOperation[] {
  return getSliceArray<ConstructionOperation>("constructionOperations");
}
export function setConstructionOperations(operations: readonly ConstructionOperation[]): void {
  setSliceArray("constructionOperations", operations);
}

/** Commercial short-stay lodging stock. It is intentionally separate from permanent dwellings. */
export function getInnFacilities(): InnFacility[] {
  return getSliceArray<InnFacility>("innFacilities");
}
export function setInnFacilities(facilities: readonly InnFacility[]): void {
  setSliceArray("innFacilities", facilities);
}

/** Pending non-dwelling inn construction work orders. */
export function getInnConstructionOrders(): InnConstructionOrder[] {
  return getSliceArray<InnConstructionOrder>("innConstructionOrders");
}
export function setInnConstructionOrders(orders: readonly InnConstructionOrder[]): void {
  setSliceArray("innConstructionOrders", orders);
}

/** Short-stay inn occupancy; separate from burg population and permanent housing. */
export function getInnStayLedgers(): InnStayLedger[] {
  return getSliceArray<InnStayLedger>("innStayLedgers");
}
export function setInnStayLedgers(ledgers: readonly InnStayLedger[]): void {
  setSliceArray("innStayLedgers", ledgers);
}

/** Global visual language for lodging. It is stored in Economy's extension slice, never on Burg. */
export function getLodgingStyle(): LodgingStyle {
  const value = getEconomySlice()?.lodgingStyle ?? getLegacyPackFields().lodgingStyle;
  return typeof value === "string" && (LODGING_STYLES as readonly string[]).includes(value)
    ? (value as LodgingStyle)
    : "medievalCentralEuropean";
}
export function setLodgingStyle(style: LodgingStyle): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.lodgingStyle = style;
    return;
  }
  getLegacyPackFields().lodgingStyle = style;
}

/** Once-per-simulation-year guard for InnFacilities.settleAnnual(). */
export function getInnFacilitiesLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.innFacilitiesLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _innFacilitiesLastSettledYearFallback;
}
export function setInnFacilitiesLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.innFacilitiesLastSettledYear = year;
    return;
  }
  _innFacilitiesLastSettledYearFallback = year;
}

/** Burg water / sanitation infrastructure (docs/plan/urban-water-and-sanitation-system.md Phase 1). */
export function getUrbanWaterSystems(): UrbanWaterSystem[] {
  return getSliceArray<UrbanWaterSystem>("urbanWaterSystems");
}
export function setUrbanWaterSystems(systems: readonly UrbanWaterSystem[]): void {
  setSliceArray("urbanWaterSystems", systems);
}

/** Once-per-simulation-year guard for UrbanWater.settleAnnual(). */
export function getUrbanWaterLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.urbanWaterLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _urbanWaterLastSettledYearFallback;
}
export function setUrbanWaterLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.urbanWaterLastSettledYear = year;
    return;
  }
  _urbanWaterLastSettledYearFallback = year;
}

export function getSteamPumpTrials(): SteamPumpTrial[] {
  return getSliceArray<SteamPumpTrial>("steamPumpTrials");
}
export function setSteamPumpTrials(trials: readonly SteamPumpTrial[]): void {
  setSliceArray("steamPumpTrials", trials);
}
export function getSteamInstallations(): SteamInstallation[] {
  return getSliceArray<SteamInstallation>("steamInstallations");
}
export function setSteamInstallations(installations: readonly SteamInstallation[]): void {
  setSliceArray("steamInstallations", installations);
}
export function getRailwayLinks(): RailwayLink[] {
  return getSliceArray<RailwayLink>("railwayLinks");
}
export function setRailwayLinks(links: readonly RailwayLink[]): void {
  setSliceArray("railwayLinks", links);
}

export function getSteamInstallationsLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.steamInstallationsLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _steamInstallationsLastSettledYearFallback;
}
export function setSteamInstallationsLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.steamInstallationsLastSettledYear = year;
    return;
  }
  _steamInstallationsLastSettledYearFallback = year;
}

function yearFromSlice(field: string, fallback: number | null): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice[field];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return fallback;
}

function writeYearToSlice(field: string, year: number, assignFallback: (value: number) => void): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = year;
    return;
  }
  assignFallback(year);
}

export function getExperimentalWorkshops(): ExperimentalWorkshop[] {
  return getSliceArray<ExperimentalWorkshop>("experimentalWorkshops");
}
export function setExperimentalWorkshops(rows: readonly ExperimentalWorkshop[]): void {
  setSliceArray("experimentalWorkshops", rows);
}
export function getApothecaryWorkshops(): ApothecaryWorkshop[] {
  return getSliceArray<ApothecaryWorkshop>("apothecaryWorkshops");
}
export function setApothecaryWorkshops(rows: readonly ApothecaryWorkshop[]): void {
  setSliceArray("apothecaryWorkshops", rows);
}
export function getChemistryTrials(): ChemistryTrial[] {
  return getSliceArray<ChemistryTrial>("chemistryTrials");
}
export function setChemistryTrials(rows: readonly ChemistryTrial[]): void {
  setSliceArray("chemistryTrials", rows);
}
export function getHospitalInstallations(): HospitalInstallation[] {
  return getSliceArray<HospitalInstallation>("hospitalInstallations");
}
export function setHospitalInstallations(rows: readonly HospitalInstallation[]): void {
  setSliceArray("hospitalInstallations", rows);
}
export function getAcidPlants(): AcidPlant[] {
  return getSliceArray<AcidPlant>("acidPlants");
}
export function setAcidPlants(rows: readonly AcidPlant[]): void {
  setSliceArray("acidPlants", rows);
}
export function getPhosphateFertilizerPlants(): PhosphateFertilizerPlant[] {
  return getSliceArray<PhosphateFertilizerPlant>("phosphateFertilizerPlants");
}
export function setPhosphateFertilizerPlants(rows: readonly PhosphateFertilizerPlant[]): void {
  setSliceArray("phosphateFertilizerPlants", rows);
}
/** Same shape as getAcidPlants/getPhosphateFertilizerPlants. Design: docs/plan/chlorine-production-vertical-slice.md §3.6. */
export function getChlorinePlants(): ChlorinePlant[] {
  return getSliceArray<ChlorinePlant>("chlorinePlants");
}
export function setChlorinePlants(rows: readonly ChlorinePlant[]): void {
  setSliceArray("chlorinePlants", rows);
}
/** Same shape as getAcidPlants/getPhosphateFertilizerPlants. Design: docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.2. */
export function getSteelConverterPlants(): SteelConverterPlant[] {
  return getSliceArray<SteelConverterPlant>("steelConverterPlants");
}
export function setSteelConverterPlants(rows: readonly SteelConverterPlant[]): void {
  setSliceArray("steelConverterPlants", rows);
}
/** Same shape as getAcidPlants/getPhosphateFertilizerPlants. Design: docs/plan/synthetic-ammonia-vertical-slice.md §3.6. */
export function getSyntheticAmmoniaPlants(): SyntheticAmmoniaPlant[] {
  return getSliceArray<SyntheticAmmoniaPlant>("syntheticAmmoniaPlants");
}
export function setSyntheticAmmoniaPlants(rows: readonly SyntheticAmmoniaPlant[]): void {
  setSliceArray("syntheticAmmoniaPlants", rows);
}
/** Same shape as getAcidPlants/getSteelConverterPlants. Design: docs/plan/electric-power-and-telegraph.md §3.9. */
export function getPowerStations(): PowerStation[] {
  return getSliceArray<PowerStation>("powerStations");
}
export function setPowerStations(rows: readonly PowerStation[]): void {
  setSliceArray("powerStations", rows);
}
/** Same shape as getPowerStations. Design: docs/plan/electric-power-and-telegraph.md §3.9. */
export function getTelegraphLines(): TelegraphLine[] {
  return getSliceArray<TelegraphLine>("telegraphLines");
}
export function setTelegraphLines(rows: readonly TelegraphLine[]): void {
  setSliceArray("telegraphLines", rows);
}
/** Same shape as getPowerStations. Design: docs/plan/dam-flood-control-and-hydropower.md §3. */
export function getDamSites(): DamSite[] {
  return getSliceArray<DamSite>("damSites");
}
export function setDamSites(rows: readonly DamSite[]): void {
  setSliceArray("damSites", rows);
}
/** Same shape as getPowerStations. Design: docs/plan/dam-flood-control-and-hydropower.md §3. */
export function getDams(): Dam[] {
  return getSliceArray<Dam>("dams");
}
export function setDams(rows: readonly Dam[]): void {
  setSliceArray("dams", rows);
}
/** Same shape as getDamSites. Design: docs/plan/river-levee-and-flood-damage.md §3. */
export function getLeveeSites(): LeveeSite[] {
  return getSliceArray<LeveeSite>("leveeSites");
}
export function setLeveeSites(rows: readonly LeveeSite[]): void {
  setSliceArray("leveeSites", rows);
}
/** Same shape as getDams. Design: docs/plan/river-levee-and-flood-damage.md §3. */
export function getLevees(): Levee[] {
  return getSliceArray<Levee>("levees");
}
export function setLevees(rows: readonly Levee[]): void {
  setSliceArray("levees", rows);
}
/** Same shape as getPowerStations. Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7. */
export function getElectrolysisPlants(): ElectrolysisPlant[] {
  return getSliceArray<ElectrolysisPlant>("electrolysisPlants");
}
export function setElectrolysisPlants(rows: readonly ElectrolysisPlant[]): void {
  setSliceArray("electrolysisPlants", rows);
}
/** Same shape as getElectrolysisPlants — a third supply route for Chlorine/Caustic Soda.
 *  Design: docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7. */
export function getChlorAlkaliPlants(): ChlorAlkaliPlant[] {
  return getSliceArray<ChlorAlkaliPlant>("chlorAlkaliPlants");
}
export function setChlorAlkaliPlants(rows: readonly ChlorAlkaliPlant[]): void {
  setSliceArray("chlorAlkaliPlants", rows);
}
/** Same shape as getPhosphateFertilizerPlants. Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.7. */
export function getMercuryPlants(): MercuryPlant[] {
  return getSliceArray<MercuryPlant>("mercuryPlants");
}
export function setMercuryPlants(rows: readonly MercuryPlant[]): void {
  setSliceArray("mercuryPlants", rows);
}
/**
 * Same shape as getMercuryPlants — the first plant that yields two Goods (Kerosene + Lubricating
 * Oil) from one input. Design: docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.7.
 */
export function getOilRefineryPlants(): OilRefineryPlant[] {
  return getSliceArray<OilRefineryPlant>("oilRefineryPlants");
}
export function setOilRefineryPlants(rows: readonly OilRefineryPlant[]): void {
  setSliceArray("oilRefineryPlants", rows);
}
export function getChemMedPracticeRecords(): ChemMedPracticeRecord[] {
  return getSliceArray<ChemMedPracticeRecord>("chemMedPracticeRecords");
}
export function setChemMedPracticeRecords(rows: readonly ChemMedPracticeRecord[]): void {
  setSliceArray("chemMedPracticeRecords", rows);
}
export function getMedicalCareReliefByBurg(): MedicalCareReliefRow[] {
  return getSliceArray<MedicalCareReliefRow>("medicalCareReliefByBurg");
}
export function setMedicalCareReliefByBurg(rows: readonly MedicalCareReliefRow[]): void {
  setSliceArray("medicalCareReliefByBurg", rows);
}

export function getApothecaryWorkshopsLastSettledYear(): number | null {
  return yearFromSlice("apothecaryWorkshopsLastSettledYear", _apothecaryWorkshopsLastSettledYearFallback);
}
export function setApothecaryWorkshopsLastSettledYear(year: number): void {
  writeYearToSlice("apothecaryWorkshopsLastSettledYear", year, value => {
    _apothecaryWorkshopsLastSettledYearFallback = value;
  });
}
export function getExperimentalWorkshopsLastSettledYear(): number | null {
  return yearFromSlice("experimentalWorkshopsLastSettledYear", _experimentalWorkshopsLastSettledYearFallback);
}
export function setExperimentalWorkshopsLastSettledYear(year: number): void {
  writeYearToSlice("experimentalWorkshopsLastSettledYear", year, value => {
    _experimentalWorkshopsLastSettledYearFallback = value;
  });
}
export function getHospitalInstallationsLastSettledYear(): number | null {
  return yearFromSlice("hospitalInstallationsLastSettledYear", _hospitalInstallationsLastSettledYearFallback);
}
export function setHospitalInstallationsLastSettledYear(year: number): void {
  writeYearToSlice("hospitalInstallationsLastSettledYear", year, value => {
    _hospitalInstallationsLastSettledYearFallback = value;
  });
}
export function getAcidPlantsLastSettledYear(): number | null {
  return yearFromSlice("acidPlantsLastSettledYear", _acidPlantsLastSettledYearFallback);
}
export function setAcidPlantsLastSettledYear(year: number): void {
  writeYearToSlice("acidPlantsLastSettledYear", year, value => {
    _acidPlantsLastSettledYearFallback = value;
  });
}
export function getPhosphateFertilizerPlantsLastSettledYear(): number | null {
  return yearFromSlice("phosphateFertilizerPlantsLastSettledYear", _phosphateFertilizerPlantsLastSettledYearFallback);
}
export function setPhosphateFertilizerPlantsLastSettledYear(year: number): void {
  writeYearToSlice("phosphateFertilizerPlantsLastSettledYear", year, value => {
    _phosphateFertilizerPlantsLastSettledYearFallback = value;
  });
}
/** Guards ChlorinePlants.settleAnnual(), same shape as getAcidPlantsLastSettledYear. */
export function getChlorinePlantsLastSettledYear(): number | null {
  return yearFromSlice("chlorinePlantsLastSettledYear", _chlorinePlantsLastSettledYearFallback);
}
export function setChlorinePlantsLastSettledYear(year: number): void {
  writeYearToSlice("chlorinePlantsLastSettledYear", year, value => {
    _chlorinePlantsLastSettledYearFallback = value;
  });
}
/** Guards SteelConverters.settleAnnual(), same shape as getAcidPlantsLastSettledYear. */
export function getSteelConverterPlantsLastSettledYear(): number | null {
  return yearFromSlice("steelConverterPlantsLastSettledYear", _steelConverterPlantsLastSettledYearFallback);
}
export function setSteelConverterPlantsLastSettledYear(year: number): void {
  writeYearToSlice("steelConverterPlantsLastSettledYear", year, value => {
    _steelConverterPlantsLastSettledYearFallback = value;
  });
}
/** Guards SyntheticAmmoniaPlants.settleAnnual(), same shape as getPhosphateFertilizerPlantsLastSettledYear. */
export function getSyntheticAmmoniaPlantsLastSettledYear(): number | null {
  return yearFromSlice("syntheticAmmoniaPlantsLastSettledYear", _syntheticAmmoniaPlantsLastSettledYearFallback);
}
export function setSyntheticAmmoniaPlantsLastSettledYear(year: number): void {
  writeYearToSlice("syntheticAmmoniaPlantsLastSettledYear", year, value => {
    _syntheticAmmoniaPlantsLastSettledYearFallback = value;
  });
}
/** Guards FertilizerInvestment.settleAnnual(), same shape as getAgTechLastSettledYear. */
export function getFertilizerInvestmentLastSettledYear(): number | null {
  return yearFromSlice("fertilizerInvestmentLastSettledYear", _fertilizerInvestmentLastSettledYearFallback);
}
export function setFertilizerInvestmentLastSettledYear(year: number): void {
  writeYearToSlice("fertilizerInvestmentLastSettledYear", year, value => {
    _fertilizerInvestmentLastSettledYearFallback = value;
  });
}
/** Guards NitrogenFertilizerInvestment.settleAnnual(), same shape as getFertilizerInvestmentLastSettledYear. */
export function getNitrogenFertilizerInvestmentLastSettledYear(): number | null {
  return yearFromSlice(
    "nitrogenFertilizerInvestmentLastSettledYear",
    _nitrogenFertilizerInvestmentLastSettledYearFallback
  );
}
export function setNitrogenFertilizerInvestmentLastSettledYear(year: number): void {
  writeYearToSlice("nitrogenFertilizerInvestmentLastSettledYear", year, value => {
    _nitrogenFertilizerInvestmentLastSettledYearFallback = value;
  });
}
/** Guards PowerStations.settleAnnual(), same shape as getSteelConverterPlantsLastSettledYear. */
export function getPowerStationsLastSettledYear(): number | null {
  return yearFromSlice("powerStationsLastSettledYear", _powerStationsLastSettledYearFallback);
}
export function setPowerStationsLastSettledYear(year: number): void {
  writeYearToSlice("powerStationsLastSettledYear", year, value => {
    _powerStationsLastSettledYearFallback = value;
  });
}
/** Guards TelegraphLines.settleAnnual(), same shape as getPowerStationsLastSettledYear. */
export function getTelegraphLinesLastSettledYear(): number | null {
  return yearFromSlice("telegraphLinesLastSettledYear", _telegraphLinesLastSettledYearFallback);
}
export function setTelegraphLinesLastSettledYear(year: number): void {
  writeYearToSlice("telegraphLinesLastSettledYear", year, value => {
    _telegraphLinesLastSettledYearFallback = value;
  });
}
/**
 * Guards ElectrolysisPlants.settleAnnual(), same shape as getTelegraphLinesLastSettledYear.
 * Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7.
 */
export function getElectrolysisPlantsLastSettledYear(): number | null {
  return yearFromSlice("electrolysisPlantsLastSettledYear", _electrolysisPlantsLastSettledYearFallback);
}
export function setElectrolysisPlantsLastSettledYear(year: number): void {
  writeYearToSlice("electrolysisPlantsLastSettledYear", year, value => {
    _electrolysisPlantsLastSettledYearFallback = value;
  });
}
/**
 * Guards ChlorAlkaliPlants.settleAnnual(), same shape as getElectrolysisPlantsLastSettledYear.
 * Design: docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7.
 */
export function getChlorAlkaliPlantsLastSettledYear(): number | null {
  return yearFromSlice("chlorAlkaliPlantsLastSettledYear", _chlorAlkaliPlantsLastSettledYearFallback);
}
export function setChlorAlkaliPlantsLastSettledYear(year: number): void {
  writeYearToSlice("chlorAlkaliPlantsLastSettledYear", year, value => {
    _chlorAlkaliPlantsLastSettledYearFallback = value;
  });
}
/**
 * Guards MercuryPlants.settleAnnual(), same shape as getChlorAlkaliPlantsLastSettledYear.
 * Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.7.
 */
export function getMercuryPlantsLastSettledYear(): number | null {
  return yearFromSlice("mercuryPlantsLastSettledYear", _mercuryPlantsLastSettledYearFallback);
}
export function setMercuryPlantsLastSettledYear(year: number): void {
  writeYearToSlice("mercuryPlantsLastSettledYear", year, value => {
    _mercuryPlantsLastSettledYearFallback = value;
  });
}
/**
 * Guards OilRefineryPlants.settleAnnual(), same shape as getMercuryPlantsLastSettledYear.
 * Design: docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.7.
 */
export function getOilRefineryPlantsLastSettledYear(): number | null {
  return yearFromSlice("oilRefineryPlantsLastSettledYear", _oilRefineryPlantsLastSettledYearFallback);
}
export function setOilRefineryPlantsLastSettledYear(year: number): void {
  writeYearToSlice("oilRefineryPlantsLastSettledYear", year, value => {
    _oilRefineryPlantsLastSettledYearFallback = value;
  });
}
/** Guards PowerGridInvestment.settleAnnual(), same shape as getFertilizerInvestmentLastSettledYear. */
export function getPowerGridInvestmentLastSettledYear(): number | null {
  return yearFromSlice("powerGridInvestmentLastSettledYear", _powerGridInvestmentLastSettledYearFallback);
}
export function setPowerGridInvestmentLastSettledYear(year: number): void {
  writeYearToSlice("powerGridInvestmentLastSettledYear", year, value => {
    _powerGridInvestmentLastSettledYearFallback = value;
  });
}
/** Guards Dams.settleAnnual(). Design: docs/plan/dam-flood-control-and-hydropower.md §3. */
export function getDamsLastSettledYear(): number | null {
  return yearFromSlice("damsLastSettledYear", _damsLastSettledYearFallback);
}
export function setDamsLastSettledYear(year: number): void {
  writeYearToSlice("damsLastSettledYear", year, value => {
    _damsLastSettledYearFallback = value;
  });
}
/** Guards Levees.settleAnnual(). Design: docs/plan/river-levee-and-flood-damage.md §3. */
export function getLeveesLastSettledYear(): number | null {
  return yearFromSlice("leveesLastSettledYear", _leveesLastSettledYearFallback);
}
export function setLeveesLastSettledYear(year: number): void {
  writeYearToSlice("leveesLastSettledYear", year, value => {
    _leveesLastSettledYearFallback = value;
  });
}
/** Guards ClimateDisasters.settleAnnual(). Design: docs/plan/climate-disaster-drought.md §3.1. */
export function getClimateDisastersLastSettledYear(): number | null {
  return yearFromSlice("climateDisastersLastSettledYear", _climateDisastersLastSettledYearFallback);
}
export function setClimateDisastersLastSettledYear(year: number): void {
  writeYearToSlice("climateDisastersLastSettledYear", year, value => {
    _climateDisastersLastSettledYearFallback = value;
  });
}

/**
 * Once-per-simulation-year guard for FaunaPopulation.updateAnnualFaunaCohorts()
 * (docs/plan/biome-goods-producer-ecosystem.md §4, Phase 2). Independent of
 * getSettlementDevelopmentLastEvaluatedYear so the (heavier, togglable) fauna cohort update can be
 * skipped without disturbing agriculture's own annual cadence.
 */
export function getFaunaPopulationLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.faunaPopulationLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _faunaPopulationLastSettledYearFallback;
}
export function setFaunaPopulationLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.faunaPopulationLastSettledYear = year;
    return;
  }
  _faunaPopulationLastSettledYearFallback = year;
}

/** Pending construction hire applications (Phase 2 lag). */
export function getConstructionHireApplications(): ConstructionHireApplication[] {
  return getSliceArray<ConstructionHireApplication>("constructionHireApplications");
}
export function setConstructionHireApplications(apps: readonly ConstructionHireApplication[]): void {
  setSliceArray("constructionHireApplications", apps);
}

/** Named characters on construction seats (Phase 3). */
export function getConstructionNamedSeats(): ConstructionNamedSeat[] {
  return getSliceArray<ConstructionNamedSeat>("constructionNamedSeats");
}
export function setConstructionNamedSeats(seats: readonly ConstructionNamedSeat[]): void {
  setSliceArray("constructionNamedSeats", seats);
}

/** Threat cull / pest job postings (docs/plan/player-threat-cull-jobs.md PR-2). */
export function getCullJobPostings(): CullJobPosting[] {
  return getSliceArray<CullJobPosting>("cullJobPostings");
}
export function setCullJobPostings(posts: readonly CullJobPosting[]): void {
  setSliceArray("cullJobPostings", posts);
}

export function getCullHireApplications(): CullHireApplication[] {
  return getSliceArray<CullHireApplication>("cullHireApplications");
}
export function setCullHireApplications(apps: readonly CullHireApplication[]): void {
  setSliceArray("cullHireApplications", apps);
}

export function getCullActiveContracts(): CullActiveContract[] {
  return getSliceArray<CullActiveContract>("cullActiveContracts");
}
export function setCullActiveContracts(contracts: readonly CullActiveContract[]): void {
  setSliceArray("cullActiveContracts", contracts);
}

export function getCullCooldowns(): CullCooldowns {
  const slice = getEconomySlice();
  const value = slice ? slice.cullCooldowns : getLegacyPackFields().cullCooldowns;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as CullCooldowns;
  }
  return {};
}
export function setCullCooldowns(cooldowns: CullCooldowns): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.cullCooldowns = cooldowns;
    return;
  }
  getLegacyPackFields().cullCooldowns = cooldowns;
}

/** Escort (護衛) job board — all culture sets. */
export function getEscortJobPostings(): EscortJobPosting[] {
  return getSliceArray<EscortJobPosting>("escortJobPostings");
}
export function setEscortJobPostings(posts: readonly EscortJobPosting[]): void {
  setSliceArray("escortJobPostings", posts);
}

export function getEscortHireApplications(): EscortHireApplication[] {
  return getSliceArray<EscortHireApplication>("escortHireApplications");
}
export function setEscortHireApplications(apps: readonly EscortHireApplication[]): void {
  setSliceArray("escortHireApplications", apps);
}

export function getEscortActiveContracts(): EscortActiveContract[] {
  return getSliceArray<EscortActiveContract>("escortActiveContracts");
}
export function setEscortActiveContracts(contracts: readonly EscortActiveContract[]): void {
  setSliceArray("escortActiveContracts", contracts);
}

export function getEscortCooldowns(): EscortCooldowns {
  const slice = getEconomySlice();
  const value = slice ? slice.escortCooldowns : getLegacyPackFields().escortCooldowns;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as EscortCooldowns;
  }
  return {};
}
export function setEscortCooldowns(cooldowns: EscortCooldowns): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.escortCooldowns = cooldowns;
    return;
  }
  getLegacyPackFields().escortCooldowns = cooldowns;
}

/** Player technology-bias SoT (docs/plan/player-character-technology-bias.md). Derived contributions are not persisted. */
export function getResearchHireApplications(): ResearchHireApplication[] {
  return getSliceArray<ResearchHireApplication>("researchHireApplications");
}
export function setResearchHireApplications(apps: readonly ResearchHireApplication[]): void {
  setSliceArray("researchHireApplications", apps);
}

export function getResearchNamedSeats(): ResearchNamedSeat[] {
  return getSliceArray<ResearchNamedSeat>("researchNamedSeats");
}
export function setResearchNamedSeats(seats: readonly ResearchNamedSeat[]): void {
  setSliceArray("researchNamedSeats", seats);
}

export function getResearchInstructMissions(): TechnologyInstructMission[] {
  return getSliceArray<TechnologyInstructMission>("researchInstructMissions");
}
export function setResearchInstructMissions(missions: readonly TechnologyInstructMission[]): void {
  setSliceArray("researchInstructMissions", missions);
}

export function getInstructionResidues(): InstructionResidue[] {
  return getSliceArray<InstructionResidue>("instructionResidues");
}
export function setInstructionResidues(residues: readonly InstructionResidue[]): void {
  setSliceArray("instructionResidues", residues);
}

export function getTechnologyHints(): TechnologyHint[] {
  return getSliceArray<TechnologyHint>("technologyHints");
}
export function setTechnologyHints(hints: readonly TechnologyHint[]): void {
  setSliceArray("technologyHints", hints);
}

export function getPatronageDeposits(): PatronageDeposit[] {
  return getSliceArray<PatronageDeposit>("patronageDeposits");
}
export function setPatronageDeposits(deposits: readonly PatronageDeposit[]): void {
  setSliceArray("patronageDeposits", deposits);
}

/** Urban pregnancy pipeline stock (docs/plan/urban-housing-system.md PR-P1). */
export function getUrbanPregnancy(): UrbanPregnancyRecord[] {
  return getSliceArray<UrbanPregnancyRecord>("urbanPregnancy");
}
export function setUrbanPregnancy(records: readonly UrbanPregnancyRecord[]): void {
  setSliceArray("urbanPregnancy", records);
}

/**
 * Burg-anchored volcanic works sites, yielding Volcanic Ash/Sulfur/Obsidian from one shared
 * workforce (docs/plan/urban-construction-industry.md §3.4, docs/plan/volcanic-biome-goods.md §3.3).
 */
export function getVolcanicOperations(): VolcanicOperation[] {
  return getSliceArray<VolcanicOperation>("volcanicOperations");
}
export function setVolcanicOperations(operations: readonly VolcanicOperation[]): void {
  setSliceArray("volcanicOperations", operations);
}
export function getSmelterOperations(): SmelterOperation[] {
  return getSliceArray<SmelterOperation>("smelterOperations");
}
export function setSmelterOperations(operations: readonly SmelterOperation[]): void {
  setSliceArray("smelterOperations", operations);
}

/** Burg-scoped guild technique stocks, one entry per (burgId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 1). */
export function getGuildKnowledgeStocks(): GuildKnowledgeStock[] {
  return getSliceArray<GuildKnowledgeStock>("guildKnowledgeStocks");
}
export function setGuildKnowledgeStocks(stocks: readonly GuildKnowledgeStock[]): void {
  setSliceArray("guildKnowledgeStocks", stocks);
}

/** Current-cycle material, sales, profit, and master-wage records for metallurgy workshops. */
export function getSmithingWorkshopLedgers(): SmithingWorkshopLedger[] {
  return getSliceArray<SmithingWorkshopLedger>("smithingWorkshopLedgers");
}
export function setSmithingWorkshopLedgers(ledgers: readonly SmithingWorkshopLedger[]): void {
  setSliceArray("smithingWorkshopLedgers", ledgers);
}

/** Demand-only Metallurg planning state. Fulfillment remains in the generic production flow for now. */
export function getMetallurgAssetLedgers(): MetallurgAssetLedger[] {
  return getSliceArray<MetallurgAssetLedger>("metallurgAssetLedgers");
}
export function setMetallurgAssetLedgers(ledgers: readonly MetallurgAssetLedger[]): void {
  setSliceArray("metallurgAssetLedgers", ledgers);
}
export function getMetallurgWorkOrders(): MetallurgWorkOrder[] {
  return getSliceArray<MetallurgWorkOrder>("metallurgWorkOrders");
}
export function setMetallurgWorkOrders(orders: readonly MetallurgWorkOrder[]): void {
  setSliceArray("metallurgWorkOrders", orders);
}
export function getMetallurgMaterialForecasts(): MetallurgMaterialForecast[] {
  return getSliceArray<MetallurgMaterialForecast>("metallurgMaterialForecasts");
}
export function setMetallurgMaterialForecasts(forecasts: readonly MetallurgMaterialForecast[]): void {
  setSliceArray("metallurgMaterialForecasts", forecasts);
}
export function getMetallurgNextWorkOrderId(): number {
  return getSliceNumber("nextMetallurgWorkOrderId");
}
export function setMetallurgNextWorkOrderId(id: number): void {
  setSliceNumber("nextMetallurgWorkOrderId", id);
}
/** Version marker for one-time Metallurg work-queue migrations in persisted saves. */
export function getMetallurgToolsUnitScaleVersion(): number {
  return getSliceNumber("metallurgToolsUnitScaleVersion");
}
export function setMetallurgToolsUnitScaleVersion(version: number): void {
  setSliceNumber("metallurgToolsUnitScaleVersion", version);
}

/** Formal guild halls, distinct from practitioner-driven GuildKnowledgeStock entries. */
export function getGuildChapters(): GuildChapter[] {
  return getSliceArray<GuildChapter>("guildChapters");
}
export function setGuildChapters(chapters: readonly GuildChapter[]): void {
  setSliceArray("guildChapters", chapters);
}

/** Practical skills for the small set of Economy-owned master/apprentice characters. */
export function getIndividualSkills(): CharacterDomainSkill[] {
  return getSliceArray<CharacterDomainSkill>("individualSkills");
}
export function setIndividualSkills(skills: readonly CharacterDomainSkill[]): void {
  setSliceArray("individualSkills", skills);
}

/** Burg-scoped academy/chancery technique stocks, one entry per (burgId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 3). */
export function getAcademyKnowledgeStocks(): AcademyKnowledgeStock[] {
  return getSliceArray<AcademyKnowledgeStock>("academyKnowledgeStocks");
}
export function setAcademyKnowledgeStocks(stocks: readonly AcademyKnowledgeStock[]): void {
  setSliceArray("academyKnowledgeStocks", stocks);
}

/** One State's royal-patronage library project, at most one active (non-"ruined") per State (docs/plan/great-library.md Persistence). */
export function getGreatLibraryProjects(): GreatLibraryProject[] {
  return getSliceArray<GreatLibraryProject>("greatLibraryProjects");
}
export function setGreatLibraryProjects(projects: readonly GreatLibraryProject[]): void {
  setSliceArray("greatLibraryProjects", projects);
}

/** Once-per-year guard for GreatLibrary.settleAnnual() (docs/plan/great-library.md 年次フロー). */
export function getGreatLibraryLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.greatLibraryLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _greatLibraryLastSettledYearFallback;
}
export function setGreatLibraryLastSettledYear(year: number | null): void {
  const slice = getEconomySlice();
  if (slice) {
    if (year === null) delete slice.greatLibraryLastSettledYear;
    else slice.greatLibraryLastSettledYear = year;
    return;
  }
  _greatLibraryLastSettledYearFallback = year;
}

/** Monotonic id allocator for new GreatLibraryProject records; starts at 1 (docs/plan/great-library.md Persistence). */
export function getGreatLibraryNextId(): number {
  const value = getSliceNumber("greatLibraryNextId");
  return value > 0 ? value : 1;
}
export function setGreatLibraryNextId(id: number): void {
  setSliceNumber("greatLibraryNextId", id);
}

/** State-scoped national-secret technique stocks, one entry per (stateId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 4). */
export function getStateSecretStocks(): StateSecretStock[] {
  return getSliceArray<StateSecretStock>("stateSecretStocks");
}
export function setStateSecretStocks(stocks: readonly StateSecretStock[]): void {
  setSliceArray("stateSecretStocks", stocks);
}

/** State-scoped standing-army training stocks, one entry per (stateId, domain) (docs/plan/knowledge-guild-system.md §6, §9 Phase 5). */
export function getMartialDisciplineStocks(): MartialDisciplineStock[] {
  return getSliceArray<MartialDisciplineStock>("martialDisciplineStocks");
}
export function setMartialDisciplineStocks(stocks: readonly MartialDisciplineStock[]): void {
  setSliceArray("martialDisciplineStocks", stocks);
}
export function getAdministrationEmployment(): AdministrationEmploymentRecord[] {
  return getSliceArray<AdministrationEmploymentRecord>("administrationEmployment");
}
export function setAdministrationEmployment(records: readonly AdministrationEmploymentRecord[]): void {
  setSliceArray("administrationEmployment", records);
}
export function getBasicEmploymentSummary(): BasicEmploymentSummaryRecord[] {
  return getSliceArray<BasicEmploymentSummaryRecord>("basicEmploymentSummary");
}
export function setBasicEmploymentSummary(records: readonly BasicEmploymentSummaryRecord[]): void {
  setSliceArray("basicEmploymentSummary", records);
}
export function getCraftEmploymentRecords(): CraftEmploymentRecord[] {
  return getSliceArray<CraftEmploymentRecord>("craftEmployment");
}
export function setCraftEmploymentRecords(records: readonly CraftEmploymentRecord[]): void {
  setSliceArray("craftEmployment", records);
}
/** Domain-split counterpart of `craftEmployment` (docs/plan/knowledge-guild-system.md §9 Phase 2). */
export function getCraftDomainEmploymentRecords(): CraftDomainEmploymentRecord[] {
  return getSliceArray<CraftDomainEmploymentRecord>("craftDomainEmployment");
}
export function setCraftDomainEmploymentRecords(records: readonly CraftDomainEmploymentRecord[]): void {
  setSliceArray("craftDomainEmployment", records);
}
export function getMintLedgers(): MintLedger[] {
  return getSliceArray<MintLedger>("mintLedgers");
}
export function setMintLedgers(ledgers: readonly MintLedger[]): void {
  setSliceArray("mintLedgers", ledgers);
}
/** Per-state firepower demand and the market stock consumed to satisfy it. */
export function getMilitaryResourceLedgers(): MilitaryResourceLedger[] {
  return getSliceArray<MilitaryResourceLedger>("militaryResourceLedgers");
}
export function setMilitaryResourceLedgers(ledgers: readonly MilitaryResourceLedger[]): void {
  setSliceArray("militaryResourceLedgers", ledgers);
}
/** Per-state caravan-security budgets owned by the economy extension. */
export function getTradeSecurityLedgers(): TradeSecurityLedger[] {
  return getSliceArray<TradeSecurityLedger>("tradeSecurityLedgers");
}
export function setTradeSecurityLedgers(ledgers: readonly TradeSecurityLedger[]): void {
  setSliceArray("tradeSecurityLedgers", ledgers);
}

/** Per-cell dominant good id, owned by the economy extension. */
export function getGoodCellColumn(): Uint16Array {
  return getSliceCellColumn("good");
}
export function setGoodCellColumn(column: Uint16Array): void {
  setSliceCellColumn("good", column);
}

/** Per-cell market id, owned by the economy extension. */
export function getMarketCellColumn(): Uint16Array {
  return getSliceCellColumn("market");
}
export function setMarketCellColumn(column: Uint16Array): void {
  setSliceCellColumn("market", column);
}

/**
 * Sparse "marketId:collectionBurgId:goodId" → banked-catch accumulator, owned by the
 * economy slice. Used by liveAnimalCatch.ts to turn liveAnimal-tagged goods' continuous
 * rural production rate into lumpy integer catches instead of a fractional trickle.
 * Returns null when the extension API / simulation context is not available (unit tests
 * may use a module fallback in liveAnimalCatch.ts).
 */
export function getOrCreateLiveAnimalCatchTable(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.liveAnimalCatchAccumulators;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.liveAnimalCatchAccumulators = table;
  return table;
}

/**
 * Sparse "cellId:speciesKey" → {young,breeding,old} headcount, owned by the economy slice
 * (docs/plan/biome-goods-producer-ecosystem.md §4, Phase 2). speciesKey is "Game" for the wild
 * stock or a liveAnimal Good's name for domesticated stock. Returns null when the extension API /
 * simulation context is not available (unit tests may treat this as "fauna model inactive").
 */
export function getOrCreateFaunaStockTable(): Record<string, FaunaCohorts> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.faunaStock;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, FaunaCohorts>;
  }
  const table: Record<string, FaunaCohorts> = {};
  slice.faunaStock = table;
  return table;
}

/**
 * Cell-local preserved-food reserves, expressed as raw-fresh equivalents. Fresh food never enters
 * the Market pool; only preservation output above this reserve is allowed into normal trade.
 */
export function getOrCreateCellFoodReserves(): Record<number, CellFoodReserve> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.cellFoodReserves;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, CellFoodReserve>;
  }
  const reserves: Record<number, CellFoodReserve> = {};
  slice.cellFoodReserves = reserves;
  return reserves;
}

/**
 * Sparse "marketId:goodId" → last up-to-4 quarterly consumed-stock samples, for non-food
 * liveAnimal goods' demand-absorption carrying-capacity cap (§4.5). Paired with
 * getOrCreateNonFoodFaunaDemandSnapshot(), which holds the stock level as of the last quarter
 * boundary, and getOrCreateNonFoodFaunaProductionSnapshot(), which holds the cumulative-production
 * total as of the same boundary — together they let the next quarter's sample be derived as
 * "produced this quarter + stock delta" rather than a raw stock delta alone (see that function's
 * doc-comment for why the raw-delta-only version silently reports ~0 demand for a chronically
 * undersupplied good).
 */
export function getOrCreateNonFoodFaunaDemandHistory(): Record<string, number[]> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.nonFoodFaunaDemandHistory;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number[]>;
  }
  const table: Record<string, number[]> = {};
  slice.nonFoodFaunaDemandHistory = table;
  return table;
}

export function getOrCreateNonFoodFaunaDemandSnapshot(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.nonFoodFaunaDemandSnapshot;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.nonFoodFaunaDemandSnapshot = table;
  return table;
}

/**
 * Snapshot of getOrCreateMarketGoodProductionTotals() as of the last quarter boundary, for the
 * same "marketId:goodId" key as getOrCreateNonFoodFaunaDemandSnapshot(). Found 2026-08-08: a good
 * whose market supply chronically can't keep up with demand (e.g. Sheep, entirely bought up as
 * Wool's `recipes: [{ Sheep: 1 }]` ingredient the moment it lands) sits at near-zero stock at
 * EVERY quarter boundary even while huge volumes are actually changing hands — `previousStock -
 * currentStock` alone reads that as "nobody wants it" (both snapshots are already ~0, so the delta
 * is ~0 too) and the demand-absorption cap crashes toward 0 exactly as if it really were an
 * unsellable surplus, wiping the species out within a year (§4.3's carryingCapacity<=0 hard-zero
 * rule). Recovering `producedThisQuarter + previousStock - currentStock` instead correctly
 * attributes that throughput as consumption regardless of how little stock ever had a chance to
 * visibly pile up between snapshots.
 */
export function getOrCreateNonFoodFaunaProductionSnapshot(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.nonFoodFaunaProductionSnapshot;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.nonFoodFaunaProductionSnapshot = table;
  return table;
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

/**
 * Sparse goodId → cumulative units ever placed into a market, owned by the economy slice.
 * Two independent event sources feed it, both in markets-generator.ts: Markets.sell() (a Burg selling
 * its own craft-manufactured output — the production-generator.ts:594 call site, matching
 * production-overview.ts's own "sold" deal-kind naming) and addRuralOutput() (a cell's rural/biome
 * harvest — Grapes, Milk, Fish, Game, Wood, ... — reaching the market; these are never manufactured by
 * a Burg, so no Deal exists for them). 2026-08-08 (docs/temp/0807-alcoholic.md): the addRuralOutput()
 * half was added after the Goods Editor's Sales column shipped with only the sell() half — craft goods
 * (Wine, Cheese) showed real numbers while their own raw ingredients (Grapes, Milk), produced and
 * consumed just as continuously, sat at ~0. Unlike `production` (economyTotals.ts's getProduction(), a
 * per-cycle snapshot recomputed fresh every time) and `deals` (wiped every production cycle for UI
 * history — see getDeals()'s doc-comment), this accumulates across the whole session and is only ever
 * cleared explicitly (resetCumulativeMarketIntake(), the Goods Editor's reset button). Returns null when
 * the extension API / simulation context is not available.
 */
export function getOrCreateCumulativeMarketIntake(): Record<number, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.cumulativeGoodsSales;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, number>;
  }
  const table: Record<number, number> = {};
  slice.cumulativeGoodsSales = table;
  return table;
}

/** Zeroes every good's cumulative market-intake counter in place. */
export function resetCumulativeMarketIntake(): void {
  const table = getOrCreateCumulativeMarketIntake();
  if (table) {
    for (const goodId of Object.keys(table)) delete table[Number(goodId)];
  }
  const foodFlows = getOrCreateCumulativeCellFoodFlows();
  if (foodFlows) {
    for (const goodId of Object.keys(foodFlows)) delete foodFlows[Number(goodId)];
  }
}

/** @deprecated Intake includes rural harvest and is not necessarily a retail sale. */
export const getOrCreateCumulativeGoodsSales = getOrCreateCumulativeMarketIntake;
/** @deprecated Use resetCumulativeMarketIntake. */
export const resetCumulativeGoodsSales = resetCumulativeMarketIntake;

export type CumulativeCellFoodFlow = {
  /** Fresh units actually harvested in source cells, before local consumption or processing. */
  harvested: number;
  /** Fresh units actually used as preservation or manufacturing inputs. */
  processed: number;
  /** Shelf-stable output made for a source cell's private reserve, not placed into Market stock. */
  privateReserveOutput: number;
};

/**
 * Per-good realised fresh-food flow, separate from Market intake and from the editor's projected
 * production estimate. It is reset alongside the Goods Editor's cumulative Market-output counter.
 */
export function getOrCreateCumulativeCellFoodFlows(): Record<number, CumulativeCellFoodFlow> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.cumulativeCellFoodFlows;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, CumulativeCellFoodFlow>;
  }
  const flows: Record<number, CumulativeCellFoodFlow> = {};
  slice.cumulativeCellFoodFlows = flows;
  return flows;
}

export function recordCumulativeCellFoodHarvest(goodId: number, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  const flows = getOrCreateCumulativeCellFoodFlows();
  if (!flows) return;
  const flow = flows[goodId] ?? { harvested: 0, processed: 0, privateReserveOutput: 0 };
  flow.harvested += units;
  flows[goodId] = flow;
}

export function recordCumulativeCellFoodProcessing(goodId: number, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  const flows = getOrCreateCumulativeCellFoodFlows();
  if (!flows) return;
  const flow = flows[goodId] ?? { harvested: 0, processed: 0, privateReserveOutput: 0 };
  flow.processed += units;
  flows[goodId] = flow;
}

export function recordCumulativeCellFoodReserveOutput(goodId: number, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  const flows = getOrCreateCumulativeCellFoodFlows();
  if (!flows) return;
  const flow = flows[goodId] ?? { harvested: 0, processed: 0, privateReserveOutput: 0 };
  flow.privateReserveOutput = (flow.privateReserveOutput ?? 0) + units;
  flows[goodId] = flow;
}

/**
 * Sparse "marketId:goodId" → cumulative units ever placed into THAT market's stock, owned by the
 * economy slice. Same two event sources as getOrCreateCumulativeMarketIntake() (Markets.sell() and
 * addRuralOutput() in markets-generator.ts), just market-scoped instead of world-wide. Lets a
 * per-market consumer recover how much actually flowed INTO a market between two points in time,
 * not just where its stock number happened to net out to — see
 * getOrCreateNonFoodFaunaProductionSnapshot()'s doc-comment for why that distinction matters.
 * Never reset automatically; only meaningful as a delta between two snapshots taken by the caller.
 */
export function getOrCreateMarketGoodProductionTotals(): Record<string, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.marketGoodProductionTotals;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.marketGoodProductionTotals = table;
  return table;
}

export function getViewContext() {
  return getApi().viewContext;
}

export function getAppServices() {
  return getApi().appServices;
}

export function getGoodsLayer() {
  return getApi().getSvgLayer("goods");
}

export function getMarketsLayer() {
  return getApi().getSvgLayer("marketsLayer");
}

export function getMarketsFillLayer() {
  return getApi().getSvgLayer("marketsLayerFill");
}

export function getTradeAnimLayer() {
  return getApi().getSvgLayer("tradeAnimation");
}

export function getMineralDepositsLayer() {
  return getApi().getSvgLayer("mineralDeposits");
}

export function getDamsLayer() {
  return getApi().getSvgLayer("dams");
}

export function getLeveesLayer() {
  return getApi().getSvgLayer("levees");
}
