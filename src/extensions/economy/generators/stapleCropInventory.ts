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
 * Removes a named crop from the tradeable portion of a Food Ledger. The crop lot is debited
 * directly (its own overflow, then its own oldest-first buckets); the aggregate ledger fields
 * are then resynced from every crop's real totals via refreshLegacyFoodLedgerTotals() rather
 * than mirrored through a second, independently-aged copy — see stapleCropInventories doc
 * comment on FoodLedger for why keeping two separately-aged books in sync used to drift.
 */
export function drawTradeableStapleCrop(ledger: FoodLedger, goodId: number, units: number): number {
  const inventory = ledger.stapleCropInventories?.[goodId];
  const available = getTradeableStapleCropUnits(ledger, goodId);
  if (!inventory || available === null || !(units > EPSILON)) return 0;

  let remaining = Math.min(units, available);
  const fromOverflow = Math.min(Math.max(0, inventory.overflow), remaining);
  inventory.overflow = rn(Math.max(0, inventory.overflow - fromOverflow), 2);
  remaining -= fromOverflow;

  const fromStored = debitOldest(inventory, remaining);
  refreshLegacyFoodLedgerTotals(ledger);
  ledger.exportable = rn(Math.max(0, ledger.exportable - fromStored), 2);
  return rn(fromOverflow + fromStored, 2);
}

