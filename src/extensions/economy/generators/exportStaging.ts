/**
 * Merchant export warehouse: goods reserved for inter-market shipment.
 * Retail stock is deducted once on book; lots survive deal wipes until loaded or returned.
 * Phase D: booking locks trade working capital until cargo arrives, cancels, or is lost.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase C / D
 */

import { rn } from "../../hostUtils";
import {
  getExportStagingLots,
  getExportWarehouseSeeded,
  getGoods,
  getMarketById,
  getMarkets,
  getNextExportStagingLotId,
  setExportStagingLots,
  setExportWarehouseSeeded,
  setNextExportStagingLotId
} from "../economyContext";
import { isFreshFoodGood, isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import { floorToRetailLot, getRetailLotSize } from "./goodsTradeLots";
import type { ExportStagingLot, TradePaymentTerms } from "./marketTypes";
import { isLongDistanceTradeEnabled, MerchantTradeCapital, recordStaleLotCancelled } from "./merchantTradeCapital";
import { isSeaClosed } from "./seaSeason";
import { TradeLogisticsSettings } from "./tradeLogisticsSettings";

const UNIT_EPSILON = 0.000001;

/** How many destination markets a company may pre-stock for at game start. */
const INHERITED_DESTINATION_COUNT = { min: 1, max: 3 } as const;
/** Goods lines pre-staged per origin market at game start. */
const INHERITED_GOOD_LINES = { min: 1, max: 4 } as const;
/** Share of available trade capital allowed for inherited warehouse stocking. */
const INHERITED_CAPITAL_SPEND_SHARE = 0.45;
/** Max share of a good's retail stock moved into the inherited warehouse. */
const INHERITED_STOCK_SHARE = 0.35;

export type BookExportStagingInput = {
  marketId: number;
  destinationMarketId: number;
  goodId: number;
  units: number;
  unitCost: number;
  dealId?: number;
  distance?: number;
  durationDays?: number;
  maintenanceCost?: number;
  taxPerUnit?: number;
  /** Exporter price per unit inside `unitCost`; the rest is carriage and taxes. Default `unitCost`. */
  goodsUnitCost?: number;
  /** Carriage per unit inside `unitCost` (paid to the origin's carriers when the setting is on). */
  freightUnitCost?: number;
  /** Price per unit the house expects the destination to pay. */
  saleUnitPrice?: number;
  /** How the destination pays (§12); escrow puts the price up from its cash at booking. */
  paymentTerms?: TradePaymentTerms;
  /** Port burg the route's sea leg sails from, if it has one. */
  seaPortBurgId?: number;
  /** When false, skip capital lock (tests / special paths). Default true. */
  requireCapital?: boolean;
};

/** Route a start-of-map lot of `good` can travel from one market to another, or null. */
export type InheritedLotRouteResolver = (
  sourceMarketId: number,
  targetMarketId: number,
  good: Good
) => { durationDays: number; distanceKm: number } | null;

export type TakeFromLotResult = {
  units: number;
  lockedCapital: number;
  goodsUnitCost?: number;
  saleUnitPrice?: number;
  paymentTerms?: TradePaymentTerms;
  escrowAmount?: number;
  freshnessAgeDays?: number;
};

/** Units-weighted mean of a per-unit price when cargo merges; keeps whichever side is known. */
export function mergeUnitPrice(
  current: number | undefined,
  currentUnits: number,
  added: number | undefined,
  addedUnits: number
): number | undefined {
  if (added === undefined) return current;
  if (current === undefined || !(currentUnits > UNIT_EPSILON)) return added;
  return rn((current * currentUnits + added * addedUnits) / (currentUnits + addedUnits), 4);
}

/** Days past a round trip a lot still waits for carts or a hull that are out on the road. */
const STALE_LOT_GRACE_DAYS = 30;

/**
 * Days a lot may sit in the warehouse before it is cancelled: the longest wait for a sailing, a
 * round trip for the house's carts or hull to come back, and a month's grace (§5.3, §15). With only
 * the wait and one trip, cargo waiting for carts still out on the road was cancelled.
 */
export function getStaleLotDays(lot: Pick<ExportStagingLot, "durationDays">): number {
  const logistics = TradeLogisticsSettings.getOptions();
  const maxWait = Math.max(logistics.maxWaitDaysLand, logistics.maxWaitDaysSea, logistics.maxWaitDaysShortSea);
  return maxWait + 2 * Math.max(0, lot.durationDays ?? 0) + STALE_LOT_GRACE_DAYS;
}

function ensureNextLotId(): number {
  const nextId = getNextExportStagingLotId();
  if (nextId) return nextId;
  const lots = getExportStagingLots();
  const computed = lots.length > 0 ? Math.max(...lots.map(lot => lot.id)) + 1 : 1;
  setNextExportStagingLotId(computed);
  return computed;
}

function findMergeTarget(
  lots: readonly ExportStagingLot[],
  input: Pick<BookExportStagingInput, "marketId" | "destinationMarketId" | "goodId" | "unitCost" | "paymentTerms">
): ExportStagingLot | undefined {
  return lots.find(
    lot =>
      lot.marketId === input.marketId &&
      lot.destinationMarketId === input.destinationMarketId &&
      lot.goodId === input.goodId &&
      lot.paymentTerms === input.paymentTerms &&
      Math.abs(lot.unitCost - input.unitCost) < 0.0001
  );
}

/** Escrowed cash of `units` out of a lot's or cargo's `totalUnits`. */
function escrowShare(escrow: number | undefined, units: number, totalUnits: number): number {
  return escrow && totalUnits > UNIT_EPSILON ? rn((escrow * Math.min(units, totalUnits)) / totalUnits, 2) : 0;
}

/** What the exporting market refunds when a lot's goods come back to it; undefined = the whole lock. */
function goodsRefund(lot: Pick<ExportStagingLot, "units" | "goodsUnitCost">): number | undefined {
  return lot.goodsUnitCost === undefined ? undefined : rn(lot.units * lot.goodsUnitCost, 2);
}

export class ExportStagingModule {
  /**
   * Removes units from retail stock and places them in the export warehouse.
   * Capital-gates and locks trade working capital (Phase D) unless requireCapital is false.
   */
  bookFromRetail(input: BookExportStagingInput): ExportStagingLot | null {
    if (!(input.units > UNIT_EPSILON)) return null;
    const market = getMarketById(input.marketId);
    if (!market) return null;
    const row = market.goods[input.goodId];
    if (!row || row.stock <= UNIT_EPSILON) return null;

    // Clamp by retail stock first, then by trade working capital (Phase D).
    let units = Math.min(input.units, row.stock);
    const unitCost = Math.max(0, input.unitCost);
    const requireCapital = input.requireCapital !== false;

    if (requireCapital && unitCost > UNIT_EPSILON) {
      MerchantTradeCapital.ensureTradeCapital(market);
      const affordable = MerchantTradeCapital.availableCapital(input.marketId) / unitCost;
      // What the house could not fund is asked of its investors (long-distance-merchant-reach-capital.md §5.2).
      if (affordable < units) MerchantTradeCapital.recordShortfall(input.marketId, (units - affordable) * unitCost);
      units = rn(Math.min(units, affordable), 2);
      if (units < UNIT_EPSILON) return null;
    }

    const lockAmount = rn(units * unitCost, 2);
    const goodsUnitCost = Math.min(unitCost, Math.max(0, input.goodsUnitCost ?? unitCost));
    const freightUnitCost = Math.min(unitCost - goodsUnitCost, Math.max(0, input.freightUnitCost ?? 0));
    // Prices for settlement are only kept when cargo is paid for, so the legacy save stays as it was.
    const priced = isLongDistanceTradeEnabled();
    const paymentTerms = priced && requireCapital ? input.paymentTerms : undefined;
    if (
      requireCapital &&
      lockAmount > UNIT_EPSILON &&
      !MerchantTradeCapital.lock(input.marketId, lockAmount, {
        goods: rn(units * goodsUnitCost, 2),
        freight: rn(units * freightUnitCost, 2)
      })
    ) {
      return null;
    }

    row.stock = rn(Math.max(0, row.stock - units), 2);
    recordGoodFlow({
      direction: "sink",
      category: "exportDeparture",
      goodId: input.goodId,
      units,
      marketId: input.marketId
    });

    // Escrow terms: the importer puts the price up from its cash now (§12).
    const escrow =
      paymentTerms === "escrow" && input.saleUnitPrice
        ? MerchantTradeCapital.putUpEscrow(input.destinationMarketId, rn(units * input.saleUnitPrice, 2))
        : 0;

    const lots = [...getExportStagingLots()];
    const existing = findMergeTarget(lots, { ...input, unitCost, paymentTerms });
    if (existing) {
      if (priced) {
        existing.goodsUnitCost = mergeUnitPrice(existing.goodsUnitCost, existing.units, goodsUnitCost, units);
        existing.saleUnitPrice = mergeUnitPrice(existing.saleUnitPrice, existing.units, input.saleUnitPrice, units);
      }
      if (escrow > 0) existing.escrowAmount = rn((existing.escrowAmount ?? 0) + escrow, 2);
      existing.units = rn(existing.units + units, 2);
      existing.lockedCapital = rn((existing.lockedCapital ?? 0) + lockAmount, 2);
      if (input.dealId !== undefined) existing.dealId = input.dealId;
      if (input.distance !== undefined) existing.distance = input.distance;
      if (input.durationDays !== undefined) existing.durationDays = input.durationDays;
      if (input.maintenanceCost !== undefined) existing.maintenanceCost = input.maintenanceCost;
      if (input.taxPerUnit !== undefined) existing.taxPerUnit = input.taxPerUnit;
      if (input.seaPortBurgId !== undefined) existing.seaPortBurgId = input.seaPortBurgId;
      setExportStagingLots(lots);
      return existing;
    }

    const id = ensureNextLotId();
    const lot: ExportStagingLot = {
      id,
      marketId: input.marketId,
      destinationMarketId: input.destinationMarketId,
      goodId: input.goodId,
      units: rn(units, 2),
      unitCost,
      lockedCapital: lockAmount,
      dealId: input.dealId,
      distance: input.distance,
      durationDays: input.durationDays,
      maintenanceCost: input.maintenanceCost,
      taxPerUnit: input.taxPerUnit,
      goodsUnitCost: priced ? goodsUnitCost : undefined,
      saleUnitPrice: priced ? input.saleUnitPrice : undefined,
      paymentTerms,
      escrowAmount: escrow > 0 ? escrow : undefined,
      seaPortBurgId: input.seaPortBurgId,
      freshnessAgeDays: (() => {
        const good = getGoods().find(candidate => candidate.i === input.goodId);
        return good && isFreshFoodGood(good) ? 0 : undefined;
      })()
    };
    lots.push(lot);
    setExportStagingLots(lots);
    setNextExportStagingLotId(id + 1);
    return lot;
  }

  totalUnits(): number {
    return getExportStagingLots().reduce((sum, lot) => sum + lot.units, 0);
  }

  lotsForRoute(originMarketId: number, destinationMarketId: number): ExportStagingLot[] {
    return getExportStagingLots().filter(
      lot =>
        lot.marketId === originMarketId && lot.destinationMarketId === destinationMarketId && lot.units > UNIT_EPSILON
    );
  }

  /**
   * Removes units from a lot when they are placed on a loading/transit caravan.
   * Locked capital moves with the cargo (returned proportionally).
   */
  takeFromLot(lotId: number, units: number): TakeFromLotResult {
    if (!(units > UNIT_EPSILON)) return { units: 0, lockedCapital: 0 };
    const lots = [...getExportStagingLots()];
    const lot = lots.find(entry => entry.id === lotId);
    if (!lot) return { units: 0, lockedCapital: 0 };
    const taken = Math.min(lot.units, units);
    const capitalShare = lot.units > UNIT_EPSILON ? rn(((lot.lockedCapital ?? 0) * taken) / lot.units, 2) : 0;
    const escrowTaken = escrowShare(lot.escrowAmount, taken, lot.units);
    if (lot.escrowAmount !== undefined) lot.escrowAmount = rn(Math.max(0, lot.escrowAmount - escrowTaken), 2);
    lot.units = rn(Math.max(0, lot.units - taken), 2);
    lot.lockedCapital = rn(Math.max(0, (lot.lockedCapital ?? 0) - capitalShare), 2);
    // Loading is movement: the lot is not stuck (§5.3).
    if (lot.waitedDays !== undefined) lot.waitedDays = 0;
    setExportStagingLots(lot.units <= UNIT_EPSILON ? lots.filter(entry => entry.id !== lotId) : lots);
    return {
      units: taken,
      lockedCapital: capitalShare,
      goodsUnitCost: lot.goodsUnitCost,
      saleUnitPrice: lot.saleUnitPrice,
      paymentTerms: lot.paymentTerms,
      escrowAmount: escrowTaken > 0 ? escrowTaken : undefined,
      freshnessAgeDays: lot.freshnessAgeDays
    };
  }

  returnUnitsToRetail(marketId: number, goodId: number, units: number): void {
    if (!(units > UNIT_EPSILON)) return;
    const market = getMarketById(marketId);
    if (!market) return;
    const row = market.goods[goodId];
    if (!row) {
      market.goods[goodId] = { stock: rn(units, 2), price: 0 };
      return;
    }
    row.stock = rn(row.stock + units, 2);
  }

  /** Cancel one lot: restore retail and unlock remaining capital. */
  cancelLot(lotId: number): number {
    const lots = [...getExportStagingLots()];
    const lot = lots.find(entry => entry.id === lotId);
    if (!lot) return 0;
    const units = lot.units;
    const locked = lot.lockedCapital ?? 0;
    this.returnUnitsToRetail(lot.marketId, lot.goodId, units);
    if (locked > UNIT_EPSILON) MerchantTradeCapital.unlock(lot.marketId, locked, goodsRefund(lot));
    MerchantTradeCapital.releaseEscrow(lot.destinationMarketId, lot.escrowAmount ?? 0);
    setExportStagingLots(lots.filter(entry => entry.id !== lotId));
    return units;
  }

  /**
   * With `fmg-long-distance-trade` on, a lot that has waited longer than any sailing wait plus
   * its trip without loading is cancelled: the goods go back to retail and its capital is freed
   * (docs/plan/long-distance-merchant-reach-capital.md §5.3). Sea cargo does not count the days
   * its port is laid up or iced in, as cargo waiting in port does not
   * (port-freight-queue-and-warehouses.md §10.27). Returns the lots cancelled.
   */
  cancelStaleLots(deltaDays: number): number {
    if (!(deltaDays > 0) || !isLongDistanceTradeEnabled()) return 0;
    const stale: ExportStagingLot[] = [];
    for (const lot of getExportStagingLots()) {
      if (isSeaClosed(lot.seaPortBurgId)) continue;
      lot.waitedDays = (lot.waitedDays ?? 0) + deltaDays;
      if (lot.waitedDays > getStaleLotDays(lot)) stale.push(lot);
    }
    for (const lot of stale) {
      recordStaleLotCancelled(lot.lockedCapital ?? 0);
      this.cancelLot(lot.id);
    }
    return stale.length;
  }

  returnAllToRetail(): void {
    for (const lot of [...getExportStagingLots()]) {
      this.returnUnitsToRetail(lot.marketId, lot.goodId, lot.units);
      if ((lot.lockedCapital ?? 0) > UNIT_EPSILON) {
        MerchantTradeCapital.unlock(lot.marketId, lot.lockedCapital ?? 0, goodsRefund(lot));
      }
      MerchantTradeCapital.releaseEscrow(lot.destinationMarketId, lot.escrowAmount ?? 0);
    }
    setExportStagingLots([]);
    setNextExportStagingLotId(1);
  }

  /**
   * Fresh cargo is never valid export inventory. Clear any legacy/persisted lots before they
   * can be displayed as a loading trade.
   */
  expireFreshLots(deltaDays: number): number {
    if (!(deltaDays > 0)) return 0;
    let spoiledUnits = 0;
    const remaining: ExportStagingLot[] = [];
    for (const lot of getExportStagingLots()) {
      const good = getGoods().find(candidate => candidate.i === lot.goodId);
      if (!good || !isFreshFoodGood(good)) {
        remaining.push(lot);
        continue;
      }
      // Fresh goods are never valid export inventory. This also clears warehouse lots created
      // before the no-raw-fresh-trade rule was introduced.
      lot.freshnessAgeDays = (lot.freshnessAgeDays ?? 0) + deltaDays;
      spoiledUnits += lot.units;
      if ((lot.lockedCapital ?? 0) > UNIT_EPSILON) {
        MerchantTradeCapital.settleLoss(lot.marketId, lot.lockedCapital ?? 0);
      }
      MerchantTradeCapital.releaseEscrow(lot.destinationMarketId, lot.escrowAmount ?? 0);
      recordGoodFlow({
        direction: "sink",
        category: "spoilage",
        goodId: lot.goodId,
        units: lot.units,
        marketId: lot.marketId
      });
    }
    setExportStagingLots(remaining);
    return spoiledUnits;
  }

  clear(): void {
    setExportStagingLots([]);
    setNextExportStagingLotId(1);
    setExportWarehouseSeeded(false);
  }

  /**
   * Once per map: stage random export lots as pre-start merchant inventory, funded by trade
   * working capital (as if the house already bought cargo before the player opened the map).
   * With `shippableRoute`, a good is only stocked for a destination it reaches before it spoils or
   * stops paying its carriage; a lot that could never load would sit in the warehouse for good.
   */
  seedInheritedExportWarehouseIfNeeded(shippableRoute?: InheritedLotRouteResolver): void {
    if (getExportWarehouseSeeded()) return;
    const markets = getMarkets().filter(market => market?.i);
    if (markets.length < 2) {
      setExportWarehouseSeeded(true);
      return;
    }

    MerchantTradeCapital.ensureAllMarkets();
    const goods = getGoods().filter(
      good =>
        good && isGoodEnabled(good) && !good.tags.includes("stapleFood") && !isFreshFoodGood(good) && good.value > 0
    );
    if (!goods.length) {
      setExportWarehouseSeeded(true);
      return;
    }

    for (const origin of markets) {
      const capitalBudget = MerchantTradeCapital.availableCapital(origin.i) * INHERITED_CAPITAL_SPEND_SHARE;
      if (capitalBudget < 1) continue;

      const destinations = markets.filter(market => market.i !== origin.i);
      if (!destinations.length) continue;

      const destCount =
        INHERITED_DESTINATION_COUNT.min +
        Math.floor(Math.random() * (INHERITED_DESTINATION_COUNT.max - INHERITED_DESTINATION_COUNT.min + 1));
      const chosenDests = [...destinations].sort(() => Math.random() - 0.5).slice(0, destCount);

      const lineCount =
        INHERITED_GOOD_LINES.min +
        Math.floor(Math.random() * (INHERITED_GOOD_LINES.max - INHERITED_GOOD_LINES.min + 1));
      const candidateGoods = goods
        .filter(good => (origin.goods[good.i]?.stock ?? 0) > 0.5)
        .sort(() => Math.random() - 0.5)
        .slice(0, lineCount);

      let spent = 0;
      for (const good of candidateGoods) {
        if (spent >= capitalBudget - UNIT_EPSILON) break;
        const row = origin.goods[good.i];
        if (!row || row.stock <= UNIT_EPSILON) continue;
        const reachable = shippableRoute
          ? chosenDests.filter(market => shippableRoute(origin.i, market.i, good) !== null)
          : chosenDests;
        const dest = reachable[Math.floor(Math.random() * reachable.length)];
        if (!dest) continue;
        const route = shippableRoute?.(origin.i, dest.i, good) ?? undefined;

        const unitCost = Math.max(row.price || good.value, good.value * 0.5);
        const maxByStock = row.stock * INHERITED_STOCK_SHARE;
        const maxByCapital = (capitalBudget - spent) / unitCost;
        // Indivisible units ("head" livestock, ships, etc.) can't seed a fractional pre-start
        // warehouse lot — a market can't start owning 0.4 of a live animal.
        const units = floorToRetailLot(
          Math.min(maxByStock, maxByCapital, 2 + Math.random() * 18),
          getRetailLotSize(good)
        );
        if (units < 0.1) continue;

        const lot = this.bookFromRetail({
          marketId: origin.i,
          destinationMarketId: dest.i,
          goodId: good.i,
          units,
          unitCost,
          distance: route ? rn(route.distanceKm, 2) : undefined,
          durationDays: route?.durationDays
        });
        if (lot) spent += lot.lockedCapital ?? units * unitCost;
      }
    }

    setExportWarehouseSeeded(true);
  }
}

export const ExportStaging = new ExportStagingModule();
