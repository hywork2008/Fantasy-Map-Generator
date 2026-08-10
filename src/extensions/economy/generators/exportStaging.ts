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
import { floorToRetailLot, getRetailLotSize } from "./goodsTradeLots";
import type { ExportStagingLot } from "./marketTypes";
import { MerchantTradeCapital } from "./merchantTradeCapital";

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
  /** When false, skip capital lock (tests / special paths). Default true. */
  requireCapital?: boolean;
};

export type TakeFromLotResult = {
  units: number;
  lockedCapital: number;
  freshnessAgeDays?: number;
};

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
  input: Pick<BookExportStagingInput, "marketId" | "destinationMarketId" | "goodId" | "unitCost">
): ExportStagingLot | undefined {
  return lots.find(
    lot =>
      lot.marketId === input.marketId &&
      lot.destinationMarketId === input.destinationMarketId &&
      lot.goodId === input.goodId &&
      Math.abs(lot.unitCost - input.unitCost) < 0.0001
  );
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
      units = rn(Math.min(units, affordable), 2);
      if (units < UNIT_EPSILON) return null;
    }

    const lockAmount = rn(units * unitCost, 2);
    if (requireCapital && lockAmount > UNIT_EPSILON && !MerchantTradeCapital.lock(input.marketId, lockAmount)) {
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

    const lots = [...getExportStagingLots()];
    const existing = findMergeTarget(lots, { ...input, unitCost });
    if (existing) {
      existing.units = rn(existing.units + units, 2);
      existing.lockedCapital = rn((existing.lockedCapital ?? 0) + lockAmount, 2);
      if (input.dealId !== undefined) existing.dealId = input.dealId;
      if (input.distance !== undefined) existing.distance = input.distance;
      if (input.durationDays !== undefined) existing.durationDays = input.durationDays;
      if (input.maintenanceCost !== undefined) existing.maintenanceCost = input.maintenanceCost;
      if (input.taxPerUnit !== undefined) existing.taxPerUnit = input.taxPerUnit;
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
    lot.units = rn(Math.max(0, lot.units - taken), 2);
    lot.lockedCapital = rn(Math.max(0, (lot.lockedCapital ?? 0) - capitalShare), 2);
    setExportStagingLots(lot.units <= UNIT_EPSILON ? lots.filter(entry => entry.id !== lotId) : lots);
    return { units: taken, lockedCapital: capitalShare, freshnessAgeDays: lot.freshnessAgeDays };
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
    if (locked > UNIT_EPSILON) MerchantTradeCapital.unlock(lot.marketId, locked);
    setExportStagingLots(lots.filter(entry => entry.id !== lotId));
    return units;
  }

  returnAllToRetail(): void {
    for (const lot of [...getExportStagingLots()]) {
      this.returnUnitsToRetail(lot.marketId, lot.goodId, lot.units);
      if ((lot.lockedCapital ?? 0) > UNIT_EPSILON) {
        MerchantTradeCapital.unlock(lot.marketId, lot.lockedCapital ?? 0);
      }
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
   */
  seedInheritedExportWarehouseIfNeeded(): void {
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
        const dest = chosenDests[Math.floor(Math.random() * chosenDests.length)];
        if (!dest) continue;

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
          unitCost
        });
        if (lot) spent += lot.lockedCapital ?? units * unitCost;
      }
    }

    setExportWarehouseSeeded(true);
  }
}

export const ExportStaging = new ExportStagingModule();
