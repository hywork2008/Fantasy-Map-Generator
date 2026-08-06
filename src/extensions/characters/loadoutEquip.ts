/**
 * Equip / unequip / editor loadout mutations (EQ-2).
 * Spec: docs/plan/character-loadout-and-readiness.md
 *
 * Pure character mutations: debit/credit personal inventory only — no market prices.
 */
import type { Character, CharacterLoadout, EquipmentQuality, EquippedItem, LoadoutSlotId } from "./characterTypes";
import { clampEquipmentQuality, normalizeCharacterLoadout } from "./loadoutSeed";

/** Default quality when equipping a purchased good (design open question default). */
export const EQUIP_FROM_INVENTORY_DEFAULT_QUALITY: EquipmentQuality = 3;

/** Good names allowed in each loadout slot. */
export const LOADOUT_SLOT_GOOD_NAMES: Readonly<Record<LoadoutSlotId, readonly string[]>> = {
  body: ["Garments", "Cloth", "Linen", "Silk", "Furs"],
  weapon: ["Arms"],
  accessory: ["Jewelry"],
  mount: ["Horses"]
};

export const LOADOUT_SLOT_IDS: readonly LoadoutSlotId[] = ["body", "weapon", "accessory", "mount"];

export type LoadoutCommandErrorCode =
  | "character_not_found"
  | "character_dead"
  | "invalid_slot"
  | "invalid_good"
  | "ineligible_good"
  | "insufficient_inventory"
  | "slot_empty"
  | "invalid_quality"
  | "invalid_payload";

export interface LoadoutCommandResult {
  ok: boolean;
  changed: boolean;
  code?: LoadoutCommandErrorCode;
  message?: string;
}

export interface NamedGoodRef {
  i: number;
  name: string;
}

function fail(code: LoadoutCommandErrorCode, message: string): LoadoutCommandResult {
  return { ok: false, changed: false, code, message };
}

function ok(changed: boolean): LoadoutCommandResult {
  return { ok: true, changed };
}

export function isLoadoutSlotId(value: unknown): value is LoadoutSlotId {
  return typeof value === "string" && (LOADOUT_SLOT_IDS as readonly string[]).includes(value);
}

/** Whether a catalog good name may be placed in the given slot. */
export function isGoodEligibleForSlot(slot: LoadoutSlotId, goodName: string): boolean {
  return LOADOUT_SLOT_GOOD_NAMES[slot].includes(goodName);
}

export function resolveGoodName(goods: readonly NamedGoodRef[], goodId: number): string | undefined {
  return goods.find(good => good.i === goodId)?.name;
}

function inventoryUnits(character: Character, goodId: number): number {
  return character.inventory?.[goodId] ?? 0;
}

function debitInventory(character: Character, goodId: number, units: number): void {
  character.inventory ??= {};
  const next = (character.inventory[goodId] ?? 0) - units;
  if (next > 1e-9) character.inventory[goodId] = next;
  else delete character.inventory[goodId];
  if (Object.keys(character.inventory).length === 0) delete character.inventory;
}

function creditInventory(character: Character, goodId: number, units: number): void {
  character.inventory ??= {};
  character.inventory[goodId] = (character.inventory[goodId] ?? 0) + units;
}

/** Return an equipped-from-inventory item to the bag; seeded/editor kit is discarded. */
function releaseSlotItem(character: Character, item: EquippedItem | undefined): void {
  if (!item) return;
  if (item.source === "equipped") creditInventory(character, item.goodId, 1);
}

function styleKeyForEquip(slot: LoadoutSlotId, quality: EquipmentQuality, goodName: string): string {
  if (slot === "weapon") {
    if (quality >= 4) return "officer_arms";
    if (quality >= 3) return "soldier_arms";
    return "militia_arms";
  }
  if (slot === "accessory") return "court_jewel";
  if (slot === "mount") return "riding_mount";
  // body
  if (goodName === "Silk") return quality >= 5 ? "regalia" : "court_attire";
  if (goodName === "Furs") return "frontier_furs";
  if (goodName === "Cloth" || goodName === "Linen") return quality <= 1 ? "rags" : "work_clothes";
  switch (quality) {
    case 1:
      return "rags";
    case 2:
      return "work_clothes";
    case 3:
      return "town_dress";
    case 4:
      return "court_attire";
    case 5:
      return "regalia";
  }
}

export interface EquipFromInventoryArgs {
  character: Character;
  slot: LoadoutSlotId;
  goodId: number;
  /** Defaults to {@link EQUIP_FROM_INVENTORY_DEFAULT_QUALITY}. */
  quality?: number;
  goods: readonly NamedGoodRef[];
  /** When the goods catalogue is incomplete, callers may supply the catalog name. */
  goodName?: string;
}

/**
 * Equip one unit of an inventory good into a loadout slot.
 * Replaces any previous slot contents (returns previous if source was equipped).
 */
