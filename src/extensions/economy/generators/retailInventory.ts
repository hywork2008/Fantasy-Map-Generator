import type { Burg } from "../../hostTypes";
import {
  getApi,
  getBurgRetailInventories,
  getBurgWholesaleInventories,
  getMarketShipments,
  getMarkets,
  getNextMarketShipmentId,
  getWorldContext,
  setBurgRetailInventories,
  setBurgWholesaleInventories,
  setMarketShipments,
  setNextMarketShipmentId
} from "../economyContext";
import { Goods } from "./goods-generator";
import { getRetailLotSize } from "./goodsTradeLots";
import type { Market } from "./marketTypes";
import type {
  BurgRetailInventory,
  BurgWholesaleInventory,
  MarketShipment,
  RetailGoodStock,
  RetailInventoryInvariantIssue
} from "./retailInventoryTypes";
import { calculateRouteDurationDays } from "./tradeRouteDuration";
import { TradeRoutePlanner } from "./tradeRoutePlanner";

const EPSILON = 1e-7;
const INITIAL_RETAIL_SHARE = 0.2;
const FALLBACK_DISTANCE_PER_DAY = 150;
const RETAIL_SURCHARGE_PER_TRAVEL_DAY = 0.004;
const MAX_RETAIL_LOCALITY_SURCHARGE = 0.15;
type MarketBurg = Burg & { i: number };

/**
 * Set when Market.goods stock or topology changes outside this module's
 * delivery/replenishment path. Daily Advance Time only re-runs the expensive
 * reconcile when this is true or internal shipments are due — quiet days are free.
 * Starts true so the first tick after enable still lays out positions.
 *
 * When only a subset of markets changed (typical: one caravan arrival),
 * `dirtyMarketIds` limits ensurePositions to those markets. Topology / bulk
 * regenerates use `null` (= all markets).
 */
let retailInventoryDirty = true;
/** `null` means every market; a Set means only those ids. Meaningful only while dirty. */
let dirtyMarketIds: Set<number> | null = null;

/**
 * Call when market stock / burg↔market membership may have changed outside retailInventory.
 * Prefer `marketId` when a single market's stock changed so daily ticks can re-layout only that market.
 */
export function markRetailInventoryDirty(marketId?: number): void {
  if (marketId === undefined) {
    retailInventoryDirty = true;
    dirtyMarketIds = null;
    return;
  }
  if (!retailInventoryDirty) {
    retailInventoryDirty = true;
    dirtyMarketIds = new Set([marketId]);
    return;
  }
  // Already dirty for all markets — stay broad.
  if (dirtyMarketIds === null) return;
  dirtyMarketIds.add(marketId);
}

export function isRetailInventoryDirty(): boolean {
  return retailInventoryDirty;
}

function clearRetailDirty(): void {
  retailInventoryDirty = false;
  dirtyMarketIds = new Set();
}

/** After laying out `processed`, drop those ids from the dirty set (or clear entirely). */
function acknowledgeReconciledMarkets(processed: readonly Market[], allMarkets: readonly Market[]): void {
  if (!retailInventoryDirty) return;
  if (dirtyMarketIds === null || processed.length >= allMarkets.length) {
    clearRetailDirty();
    return;
  }
  for (const market of processed) dirtyMarketIds.delete(market.i);
  if (!dirtyMarketIds.size) clearRetailDirty();
}

function currentTick(): number {
  return Math.max(0, Math.floor(getApi().simulationContext?.tickCount ?? 0));
}

function physicalKey(marketId: number, goodId: number): string {
  return `${marketId}:${goodId}`;
}

/**
 * One pack.burgs scan → marketId → burgs. Replaces N full-burg filters inside a
 * single reconcile (N ≈ market count, often hundreds on large maps).
 */
function buildBurgsByMarket(): Map<number, MarketBurg[]> {
  const byMarket = new Map<number, MarketBurg[]>();
  const burgs = getWorldContext().pack.burgs;
  if (!burgs?.length) return byMarket;
  for (const burg of burgs) {
    if (!burg || burg.removed || typeof burg.i !== "number" || !burg.market) continue;
    const list = byMarket.get(burg.market);
    if (list) list.push(burg as MarketBurg);
    else byMarket.set(burg.market, [burg as MarketBurg]);
  }
  return byMarket;
}

