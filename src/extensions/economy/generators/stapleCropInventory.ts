import { rn } from "../../hostUtils";
import type { FoodLedger } from "./marketTypes";

/**
 * One physical crop's aged Market stock. Amounts are expressed in the shared
 * wheat-equivalent food unit for nutrition, but the `goodId` is never merged
 * with another crop: Wheat, Rye, and Barley remain separate trade lots.
 */
export interface StapleCropInventory {
  age0: number;
  age1: number;
  age2: number;
  age0UnitCost: number;
  age1UnitCost: number;
  age2UnitCost: number;
  overflow: number;
}

function emptyInventory(): StapleCropInventory {
  return { age0: 0, age1: 0, age2: 0, age0UnitCost: 0, age1UnitCost: 0, age2UnitCost: 0, overflow: 0 };
}

const EPSILON = 1e-7;

function storedUnits(inventory: StapleCropInventory): number {
  return Math.max(0, inventory.age0) + Math.max(0, inventory.age1) + Math.max(0, inventory.age2);
}

function cropLedgerTotals(ledger: FoodLedger): { stored: number; overflow: number } {
  return Object.values(ledger.stapleCropInventories ?? {}).reduce(
    (totals, inventory) => ({
      stored: totals.stored + storedUnits(inventory),
      overflow: totals.overflow + Math.max(0, inventory.overflow)
    }),
    { stored: 0, overflow: 0 }
  );
}

function debitOldest(inventory: StapleCropInventory, units: number): number {
  let remaining = units;
  for (const age of ["age2", "age1", "age0"] as const) {
    if (!(remaining > EPSILON)) break;
    const taken = Math.min(Math.max(0, inventory[age]), remaining);
    inventory[age] = rn(Math.max(0, inventory[age] - taken), 2);
    remaining -= taken;
    if (!(inventory[age] > EPSILON)) {
      inventory[age] = 0;
      inventory[`${age}UnitCost`] = 0;
    }
  }
  return rn(units - remaining, 2);
}

/** Returns one actual crop's inventory, creating an empty lot when necessary. */
export function getStapleCropInventory(ledger: FoodLedger, goodId: number): StapleCropInventory {
  ledger.stapleCropInventories ??= {};
  const existing = ledger.stapleCropInventories[goodId];
  if (existing) return existing;
  const inventory = emptyInventory();
  ledger.stapleCropInventories[goodId] = inventory;
  return inventory;
}

/**
 * The quantity of one physical crop that can leave the Food Ledger without
 * touching the market's protected food reserve. `null` means this market has
 * no crop-specific lot, so callers may use its ordinary Goods inventory.
 */
export function getTradeableStapleCropUnits(ledger: FoodLedger, goodId: number): number | null {
  const inventory = ledger.stapleCropInventories?.[goodId];
  if (!inventory) return null;

  const totalStored =
    Math.max(0, ledger.foodStockAge0) + Math.max(0, ledger.foodStockAge1) + Math.max(0, ledger.foodStockAge2);
  const cropStored = storedUnits(inventory);
  const cropTotals = cropLedgerTotals(ledger);
  const exportable = Math.min(Math.max(0, ledger.exportable), totalStored);
  const allocatedExportable =
    cropTotals.stored > EPSILON ? Math.min(cropStored, (exportable * cropStored) / cropTotals.stored) : 0;
  const allocatedOverflow =
    cropTotals.overflow > EPSILON
      ? Math.min(
          Math.max(0, inventory.overflow),
          (Math.max(0, ledger.storageOverflow) * inventory.overflow) / cropTotals.overflow
        )
      : 0;
  return rn(allocatedOverflow + allocatedExportable, 2);
}

/**
 * Removes a named crop from the tradeable portion of a Food Ledger. The same
 * crop lot and aggregate ledger are debited together, preserving both identity
 * and the food-reserve constraint.
 */
export function drawTradeableStapleCrop(ledger: FoodLedger, goodId: number, units: number): number {
  const inventory = ledger.stapleCropInventories?.[goodId];
  const available = getTradeableStapleCropUnits(ledger, goodId);
  if (!inventory || available === null || !(units > EPSILON)) return 0;

  let remaining = Math.min(units, available);
  const fromOverflow = Math.min(Math.max(0, inventory.overflow), remaining);
  inventory.overflow = rn(Math.max(0, inventory.overflow - fromOverflow), 2);
  ledger.storageOverflow = rn(Math.max(0, ledger.storageOverflow - fromOverflow), 2);
  remaining -= fromOverflow;

  const fromStored = debitOldest(inventory, remaining);
  const aggregate = {
    age0: ledger.foodStockAge0,
    age1: ledger.foodStockAge1,
    age2: ledger.foodStockAge2,
    age0UnitCost: ledger.foodStockAge0UnitCost,
    age1UnitCost: ledger.foodStockAge1UnitCost,
    age2UnitCost: ledger.foodStockAge2UnitCost,
    overflow: 0
  };
  const aggregateDebit = debitOldest(aggregate, fromStored);
  ledger.foodStockAge0 = aggregate.age0;
  ledger.foodStockAge1 = aggregate.age1;
  ledger.foodStockAge2 = aggregate.age2;
  ledger.foodStockAge0UnitCost = aggregate.age0UnitCost;
  ledger.foodStockAge1UnitCost = aggregate.age1UnitCost;
  ledger.foodStockAge2UnitCost = aggregate.age2UnitCost;
  ledger.exportable = rn(Math.max(0, ledger.exportable - aggregateDebit), 2);
  return rn(fromOverflow + aggregateDebit, 2);
}

