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
import type { ConstructionOperation } from "./generators/constructionEmploymentTypes";
import type { ConstructionHireApplication, ConstructionNamedSeat } from "./generators/constructionHireTypes";
import type { CraftEmploymentRecord } from "./generators/craftEmployment";
import type { Good } from "./generators/goodsGeneratorTypes";
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
import type { BasicEmploymentSummaryRecord } from "./generators/serviceEmployment";
import type { SmelterOperation } from "./generators/smelterOperationsTypes";
import type { StateSecretStock } from "./generators/stateSecretTypes";
import type { LaborMarket } from "./generators/strategicLaborMarketsTypes";
import type { StrategicGoodsPolicy } from "./generators/strategicProcurementPolicy";
import type { ProcurementOrder } from "./generators/strategicProcurementTypes";
import type { TradeSecurityLedger } from "./generators/tradeSecurityTypes";
import type { BanditCohort, MobileAdultCohort, UrbanLaborIntake } from "./generators/urbanLaborIntakeTypes";
import type { UrbanPregnancyRecord } from "./generators/urbanPregnancyTypes";
import type { UrbanWaterSystem } from "./generators/urbanWaterTypes";
import type { VolcanicAshOperation } from "./generators/volcanicAshOperationsTypes";

let _api: ExtensionAPI | null = null;
let _foodPotentialFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _cultivableAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _yieldPerAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _ruralFoodCapacityFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _cultivatedAreaFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _farmLaborRequiredFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _migratableAdultsFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _ruralReleasePressureFallback: Float32Array<ArrayBufferLike> = new Float32Array();
let _settlementDevelopmentPotentialFallback: Float32Array<ArrayBufferLike> = new Float32Array();
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
let _stateAgriculturalProductivityFallback: Float32Array<ArrayBufferLike> = new Float32Array();

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
  _farmLaborRequiredFallback = new Float32Array();
  _migratableAdultsFallback = new Float32Array();
  _ruralReleasePressureFallback = new Float32Array();
  _settlementDevelopmentPotentialFallback = new Float32Array();
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
  _stateAgriculturalProductivityFallback = new Float32Array();
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

/** Urban pregnancy pipeline stock (docs/plan/urban-housing-system.md PR-P1). */
export function getUrbanPregnancy(): UrbanPregnancyRecord[] {
  return getSliceArray<UrbanPregnancyRecord>("urbanPregnancy");
}
export function setUrbanPregnancy(records: readonly UrbanPregnancyRecord[]): void {
  setSliceArray("urbanPregnancy", records);
}

/** Burg-anchored Volcanic Ash sites (docs/plan/urban-construction-industry.md §3.4, Phase 3). */
export function getVolcanicAshOperations(): VolcanicAshOperation[] {
  return getSliceArray<VolcanicAshOperation>("volcanicAshOperations");
}
export function setVolcanicAshOperations(operations: readonly VolcanicAshOperation[]): void {
  setSliceArray("volcanicAshOperations", operations);
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
 * Sparse cellId → forest depletion factor [0, 0.9], owned by the economy slice.
 * Returns null when the extension API / simulation context is not available
 * (unit tests may use a module fallback in forestDepletion.ts).
 */
export function getOrCreateForestDepletionTable(): Record<number, number> | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  const existing = slice.forestDepletion;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<number, number>;
  }
  const table: Record<number, number> = {};
  slice.forestDepletion = table;
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
