/**
 * Merchant export warehouse: goods reserved for inter-market shipment.
 * Retail stock is deducted once on book; lots survive deal wipes until loaded or returned.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase C
 */

import { rn } from "../../hostUtils";
import {
  getExportStagingLots,
  getMarketById,
  getNextExportStagingLotId,
  setExportStagingLots,
  setNextExportStagingLotId
} from "../economyContext";
import type { ExportStagingLot } from "./marketTypes";

const UNIT_EPSILON = 0.000001;

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
  // Merge same O/D/good when unit cost matches closely so packing stays homogeneous.
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
   * Returns null when the market/good row is missing or units are non-positive.
   */
  bookFromRetail(input: BookExportStagingInput): ExportStagingLot | null {
    if (!(input.units > UNIT_EPSILON)) return null;
    const market = getMarketById(input.marketId);
    if (!market) return null;
    const row = market.goods[input.goodId];
    if (!row || row.stock + UNIT_EPSILON < input.units) return null;

    row.stock = rn(Math.max(0, row.stock - input.units), 2);

    // getSliceArray returns a fresh [] when the field is missing — always re-store so
    // subsequent reads see the same durable array (pack slice or simulation slice).
    const lots = [...getExportStagingLots()];
    const existing = findMergeTarget(lots, input);
    if (existing) {
      existing.units = rn(existing.units + input.units, 2);
      // Prefer the newest deal id for UI linkage when merging.
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
      units: rn(input.units, 2),
      unitCost: input.unitCost,
      dealId: input.dealId,
      distance: input.distance,
      durationDays: input.durationDays,
      maintenanceCost: input.maintenanceCost,
      taxPerUnit: input.taxPerUnit
    };
    lots.push(lot);
    setExportStagingLots(lots);
    setNextExportStagingLotId(id + 1);
    return lot;
  }

  /** Units still waiting in the export warehouse (all origins). */
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
   * Empty lots are pruned. Returns actual units taken.
   */
  takeFromLot(lotId: number, units: number): number {
    if (!(units > UNIT_EPSILON)) return 0;
    const lots = [...getExportStagingLots()];
    const lot = lots.find(entry => entry.id === lotId);
    if (!lot) return 0;
    const taken = Math.min(lot.units, units);
    lot.units = rn(Math.max(0, lot.units - taken), 2);
    setExportStagingLots(lot.units <= UNIT_EPSILON ? lots.filter(entry => entry.id !== lotId) : lots);
    return taken;
  }

  /** Credit retail stock at the origin market (cancel / cleanup path). */
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

  /** Cancel one lot entirely and restore its units to retail. */
  cancelLot(lotId: number): number {
    const lots = [...getExportStagingLots()];
    const lot = lots.find(entry => entry.id === lotId);
    if (!lot) return 0;
    const units = lot.units;
    this.returnUnitsToRetail(lot.marketId, lot.goodId, units);
    setExportStagingLots(lots.filter(entry => entry.id !== lotId));
    return units;
  }

  /** Extension disable / map regenerate: put every staged unit back into retail stock. */
  returnAllToRetail(): void {
    for (const lot of [...getExportStagingLots()]) {
      this.returnUnitsToRetail(lot.marketId, lot.goodId, lot.units);
    }
    setExportStagingLots([]);
    setNextExportStagingLotId(1);
  }

  clear(): void {
    setExportStagingLots([]);
    setNextExportStagingLotId(1);
  }
}

export const ExportStaging = new ExportStagingModule();
