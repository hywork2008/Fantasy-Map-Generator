import type { SiteConfig } from "../../types/contracts/siteConfig";
import type { GenerationSettings, StreetSettings } from "../../types/generation";
import { makeRng } from "../prng";
import { DEFAULT_SITE_CONFIG, randomSiteConfig } from "../site/siteConfig";
import { bastionEra } from "./skeleton/wallShapes";

/** Resolve effective morphology layout:
 * - "circulade" -> "circulade"
 * - "bram" -> "bram"
 * - "organic" -> "organic"
 * - "classic" -> "classic"
 * - "auto" -> deterministically roll Circulade, Bram, or Organic for tiny maps (<= 700m)
 */
export function resolveEffectiveLayout(
  layout: import("../../types/contracts/siteConfig").CityLayout | undefined,
  extentMeters: number,
  seed: string
): "organic" | "circulade" | "bram" | "classic" {
  if (layout === "classic") return "classic";
  if (layout === "circulade") return "circulade";
  if (layout === "bram") return "bram";
  if (layout === "organic") return "organic";
  if (extentMeters <= 700) {
    const rng = makeRng(`${seed}:effective-layout`);
    const roll = rng();
    if (roll < 0.33) return "circulade";
    if (roll < 0.66) return "bram";
    return "organic";
  }
  return "organic";
}

export function defaultStreetSettings(): StreetSettings {
  return { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
}

export function resolveStreetSettings(settings: GenerationSettings): StreetSettings {
  return { ...defaultStreetSettings(), ...settings.streets };
}

/** A random internal seed for one town; completed evolution maps retain it for replay. */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

export function defaultGenerationSettings(): GenerationSettings {
  return { config: structuredClone(DEFAULT_SITE_CONFIG), streets: defaultStreetSettings() };
}

/** A fresh coherent random coast / rivers / relief / feature combination. */
export function randomGeography(): SiteConfig {
  return randomSiteConfig(makeRng(randomSeed()));
}

/** Rebuild `config.rivers` for a plain "how many rivers" control: the first one
 * reaches the coast when there is one, the rest are pronounced meanders. */
export function riversForCount(config: SiteConfig, count: number): SiteConfig["rivers"] {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    config.coast !== "none" && index === 0 ? "toCoast" : "meander"
  );
}

/** Missing method preserves old documents and recipes. */
export function resolveGenerationMethod(settings: Pick<GenerationSettings, "generationMethod">) {
  return settings.generationMethod ?? "mesh-first";
}

/** Explicitly reject unsupported API inputs as well as disabling them in the UI. */
export function skeletonUnsupportedSettings(settings: GenerationSettings): string[] {
  if (resolveGenerationMethod(settings) !== "skeleton-first") return [];
  const reasons: string[] = [];
  if (settings.townWallRings === "double") reasons.push("double walls");
  if (settings.descriptor ? settings.descriptor.burg.citadel : settings.config.features.citadel) reasons.push("castle");
  if (settings.moats?.town || settings.moats?.castle) reasons.push("moats");
  const layout = settings.layout ?? settings.config.layout;
  if (layout === "bram" || layout === "circulade") reasons.push(layout);
  if (
    settings.wallSides !== undefined &&
    (!Number.isInteger(settings.wallSides) || settings.wallSides < 3 || settings.wallSides > 12)
  )
    reasons.push("wall sides must be 3-12");
  if (
    settings.wallShape &&
    !["auto", "organic", "round", "oval", "square", "polygon", "bastioned"].includes(settings.wallShape)
  )
    reasons.push("wall shape");
  if (
    settings.wallShape === "bastioned" &&
    !bastionEra(settings.historicalPeriod ?? settings.descriptor?.historicalPeriod)
  )
    reasons.push("bastioned walls need the age of exploration or later");
  if (settings.riverPlacement && settings.riverPlacement !== "through") reasons.push("river placement");
  if (settings.urbanNPatches !== undefined) reasons.push("urban patch count");
  if (settings.urbanCoreMode === "legacy") reasons.push("legacy urban allocation");
  if (settings.streets?.farNode && settings.streets.farNode !== "descriptorEnd") reasons.push("street far end");
  if (settings.streets?.manualBearings?.length) reasons.push("manual road bearings");
  if (settings.streets?.avoidSea === false) reasons.push("roads over water");
  if (settings.config.wall?.coast && !["auto", "open"].includes(settings.config.wall.coast))
    reasons.push("coastal wall mode");
  return reasons;
}

// Wall family resolution is shared with vector-only planning.
export { bastionEra, resolveWallShape } from "./skeleton/wallShapes";
