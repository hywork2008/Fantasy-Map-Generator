import { BUILDING_APPEARANCE_PROFILES } from "../../buildings/appearance/types";
import type { ModelQuality } from "../../buildings/modelQuality";
import { growthRandom } from "../../utils/urbanMorphology";
import type { DistrictFabric } from "../generators/blockInfill.types";
import { assignBuildingAppearances, withBuildingAppearance } from "../generators/buildingAppearance";
import type { CityDocument } from "../types/document";

const profiles = BUILDING_APPEARANCE_PROFILES.filter(profile => profile !== "legacy");
const previews = new WeakMap<CityDocument, { source: DistrictFabric; result: DistrictFabric }>();

/** Viewer-only automatic style: keep climate, saved controls and field snapshots intact. */
export function standaloneHousingAppearance(
  document: CityDocument,
  fabric: DistrictFabric,
  quality: ModelQuality,
  fmgLinked: boolean
): DistrictFabric {
  if (
    fmgLinked ||
    document.fabric?.generation?.settings.descriptor ||
    quality !== "high" ||
    document.buildingAppearanceProfile
  )
    return fabric;
  const cached = previews.get(document);
  if (cached?.source === fabric) return cached.result;
  const seed = document.generationSeed || document.fabric?.seed || "massing";
  const profile = profiles[Math.floor(growthRandom(`${seed}:standalone-housing-culture`) * profiles.length)];
  const appearanceDocument = withBuildingAppearance(document, profile);
  const result = { ...fabric, buildings: assignBuildingAppearances(appearanceDocument, fabric.buildings) };
  previews.set(document, { source: fabric, result });
  return result;
}
