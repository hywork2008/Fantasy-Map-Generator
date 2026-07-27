/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";
import type { Burg } from "../../types/models";
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
import type { LaborMarket } from "./generators/strategicLaborMarkets";
import type { ProcurementOrder } from "./generators/strategicProcurement";
import type { StrategicGoodsPolicy } from "./generators/strategicProcurementPolicy";

let _api: ExtensionAPI | null = null;

export function initEconomyContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearEconomyContext(): void {
  _api = null;
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
