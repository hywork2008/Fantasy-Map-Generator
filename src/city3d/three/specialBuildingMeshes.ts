import * as THREE from "three";
import { buildingAppearanceProfile, normalizeBuildingAppearanceContext } from "../../buildings/appearance/resolver";
import { models as churches } from "../../buildings/medieval/14-parish-churchesModels";
import { type ModelQuality, resolveModelQuality } from "../../buildings/modelQuality";
import { BASILICA_QUALITIES } from "../../buildings/temples/basilicaTemple";
import { BASILICA_VARIANTS } from "../../buildings/temples/basilicaVariants";
import { templeFootprintMeters } from "../../city-editor/generators/housing";
import { townExtentMeters } from "../../city-editor/generators/settlementExtent";
import { BASILICA_LENGTH, BASILICA_ORIGIN_X, BASILICA_WIDTH } from "../../city-editor/renderers/structureMassing";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import type { CityDocument } from "../../city-editor/types/document";
import { adopt } from "../adoption";
import { type BvDefinition, type BvPlacement, type BvPrototypeCache, createBvInstances } from "./bvInstances";
import { fitBvBuilding } from "./bvPlacement";

export const CE_CHAPEL = churches[1];
/** The detailed basilica shares the catalogue record's plan frame, so it maps onto CE with the same transform. */
export const CE_BASILICAS = Object.fromEntries(
  BASILICA_QUALITIES.map(level => {
    const variant = adopt(BASILICA_VARIANTS, "temple.basilica", level);
    return [level, { id: `basilica-temple:${level}`, cacheKey: variant.id, create: variant.create }];
  })
) as Record<(typeof BASILICA_QUALITIES)[number], BvDefinition>;
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
  cache: BvPrototypeCache,
  quality: ModelQuality = "standard"
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
  const parts = new Map<string, StructureMassing[]>();
  for (const element of city.elements) {
    if (element.kind !== "temple" || !element.point) continue;
    const length =
      element.sizeMeters && element.sizeMeters > 0
        ? element.sizeMeters
        : templeFootprintMeters(townExtentMeters(city.frame)).length;
    if ((element.templeType ?? (length < 24 ? "chapel" : "basilica")) !== "basilica") continue;
    // Terrain foundations stay; only the catalogue's raised parts give way to the detailed model.
    const own = structures.filter(
      part => part.id.startsWith(`temple:${element.id}:`) && !part.id.endsWith(":foundation")
    );
    if (!own.length) continue;
    const preset = templeFootprintMeters(townExtentMeters(city.frame));
    const scaleX = length / BASILICA_LENGTH;
    const scaleZ = (length * (preset.width / preset.length)) / BASILICA_WIDTH;
    const elevation = Math.min(...own.map(part => part.baseElevationMeters));
    const matrix = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(element.point[0], elevation, -element.point[1]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), element.rotation ?? 0),
        new THREE.Vector3(scaleX, scaleX, scaleZ)
      )
      .multiply(new THREE.Matrix4().makeTranslation(-BASILICA_ORIGIN_X, 0, 0));
    const id = `temple:${element.id}`;
    parts.set(id, own);
    sites.push({
      id,
      definition: CE_BASILICAS[resolveModelQuality(quality, BASILICA_QUALITIES)],
      matrix,
      structure: own[0]
    });
  }
  const layer = createBvInstances(sites, cache);
  prototype?.release();
  layer.group.name = "ce-special-buildings";
  return {
    ...layer,
    replaced: new Set(layer.accepted.flatMap(site => parts.get(site.id)?.map(part => part.id) ?? [site.id]))
  };
}
export type TownSpecialBuildings = ReturnType<typeof createTownSpecialBuildings>;
