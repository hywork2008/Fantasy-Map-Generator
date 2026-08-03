/**
 * Food ↔ general goods co-load.
 *
 * When a market→market commercial caravan still has free cargo slots, fill them with
 * staple food (Grain) drawn from the exporter Food Ledger's `exportable` surplus.
 * Arrival credits the importer ledger (Age0) after transit spoilage — the abstract
 * quarterly `resolveFoodImportNetwork` still covers residual need / capacity bonus.
 *
 * @see docs/plan/merchant-logistics-warehouses.md
 * @see docs/plan/megacity-food-import-economy.md (FoodShipment co-load notes)
 */

import { rn } from "../../hostUtils";
import { getMarkets } from "../economyContext";
import { FOOD_SPOILAGE_HALF_LIFE_DAYS } from "./foodImportNetwork";
import { getStapleFoodGood } from "./foodProduction";
import type { Caravan, FoodLedger, Market } from "./marketTypes";
import { markRetailInventoryDirty } from "./retailInventory";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";
import { calculateRouteDurationDays } from "./tradeRouteDuration";

const UNIT_EPSILON = 0.000001;

/** Pseudo deal id for food co-load payload rows (not a real Deal). */
export const FOOD_COLOAD_DEAL_ID = -9001;

export type FoodDrawResult = {
  units: number;
  /** Weighted-average unit cost of the drawn buckets. */
  unitCost: number;
};

/**
 * Pure: how many food units fit free hold space, limited by exportable surplus and importer need.
 * When importNeed is 0, allow a modest opportunistic fill up to exportable (bulk ballast).
 */
export function computeFoodCoLoadUnits(input: {
  freeSlots: number;
  cargoSlotsPerUnit: number;
  exportable: number;
  /** Remaining unmet import need at destination; 0 = opportunistic ballast only. */
  importNeed: number;
  /**
   * Max over-ship vs import need when the destination still has need
   * (covers expected spoilage). Default 1 / typical delivered share ≈ 1.15.
   */
  spoilageLoadFactor?: number;
}): number {
  const slotsPerUnit = Math.max(UNIT_EPSILON, input.cargoSlotsPerUnit);
  const slotCap = Math.max(0, input.freeSlots) / slotsPerUnit;
  const exportCap = Math.max(0, input.exportable);
  if (slotCap <= UNIT_EPSILON || exportCap <= UNIT_EPSILON) return 0;

  const need = Math.max(0, input.importNeed);
  if (need <= UNIT_EPSILON) {
    // Opportunistic ballast: fill free space but never more than exportable.
    return rn(Math.min(slotCap, exportCap), 2);
  }

  const loadFactor = input.spoilageLoadFactor ?? 1.15;
  const needCap = need * loadFactor;
  return rn(Math.min(slotCap, exportCap, needCap), 2);
}

/** Pure spoilage fraction remaining after `travelDays` (half-life model). */
export function foodDeliveredShare(travelDays: number, halfLifeDays: number = FOOD_SPOILAGE_HALF_LIFE_DAYS): number {
  if (!(travelDays > 0) || !(halfLifeDays > 0)) return 1;
  return Math.exp(-travelDays / halfLifeDays);
}

/**
 * Draw staple food for export from oldest buckets first (FIFO), capped by `exportable`.
 * Mutates the ledger in place.
 */
export function drawFoodForExport(ledger: FoodLedger, amount: number): FoodDrawResult {
  const totalStock = ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2;
  const maxDraw = Math.min(Math.max(0, amount), Math.max(0, ledger.exportable), totalStock);
  if (maxDraw <= UNIT_EPSILON) return { units: 0, unitCost: 0 };

  let remaining = maxDraw;
  let costSum = 0;
  let drawn = 0;

  const take = (
    getAvailable: () => number,
    setAvailable: (value: number) => void,
    getUnitCost: () => number,
    clearUnitCost: () => void
  ) => {
    if (remaining <= UNIT_EPSILON) return;
    const available = getAvailable();
    const takeUnits = Math.min(available, remaining);
    if (takeUnits <= UNIT_EPSILON) return;
    const nextAvailable = rn(available - takeUnits, 2);
    setAvailable(nextAvailable);
    costSum += takeUnits * getUnitCost();
    drawn += takeUnits;
    remaining -= takeUnits;
    if (nextAvailable <= UNIT_EPSILON) {
      setAvailable(0);
      clearUnitCost();
    }
  };

  take(
    () => ledger.foodStockAge2,
    value => {
      ledger.foodStockAge2 = value;
    },
    () => ledger.foodStockAge2UnitCost,
    () => {
      ledger.foodStockAge2UnitCost = 0;
    }
  );
  take(
    () => ledger.foodStockAge1,
    value => {
      ledger.foodStockAge1 = value;
    },
    () => ledger.foodStockAge1UnitCost,
    () => {
      ledger.foodStockAge1UnitCost = 0;
    }
  );
  take(
    () => ledger.foodStockAge0,
    value => {
      ledger.foodStockAge0 = value;
    },
    () => ledger.foodStockAge0UnitCost,
    () => {
      ledger.foodStockAge0UnitCost = 0;
    }
  );

  drawn = rn(drawn, 2);
  ledger.exportable = rn(Math.max(0, ledger.exportable - drawn), 2);
  const unitCost = drawn > UNIT_EPSILON ? rn(costSum / drawn, 2) : 0;
  return { units: drawn, unitCost };
}