/** Returns a player-sold physical crop to the newest Food Ledger bucket. */
export function returnTradeableStapleCrop(ledger: FoodLedger, goodId: number, units: number, unitCost: number): void {
  if (!(units > EPSILON)) return;
  creditStapleCropHarvest(ledger, goodId, units, unitCost);
  refreshLegacyFoodLedgerTotals(ledger);
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
 * Ages one crop's own buckets by one quarter: the oldest bucket (age2) becomes this crop's own
 * overflow, age1 becomes age2, age0 becomes age1, and this quarter's production lands in a fresh
 * age0. Mirrors the shift `FoodProductionModule.advanceQuarterlyStock()` performs on the shared
 * aggregate buckets, but scoped to a single crop, so every catalogued crop — not only the one
 * seeded at bootstrap — actually rotates through age0/1/2 instead of piling up forever in age0.
 * Called every quarter for every crop this market has ever produced, even one with zero output
 * this cycle, so a crop that stops producing still ages its existing stock out on schedule.
 */
export function advanceStapleCropInventoryQuarterly(
  inventory: StapleCropInventory,
  producedThisQuarter: number,
  farmgateUnitCost: number
): void {
  inventory.overflow = rn(Math.max(0, inventory.overflow) + Math.max(0, inventory.age2), 2);
  inventory.age2 = inventory.age1;
  inventory.age2UnitCost = inventory.age1UnitCost;
  inventory.age1 = inventory.age0;
  inventory.age1UnitCost = inventory.age0UnitCost;
  inventory.age0 = rn(Math.max(0, producedThisQuarter), 2);
  inventory.age0UnitCost = producedThisQuarter > 0 ? farmgateUnitCost : 0;
}

/**
 * Caps the market's total staple-crop stock (every crop combined) at `capTotal`, trimming the
 * oldest tier first — every crop's age2, then age1, then age0 — into each crop's *own* overflow
 * bucket, split proportionally to that crop's share of the tier being trimmed. This keeps one
 * market-wide cap (matching the legacy aggregate cap) while giving every crop a real, populated
 * overflow bucket instead of only the market-wide `ledger.storageOverflow` mirror, which used to
 * leave every crop's `getTradeableStapleCropUnits()` overflow share permanently at 0.
 */
export function applyStapleCropStorageCap(ledger: FoodLedger, capTotal: number): void {
  const inventories = Object.values(ledger.stapleCropInventories ?? {});
  if (!inventories.length) return;
  let excess = inventories.reduce((sum, inventory) => sum + storedUnits(inventory), 0) - capTotal;
  if (!(excess > EPSILON)) return;

  for (const age of ["age2", "age1", "age0"] as const) {
    if (!(excess > EPSILON)) break;
    const tierTotal = inventories.reduce((sum, inventory) => sum + Math.max(0, inventory[age]), 0);
    if (!(tierTotal > EPSILON)) continue;
    const tierExcess = Math.min(tierTotal, excess);
    for (const inventory of inventories) {
      if (!(tierExcess > EPSILON)) break;
      const share = Math.max(0, inventory[age]) / tierTotal;
      const taken = Math.min(Math.max(0, inventory[age]), rn(tierExcess * share, 2));
      if (!(taken > EPSILON)) continue;
      inventory[age] = rn(inventory[age] - taken, 2);
      inventory.overflow = rn(Math.max(0, inventory.overflow) + taken, 2);
      excess -= taken;
    }
  }
}

/**
 * Draws one specific crop's staple food for outbound transport (merchant caravan co-load),
 * oldest-first from that crop's own age0-2 buckets only — never its overflow, so an in-transit
 * shipment never competes with stock a market is protecting past its own 9-month storage cap.
 * Capped by `ledger.exportable`, matching every other outbound draw. Returns the units actually
 * drawn and their weighted-average unit cost, for cargo valuation.
 */
export function drawStapleCropForTransport(
  ledger: FoodLedger,
  goodId: number,
  amount: number
): { units: number; unitCost: number } {
  const inventory = ledger.stapleCropInventories?.[goodId];
  if (!inventory || !(amount > EPSILON)) return { units: 0, unitCost: 0 };

  const cropStored = storedUnits(inventory);
  const maxDraw = Math.min(amount, Math.max(0, ledger.exportable), cropStored);
  if (!(maxDraw > EPSILON)) return { units: 0, unitCost: 0 };

  let remaining = maxDraw;
  let costSum = 0;
  let drawn = 0;
  for (const age of ["age2", "age1", "age0"] as const) {
    if (!(remaining > EPSILON)) break;
    const available = Math.max(0, inventory[age]);
    const taken = Math.min(available, remaining);
    if (!(taken > EPSILON)) continue;
    inventory[age] = rn(available - taken, 2);
    costSum += taken * inventory[`${age}UnitCost`];
    drawn += taken;
    remaining -= taken;
    if (!(inventory[age] > EPSILON)) {
      inventory[age] = 0;
      inventory[`${age}UnitCost`] = 0;
    }
  }

  drawn = rn(drawn, 2);
  refreshLegacyFoodLedgerTotals(ledger);
  ledger.exportable = rn(Math.max(0, ledger.exportable - drawn), 2);
  const unitCost = drawn > EPSILON ? rn(costSum / drawn, 2) : 0;
  return { units: drawn, unitCost };
}

/**
 * Draws food from the oldest physical crop lots first. Crop identity is kept in each lot; only
 * the caller's nutritional requirement is aggregated. The available amount is read directly from
 * the crop inventories (not the aggregate `ledger.foodStockAge0-2` mirror) so a draw can never be
 * short-circuited by that mirror lagging behind the real per-crop totals. The aggregate fields
 * are resynced afterwards via refreshLegacyFoodLedgerTotals() for the many other call sites
 * (pricing, storage cap, farmgate settlement) that still read them.
 */
export function drawStapleCropFood(ledger: FoodLedger, requestedUnits: number): number {
  if (!(requestedUnits > 0)) return 0;
  const inventories = Object.values(ledger.stapleCropInventories ?? {});
  const aggregateAvailable = inventories.reduce((sum, inventory) => sum + storedUnits(inventory), 0);
  requestedUnits = Math.min(requestedUnits, aggregateAvailable);
  if (!(requestedUnits > 0)) return 0;
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
  refreshLegacyFoodLedgerTotals(ledger);
  return drawn;
}
