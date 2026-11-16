import { buildingAppearanceProfile } from "../../buildings/appearance/resolver";
import {
  BUILDING_APPEARANCE_PROFILES,
  type BuildingAppearanceContext,
  type BuildingAppearanceProfile
} from "../../buildings/appearance/types";
import type { ModelQuality } from "../../buildings/modelQuality";
import { growthRandom } from "../../utils/urbanMorphology";
import type { DistrictFabric } from "../generators/blockInfill.types";
import {
  assignBuildingAppearances,
  buildingAppearanceKey,
  withBuildingAppearance
} from "../generators/buildingAppearance";
import type { CityDocument } from "../types/document";

const profiles = BUILDING_APPEARANCE_PROFILES.filter(profile => profile !== "legacy");
const previews = new WeakMap<CityDocument, { source: DistrictFabric; key: string; result: DistrictFabric }>();

/** Viewer-only automatic style: keep climate, saved controls and field snapshots intact. */
export function standaloneHousingAppearance(
  document: CityDocument,
  fabric: DistrictFabric,
  quality: ModelQuality,
  fmgLinked: boolean
): DistrictFabric {
  const appearanceDocument = standaloneHousingDocument(document, quality, fmgLinked);
  if (appearanceDocument === document) return fabric;
  const key = buildingAppearanceKey(appearanceDocument);
  const cached = previews.get(document);
  if (cached?.source === fabric && cached.key === key) return cached.result;
  const result = { ...fabric, buildings: assignBuildingAppearances(appearanceDocument, fabric.buildings) };
  previews.set(document, { source: fabric, key, result });
  return result;
}

export interface HousingViewOptions {
  modelQuality: ModelQuality;
  fmgLinked: boolean;
}

/** Resolve the same seeded automatic culture for both SVG and WebGL views. */
export function standaloneHousingDocument(
  document: CityDocument,
  quality: ModelQuality,
  fmgLinked: boolean
): CityDocument {
  if (quality !== "high" || document.buildingAppearanceProfile) return document;
  const seed = document.generationSeed || document.fabric?.seed || "massing";
  if (fmgLinked || document.fabric?.generation?.settings.descriptor) {
    const refreshed = withBuildingAppearance(document);
    const context = document.buildingAppearanceContext ?? refreshed.buildingAppearanceContext!;
    const profile = automaticHousingProfile(context, true, seed);
    if (!profile)
      return document.buildingAppearanceVersion === refreshed.buildingAppearanceVersion
        ? document
        : { ...refreshed, buildingAppearanceContext: context };
    return { ...refreshed, buildingAppearanceContext: context, buildingAppearanceProfile: profile };
  }
  return withBuildingAppearance(document, automaticHousingProfile(undefined, false, seed));
}

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
