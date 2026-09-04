/**
 * Goods and markets, deals, caravans and transport assets, retail/wholesale inventories, merchant
organizations, and strategic procurement.
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

import type { Burg } from "../../../types/models";
import type { BurgMarketLedger } from "../generators/burgMarketLedgersTypes";
import type { Good } from "../generators/goodsGeneratorTypes";
import type { FlowCycleSnapshot } from "../generators/marketFlowTypes";
import type {
  Caravan,
  Deal,
  ExportStagingLot,
  Market,
  MerchantTransportLedger,
  TransportAssetOrder,
  TransportReservation
} from "../generators/marketTypes";
import type { MerchantOrganization } from "../generators/merchantOrganizationsTypes";
import type { ProductionRecord } from "../generators/productionRecordTypes";
import type {
  BurgRetailInventory,
  BurgWholesaleInventory,
  CharacterInventoryCostBasis,
  MarketMerchantPortfolio,
  MarketShipment,
  MerchantGoodSalesLedger,
  PlayerMarketTransaction
} from "../generators/retailInventoryTypes";
import type { LaborMarket } from "../generators/strategicLaborMarketsTypes";
import type { StrategicGoodsPolicy } from "../generators/strategicProcurementPolicy";
import type { ProcurementOrder } from "../generators/strategicProcurementTypes";
import type { MerchantVesselOwnership } from "../generators/vesselOwnershipTypes";
import { getProductionTable, getSliceArray, getSliceNumber, setSliceArray, setSliceNumber } from "./economyApi";

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
