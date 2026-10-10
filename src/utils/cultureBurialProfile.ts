/**
 * Utility functions for accessing and generating culture burial profiles.
 *
 * Parallel to cultureFuneralRite.ts, ensuring backwards compatibility and
 * seamless integration with FMG models and generator pipelines.
 */
import {
  BURIAL_CULTURE_PRESETS,
  type BurialCultureProfile,
  corpseTreatmentToFuneralRite,
  DEFAULT_BURIAL_CULTURE_PRESET_ID,
  funeralRiteToDefaultCorpseTreatment,
  getBurialCulturePreset,
  isBurialCultureProfile
} from "../data/burialCultures";
import { SYNTHESIS_FAITHS, traditionEra, traditionForNameBase } from "../data/civilizationTraditions";
import { FUNERAL_RITE_DEFINITIONS, type FuneralRite, funeralMaterialsFor, isFuneralRite } from "../data/funeralRites";
import { type SynthesisGeographyOptions, synthesizeBurialCulture } from "../generators/burialCultureSynthesis";
import type { Culture, CultureType, RaceKey } from "../types/models";
import { defaultFuneralRiteForType, getCultureFuneralRite } from "./cultureFuneralRite";
import { faithBurialPresets } from "./cultureTradition";

/**
 * Maps a FuneralRite and CultureType to the most historically characteristic preset.
 */
export function defaultPresetForRiteAndType(rite: FuneralRite | undefined, type: CultureType | undefined): string {
  if (rite === "skyBurial") {
    return "tibetan_jhator";
  }
  if (rite === "cremation") {
    if (type === "River") return "varanasi_ghat";
    if (type === "Highland") return "thai_chedi_wat";
    return "edo_temple_town";
  }
  if (rite === "mummification") {
    return "roman_via_appia";
  }
  if (rite === "waterBurial") {
    return "varanasi_ghat";
  }
  if (rite === "exposure") {
    return "zoroastrian_tower";
  }

  // Inhumation
  if (type === "Highland") return "fengshui_mountain";
  if (type === "Nomadic") return "steppe_kurgan";
  if (type === "Desert") return "sunni_wahhabi";
  if (type === "Industrial" || type === "Colonial") return "victorian_garden";

  return DEFAULT_BURIAL_CULTURE_PRESET_ID; // "medieval_parish"
}

/**
 * Retrieves the BurialCultureProfile for a culture.
 * - Returns undefined for wildlands (culture 0) or uninitialized cultures.
 * - Resolves preset ID strings or returns inline custom profiles.
 * - Falls back to a characteristic preset matching the culture's funeralRite / type for legacy saves.
 */
export function getCultureBurialProfile(
  culture: Pick<Culture, "i" | "type" | "funeralRite" | "burialProfile"> | undefined | null
): BurialCultureProfile | undefined {
  if (!culture || culture.i === 0) return undefined;

  const raw = culture.burialProfile;
  const explicit = isBurialCultureProfile(raw)
    ? raw
    : typeof raw === "string" && Object.hasOwn(BURIAL_CULTURE_PRESETS, raw)
      ? getBurialCulturePreset(raw)
      : undefined;
  // Maps saved by older independent rolls may contain contradictory fields.
  // Preserve the selected legacy rite and use the same compatible profile in CE and simulation.
  if (
    explicit &&
    (!isFuneralRite(culture.funeralRite) || corpseTreatmentToFuneralRite(explicit.bodyFate) === culture.funeralRite)
  )
    return explicit;

  // Fallback for legacy cultures
  const rite = getCultureFuneralRite(culture) ?? defaultFuneralRiteForType(culture.type);
  const fallbackPresetId = defaultPresetForRiteAndType(rite, culture.type);
  const profile = getBurialCulturePreset(fallbackPresetId);
  profile.bodyFate = funeralRiteToDefaultCorpseTreatment(rite);
  if (rite === "waterBurial" || rite === "exposure") profile.sanctuary = "none_flat_memorial";
  const definition = FUNERAL_RITE_DEFINITIONS[rite];
  profile.mechanics = {
    ...profile.mechanics,
    remainFraction: definition.remainFraction,
    zombieRatio: definition.zombieShare,
    resourceCostPerCapita: funeralMaterialsFor(rite, culture.type)
  };
  return profile;
}

