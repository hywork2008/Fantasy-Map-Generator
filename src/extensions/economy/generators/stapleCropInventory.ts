import { rn } from "../../hostUtils";
import type { FoodLedger } from "./marketTypes";
import type { StapleCropInventory } from "./stapleCropInventoryTypes";

/** Consumption, trade and capping draw the oldest grain first. */
const OLDEST_FIRST = ["age3", "age2", "age1", "age0"] as const;

/**
 * One physical crop's aged Market stock. Amounts are expressed in the shared
 * wheat-equivalent food unit for nutrition, but the `goodId` is never merged
 * with another crop: Wheat, Rye, and Barley remain separate trade lots.
 */
export type { StapleCropInventory } from "./stapleCropInventoryTypes";

function emptyInventory(): StapleCropInventory {
  return {
    age0: 0,
    age1: 0,
    age2: 0,
    age3: 0,
    age0UnitCost: 0,
    age1UnitCost: 0,
    age2UnitCost: 0,
    age3UnitCost: 0,
    overflow: 0
  };
}

const EPSILON = 1e-7;

function storedUnits(inventory: StapleCropInventory): number {
  return (
    Math.max(0, inventory.age0) +
    Math.max(0, inventory.age1) +
    Math.max(0, inventory.age2) +
    Math.max(0, inventory.age3 ?? 0)
  );
}

