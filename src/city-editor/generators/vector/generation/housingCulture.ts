import { automaticHousingProfile } from "../../../../buildings/appearance/automaticHousing";
import {
  buildingAppearanceProfile,
  normalizeBuildingAppearanceContext
} from "../../../../buildings/appearance/resolver";
import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceProfile } from "../../../../buildings/appearance/types";
import type { VectorCityDocument } from "../../../types/vector/document";

/** The housing culture a meshless city was given, kept with its requested settings; absent means automatic. */
export function vectorHousingCulture(doc: Pick<VectorCityDocument, "context">): BuildingAppearanceProfile | undefined {
  const value = (doc.context.requestedSettings as { buildingAppearanceProfile?: unknown } | undefined)
    ?.buildingAppearanceProfile;
  return (BUILDING_APPEARANCE_PROFILES as readonly unknown[]).includes(value)
    ? (value as BuildingAppearanceProfile)
    : undefined;
}

/** The town's appearance profile: the chosen housing culture, else the automatic one its site and seed give (the
 * profile its walls, towers and workhomes are drawn in). */
export function vectorTownProfile(
  doc: Pick<VectorCityDocument, "context" | "site" | "recipe">
): BuildingAppearanceProfile {
  const descriptor = doc.site?.descriptor,
    context = normalizeBuildingAppearanceContext({
      period: doc.context.historicalPeriod,
      tradition: descriptor?.civilization?.tradition,
      temperatureC: descriptor?.climate?.temperatureC,
      biome: descriptor?.biome ?? (descriptor?.climate?.biomeKey ? { key: descriptor.climate.biomeKey } : undefined)
    });
  return buildingAppearanceProfile({
    profile: vectorHousingCulture(doc) ?? automaticHousingProfile(context, !!descriptor, doc.recipe.seed),
    context,
    rural: false
  });
}
