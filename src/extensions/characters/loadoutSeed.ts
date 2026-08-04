/**
 * Estate- and role-based loadout seeding (EQ-1).
 * Spec: docs/plan/character-loadout-and-readiness.md
 *
 * Pure helpers take an explicit goods catalog so personFactory / backstory stay free of
 * economy module imports. Call sites resolve catalog from live goods when present.
 */
import type {
  Character,
  CharacterLoadout,
  CharacterRoleClass,
  EquipmentQuality,
  EquippedItem,
  EstateStatus,
  LoadoutSlotId,
  RaisedIn,
  SocialStratum,
  TitleHolding
} from "./characterTypes";

// ---------------------------------------------------------------------------
// Goods catalog (name → id)
// ---------------------------------------------------------------------------

/** Good ids needed to seed body / weapon (and optional accessory). */
export interface LoadoutGoodsCatalog {
  garments: number;
  cloth: number;
  silk: number;
  furs: number;
  arms: number;
  linen?: number;
  jewelry?: number;
}

/**
 * Fallback ids matching the default economy GOODS_DATA order (1-based index).
 * Prefer {@link buildLoadoutGoodsCatalog} from the live goods list; use this only when
 * economy goods are not yet available (unit tests, characters-only sessions).
 */
export const FALLBACK_LOADOUT_GOOD_IDS: Readonly<LoadoutGoodsCatalog> = {
  silk: 34,
  furs: 37,
  cloth: 55,
  garments: 56,
  arms: 74,
  jewelry: 80,
  linen: 100
};

export interface NamedGoodRef {
  i: number;
  name: string;
}

/** Resolve loadout goods by name from a live catalogue. Returns null if essentials are missing. */
export function buildLoadoutGoodsCatalog(goods: readonly NamedGoodRef[]): LoadoutGoodsCatalog | null {
  const byName = new Map<string, number>();
  for (const good of goods) {
    if (typeof good?.i === "number" && typeof good?.name === "string" && !byName.has(good.name)) {
      byName.set(good.name, good.i);
    }
  }
  const garments = byName.get("Garments");
  const arms = byName.get("Arms");
  if (garments === undefined || arms === undefined) return null;

  return {
    garments,
    cloth: byName.get("Cloth") ?? garments,
    silk: byName.get("Silk") ?? garments,
    furs: byName.get("Furs") ?? garments,
    arms,
    linen: byName.get("Linen"),
    jewelry: byName.get("Jewelry")
  };
}

// ---------------------------------------------------------------------------
// Quality helpers
// ---------------------------------------------------------------------------

export function clampEquipmentQuality(value: number): EquipmentQuality {
  const q = Math.round(value);
  if (q <= 1) return 1;
  if (q === 2) return 2;
  if (q === 3) return 3;
  if (q === 4) return 4;
  return 5;
}

function hasLandedSovereignTitle(titles: readonly TitleHolding[] | undefined): boolean {
  return (titles ?? []).some(title => title.landed && title.entityType === "state" && !title.endYear);
}

/** Minimum social dignity floors (K4). */
export function attireQualityFloor(
  estateStatus: EstateStatus | undefined,
  socialStratum: SocialStratum | undefined,
  titles: readonly TitleHolding[] | undefined
): EquipmentQuality {
  if (hasLandedSovereignTitle(titles)) return 4;
  if (
    estateStatus === "reigning_dynasty" ||
    estateStatus === "court_noble" ||
    estateStatus === "landed_noble" ||
    socialStratum === "royal" ||
    socialStratum === "high_noble"
  ) {
    return 3;
  }
  return 1;
}

function attireQualityTarget(
  estateStatus: EstateStatus | undefined,
  socialStratum: SocialStratum | undefined,
  roleClass: CharacterRoleClass | undefined,
  wealth: number
): number {
  let target = 2;

  switch (socialStratum) {
    case "slave_born":
      target = 1;
      break;
    case "freedman":
    case "commoner":
    case "foreigner":
    case "unknown":
      target = 2;
      break;
    case "merchant_born":
    case "clergy_orphan":
    case "gentry":
    case "minor_noble":
      target = 3;
      break;
    case "high_noble":
      target = 4;
      break;
    case "royal":
      target = 5;
      break;
    default:
      target = 2;
  }

  switch (estateStatus) {
    case "slave":
    case "serf":
      target = Math.min(target, 1);
      break;
    case "outlaw":
    case "exile":
      target = Math.min(target, 2);
      break;
    case "freeman":
    case "burgher":
      target = Math.max(target, 2);
      break;
    case "cleric":
    case "official":
    case "officer":
      target = Math.max(target, 3);
      break;
    case "landed_noble":
    case "court_noble":
      target = Math.max(target, 4);
      break;
    case "reigning_dynasty":
      target = Math.max(target, 5);
      break;
    default:
      break;
  }

  if (roleClass === "ruler") target = Math.max(target, 4);
  if (roleClass === "commander" || roleClass === "province_lord") target = Math.max(target, 3);
  if (roleClass === "merchant" || roleClass === "central_officer") target = Math.max(target, 3);

  // Soft attire bump from personal wealth (household means, not market stock).
  if (wealth >= 500) target += 1;
  else if (wealth >= 150) target = Math.max(target, 3);

  return target;
}

