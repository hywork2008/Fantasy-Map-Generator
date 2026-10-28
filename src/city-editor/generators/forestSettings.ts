import type { ForestSettings, LandCoverOverride } from "../types/contracts/forest";
import type { CityDocument } from "../types/document";

export function validForestSettings(value: unknown): value is ForestSettings | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as ForestSettings;
  return (
    settings.version === 1 &&
    ["legacy", "farmland", "surroundings"].includes(settings.mode) &&
    ["sparse", "standard", "dense"].includes(settings.density)
  );
}

export function validLandCoverOverride(value: unknown): value is LandCoverOverride | undefined {
  return value === undefined || value === "forest" || value === "open";
}

export function hasForestState(document: Partial<CityDocument>): boolean {
  return (
    document.forestSettings !== undefined ||
    Object.values(document.mesh?.faces ?? {}).some(face => face?.properties?.landCoverOverride !== undefined)
  );
}

export function validForestDocument(document: Partial<CityDocument>): boolean {
  return (
    validForestSettings(document.forestSettings) &&
    Object.values(document.mesh?.faces ?? {}).every(face =>
      validLandCoverOverride(face?.properties?.landCoverOverride)
    ) &&
    validForestSettings(document.fabric?.generation?.settings?.forestSettings) &&
    (!hasForestState(document) || document.version === 6)
  );
}

/** An explicit opening wins a merge; a forest must never swallow an edited clearing. */
export function mergedLandCover(
  a: LandCoverOverride | undefined,
  b: LandCoverOverride | undefined
): LandCoverOverride | undefined {
  return a === "open" || b === "open" ? "open" : a === "forest" || b === "forest" ? "forest" : undefined;
}
