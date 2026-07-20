/**
 * Module-level context holder for the characters extension.
 * Populated once by init(api) in index.ts; read by all characters sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";
import { ck3Preset, dnd5ePreset } from "./abilityPresets";
import type { AbilityPreset, Character } from "./characterTypes";

let _api: ExtensionAPI | null = null;

/** Ability-score preset registry — module-level (not per-map state), pre-seeded with the built-ins. */
const _presets = new Map<string, AbilityPreset>([
  [ck3Preset.id, ck3Preset],
  [dnd5ePreset.id, dnd5ePreset]
]);

export function initCharactersContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearCharactersContext(): void {
  _api = null;
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