/**
 * Rolls a BurialCultureProfile at culture generation time.
 * Either picks from thematic historic presets (70% probability) or procedurally synthesizes one (30% probability).
 */
export function rollCultureBurialProfile(
  type: CultureType | undefined,
  rng: () => number = Math.random,
  raceKey?: RaceKey | string,
  geography: SynthesisGeographyOptions = {},
  civilization?: { base: number; period?: string }
): BurialCultureProfile {
  if (civilization) {
    // Historical civilizations bury their dead the way their faith did in the
    // period; only fantasy faiths may roll a synthesized tradition.
    const tradition = traditionForNameBase(civilization.base);
    const faith = traditionEra(tradition, civilization.period).faith;
    if (!SYNTHESIS_FAITHS.has(faith) || rng() >= 0.3) {
      const presets = faithBurialPresets(faith, civilization.period, tradition, geography.hasRiver !== false);
      return getBurialCulturePreset(presets[Math.floor(rng() * presets.length)]);
    }
  }
  const isProcedural = !!civilization || rng() < 0.3;

  if (isProcedural) {
    return synthesizeBurialCulture(
      {
        cultureType: type,
        raceKey,
        hasRiver: type === "River",
        hasElevation: type === "Highland" || type === "Nomadic",
        biome: type === "Desert" ? "desert" : "temperate",
        ...geography
      },
      rng
    );
  }

  // Curated preset selection based on culture type
  const candidates: string[] = [];
  switch (type) {
    case "Highland":
      candidates.push("tibetan_jhator", "zoroastrian_tower", "fengshui_mountain", "steppe_kurgan");
      break;
    case "Nomadic":
      candidates.push("steppe_kurgan", "sunni_wahhabi", "tibetan_jhator");
      break;
    case "Desert":
      candidates.push("sunni_wahhabi", "wadi_us_salaam", "ottoman_turbe", "jewish_orthodox");
      break;
    case "River":
      candidates.push("varanasi_ghat", "fengshui_mountain", "medieval_parish");
      break;
    case "Naval":
      candidates.push("roman_via_appia", "ottoman_turbe", "thai_chedi_wat");
      break;
    case "Industrial":
    case "Colonial":
      candidates.push("victorian_garden", "catacomb_paris", "jewish_orthodox");
      break;
    case "Generic":
    default:
      candidates.push("medieval_parish", "roman_via_appia", "edo_temple_town", "prague_ghetto");
      break;
  }

  const eligible = candidates.filter(
    id => geography.hasRiver !== false || BURIAL_CULTURE_PRESETS[id].zoning !== "riverfront_ghat"
  );
  const pick = eligible[Math.floor(rng() * eligible.length)] ?? DEFAULT_BURIAL_CULTURE_PRESET_ID;
  return getBurialCulturePreset(pick);
}

/** Explicit profiles drive mechanics; legacy cultures retain their existing recipes. */
export function getCultureFuneralMechanics(culture: Parameters<typeof getCultureBurialProfile>[0]) {
  const rite = getCultureFuneralRite(culture);
  if (!rite) return undefined;
  const profile = culture?.burialProfile ? getCultureBurialProfile(culture) : undefined;
  // Old or imported conflicting data keeps the explicitly selected funeral rite.
  if (profile && corpseTreatmentToFuneralRite(profile.bodyFate) === rite) return profile.mechanics;
  const definition = FUNERAL_RITE_DEFINITIONS[rite];
  return {
    remainFraction: definition.remainFraction,
    zombieRatio: definition.zombieShare,
    resourceCostPerCapita: funeralMaterialsFor(rite, culture?.type),
    sanitationRisk: 0,
    pilgrimageAppeal: 0
  };
}

/** Changing the old rite control must also update the detailed tradition. */
export function setCultureFuneralRite(culture: Culture, rite: FuneralRite): void {
  culture.funeralRite = rite;
  delete culture.burialProfile;
  culture.burialProfile = getCultureBurialProfile(culture);
}
