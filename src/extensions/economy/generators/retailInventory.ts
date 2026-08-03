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

function currentTick(): number {
  return Math.max(0, Math.floor(getApi().simulationContext?.tickCount ?? 0));
}

function validBurgs(marketId: number): MarketBurg[] {
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

function physicalTotal(marketId: number, goodId: number): number {
  const retail = getBurgRetailInventories().reduce(
    (sum, row) => sum + (row.marketId === marketId ? (row.goods[goodId]?.onHand ?? 0) : 0),
    0
  );
  const wholesale = getBurgWholesaleInventories().reduce(
    (sum, row) => sum + (row.marketId === marketId ? (row.goods[goodId] ?? 0) : 0),
    0
  );
  const transit = getMarketShipments().reduce(
    (sum, row) => sum + (row.marketId === marketId && row.goodId === goodId ? row.units : 0),
    0
  );
  return retail + wholesale + transit;
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

function pruneEmptyRows(): void {
  const markets = getMarkets();
  const marketIds = new Set(markets.map(market => market.i));
  const marketGoodIds = new Map(markets.map(market => [market.i, new Set(marketGoodsIds(market))]));
  const validBurgKeys = new Set<string>();
  for (const market of markets) {
    for (const burg of validBurgs(market.i)) validBurgKeys.add(`${market.i}:${burg.i}`);
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

function ensurePositions(market: Market, tick: number): void {
  const burgs = validBurgs(market.i);
  if (!burgs.length) return;
  const centerBurgId = burgs.some(burg => burg.i === market.centerBurgId) ? market.centerBurgId : burgs[0].i;
  for (const goodId of marketGoodsIds(market)) {
    const marketStock = Math.max(0, market.goods[goodId]?.stock ?? 0);
    const positioned = physicalTotal(market.i, goodId);
    if (positioned + EPSILON < marketStock) {
      addWholesale(wholesaleRecord(centerBurgId, market.i)!, goodId, marketStock - positioned);
    } else if (positioned > marketStock + EPSILON) {
      removePhysicalStock(market.i, goodId, positioned - marketStock);
    }

    const totalWeight = burgs.reduce((sum, burg) => sum + Math.max(1, burg.population ?? 0), 0);
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

function planGoodReplenishment(market: Market, goodId: number, tick: number): void {
  const burgs = validBurgs(market.i);
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

/** Establish or repair the location breakdown without changing Market.goods total stock. */
export function reconcileRetailInventory(markets: readonly Market[] = getMarkets(), tick = currentTick()): void {
  pruneEmptyRows();
  for (const market of markets) ensurePositions(market, tick);
  setBurgRetailInventories(getBurgRetailInventories());
  setBurgWholesaleInventories(getBurgWholesaleInventories());
  setMarketShipments(getMarketShipments());
}

/** Plan direct burg-to-burg resupply; the market center is not an obligatory waypoint. */
export function planRetailReplenishment(markets: readonly Market[] = getMarkets(), tick = currentTick()): void {
  reconcileRetailInventory(markets, tick);
  for (const market of markets) {
    for (const goodId of marketGoodsIds(market)) planGoodReplenishment(market, goodId, tick);
  }
  pruneEmptyRows();
}

/** Deliver due internal cargo, then let the normal replenishment rule refill shelves. */
export function tickRetailInventory(tick = currentTick()): boolean {
  let changed = false;
  const pending: MarketShipment[] = [];
  for (const shipment of getMarketShipments()) {
    if (shipment.arrivalTick > tick) {
      pending.push(shipment);
      continue;
    }
    const retail = retailGood(retailRecord(shipment.destinationBurgId, shipment.marketId)!, shipment.goodId, tick);
    const shelfUnits = Math.min(shipment.units, Math.max(0, retail.target - retail.onHand));
    addRetailStock(retail, shelfUnits, shipment.travelDays ?? 0, tick);
    addWholesale(
      wholesaleRecord(shipment.destinationBurgId, shipment.marketId)!,
      shipment.goodId,
      shipment.units - shelfUnits
    );
    changed = true;
  }
  if (changed) setMarketShipments(pending);
  reconcileRetailInventory();
  if (changed) planRetailReplenishment();
  return changed;
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
}

export function validateRetailInventory(markets: readonly Market[] = getMarkets()): RetailInventoryInvariantIssue[] {
  const issues: RetailInventoryInvariantIssue[] = [];
  for (const market of markets) {
    for (const goodId of marketGoodsIds(market)) {
      const expected = Math.max(0, market.goods[goodId]?.stock ?? 0);
      const actual = physicalTotal(market.i, goodId);
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
}
