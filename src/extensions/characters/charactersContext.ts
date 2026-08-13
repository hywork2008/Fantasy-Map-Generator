/**
 * Module-level context holder for the characters extension.
 * Populated once by init(api) in index.ts; read by all characters sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import { RACE_DEFINITIONS } from "../../data/races";
import type { ExtensionAPI } from "../../types/extension-api";
import type { Race } from "../../types/models";
import { ck3Preset, dnd5ePreset } from "./abilityPresets";
import type { AbilityPreset, Character } from "./characterTypes";
import {
  buildLoadoutGoodsCatalog,
  FALLBACK_LOADOUT_GOOD_IDS,
  type LoadoutGoodsCatalog,
  type NamedGoodRef
} from "./loadoutSeed";

let _api: ExtensionAPI | null = null;

/** Ability-score preset registry — module-level (not per-map state), pre-seeded with the built-ins. */
const _presets = new Map<string, AbilityPreset>([
  [ck3Preset.id, ck3Preset],
  [dnd5ePreset.id, dnd5ePreset]
]);

const DEFAULT_ABILITY_PRESET_ID = ck3Preset.id;
let _fallbackAbilityPresetId = DEFAULT_ABILITY_PRESET_ID;
const DEFAULT_ALLOWED_CHARACTER_RACE_KEYS = RACE_DEFINITIONS.filter(race => race.key !== "unknown").map(
  race => race.key
);
let _fallbackAllowedCharacterRaceKeys = [...DEFAULT_ALLOWED_CHARACTER_RACE_KEYS];

export function initCharactersContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearCharactersContext(): void {
  _api = null;
}

/** Supports cross-extension callers (e.g. Economy's ruler household stipend) that must degrade gracefully when Characters is disabled, instead of hitting getApi()'s throw. */
export function hasCharactersContext(): boolean {
  return _api !== null;
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[characters] Extension context not initialized — call init(api) first");
  return _api;
}

export function getWorldContext() {
  return getApi().worldContext;
}

/**
 * Live simulation year. Falls back to generation options only when a minimal
 * test double omits simulationContext.
 */
export function getCurrentYear(): number {
  const year = _api?.simulationContext?.currentYear;
  if (typeof year === "number" && Number.isFinite(year)) return year;
  return Number(getWorldContext().options.year) || 1000;
}

/** Characters owns this namespaced simulation slice; pack.characters is compatibility-only. */
export function getCharacters(): Character[] {
  const simulation = getApi().simulationContext;
  // Isolated generator tests intentionally provide a minimal ExtensionAPI.
  // Production initialization always provides SimulationContext.extensions.
  if (!simulation?.extensions) {
    const pack = getWorldContext().pack;
    if (!pack.characters) pack.characters = [];
    return pack.characters;
  }
  const extensions = simulation.extensions;
  let slice = extensions.characters;
  if (!slice) {
    slice = {};
    extensions.characters = slice;
  }
  const characters = slice.characters;
  if (Array.isArray(characters)) return characters as Character[];
  const next: Character[] = [];
  slice.characters = next;
  return next;
}

export function replaceCharacters(characters: Character[]): void {
  const simulation = getApi().simulationContext;
  if (!simulation?.extensions) {
    getWorldContext().pack.characters = characters;
    return;
  }
  simulation.extensions.characters ??= {};
  simulation.extensions.characters.characters = characters;
}

/** Registers an additional ability-score preset (e.g. a future NPC extension's own stat block). */
export function registerAbilityPreset(preset: AbilityPreset): void {
  _presets.set(preset.id, preset);
}

export function getAbilityPreset(id: string): AbilityPreset | undefined {
  return _presets.get(id);
}

export function listAbilityPresets(): AbilityPreset[] {
  return Array.from(_presets.values());
}

/** Extension-wide ability system used for newly created characters and character UI. */
export function getSelectedAbilityPresetId(): string {
  if (!_api) return _fallbackAbilityPresetId;
  const slice = getApi().simulationContext?.extensions?.characters as Record<string, unknown> | undefined;
  const stored = slice?.abilityPresetId;
  if (typeof stored === "string" && _presets.has(stored)) return stored;
  return _fallbackAbilityPresetId;
}

export function getSelectedAbilityPreset(): AbilityPreset {
  return getAbilityPreset(getSelectedAbilityPresetId()) ?? ck3Preset;
}

/**
 * Set the single ability system for the Characters extension. Existing characters
 * keep their stored profiles; all Characters views immediately use the new schema.
 */
export function setSelectedAbilityPresetId(id: string): boolean {
  if (!_presets.has(id)) return false;
  _fallbackAbilityPresetId = id;
  const extensions = getApi().simulationContext?.extensions;
  if (extensions) {
    let slice = extensions.characters;
    if (!slice) {
      slice = {};
      extensions.characters = slice;
    }
    const settings = slice as Record<string, unknown>;
    settings.abilityPresetId = id;
  }
  return true;
}

