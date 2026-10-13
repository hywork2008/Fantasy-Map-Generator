import { resolveMaxPatches } from "../generators/document";

const MAX_PATCHES_KEY = "fmg-city-editor:max-patches";

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