function cropLedgerTotals(ledger: FoodLedger): {
  stored: number;
  overflow: number;
} {
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
  for (const age of OLDEST_FIRST) {
    if (!(remaining > EPSILON)) break;
    const taken = Math.min(Math.max(0, inventory[age] ?? 0), remaining);
    inventory[age] = rn(Math.max(0, (inventory[age] ?? 0) - taken), 2);
    remaining -= taken;
    if (!((inventory[age] ?? 0) > EPSILON)) {
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
    Math.max(0, ledger.foodStockAge0) +
    Math.max(0, ledger.foodStockAge1) +
    Math.max(0, ledger.foodStockAge2) +
    Math.max(0, ledger.foodStockAge3 ?? 0);
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
 * Food transport takes stored crop buckets, never overflow or a stale generic-Goods mirror.
 * A missing crop in an already tracked ledger is zero; null is only for aggregate-only saves.
 */
export function getTransportableStapleCropUnits(ledger: FoodLedger, goodId: number): number | null {
  if (!ledger.stapleCropInventories || !Object.keys(ledger.stapleCropInventories).length) return null;
  const inventory = ledger.stapleCropInventories[goodId];
  return inventory ? Math.min(Math.max(0, ledger.exportable), storedUnits(inventory)) : 0;
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

/**
 * Moves `share` of every crop's stored buckets, age by age and at their unit cost, from one ledger
 * to another; overflow heaped outside the granary stays. Returns the units moved.
 */
export function transferStapleCropShare(from: FoodLedger, to: FoodLedger, share: number): number {
  const fraction = Math.min(1, Math.max(0, share));
  if (!(fraction > EPSILON)) return 0;
  let moved = 0;
  for (const [goodId, source] of Object.entries(from.stapleCropInventories ?? {})) {
    const target = getStapleCropInventory(to, Number(goodId));
    for (const age of OLDEST_FIRST) {
      const units = rn(Math.max(0, source[age] ?? 0) * fraction, 2);
      if (!(units > EPSILON)) continue;
      const held = Math.max(0, target[age] ?? 0);
      target[`${age}UnitCost`] = rn(
        (held * (target[`${age}UnitCost`] ?? 0) + units * (source[`${age}UnitCost`] ?? 0)) / (held + units),
        4
      );
      target[age] = rn(held + units, 2);
      source[age] = rn(Math.max(0, (source[age] ?? 0) - units), 2);
      moved += units;
    }
  }
  refreshLegacyFoodLedgerTotals(from);
  refreshLegacyFoodLedgerTotals(to);
  from.exportable = rn(Math.max(0, from.exportable - moved), 2);
  return rn(moved, 2);
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
  wheat.age3 = Math.max(0, ledger.foodStockAge3 ?? 0);
  wheat.age3UnitCost = Math.max(0, ledger.foodStockAge3UnitCost ?? 0);
  wheat.overflow = Math.max(0, ledger.storageOverflow);
  refreshLegacyFoodLedgerTotals(ledger);
}

/** Keeps legacy aggregate fields read-only mirrors of crop-specific lots. */
export function refreshLegacyFoodLedgerTotals(ledger: FoodLedger): void {
  const inventories = Object.values(ledger.stapleCropInventories ?? {});
  const sum = (field: keyof Pick<StapleCropInventory, "age0" | "age1" | "age2" | "age3" | "overflow">) =>
    inventories.reduce((total, inventory) => total + (inventory[field] ?? 0), 0);
  ledger.foodStockAge0 = rn(sum("age0"), 2);
  ledger.foodStockAge1 = rn(sum("age1"), 2);
  ledger.foodStockAge2 = rn(sum("age2"), 2);
  ledger.foodStockAge3 = rn(sum("age3"), 2);
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

/** Quarterly storage-loss shares (docs/plan/grain-storage-life.md §3.2). */
export interface QuarterlyStorageLoss {
  /** Age0-2 grain. */
  fresh: number;
  /** Age3 grain carried past the next harvest. */
  carryover: number;
  /** Grain heaped over the storage cap. */
  overflow: number;
}

/** Keeps each bucket's unit cost when it shrinks; merges cost when two lots combine. */
function mergeUnitCost(units: number, unitCost: number, addedUnits: number, addedUnitCost: number): number {
  const total = units + addedUnits;
  return total > EPSILON ? rn((units * unitCost + addedUnits * addedUnitCost) / total, 2) : 0;
}

/**
 * Ages one crop's own buckets by one quarter. Every bucket first loses its quarterly spoilage;
 * then age2 joins the carried-over age3 (grain is no longer discarded on a date), age1 becomes
 * age2, age0 becomes age1, and this quarter's production lands in a fresh age0. Mirrors
 * `FoodProductionModule.advanceQuarterlyStock()` on the shared aggregate buckets, scoped to one
 * crop. Called every quarter for every crop this market has ever produced, even one with zero
 * output this cycle, so a crop that stops producing still ages and spoils its stock.
 * Returns the units spoiled.
 */
export function advanceStapleCropInventoryQuarterly(
  inventory: StapleCropInventory,
  producedThisQuarter: number,
  farmgateUnitCost: number,
  loss: QuarterlyStorageLoss = { fresh: 0, carryover: 0, overflow: 0 }
): number {
  let spoiled = 0;
  const spoil = (units: number, share: number): number => {
    const kept = rn(Math.max(0, units) * (1 - share), 2);
    spoiled += Math.max(0, units) - kept;
    return kept;
  };
  inventory.overflow = spoil(inventory.overflow, loss.overflow);
  const age3 = spoil(inventory.age3 ?? 0, loss.carryover);
  const age2 = spoil(inventory.age2, loss.fresh);
  inventory.age3UnitCost = mergeUnitCost(age3, inventory.age3UnitCost ?? 0, age2, inventory.age2UnitCost);
  inventory.age3 = rn(age3 + age2, 2);
  inventory.age2 = spoil(inventory.age1, loss.fresh);
  inventory.age2UnitCost = inventory.age1UnitCost;
  inventory.age1 = spoil(inventory.age0, loss.fresh);
  inventory.age1UnitCost = inventory.age0UnitCost;
  inventory.age0 = rn(Math.max(0, producedThisQuarter), 2);
  inventory.age0UnitCost = producedThisQuarter > 0 ? farmgateUnitCost : 0;
  return rn(spoiled, 2);
}

/**
 * Caps the market's total staple-crop stock (every crop combined) at `capTotal`, trimming the
 * oldest tier first — every crop's age3, then age2, age1 and age0 — into each crop's *own* overflow
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

  for (const age of OLDEST_FIRST) {
    if (!(excess > EPSILON)) break;
    const tierTotal = inventories.reduce((sum, inventory) => sum + Math.max(0, inventory[age] ?? 0), 0);
    if (!(tierTotal > EPSILON)) continue;
    const tierExcess = Math.min(tierTotal, excess);
    for (const inventory of inventories) {
      if (!(tierExcess > EPSILON)) break;
      const share = Math.max(0, inventory[age] ?? 0) / tierTotal;
      const taken = Math.min(Math.max(0, inventory[age] ?? 0), rn(tierExcess * share, 2));
      if (!(taken > EPSILON)) continue;
      inventory[age] = rn((inventory[age] ?? 0) - taken, 2);
      inventory.overflow = rn(Math.max(0, inventory.overflow) + taken, 2);
      excess -= taken;
    }
  }
}

/**
 * Draws one specific crop's staple food for outbound transport (merchant caravan co-load),
 * oldest-first from that crop's own age0-3 buckets only — never its overflow, so an in-transit
 * shipment never competes with stock a market is protecting past its own storage cap.
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

  const maxDraw = Math.min(amount, getTransportableStapleCropUnits(ledger, goodId) ?? 0);
  if (!(maxDraw > EPSILON)) return { units: 0, unitCost: 0 };

  let remaining = maxDraw;
  let costSum = 0;
  let drawn = 0;
  for (const age of OLDEST_FIRST) {
    if (!(remaining > EPSILON)) break;
    const available = Math.max(0, inventory[age] ?? 0);
    const taken = Math.min(available, remaining);
    if (!(taken > EPSILON)) continue;
    inventory[age] = rn(available - taken, 2);
    costSum += taken * (inventory[`${age}UnitCost`] ?? 0);
    drawn += taken;
    remaining -= taken;
    if (!((inventory[age] ?? 0) > EPSILON)) {
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
 * the crop inventories (not the aggregate `ledger.foodStockAge0-3` mirror) so a draw can never be
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

  for (const age of OLDEST_FIRST) {
    for (const inventory of inventories) {
      if (!(remaining > 0)) break;
      const taken = Math.min(Math.max(0, inventory[age] ?? 0), remaining);
      if (!(taken > 0)) continue;
      inventory[age] = rn((inventory[age] ?? 0) - taken, 2);
      remaining -= taken;
    }
  }

  const drawn = rn(requestedUnits - remaining, 2);
  refreshLegacyFoodLedgerTotals(ledger);
  return drawn;
}
