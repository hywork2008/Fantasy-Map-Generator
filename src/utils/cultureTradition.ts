/**
 * Culture / religion → civilization tradition and faith family
 * (src/data/civilizationTraditions.ts, docs/plan/culture-civilization-overhaul.md).
 *
 * Everything here is derived from saved fields (culture.base, religion type/form
 * and origin culture) plus the Historical period, so legacy maps need no migration.
 */
import { type BurialCultureProfile, getBurialCulturePreset, isBurialCulturePresetId } from "../data/burialCultures";
import {
  burialPresetsFor,
  type CivilizationTradition,
  FAITH_FORMS,
  type FaithFamily,
  type FortificationFamily,
  SYNTHESIS_FAITHS,
  traditionEra,
  traditionForNameBase
} from "../data/civilizationTraditions";
import type { Culture, Religion } from "../types/models";

type CultureLike = Pick<Culture, "i" | "base"> | undefined | null;
type ReligionLike = Pick<Religion, "i" | "type" | "form" | "culture"> | undefined | null;

export function getCultureTradition(culture: CultureLike): CivilizationTradition {
  return traditionForNameBase(culture?.base);
}

/** The faith a culture's organized church held in the period. */
export function getCultureFaith(culture: CultureLike, period: string | undefined): FaithFamily {
  return traditionEra(getCultureTradition(culture), period).faith;
}

export function getCultureFortification(culture: CultureLike, period: string | undefined): FortificationFamily {
  return traditionEra(getCultureTradition(culture), period).fortification;
}

/**
 * Faith of a religion. Folk religions keep the pre-conversion substrate of
 * their culture; organized ones take the culture's church unless their form
 * cannot belong to it (an organized Polytheism of a Latin culture is a revived
 * paganism, not a Catholic church).
 */
export function getReligionFaith(
  religion: ReligionLike,
  cultures: readonly (Culture | undefined)[] | undefined,
  period: string | undefined,
  fallbackCulture?: CultureLike
): FaithFamily {
  const origin = (religion && cultures?.[religion.culture]) || fallbackCulture;
  const tradition = getCultureTradition(origin);
  const organized = traditionEra(tradition, period).faith;
  if (!religion?.i) return organized;
  if (religion.type === "Folk") return tradition.folkFaith;
  if (religion.type === "Organized" && !FAITH_FORMS[organized].includes(religion.form)) {
    if (FAITH_FORMS[tradition.folkFaith].includes(religion.form)) return tradition.folkFaith;
  }
  return organized;
}

/** Religion form for a new religion of this culture: one its faith can take. */
export function rollReligionForm(
  type: Religion["type"],
  culture: CultureLike,
  period: string | undefined,
  rng: () => number,
  fallback: () => string
): string {
  if (type !== "Folk" && type !== "Organized") return fallback();
  const tradition = getCultureTradition(culture);
  const faith = type === "Folk" ? tradition.folkFaith : traditionEra(tradition, period).faith;
  const forms = FAITH_FORMS[faith];
  return forms[Math.floor(rng() * forms.length)] ?? fallback();
}

/** Burial presets of a faith in a period, optionally preferring a civilization's own variant. */
export function faithBurialPresets(
  faith: FaithFamily,
  period: string | undefined,
  tradition?: CivilizationTradition,
  hasRiver = true
): string[] {
  const presets = burialPresetsFor(faith, period, tradition).filter(
    id => hasRiver || getBurialCulturePreset(id).zoning !== "riverfront_ghat"
  );
  return presets.length ? [...presets] : [...burialPresetsFor(faith, period, tradition)];
}

/** A saved profile fits a faith when it is one of the faith's presets in any period. */
export function burialProfileFitsFaith(profile: BurialCultureProfile, faith: FaithFamily): boolean {
  if (!isBurialCulturePresetId(profile.id)) return false;
  for (const period of ["classicalAntiquity", "preIndustrialEra", "steamEra"])
    if (burialPresetsFor(faith, period).includes(profile.id)) return true;
  return false;
}

/**
 * Burial ground CE draws for a burg. The culture's saved profile is used when
 * it belongs to the burg's faith; a burg of another faith (a conquered or
 * converted town) or a legacy profile that contradicts its faith gets the
 * faith's preset, chosen stably from `seed`.
 */
export function burgBurialProfile(
  cultureProfile: BurialCultureProfile | undefined,
  faith: FaithFamily,
  period: string | undefined,
  tradition: CivilizationTradition,
  seed: number,
  hasRiver: boolean
): BurialCultureProfile {
  if (cultureProfile) {
    const fits = isBurialCulturePresetId(cultureProfile.id)
      ? burialProfileFitsFaith(cultureProfile, faith)
      : SYNTHESIS_FAITHS.has(faith);
    // A river-ghat culture still needs a burial ground in a town without a river.
    if (fits && (hasRiver || cultureProfile.zoning !== "riverfront_ghat")) return cultureProfile;
  }
  const presets = faithBurialPresets(faith, period, tradition, hasRiver);
  return getBurialCulturePreset(presets[Math.abs(seed) % presets.length]);
}

/**
 * Period used to resolve traditions. The Antique culture set stands for the
 * classical world, so its Romans and Greeks stay polytheist even though FMG's
 * Historical period (a technology backdrop) starts in the early Middle Ages.
 */
export function worldTraditionPeriod(options: { historicalPeriod?: string; culturesSet?: string } | undefined): string {
  if (options?.culturesSet === "antique") return "classicalAntiquity";
  return options?.historicalPeriod ?? "ageOfExploration";
}