function validBurgs(marketId: number, burgsByMarket?: Map<number, MarketBurg[]>): MarketBurg[] {
  if (burgsByMarket) return burgsByMarket.get(marketId) ?? [];
  return getWorldContext().pack.burgs.filter((burg): burg is MarketBurg =>
    Boolean(burg && !burg.removed && burg.market === marketId && typeof burg.i === "number")
  );
}

function retailRecord(burgId: number, marketId: number, create = true): BurgRetailInventory | undefined {
  const inventories = getBurgRetailInventories();
  let record = inventories.find(row => row.burgId === burgId && row.marketId === marketId);
  if (!record && create) {
    record = { burgId, marketId, goods: {} };
    inventories.push(record);
  }
  return record;
}

function wholesaleRecord(burgId: number, marketId: number, create = true): BurgWholesaleInventory | undefined {
  const inventories = getBurgWholesaleInventories();
  let record = inventories.find(row => row.burgId === burgId && row.marketId === marketId);
  if (!record && create) {
    record = { burgId, marketId, goods: {} };
    inventories.push(record);
  }
  return record;
}

function retailGood(record: BurgRetailInventory, goodId: number, tick: number): RetailGoodStock {
  const existing = record.goods[goodId];
  if (existing) return existing;
  const created: RetailGoodStock = { onHand: 0, target: 0, lastRestockedTick: tick, transportDays: 0 };
  record.goods[goodId] = created;
  return created;
}

function addWholesale(record: BurgWholesaleInventory, goodId: number, units: number): void {
  if (!(units > EPSILON)) return;
  record.goods[goodId] = (record.goods[goodId] ?? 0) + units;
}

function nonNegative(value: number): number {
  return value > EPSILON ? value : 0;
}

function marketGoodsIds(market: Market): number[] {
  return Object.keys(market.goods)
    .map(Number)
    .filter(goodId => Number.isInteger(goodId));
}

/**
 * Single O(inventory rows + shipments) pass (optionally restricted to a market id set).
 * Replaces the old O(markets × goods × rows) pattern where each ensurePositions good
 * re-scanned every row.
 */
function buildPhysicalTotals(marketIds?: ReadonlySet<number>): Map<string, number> {
  const totals = new Map<string, number>();
  const include = (marketId: number) => !marketIds || marketIds.has(marketId);
  const add = (marketId: number, goodId: number, units: number) => {
    if (!(units > EPSILON) || !include(marketId)) return;
    const key = physicalKey(marketId, goodId);
    totals.set(key, (totals.get(key) ?? 0) + units);
  };

  for (const row of getBurgRetailInventories()) {
    if (!include(row.marketId)) continue;
    for (const [goodId, stock] of Object.entries(row.goods)) {
      add(row.marketId, Number(goodId), stock.onHand ?? 0);
    }
  }
  for (const row of getBurgWholesaleInventories()) {
    if (!include(row.marketId)) continue;
    for (const [goodId, units] of Object.entries(row.goods)) {
      add(row.marketId, Number(goodId), units ?? 0);
    }
  }
  for (const shipment of getMarketShipments()) {
    add(shipment.marketId, shipment.goodId, shipment.units);
  }
  return totals;
}

function physicalTotal(marketId: number, goodId: number, totals?: Map<string, number>): number {
  if (totals) return totals.get(physicalKey(marketId, goodId)) ?? 0;

  // Fallback for validators / one-off callers outside a bulk reconcile.
  let sum = 0;
  for (const row of getBurgRetailInventories()) {
    if (row.marketId === marketId) sum += row.goods[goodId]?.onHand ?? 0;
  }
  for (const row of getBurgWholesaleInventories()) {
    if (row.marketId === marketId) sum += row.goods[goodId] ?? 0;
  }
  for (const row of getMarketShipments()) {
    if (row.marketId === marketId && row.goodId === goodId) sum += row.units;
  }
  return sum;
}

