import { MODEL_QUALITIES, type ModelQuality } from "../../buildings/modelQuality";
import { resolveMaxPatches } from "../generators/document";

const MAX_PATCHES_KEY = "fmg-city-editor:max-patches";
const MODEL_QUALITY_KEY = "fmg-city-editor:model-quality";

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

/** Per-viewer 3D model quality. Default "standard" when unset or unreadable. */
export function readModelQualityPreference(): ModelQuality {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(MODEL_QUALITY_KEY);
    return MODEL_QUALITIES.find(quality => quality === raw) ?? "standard";
  } catch {
    return "standard";
  }
}

export function writeModelQualityPreference(value: ModelQuality): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MODEL_QUALITY_KEY, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}