/** Race keys that may be selected for new characters or generated for new NPCs. */
export function getAllowedCharacterRaceKeys(): readonly string[] {
  if (!_api) return _fallbackAllowedCharacterRaceKeys;
  const slice = getApi().simulationContext?.extensions?.characters as Record<string, unknown> | undefined;
  const stored = slice?.allowedRaceKeys;
  if (!Array.isArray(stored)) return _fallbackAllowedCharacterRaceKeys;

  const selected = new Set(stored.filter((key): key is string => typeof key === "string"));
  const valid = DEFAULT_ALLOWED_CHARACTER_RACE_KEYS.filter(key => selected.has(key));
  return valid.length ? valid : _fallbackAllowedCharacterRaceKeys;
}

/** Persist the extension-wide race roster. At least one playable race must remain enabled. */
export function setAllowedCharacterRaceKeys(keys: Iterable<string>): boolean {
  const selected = new Set(keys);
  const valid = DEFAULT_ALLOWED_CHARACTER_RACE_KEYS.filter(key => selected.has(key));
  if (!valid.length) return false;

  _fallbackAllowedCharacterRaceKeys = valid;
  const extensions = getApi().simulationContext?.extensions;
  if (extensions) {
    let slice = extensions.characters;
    if (!slice) {
      slice = {};
      extensions.characters = slice;
    }
    slice.allowedRaceKeys = [...valid];
  }
  return true;
}

/** Whether a race is enabled for new character creation and NPC appearance. */
export function isCharacterRaceAllowed(race: Pick<Race, "key"> | undefined): boolean {
  return race !== undefined && getAllowedCharacterRaceKeys().includes(race.key);
}

/** Filter live map races to the extension-wide character roster. */
export function filterAllowedCharacterRaces(races: readonly Race[]): Race[] {
  const allowed = new Set(getAllowedCharacterRaceKeys());
  return races.filter(race => race.i > 0 && !race.removed && allowed.has(race.key));
}

/**
 * Keep all generated characters inside the configured roster. When the requested race isn't
 * allowed, substitute uniformly at random among *all* other currently-enabled live races —
 * including human, with no special preference for it.
 *
 * Deliberately not "prefer human when enabled": human is virtually always left enabled (it's
 * the default core race), so a hard human-first rule would mean every disallowed race's
 * characters collapse onto human alone and any other race the user enabled alongside it — e.g.
 * a roster of {Human, Demon, Beastfolk} — would never actually appear as a substitute. Every
 * enabled race needs an equal shot at being picked, not just the first found or a hardcoded
 * favorite.
 */
export function resolveAllowedCharacterRaceId(raceId: number, races: readonly Race[] | null | undefined): number {
  if (!races?.length) return raceId;
  const allowed = new Set(getAllowedCharacterRaceKeys());
  const requested = races.find(race => race.i === raceId);
  if (requested && !requested.removed && allowed.has(requested.key)) return requested.i;

  const candidates = filterAllowedCharacterRaces(races);
  if (!candidates.length) return raceId;
  return candidates[Math.floor(Math.random() * candidates.length)]!.i;
}

/**
 * Resolve Garments/Arms/… good ids for loadout seeding without importing the economy module.
 * Prefers live economy goods (pack mirror or simulation slice); falls back to default catalogue ids.
 */
export function resolveLoadoutGoodsCatalog(): LoadoutGoodsCatalog {
  const candidates: NamedGoodRef[][] = [];

  try {
    const pack = getWorldContext().pack as { goods?: NamedGoodRef[] };
    if (Array.isArray(pack.goods) && pack.goods.length > 0) candidates.push(pack.goods);
  } catch {
    // Context not ready in pure unit tests.
  }

  try {
    const economyGoods = _api?.simulationContext?.extensions?.economy?.goods;
    if (Array.isArray(economyGoods) && economyGoods.length > 0) {
      candidates.push(economyGoods as NamedGoodRef[]);
    }
  } catch {
    // Optional path.
  }

  for (const goods of candidates) {
    const catalog = buildLoadoutGoodsCatalog(goods);
    if (catalog) return catalog;
  }
  return { ...FALLBACK_LOADOUT_GOOD_IDS };
}

/** Culture.type fashion hint for loadout seed (Nomadic / Hunting → furs, etc.). */
export function resolveCultureTypeForLoadout(cultureId: number): string | undefined {
  try {
    const culture = getWorldContext().pack.cultures?.[cultureId] as { type?: string } | undefined;
    return typeof culture?.type === "string" ? culture.type : undefined;
  } catch {
    return undefined;
  }
}