/** Reduce positions when legacy systems have consumed Market.goods stock directly. */
function removePhysicalStock(marketId: number, goodId: number, units: number): void {
  let remaining = units;
  for (const row of getBurgWholesaleInventories()) {
    if (row.marketId !== marketId || !(remaining > EPSILON)) continue;
    const used = Math.min(row.goods[goodId] ?? 0, remaining);
    row.goods[goodId] = nonNegative((row.goods[goodId] ?? 0) - used);
    remaining -= used;
  }
  for (const row of getBurgRetailInventories()) {
    if (row.marketId !== marketId || !(remaining > EPSILON)) continue;
    const stock = row.goods[goodId];
    if (!stock) continue;
    const used = Math.min(stock.onHand, remaining);
    stock.onHand = nonNegative(stock.onHand - used);
    remaining -= used;
  }
  for (const shipment of getMarketShipments()) {
    if (shipment.marketId !== marketId || shipment.goodId !== goodId || !(remaining > EPSILON)) continue;
    const used = Math.min(shipment.units, remaining);
    shipment.units = nonNegative(shipment.units - used);
    remaining -= used;
  }
}

function pruneEmptyRows(burgsByMarket: Map<number, MarketBurg[]>): void {
  const markets = getMarkets();
  const marketIds = new Set(markets.map(market => market.i));
  const marketGoodIds = new Map(markets.map(market => [market.i, new Set(marketGoodsIds(market))]));
  const validBurgKeys = new Set<string>();
  for (const market of markets) {
    for (const burg of validBurgs(market.i, burgsByMarket)) validBurgKeys.add(`${market.i}:${burg.i}`);
  }
  setBurgRetailInventories(
    getBurgRetailInventories()
      .filter(row => marketIds.has(row.marketId) && validBurgKeys.has(`${row.marketId}:${row.burgId}`))
      .map(row => {
        const goodIds = marketGoodIds.get(row.marketId) ?? new Set<number>();
        for (const [goodId, stock] of Object.entries(row.goods)) {
          if (!goodIds.has(Number(goodId)) || (!(stock.onHand > EPSILON) && !(stock.target > EPSILON))) {
            delete row.goods[Number(goodId)];
          }
        }
        return row;
      })
  );
  setBurgWholesaleInventories(
    getBurgWholesaleInventories()
      .filter(row => marketIds.has(row.marketId) && validBurgKeys.has(`${row.marketId}:${row.burgId}`))
      .map(row => {
        const goodIds = marketGoodIds.get(row.marketId) ?? new Set<number>();
        for (const [goodId, units] of Object.entries(row.goods)) {
          if (!goodIds.has(Number(goodId)) || !(units > EPSILON)) delete row.goods[Number(goodId)];
        }
        return row;
      })
  );
  setMarketShipments(
    getMarketShipments().filter(
      shipment =>
        shipment.units > EPSILON &&
        marketIds.has(shipment.marketId) &&
        Boolean(marketGoodIds.get(shipment.marketId)?.has(shipment.goodId)) &&
        validBurgKeys.has(`${shipment.marketId}:${shipment.originBurgId}`) &&
        validBurgKeys.has(`${shipment.marketId}:${shipment.destinationBurgId}`)
    )
  );
}

function ensurePositions(
  market: Market,
  tick: number,
  burgsByMarket: Map<number, MarketBurg[]>,
  totals: Map<string, number>
): void {
  const burgs = validBurgs(market.i, burgsByMarket);
  if (!burgs.length) return;
  const centerBurgId = burgs.some(burg => burg.i === market.centerBurgId) ? market.centerBurgId : burgs[0].i;
  const totalWeight = burgs.reduce((sum, burg) => sum + Math.max(1, burg.population ?? 0), 0);

  for (const goodId of marketGoodsIds(market)) {
    const marketStock = Math.max(0, market.goods[goodId]?.stock ?? 0);
    const positioned = physicalTotal(market.i, goodId, totals);
    if (positioned + EPSILON < marketStock) {
      const delta = marketStock - positioned;
      addWholesale(wholesaleRecord(centerBurgId, market.i)!, goodId, delta);
      totals.set(physicalKey(market.i, goodId), positioned + delta);
    } else if (positioned > marketStock + EPSILON) {
      removePhysicalStock(market.i, goodId, positioned - marketStock);
      totals.set(physicalKey(market.i, goodId), marketStock);
    }

    for (const burg of burgs) {
      const retail = retailRecord(burg.i, market.i)!;
      const stock = retailGood(retail, goodId, tick);
      if (!(stock.target > EPSILON) && marketStock > EPSILON) {
        stock.target = (marketStock * INITIAL_RETAIL_SHARE * Math.max(1, burg.population ?? 0)) / totalWeight;
      }
    }
  }
}