function weaponQualityTarget(
  estateStatus: EstateStatus | undefined,
  roleClass: CharacterRoleClass | undefined,
  raisedIn: RaisedIn | undefined
): number {
  if (roleClass === "ruler") return 4;
  if (roleClass === "commander") return 3;
  if (roleClass === "province_lord") return 3;
  if (estateStatus === "officer") return 3;
  if (raisedIn === "military_camp") return 2;
  return 2;
}

/** Deterministic -1 / 0 / +1 jitter from character id (no Math.random). */
export function qualityJitter(characterId: number, salt: number): number {
  const u = (Math.abs(characterId) * 17 + salt * 31) % 5; // 0..4
  if (u <= 1) return -1;
  if (u >= 4) return 1;
  return 0;
}

export function rollSeededQuality(
  characterId: number,
  target: number,
  floor: EquipmentQuality,
  salt: number
): EquipmentQuality {
  return clampEquipmentQuality(Math.max(floor, target + qualityJitter(characterId, salt)));
}

// ---------------------------------------------------------------------------
// Slot content selection
// ---------------------------------------------------------------------------

function bodyStyleKey(quality: EquipmentQuality): string {
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

function weaponStyleKey(quality: EquipmentQuality, roleClass: CharacterRoleClass | undefined): string {
  if (roleClass === "ruler" && quality >= 4) return "ceremonial_arms";
  if (quality >= 4) return "officer_arms";
  if (quality >= 3) return "soldier_arms";
  return "militia_arms";
}

function pickBodyGoodId(
  catalog: LoadoutGoodsCatalog,
  quality: EquipmentQuality,
  cultureType: string | undefined
): number {
  // Culture fashion tendency (setting-agnostic tags on culture.type).
  const huntingOrCold =
    cultureType === "Hunting" || cultureType === "Nomadic" || cultureType === "Nordic" || cultureType === "Arctic";
  if (huntingOrCold && quality >= 2 && quality <= 4) return catalog.furs;

  if (quality <= 1) return catalog.cloth;
  if (quality >= 5) return catalog.silk;
  if (quality >= 4) {
    // Prefer silk for high court, garments otherwise.
    return quality === 5 ? catalog.silk : catalog.garments;
  }
  return catalog.garments;
}

export function shouldSeedWeapon(
  roleClass: CharacterRoleClass | undefined,
  estateStatus: EstateStatus | undefined,
  raisedIn: RaisedIn | undefined,
  titles: readonly TitleHolding[] | undefined
): boolean {
  if (roleClass === "commander" || roleClass === "ruler" || roleClass === "province_lord") return true;
  if (estateStatus === "officer") return true;
  if (raisedIn === "military_camp") return true;
  const martialTitles = new Set(["Commander", "Admiral", "Marshal", "General", "Minister of War"]);
  if ((titles ?? []).some(title => !title.endYear && martialTitles.has(title.title))) return true;
  return false;
}

export function shouldSeedAccessory(
  estateStatus: EstateStatus | undefined,
  socialStratum: SocialStratum | undefined,
  quality: EquipmentQuality
): boolean {
  if (quality < 4) return false;
  if (estateStatus === "reigning_dynasty" || estateStatus === "court_noble") return true;
  if (socialStratum === "royal" || socialStratum === "high_noble") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Normalize / clamp (archive-safe)
// ---------------------------------------------------------------------------

const LOADOUT_SLOTS: readonly LoadoutSlotId[] = ["body", "weapon", "accessory", "mount"];
const EQUIPPED_SOURCES = new Set(["seeded", "equipped", "editor", "gift", "spoils"]);

function normalizeEquippedItem(raw: unknown): EquippedItem | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Partial<EquippedItem>;
  if (typeof item.goodId !== "number" || !Number.isFinite(item.goodId) || item.goodId <= 0) return undefined;
  if (typeof item.quality !== "number") return undefined;
  const source = typeof item.source === "string" && EQUIPPED_SOURCES.has(item.source) ? item.source : "seeded";
  const out: EquippedItem = {
    goodId: Math.floor(item.goodId),
    quality: clampEquipmentQuality(item.quality),
    source: source as EquippedItem["source"]
  };
  if (typeof item.styleKey === "string" && item.styleKey.length > 0 && item.styleKey.length <= 64) {
    out.styleKey = item.styleKey;
  }
  return out;
}

/** Drop invalid slots and clamp quality — safe to call on loaded save data. */
export function normalizeCharacterLoadout(loadout: unknown): CharacterLoadout | undefined {
  if (!loadout || typeof loadout !== "object") return undefined;
  const raw = loadout as Record<string, unknown>;
  const next: CharacterLoadout = {};
  for (const slot of LOADOUT_SLOTS) {
    const item = normalizeEquippedItem(raw[slot]);
    if (item) next[slot] = item;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function normalizeCharacterLoadoutInPlace(character: Character): void {
  if (character.loadout === undefined) return;
  const normalized = normalizeCharacterLoadout(character.loadout);
  if (normalized) character.loadout = normalized;
  else delete character.loadout;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export interface SeedLoadoutOptions {
  /** Explicit goods catalog; defaults to FALLBACK when omitted. */
  catalog?: LoadoutGoodsCatalog;
  roleClass?: CharacterRoleClass;
  /** Culture type string (e.g. "Nomadic", "Hunting") for fashion hints. */
  cultureType?: string;
  /**
   * When true (default), only fill missing slots — never overwrite equipped/editor kit.
   * When false, rebuild seeded slots (still preserves source==="equipped"|"editor" items).
   */
  onlyIfMissing?: boolean;
}

/**
 * Seed household attire (always) and martial kit when role warrants it.
 * Does not create inventory units. Idempotent for missing slots.
 */
export function seedCharacterLoadout(character: Character, options: SeedLoadoutOptions = {}): boolean {
  if (character.dead) return false;

  const catalog = options.catalog ?? FALLBACK_LOADOUT_GOOD_IDS;
  const onlyIfMissing = options.onlyIfMissing !== false;
  const origin = character.backstory?.origin;
  const roleClass = options.roleClass;
  const estateStatus = origin?.estateStatus;
  const socialStratum = origin?.socialStratum;
  const raisedIn = origin?.raisedIn;

  let changed = false;
  const loadout: CharacterLoadout = character.loadout ? { ...character.loadout } : {};

  const preserve = (item: EquippedItem | undefined): boolean =>
    item !== undefined && (onlyIfMissing || item.source === "equipped" || item.source === "editor");

  // --- body (always for living characters) ---
  if (!preserve(loadout.body)) {
    const floor = attireQualityFloor(estateStatus, socialStratum, character.titles);
    const target = attireQualityTarget(estateStatus, socialStratum, roleClass, character.wealth ?? 0);
    const quality = rollSeededQuality(character.i, target, floor, 1);
    loadout.body = {
      goodId: pickBodyGoodId(catalog, quality, options.cultureType),
      quality,
      source: "seeded",
      styleKey: bodyStyleKey(quality)
    };
    changed = true;
  }

  // --- weapon ---
  if (shouldSeedWeapon(roleClass, estateStatus, raisedIn, character.titles)) {
    if (!preserve(loadout.weapon)) {
      const floor = clampEquipmentQuality(roleClass === "commander" || roleClass === "ruler" ? 2 : 1);
      const target = weaponQualityTarget(estateStatus, roleClass, raisedIn);
      const quality = rollSeededQuality(character.i, target, floor, 2);
      loadout.weapon = {
        goodId: catalog.arms,
        quality,
        source: "seeded",
        styleKey: weaponStyleKey(quality, roleClass)
      };
      changed = true;
    }
  }

  // --- accessory (jewelry for high estate, optional) ---
  if (catalog.jewelry !== undefined) {
    const bodyQ = loadout.body?.quality ?? 1;
    if (shouldSeedAccessory(estateStatus, socialStratum, bodyQ) && !preserve(loadout.accessory)) {
      const quality = rollSeededQuality(character.i, Math.max(4, bodyQ), 4, 3);
      loadout.accessory = {
        goodId: catalog.jewelry,
        quality,
        source: "seeded",
        styleKey: "court_jewel"
      };
      changed = true;
    }
  }

  if (changed) {
    character.loadout = loadout;
  }
  return changed;
}

/**
 * Idempotent batch seed for living characters missing body attire.
 * Returns number of characters modified.
 */
export function backfillCharacterLoadouts(characters: readonly Character[], options: SeedLoadoutOptions = {}): number {
  let count = 0;
  for (const character of characters) {
    if (character.dead) continue;
    if (seedCharacterLoadout(character, { ...options, onlyIfMissing: true })) count += 1;
  }
  return count;
}
