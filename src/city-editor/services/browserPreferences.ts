import { MODEL_QUALITIES, type ModelQuality } from "../../buildings/modelQuality";
import { resolveMaxPatches } from "../generators/document";
import type { SimplificationPreferences } from "../types/contracts/simplification";

const MAX_PATCHES_KEY = "fmg-city-editor:max-patches";
const MODEL_QUALITY_KEY = "fmg-city-editor:model-quality";
const TERRAIN_SPACING_KEY = "fmg-city-editor:terrain-spacing";

export type TerrainSpacingPreference = 1 | 2 | 4 | 8 | "auto";

/** Draw-grid spacing for height-field ground. Not part of the city document. */
export function readTerrainSpacingPreference(): TerrainSpacingPreference {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(TERRAIN_SPACING_KEY);
    if (raw === "1" || raw === "2" || raw === "4" || raw === "8") return Number(raw) as 1 | 2 | 4 | 8;
  } catch {
    // Storage blocked: automatic spacing stays in effect.
  }
  return "auto";
}

export function writeTerrainSpacingPreference(value: TerrainSpacingPreference): void {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(TERRAIN_SPACING_KEY, value === "auto" ? "auto" : String(value));
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** Per-viewer nPatches ceiling (Grid evolution). Default 48 when unset or unreadable. */
export function readMaxPatchesPreference(): number {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(MAX_PATCHES_KEY);
    return resolveMaxPatches(raw === null ? undefined : Number(raw));
  } catch {
    return resolveMaxPatches(undefined);
  }
}

export function writeMaxPatchesPreference(value: number): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MAX_PATCHES_KEY, String(resolveMaxPatches(value)));
  } catch {
    // Storage blocked: the ceiling lasts for this page only.
  }
}

/** Per-viewer 3D model quality. Default "high" when unset or unreadable. */
export function readModelQualityPreference(): ModelQuality {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(MODEL_QUALITY_KEY);
    return MODEL_QUALITIES.find(quality => quality === raw) ?? "high";
  } catch {
    return "high";
  }
}

export function writeModelQualityPreference(value: ModelQuality): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MODEL_QUALITY_KEY, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

const SIMPLIFICATION_KEY = "fmg-city-editor:simplification";

/** Independent viewer preferences; never change the generated city or its share data. */
export function readSimplificationPreferences(): SimplificationPreferences {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(SIMPLIFICATION_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return { urban: value?.urban === "off" ? "off" : "auto", outskirts: value?.outskirts === "off" ? "off" : "auto" };
  } catch {
    return { urban: "auto", outskirts: "auto" };
  }
}

export function writeSimplificationPreferences(value: SimplificationPreferences): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SIMPLIFICATION_KEY, JSON.stringify(value));
  } catch {
    // Keep the default if storage is unavailable.
  }
}
