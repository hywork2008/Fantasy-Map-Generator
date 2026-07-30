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
import type { AdministrationEmploymentRecord } from "./generators/administrationEmployment";
import type { BurgMarketLedger } from "./generators/burgMarketLedgers";
import type { Good } from "./generators/goods-generator";
import type { Caravan, Deal, Market } from "./generators/marketTypes";
import type { MerchantOrganization } from "./generators/merchantOrganizations";
import type { MilitaryResourceLedger } from "./generators/militaryResources";
import type {
  MineOperation,
  MineralDeposit,
  MineralDistrict,
  MineralGeologicalProvince
} from "./generators/mineralResources";
import type { MintLedger } from "./generators/minting";
import type { ProductionRecord } from "./generators/production-generator";
import type { BasicEmploymentSummaryRecord } from "./generators/serviceEmployment";
import type { SmelterOperation } from "./generators/smelterOperations";
import type { LaborMarket } from "./generators/strategicLaborMarkets";
import type { ProcurementOrder } from "./generators/strategicProcurement";
import type { StrategicGoodsPolicy } from "./generators/strategicProcurementPolicy";
import type { TradeSecurityLedger } from "./generators/tradeSecurity";
import type { BanditCohort, MobileAdultCohort, UrbanLaborIntake } from "./generators/urbanLaborIntake";

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
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[economy] Extension context not initialized — call init(api) first");
  return _api;
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
  return Number(getWorldContext().options.year) || 0;
}

export function getSimulationMonth(): number {
  const month = _api?.simulationContext?.currentMonth;
  if (typeof month === "number" && Number.isFinite(month) && month >= 1 && month <= 12) return month;
  const fallback = Number(getWorldContext().options.month);
  return Number.isFinite(fallback) && fallback >= 1 && fallback <= 12 ? fallback : 1;
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

/** Per-burg market ledgers owned by the economy extension. */
export function getBurgMarketLedgers(): BurgMarketLedger[] {
  return getSliceArray<BurgMarketLedger>("burgMarketLedgers");
}
export function setBurgMarketLedgers(ledgers: readonly BurgMarketLedger[]): void {
  setSliceArray("burgMarketLedgers", ledgers);
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
export function getSmelterOperations(): SmelterOperation[] {
  return getSliceArray<SmelterOperation>("smelterOperations");
}
export function setSmelterOperations(operations: readonly SmelterOperation[]): void {
  setSliceArray("smelterOperations", operations);
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
