import { automaticHousingProfile } from "../../../../buildings/appearance/automaticHousing";
import {
  buildingAppearanceProfile,
  normalizeBuildingAppearanceContext
} from "../../../../buildings/appearance/resolver";
import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceProfile } from "../../../../buildings/appearance/types";
import type { OpusWorkhomeCulture } from "../../../../buildings/medieval/opusWorkhomeProfiles";
import type { HistoricalPeriod } from "../../../../types/historicalPeriod";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { VectorCityDocument } from "../../../types/vector/document";

/** The housing culture a meshless city was given, kept with its requested settings; absent means automatic. */
export function vectorHousingCulture(doc: Pick<VectorCityDocument, "context">): BuildingAppearanceProfile | undefined {
  return chosenHousingCulture(doc.context.requestedSettings);
}

/** The housing culture requested settings choose, if any (meshless keeps it beside the mesh editor's settings). */
export function chosenHousingCulture(settings: object | undefined): BuildingAppearanceProfile | undefined {
  const value = (settings as { buildingAppearanceProfile?: unknown } | undefined)?.buildingAppearanceProfile;
  return (BUILDING_APPEARANCE_PROFILES as readonly unknown[]).includes(value)
    ? (value as BuildingAppearanceProfile)
    : undefined;
}

/** The town's appearance profile: the chosen housing culture, else the automatic one its site and seed give (the
 * profile its walls, towers and workhomes are drawn in). */
export function vectorTownProfile(
  doc: Pick<VectorCityDocument, "context" | "site" | "recipe">
): BuildingAppearanceProfile {
  return townProfileFor(doc.context.historicalPeriod, vectorHousingCulture(doc), doc.site?.descriptor, doc.recipe.seed);
}

/** {@link vectorTownProfile} before the document exists: from its period, chosen culture, descriptor and seed. */
export function townProfileFor(
  period: HistoricalPeriod | undefined,
  chosen: BuildingAppearanceProfile | undefined,
  descriptor: BurgSiteDescriptor | undefined,
  seed: string
): BuildingAppearanceProfile {
  const context = normalizeBuildingAppearanceContext({
    period,
    tradition: descriptor?.civilization?.tradition,
    temperatureC: descriptor?.climate?.temperatureC,
    biome: descriptor?.biome ?? (descriptor?.climate?.biomeKey ? { key: descriptor.climate.biomeKey } : undefined)
  });
  return buildingAppearanceProfile({
    profile: chosen ?? automaticHousingProfile(context, !!descriptor, seed),
    context,
    rural: false
  });
}

/** The culture a town's shop-houses and guild halls are drawn in: its housing profile, English where it has none. */
export function vectorTownCulture(profile: BuildingAppearanceProfile): OpusWorkhomeCulture {
  return profile === "legacy" ? "atlantic" : profile;
}