/** Credit staple food into Age0 with weighted-average unit cost (stock only). */
export function creditFoodStockAge0(ledger: FoodLedger, units: number, unitCost: number): void {
  if (!(units > UNIT_EPSILON)) return;
  const prev = ledger.foodStockAge0;
  const prevCost = ledger.foodStockAge0UnitCost;
  const next = rn(prev + units, 2);
  ledger.foodStockAge0 = next;
  ledger.foodStockAge0UnitCost = next > UNIT_EPSILON ? rn((prev * prevCost + units * unitCost) / next, 2) : 0;
}

/** Credit arrived staple food into Age0 and reduce import need. */
export function receiveFoodImport(ledger: FoodLedger, units: number, unitCost: number): void {
  creditFoodStockAge0(ledger, units, unitCost);
  if (!(units > UNIT_EPSILON)) return;
  ledger.importNeed = rn(Math.max(0, ledger.importNeed - units), 2);
  ledger.satisfiedImport = rn((ledger.satisfiedImport ?? 0) + units, 2);
}

/** Return cancelled export cargo to Age0 and restore exportable. */
export function returnFoodExportToLedger(ledger: FoodLedger, units: number, unitCost: number): void {
  creditFoodStockAge0(ledger, units, unitCost);
  if (!(units > UNIT_EPSILON)) return;
  ledger.exportable = rn(ledger.exportable + units, 2);
}

/** Sync Grain market stock view (exportable + overflow), matching foodProduction. */
export function syncStapleFoodMarketStock(market: Market, stapleGoodId: number, priceFallback = 1): void {
  const ledger = market.foodLedger;
  if (!ledger) return;
  const marketGood = market.goods[stapleGoodId] ?? { stock: 0, price: priceFallback };
  marketGood.stock = rn(ledger.exportable + ledger.storageOverflow, 2);
  market.goods[stapleGoodId] = marketGood;
  markRetailInventoryDirty(market.i);
}

function payloadUsedSlots(caravan: Pick<Caravan, "payload">): number {
  return caravan.payload.reduce((sum, item) => sum + item.units * (item.cargoSlotsPerUnit ?? 1), 0);
}

function travelDaysForCaravan(caravan: Caravan, distanceScale: number): number {
  if (caravan.travelLegs?.length) {
    let days = 0;
    let prevEnd = 0;
    for (const leg of caravan.travelLegs) {
      const legKm = Math.max(0, leg.endKm - prevEnd);
      prevEnd = leg.endKm;
      if (leg.speedKmPerDay > 0) days += legKm / leg.speedKmPerDay;
    }
    return Math.max(1, Math.ceil(days));
  }
  return Math.max(1, calculateRouteDurationDays(caravan.routeSegments, distanceScale));
}

/**
 * Fill free hold capacity on a market→market caravan with staple food from the exporter ledger.
 * Returns units loaded (0 if none).
 */
