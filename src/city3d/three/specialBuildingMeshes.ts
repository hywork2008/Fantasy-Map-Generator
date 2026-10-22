import { buildingAppearanceProfile, normalizeBuildingAppearanceContext } from "../../buildings/appearance/resolver";
import { models as churches } from "../../buildings/medieval/14-parish-churchesModels";
import { templeFootprintMeters } from "../../city-editor/generators/housing";
import { townExtentMeters } from "../../city-editor/generators/settlementExtent";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import type { CityDocument } from "../../city-editor/types/document";
import { type BvPlacement, type BvPrototypeCache, createBvInstances } from "./bvInstances";
import { fitBvBuilding } from "./bvPlacement";

export const CE_CHAPEL = churches[1];
const PERIODS = new Set([
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra"
]);

/** Only semantically matching, supported regional chapels replace their simple structure. */
export function createTownSpecialBuildings(
  city: CityDocument,
  structures: readonly StructureMassing[],
  cache: BvPrototypeCache
) {
  const context =
    city.buildingAppearanceContext ??
    normalizeBuildingAppearanceContext({
      period: city.historicalPeriod,
      tradition: city.civilization?.tradition,
      biome: city.biome
    });
  const enabled =
    city.buildingAppearanceVersion === 1 &&
    PERIODS.has(city.urbanMorphology?.period ?? city.historicalPeriod ?? context.period) &&
    buildingAppearanceProfile({ profile: city.buildingAppearanceProfile, context, rural: false }) !== "legacy";
  const ids = new Set<string>();
  if (enabled)
    for (const element of city.elements) {
      const length =
        element.sizeMeters && element.sizeMeters > 0
          ? element.sizeMeters
          : templeFootprintMeters(townExtentMeters(city.frame)).length;
      if (
        element.kind === "temple" &&
        element.point &&
        (element.templeType ?? (length < 24 ? "chapel" : "basilica")) === "chapel"
      )
        ids.add(`temple:${element.id}`);
    }
  const candidates = structures.filter(part => ids.has(part.id) && part.footprint && !part.holes?.length);
  const prototype = candidates.length ? cache.acquire(CE_CHAPEL) : undefined;
  const sites: Array<BvPlacement & { structure: StructureMassing }> = [];
  if (prototype)
    for (const structure of candidates) {
      const fit = fitBvBuilding(
        prototype.bounds,
        structure.footprint!,
        structure.ridgeAzimuth ?? 0,
        structure.baseElevationMeters
      );
      if (fit) sites.push({ id: structure.id, definition: CE_CHAPEL, matrix: fit.matrix, structure });
    }
  const layer = createBvInstances(sites, cache);
  prototype?.release();
  layer.group.name = "ce-special-buildings";
  return { ...layer, replaced: new Set(layer.accepted.map(site => site.id)) };
}
export type TownSpecialBuildings = ReturnType<typeof createTownSpecialBuildings>;
