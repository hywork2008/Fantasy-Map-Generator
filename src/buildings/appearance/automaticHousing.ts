import { growthRandom } from "../../utils/urbanMorphology";
import { buildingAppearanceProfile } from "./resolver";
import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceContext, type BuildingAppearanceProfile } from "./types";

const profiles = BUILDING_APPEARANCE_PROFILES.filter(profile => profile !== "legacy");

/**
 * The automatic housing culture of a city without a chosen one. An FMG city keeps the culture of its tradition
 * (undefined); when that has no detailed family, one comes from the site climate. A standalone city draws one
 * from its seed.
 */
export function automaticHousingProfile(
  context: BuildingAppearanceContext | undefined,
  fmgLinked: boolean,
  seed: string
): BuildingAppearanceProfile | undefined {
  if (!fmgLinked || !context)
    return profiles[Math.floor(growthRandom(`${seed}:standalone-housing-culture`) * profiles.length)];
  // Auto culture can be absent or unsupported in older FMG shares. High quality
  // still needs a detailed model family; choose one from the saved site conditions.
  if (buildingAppearanceProfile({ context, rural: false }) !== "legacy") return undefined;
  return context.arid
    ? "mediterranean"
    : context.forest || (context.temperatureC !== undefined && context.temperatureC <= 5)
      ? "northern-wooded"
      : "atlantic";
}
