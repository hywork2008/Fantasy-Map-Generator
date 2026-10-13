import type { SiteConfig } from "../../types/contracts/siteConfig";
import type { GenerationSettings, StreetSettings } from "../../types/generation";
import { makeRng } from "../prng";
import { DEFAULT_SITE_CONFIG, randomSiteConfig } from "../site/siteConfig";

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