export function tryCoLoadFoodOntoCaravan(caravan: Caravan, options?: { distanceScale?: number }): number {
  if (caravan.sellerType !== "market" || caravan.buyerType !== "market") return 0;
  if (caravan.state !== "loading" && caravan.state !== "transit") return 0;

  const staple = getStapleFoodGood();
  if (!staple) return 0;

  // Already carrying food co-load — top up same payload row if free space remains.
  const planned =
    caravan.loading?.plannedCapacitySlots ??
    (caravan.transportAllocations?.length
      ? Math.min(...caravan.transportAllocations.map(allocation => allocation.capacitySlots))
      : 0);
  if (!(planned > UNIT_EPSILON)) return 0;

  const freeSlots = planned - payloadUsedSlots(caravan);
  if (freeSlots <= UNIT_EPSILON) return 0;

  const markets = getMarkets();
  const exporter = markets.find(market => market.i === caravan.seller);
  const importer = markets.find(market => market.i === caravan.buyer);
  if (!exporter?.foodLedger || !importer?.foodLedger) return 0;

  const cargoSlotsPerUnit = getGoodCargoSlotsPerUnit(staple);
  const unitsWanted = computeFoodCoLoadUnits({
    freeSlots,
    cargoSlotsPerUnit,
    exportable: exporter.foodLedger.exportable,
    importNeed: importer.foodLedger.importNeed
  });
  if (unitsWanted <= UNIT_EPSILON) return 0;

  const drawn = drawFoodForExport(exporter.foodLedger, unitsWanted);
  if (drawn.units <= UNIT_EPSILON) return 0;

  syncStapleFoodMarketStock(exporter, staple.i, staple.value);

  const value = rn(drawn.units * drawn.unitCost, 2);
  const existing = caravan.payload.find(item => item.isFoodCoLoad && item.goodId === staple.i);
  if (existing) {
    const totalUnits = existing.units + drawn.units;
    const totalCost = (existing.unitCost ?? 0) * existing.units + drawn.unitCost * drawn.units;
    existing.units = rn(totalUnits, 2);
    existing.value = rn(existing.value + value, 2);
    existing.unitCost = totalUnits > UNIT_EPSILON ? rn(totalCost / totalUnits, 2) : drawn.unitCost;
    existing.cargoSlotsPerUnit = cargoSlotsPerUnit;
  } else {
    caravan.payload.push({
      goodId: staple.i,
      dealId: FOOD_COLOAD_DEAL_ID,
      units: drawn.units,
      value,
      cargoSlotsPerUnit,
      isFoodCoLoad: true,
      unitCost: drawn.unitCost
    });
  }

  caravan.units = rn(
    caravan.payload.reduce((sum, item) => sum + item.units, 0),
    2
  );
  caravan.value = rn(
    caravan.payload.reduce((sum, item) => sum + item.value, 0),
    2
  );

  if (caravan.transportAllocations) {
    const used = payloadUsedSlots(caravan);
    for (const allocation of caravan.transportAllocations) allocation.usedSlots = used;
  }

  // distanceScale reserved for future freight pricing on co-load legs
  void options?.distanceScale;
  return drawn.units;
}

/** Return food co-load cargo to the exporter ledger (cancel thin / abort). */
export function restoreFoodCoLoadToOrigin(caravan: Caravan): void {
  if (caravan.sellerType !== "market") return;
  const staple = getStapleFoodGood();
  if (!staple) return;
  const exporter = getMarkets().find(market => market.i === caravan.seller);
  if (!exporter?.foodLedger) return;

  for (const item of caravan.payload) {
    if (!item.isFoodCoLoad || item.goodId !== staple.i || item.units <= UNIT_EPSILON) continue;
    returnFoodExportToLedger(exporter.foodLedger, item.units, item.unitCost ?? 0);
    item.units = 0;
    item.value = 0;
  }

  syncStapleFoodMarketStock(exporter, staple.i, staple.value);
  caravan.payload = caravan.payload.filter(item => !(item.isFoodCoLoad && item.units <= UNIT_EPSILON));
  caravan.units = rn(
    caravan.payload.reduce((sum, item) => sum + item.units, 0),
    2
  );
  caravan.value = rn(
    caravan.payload.reduce((sum, item) => sum + item.value, 0),
    2
  );
}

/**
 * Deliver food co-load on arrival (spoilage applied). Returns delivered units.
 * Call before or instead of treating these rows as ordinary retail stock.
 */
export function settleFoodCoLoadOnArrival(caravan: Caravan, distanceScale: number): number {
  if (caravan.buyerType !== "market") return 0;
  const staple = getStapleFoodGood();
  if (!staple) return 0;
  const importer = getMarkets().find(market => market.i === caravan.buyer);
  if (!importer) return 0;
  if (!importer.foodLedger) return 0;

  const travelDays = travelDaysForCaravan(caravan, distanceScale);
  const deliveredShare = foodDeliveredShare(travelDays);
  let deliveredTotal = 0;

  for (const item of caravan.payload) {
    if (!item.isFoodCoLoad || item.goodId !== staple.i || item.units <= UNIT_EPSILON) continue;
    const delivered = rn(item.units * deliveredShare, 2);
    if (delivered > UNIT_EPSILON) {
      receiveFoodImport(importer.foodLedger, delivered, item.unitCost ?? 0);
      deliveredTotal += delivered;
    }
    item.units = 0;
    item.value = 0;
  }

  caravan.payload = caravan.payload.filter(item => !(item.isFoodCoLoad && item.units <= UNIT_EPSILON));
  syncStapleFoodMarketStock(importer, staple.i, staple.value);
  return rn(deliveredTotal, 2);
}

/** Food already left the exporter; loss writes off cargo (no destination credit). */
export function settleFoodCoLoadOnLoss(caravan: Caravan): void {
  caravan.payload = caravan.payload.filter(item => !item.isFoodCoLoad);
  caravan.units = rn(
    caravan.payload.reduce((sum, item) => sum + item.units, 0),
    2
  );
  caravan.value = rn(
    caravan.payload.reduce((sum, item) => sum + item.value, 0),
    2
  );
}
