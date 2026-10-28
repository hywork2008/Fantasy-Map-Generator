import type { ForestSvgOptions } from "../renderers/forestSvg";
import type { ForestQualityPreference } from "../types/contracts/forest";

export type ForestRepresentation = NonNullable<ForestSvgOptions["representation"]>;
export interface ForestViewPreferences {
  representation: ForestRepresentation;
  quality: ForestQualityPreference;
}
const KEY = "fmg-city-editor:forest-view";
let sessionOnly = false;
let session: ForestViewPreferences = { representation: "edge-fill", quality: "auto" };

/** Local display choices never alter the shared city or its forest area. */
export function readForestViewPreferences(): ForestViewPreferences {
  if (sessionOnly) return { ...session };
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (typeof localStorage !== "undefined" && raw === null) session = { representation: "edge-fill", quality: "auto" };
    if (raw) {
      const value = JSON.parse(raw);
      session = {
        representation: value?.representation === "all-trees" ? "all-trees" : "edge-fill",
        quality: ["auto", "light", "standard", "high"].includes(value?.quality) ? value.quality : "auto"
      };
    }
  } catch (error) {
    if (error instanceof SyntaxError) session = { representation: "edge-fill", quality: "auto" };
    // Keep the page's choices when storage is unavailable.
  }
  return { ...session };
}

export function writeForestViewPreferences(value: ForestViewPreferences): void {
  session = { ...value };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    sessionOnly = true;
    // The choice remains available to this page without persistent storage.
  }
}
