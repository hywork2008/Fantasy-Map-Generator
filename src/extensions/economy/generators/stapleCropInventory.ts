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
