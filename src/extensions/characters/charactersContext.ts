/**
 * Module-level context holder for the characters extension.
 * Populated once by init(api) in index.ts; read by all characters sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";
import { ck3Preset, dnd5ePreset } from "./abilityPresets";
import type { AbilityPreset } from "./characterTypes";

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