function distance(a: MarketBurg, b: MarketBurg): number {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

/** Use the established road/river/sea graph; retain the direct-distance estimate only as a compatibility fallback. */
function travelDays(origin: MarketBurg, destination: MarketBurg): number {
  const { pack, distanceScale } = getWorldContext();
  const hasRouteGraph = Object.keys(pack.cells?.routes ?? {}).length > 0;
  const routePath = hasRouteGraph ? TradeRoutePlanner.findRoutePath(origin.cell, destination.cell) : null;
  if (routePath?.segments.length) {
    const duration = calculateRouteDurationDays(
      routePath.segments.map(segment => ({
        type: segment.type,
        points: segment.points.map(point =>
          typeof point[2] === "number" ? [point[0], point[1], point[2]] : [point[0], point[1]]
        )
      })),
      distanceScale
    );
    if (Number.isFinite(duration) && duration > 0) return duration;
  }
  return Math.max(1, Math.ceil(distance(origin, destination) / FALLBACK_DISTANCE_PER_DAY));
}

function addRetailStock(stock: RetailGoodStock, units: number, transportDays: number, tick: number): void {
  if (!(units > EPSILON)) return;
  const onHand = Math.max(0, stock.onHand);
  stock.transportDays = (onHand * (stock.transportDays ?? 0) + units * transportDays) / (onHand + units);
  stock.onHand = onHand + units;
  stock.lastRestockedTick = tick;
}

/** Moves goods already warehoused in a burg directly onto that burg's retail shelves. */
function replenishFromLocalWholesale(market: Market, burgId: number, goodId: number, tick: number): number {
  const retail = retailGood(retailRecord(burgId, market.i)!, goodId, tick);
  const localWholesale = wholesaleRecord(burgId, market.i)!;
  const availableUnits = localWholesale.goods[goodId] ?? 0;
  const good = Goods.get(goodId);
  // A locally stocked indivisible good (for example, one cat) must be visible as one
  // tradeable unit instead of being lost to a fractional population-based shelf target.
  const minimumShelfTarget = good ? Math.min(availableUnits, getRetailLotSize(good)) : 0;
  const required = Math.max(0, Math.max(retail.target, minimumShelfTarget) - retail.onHand);
  if (!(required > EPSILON)) return 0;

  const units = Math.min(required, availableUnits);
  if (!(units > EPSILON)) return 0;

  localWholesale.goods[goodId] = nonNegative((localWholesale.goods[goodId] ?? 0) - units);
  addRetailStock(retail, units, 0, tick);
  return units;
}

function planGoodReplenishment(
  market: Market,
  goodId: number,
  tick: number,
  burgsByMarket: Map<number, MarketBurg[]>
): void {
  const burgs = validBurgs(market.i, burgsByMarket);
  for (const destination of burgs) {
    replenishFromLocalWholesale(market, destination.i, goodId, tick);

    const retail = retailGood(retailRecord(destination.i, market.i)!, goodId, tick);

    let remaining = Math.max(0, retail.target - retail.onHand);
    while (remaining > EPSILON) {
      const source = burgs
        .filter(burg => burg.i !== destination.i && (wholesaleRecord(burg.i, market.i)!.goods[goodId] ?? 0) > EPSILON)
        .sort((a, b) => distance(a, destination) - distance(b, destination))[0];
      if (!source) break;
      const sourceWholesale = wholesaleRecord(source.i, market.i)!;
      const units = Math.min(remaining, sourceWholesale.goods[goodId] ?? 0);
      sourceWholesale.goods[goodId] = nonNegative((sourceWholesale.goods[goodId] ?? 0) - units);
      const routeTravelDays = travelDays(source, destination);
      const id = Math.max(1, getNextMarketShipmentId());
      setNextMarketShipmentId(id + 1);
      getMarketShipments().push({
        id,
        marketId: market.i,
        goodId,
        units,
        originBurgId: source.i,
        destinationBurgId: destination.i,
        dispatchedTick: tick,
        arrivalTick: tick + routeTravelDays,
        travelDays: routeTravelDays
      });
      remaining -= units;
    }
  }
}

/**
 * Establish or repair the location breakdown without changing Market.goods total stock.
 * Pass an explicit `markets` subset to re-layout only those markets (partial dirty).
 * Topology prune still considers the full market list so orphaned rows are cleaned once.
 */
export function reconcileRetailInventory(markets: readonly Market[] = getMarkets(), tick = currentTick()): void {
  const allMarkets = getMarkets();
  const isFullPass = markets.length >= allMarkets.length;
  const burgsByMarket = buildBurgsByMarket();
  // Full prune only on whole-map passes (monthly plan / initial layout). Partial daily
  // passes skip it — orphaned rows are cleaned on the next full pass.
  if (isFullPass) pruneEmptyRows(burgsByMarket);
  const marketIdSet = isFullPass ? undefined : new Set(markets.map(market => market.i));
  const totals = buildPhysicalTotals(marketIdSet);
  for (const market of markets) ensurePositions(market, tick, burgsByMarket, totals);
  setBurgRetailInventories(getBurgRetailInventories());
  setBurgWholesaleInventories(getBurgWholesaleInventories());
  setMarketShipments(getMarketShipments());
  acknowledgeReconciledMarkets(markets, allMarkets);
}

/** Plan direct burg-to-burg resupply; the market center is not an obligatory waypoint. */
export function planRetailReplenishment(markets: readonly Market[] = getMarkets(), tick = currentTick()): void {
  reconcileRetailInventory(markets, tick);
  const allMarkets = getMarkets();
  const burgsByMarket = buildBurgsByMarket();
  for (const market of markets) {
    for (const goodId of marketGoodsIds(market)) planGoodReplenishment(market, goodId, tick, burgsByMarket);
  }
  // Full prune only when planning the whole map (monthly / enable). Partial daily
  // delivery plans leave orphan cleanup to the next full pass.
  if (markets.length >= allMarkets.length) pruneEmptyRows(burgsByMarket);
}

/**
 * Deliver due internal burg↔burg cargo and replan shelves for those markets only.
 *
 * External Market.goods stock changes (inter-market caravans, quarterly food, production)
 * intentionally do **not** force a daily re-layout here. Those paths set
 * `markRetailInventoryDirty`; the next monthly `synchronizePlayerCommerce` /
 * explicit `reconcileRetailInventory` caller applies them. Quiet Advance Time days
 * then stay near free (see docs/analytics/advance-year-performance.md).
 *
 * Player-facing quotes call `reconcileRetailInventory` themselves before reading stock.
 */
export function tickRetailInventory(tick = currentTick()): boolean {
  const shipments = getMarketShipments();
  if (!shipments.length) return false;

  const due: MarketShipment[] = [];
  const pending: MarketShipment[] = [];
  for (const shipment of shipments) {
    if (shipment.arrivalTick > tick) pending.push(shipment);
    else due.push(shipment);
  }
  if (!due.length) return false;

  for (const shipment of due) {
    const retail = retailGood(retailRecord(shipment.destinationBurgId, shipment.marketId)!, shipment.goodId, tick);
    const shelfUnits = Math.min(shipment.units, Math.max(0, retail.target - retail.onHand));
    addRetailStock(retail, shelfUnits, shipment.travelDays ?? 0, tick);
    addWholesale(
      wholesaleRecord(shipment.destinationBurgId, shipment.marketId)!,
      shipment.goodId,
      shipment.units - shelfUnits
    );
  }
  setMarketShipments(pending);

  // Physical totals stay balanced (transit → shelf/wholesale). Further shelf refill
  // from wholesale / new internal shipments is deferred to the monthly
  // planRetailReplenishment (synchronizePlayerCommerce) so daily ticks stay O(due shipments).
  return true;
}

export function getRetailGoodStock(burgId: number, marketId: number, goodId: number): RetailGoodStock | undefined {
  return retailRecord(burgId, marketId, false)?.goods[goodId];
}

/** Goods physically held in this burg, whether displayed on shelves or stored in its wholesale depot. */
export function getBurgTradeableGoodStock(burgId: number, marketId: number, goodId: number): number {
  const retailUnits = getRetailGoodStock(burgId, marketId, goodId)?.onHand ?? 0;
  const wholesaleUnits = wholesaleRecord(burgId, marketId, false)?.goods[goodId] ?? 0;
  return Math.max(0, retailUnits) + Math.max(0, wholesaleUnits);
}

/**
 * Removes locally held stock for a player purchase. Shelves are used first, then the
 * same-burg wholesale depot; callers must update the matching market total separately.
 */
export function removeBurgTradeableGoodStock(burgId: number, marketId: number, goodId: number, units: number): boolean {
  if (!(units > EPSILON) || getBurgTradeableGoodStock(burgId, marketId, goodId) + EPSILON < units) return false;

  let remaining = units;
  const retail = getRetailGoodStock(burgId, marketId, goodId);
  if (retail) {
    const fromShelf = Math.min(remaining, retail.onHand);
    retail.onHand = nonNegative(retail.onHand - fromShelf);
    remaining -= fromShelf;
  }

  if (remaining > EPSILON) {
    const wholesale = wholesaleRecord(burgId, marketId, false);
    if (!wholesale) return false;
    wholesale.goods[goodId] = nonNegative((wholesale.goods[goodId] ?? 0) - remaining);
  }

  // Positions still sum to the new market total after the caller decrements stock;
  // no full reconcile required, but mark dirty so the next tick re-checks targets.
  retailInventoryDirty = true;
  return true;
}

/** Multiplicative player-facing local price adjustment for stock already delivered to this Burg. */
export function getRetailLocalityMultiplier(burgId: number, marketId: number, goodId: number): number {
  const stock = getRetailGoodStock(burgId, marketId, goodId);
  const days = Math.max(0, stock?.transportDays ?? 0);
  return 1 + Math.min(MAX_RETAIL_LOCALITY_SURCHARGE, days * RETAIL_SURCHARGE_PER_TRAVEL_DAY);
}

export function adjustRetailGoodStock(burgId: number, marketId: number, goodId: number, delta: number): boolean {
  const stock = getRetailGoodStock(burgId, marketId, goodId);
  if (!stock || stock.onHand + delta < -EPSILON) return false;
  stock.onHand = nonNegative(stock.onHand + delta);
  retailInventoryDirty = true;
  return true;
}

export function addWholesaleGoodStock(burgId: number, marketId: number, goodId: number, units: number): void {
  if (!(units > EPSILON)) return;
  const inventories = getBurgWholesaleInventories();
  let record = inventories.find(row => row.burgId === burgId && row.marketId === marketId);
  if (!record) {
    record = { burgId, marketId, goods: {} };
    inventories.push(record);
  }
  addWholesale(record, goodId, units);
  // Unlike reconciliation, this function can be called before any inventory array has
  // been established. Persist the new row into Economy's simulation slice immediately.
  setBurgWholesaleInventories(inventories);
  retailInventoryDirty = true;
}

export function validateRetailInventory(markets: readonly Market[] = getMarkets()): RetailInventoryInvariantIssue[] {
  const issues: RetailInventoryInvariantIssue[] = [];
  const totals = buildPhysicalTotals();
  for (const market of markets) {
    for (const goodId of marketGoodsIds(market)) {
      const expected = Math.max(0, market.goods[goodId]?.stock ?? 0);
      const actual = physicalTotal(market.i, goodId, totals);
      if (Math.abs(expected - actual) > 1e-5) issues.push({ marketId: market.i, goodId, expected, actual });
    }
  }
  return issues;
}

export function clearRetailInventory(): void {
  setBurgRetailInventories([]);
  setBurgWholesaleInventories([]);
  setMarketShipments([]);
  setNextMarketShipmentId(1);
  retailInventoryDirty = true;
  dirtyMarketIds = null;
}