export function equipFromInventory(args: EquipFromInventoryArgs): LoadoutCommandResult {
  const { character, slot, goodId, goods } = args;
  if (character.dead) return fail("character_dead", "Cannot equip a deceased character.");
  if (!Number.isInteger(goodId) || goodId <= 0) return fail("invalid_good", "goodId must be a positive integer.");

  const goodName = resolveGoodName(goods, goodId) ?? args.goodName;
  if (!goodName) return fail("invalid_good", `Unknown good id ${goodId}.`);
  if (!isGoodEligibleForSlot(slot, goodName)) {
    return fail("ineligible_good", `${goodName} cannot be equipped in the ${slot} slot.`);
  }
  if (inventoryUnits(character, goodId) + 1e-9 < 1) {
    return fail("insufficient_inventory", "Character does not hold enough of this good.");
  }

  const quality =
    args.quality === undefined ? EQUIP_FROM_INVENTORY_DEFAULT_QUALITY : clampEquipmentQuality(args.quality);

  const previous = character.loadout?.[slot];
  // Same good already equipped from inventory — optional quality refresh only.
  if (previous?.goodId === goodId && previous.source === "equipped") {
    if (previous.quality === quality) return ok(false);
    previous.quality = quality;
    previous.styleKey = styleKeyForEquip(slot, quality, goodName);
    return ok(true);
  }

  releaseSlotItem(character, previous);
  debitInventory(character, goodId, 1);

  const item: EquippedItem = {
    goodId,
    quality,
    source: "equipped",
    styleKey: styleKeyForEquip(slot, quality, goodName)
  };
  character.loadout = { ...(character.loadout ?? {}), [slot]: item };
  return ok(true);
}

export interface UnequipSlotArgs {
  character: Character;
  slot: LoadoutSlotId;
}

/**
 * Clear a loadout slot. Items with source `equipped` return one unit to inventory.
 * Seeded / editor / gift / spoils items are removed without inventory credit.
 */
export function unequipSlot(args: UnequipSlotArgs): LoadoutCommandResult {
  const { character, slot } = args;
  if (character.dead) return fail("character_dead", "Cannot unequip a deceased character.");
  const item = character.loadout?.[slot];
  if (!item) return fail("slot_empty", `No item in ${slot} slot.`);

  releaseSlotItem(character, item);
  const next: CharacterLoadout = { ...(character.loadout ?? {}) };
  delete next[slot];
  if (Object.keys(next).length === 0) delete character.loadout;
  else character.loadout = next;
  return ok(true);
}

export interface SetLoadoutEditorArgs {
  character: Character;
  /** Full or partial loadout; omitted slots are cleared when `replaceAll` is true. */
  loadout: CharacterLoadout | null;
  /** When true (default), replace the entire loadout. When false, merge provided slots. */
  replaceAll?: boolean;
}

/**
 * GM / repair path: write loadout without inventory debit.
 * All written items receive source `editor` (or keep source if already set and merge).
 */
export function setLoadoutEditor(args: SetLoadoutEditorArgs): LoadoutCommandResult {
  const { character } = args;
  if (character.dead) return fail("character_dead", "Cannot edit loadout of a deceased character.");

  if (args.loadout === null) {
    if (!character.loadout) return ok(false);
    // Returning equipped items to bag when clearing via editor.
    for (const slot of LOADOUT_SLOT_IDS) {
      releaseSlotItem(character, character.loadout[slot]);
    }
    delete character.loadout;
    return ok(true);
  }

  const normalized = normalizeCharacterLoadout(args.loadout);
  if (!normalized) {
    if (args.replaceAll !== false) {
      if (!character.loadout) return ok(false);
      for (const slot of LOADOUT_SLOT_IDS) releaseSlotItem(character, character.loadout[slot]);
      delete character.loadout;
      return ok(true);
    }
    return fail("invalid_payload", "Loadout payload has no valid slots.");
  }

  // Force editor source on free writes.
  const asEditor: CharacterLoadout = {};
  for (const slot of LOADOUT_SLOT_IDS) {
    const item = normalized[slot];
    if (!item) continue;
    asEditor[slot] = { ...item, source: "editor" };
  }

  if (args.replaceAll === false) {
    const merged: CharacterLoadout = { ...(character.loadout ?? {}) };
    for (const slot of LOADOUT_SLOT_IDS) {
      const item = asEditor[slot];
      if (item) {
        // Replacing an equipped item via editor merge: return previous bag item.
        if (merged[slot] && merged[slot] !== item) releaseSlotItem(character, merged[slot]);
        merged[slot] = item;
      }
    }
    character.loadout = merged;
    return ok(true);
  }

  // Full replace: return any previously equipped inventory items.
  if (character.loadout) {
    for (const slot of LOADOUT_SLOT_IDS) {
      const prev = character.loadout[slot];
      const next = asEditor[slot];
      if (prev && prev.source === "equipped" && (!next || next.goodId !== prev.goodId || next.source !== "equipped")) {
        releaseSlotItem(character, prev);
      }
    }
  }
  character.loadout = asEditor;
  return ok(true);
}

export interface SetSlotQualityArgs {
  character: Character;
  slot: LoadoutSlotId;
  quality: number;
}

/** Adjust quality on an existing slot without touching inventory. */
export function setSlotQuality(args: SetSlotQualityArgs): LoadoutCommandResult {
  const { character, slot } = args;
  if (character.dead) return fail("character_dead", "Cannot edit loadout of a deceased character.");
  const item = character.loadout?.[slot];
  if (!item) return fail("slot_empty", `No item in ${slot} slot.`);
  if (typeof args.quality !== "number" || !Number.isFinite(args.quality)) {
    return fail("invalid_quality", "quality must be a finite number.");
  }
  const quality = clampEquipmentQuality(args.quality);
  if (item.quality === quality) return ok(false);
  item.quality = quality;
  return ok(true);
}

export function notifyLoadoutChanged(characterId: number): void {
  document.dispatchEvent(new CustomEvent("fmg:character-loadout-changed", { detail: { characterId } }));
  // Inventory may have changed (equip/unequip) — keep inventory tab in sync.
  document.dispatchEvent(new CustomEvent("fmg:character-inventory-changed", { detail: { characterId } }));
}