/** Returns a player-sold physical crop to the newest Food Ledger bucket. */
export function returnTradeableStapleCrop(ledger: FoodLedger, goodId: number, units: number, unitCost: number): void {
  if (!(units > EPSILON)) return;
  creditStapleCropHarvest(ledger, goodId, units, unitCost);
  const nextUnits = ledger.foodStockAge0 + units;
  ledger.foodStockAge0UnitCost =
    nextUnits > EPSILON
      ? rn((ledger.foodStockAge0 * ledger.foodStockAge0UnitCost + units * unitCost) / nextUnits, 2)
      : 0;
  ledger.foodStockAge0 = rn(nextUnits, 2);
  ledger.exportable = rn(Math.max(0, ledger.exportable) + units, 2);
}

/**
 * Migrates a legacy aggregate Grain ledger into Wheat exactly once. Existing
 * crop lots always win, so loading a modern save never rewrites its identity.
 */
export function migrateLegacyGrainInventory(ledger: FoodLedger, wheatGoodId: number): void {
  if (ledger.stapleCropInventories && Object.keys(ledger.stapleCropInventories).length) return;
  const wheat = getStapleCropInventory(ledger, wheatGoodId);
  wheat.age0 = Math.max(0, ledger.foodStockAge0);
  wheat.age1 = Math.max(0, ledger.foodStockAge1);
  wheat.age2 = Math.max(0, ledger.foodStockAge2);
  wheat.age0UnitCost = Math.max(0, ledger.foodStockAge0UnitCost);
  wheat.age1UnitCost = Math.max(0, ledger.foodStockAge1UnitCost);
  wheat.age2UnitCost = Math.max(0, ledger.foodStockAge2UnitCost);
  wheat.overflow = Math.max(0, ledger.storageOverflow);
  refreshLegacyFoodLedgerTotals(ledger);
}

/** Keeps legacy aggregate fields read-only mirrors of crop-specific lots. */
export function refreshLegacyFoodLedgerTotals(ledger: FoodLedger): void {
  const inventories = Object.values(ledger.stapleCropInventories ?? {});
  const sum = (field: keyof Pick<StapleCropInventory, "age0" | "age1" | "age2" | "overflow">) =>
    inventories.reduce((total, inventory) => total + inventory[field], 0);
  ledger.foodStockAge0 = rn(sum("age0"), 2);
  ledger.foodStockAge1 = rn(sum("age1"), 2);
  ledger.foodStockAge2 = rn(sum("age2"), 2);
  ledger.storageOverflow = rn(sum("overflow"), 2);
}

/** Lands one crop's new harvest in its newest age bucket. */
export function creditStapleCropHarvest(ledger: FoodLedger, goodId: number, units: number, unitCost: number): void {
  if (!(units > 0)) return;
  const inventory = getStapleCropInventory(ledger, goodId);
  const previousUnits = inventory.age0;
  const nextUnits = rn(previousUnits + units, 2);
  inventory.age0UnitCost =
    nextUnits > 0 ? rn((previousUnits * inventory.age0UnitCost + units * unitCost) / nextUnits, 2) : 0;
  inventory.age0 = nextUnits;
}

/**
 * Draws food from the oldest physical crop lots first. Crop identity is kept
 * in each lot; only the caller's nutritional requirement is aggregated.
 */
export function drawStapleCropFood(ledger: FoodLedger, requestedUnits: number): number {
  if (!(requestedUnits > 0)) return 0;
  const aggregateAvailable = Math.max(0, ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2);
  requestedUnits = Math.min(requestedUnits, aggregateAvailable);
  if (!(requestedUnits > 0)) return 0;
  const inventories = Object.values(ledger.stapleCropInventories ?? {});
  let remaining = requestedUnits;

  for (const age of ["age2", "age1", "age0"] as const) {
    for (const inventory of inventories) {
      if (!(remaining > 0)) break;
      const taken = Math.min(Math.max(0, inventory[age]), remaining);
      if (!(taken > 0)) continue;
      inventory[age] = rn(inventory[age] - taken, 2);
      remaining -= taken;
    }
  }

  const drawn = rn(requestedUnits - remaining, 2);
  // The aggregate fields remain compatibility mirrors during the migration.
  let aggregateRemaining = drawn;
  for (const age of ["foodStockAge2", "foodStockAge1", "foodStockAge0"] as const) {
    if (!(aggregateRemaining > 0)) break;
    const taken = Math.min(Math.max(0, ledger[age]), aggregateRemaining);
    ledger[age] = rn(ledger[age] - taken, 2);
    aggregateRemaining -= taken;
  }
  return drawn;
}
