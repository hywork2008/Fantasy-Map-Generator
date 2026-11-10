import {
  normalizeBuildingAppearanceContext,
  regionalRoofMaterial,
  resolveBuildingAppearance
} from "../../../buildings/appearance/resolver";
import { BUILDING_APPEARANCE_VERSION, type BuildingAppearance } from "../../../buildings/appearance/types";
import { limitBuildingRoofColors } from "../../generators/buildingAppearanceBuckets";
import type { BuildingLot } from "../../generators/buildingLots.types";
import { vectorHousingCulture } from "../../generators/vector/generation/housingCulture";
import type { BuildingMassing } from "../../types/contracts/buildingMassing";
import type { VectorCityDocument } from "../../types/vector/document";
import { automaticHousingProfile } from "../standaloneHousingAppearance";

/**
 * Regional roofs and wall colours of meshless houses by the mesh editor's appearance rules (P3b), as its
 * automatic culture at high quality: an FMG city takes the culture of its tradition, or one from its climate;
 * a standalone city draws one from its seed. Roof colours are limited per street block as in the mesh editor.
 */
export function vectorHouseAppearance(doc: Pick<VectorCityDocument, "context" | "recipe" | "site">) {
  const descriptor = doc.site?.descriptor,
    seed = doc.recipe.seed,
    context = normalizeBuildingAppearanceContext({
      period: doc.context.historicalPeriod,
      tradition: descriptor?.civilization?.tradition,
      temperatureC: descriptor?.climate?.temperatureC,
      biome: descriptor?.biome ?? (descriptor?.climate?.biomeKey ? { key: descriptor.climate.biomeKey } : undefined)
    }),
    // The culture chosen in the meshless city settings, else the automatic one.
    profile = vectorHousingCulture(doc) ?? automaticHousingProfile(context, !!descriptor, seed);
  /** Houses of one street block; `rural` marks a block outside the town wall. */
  return (
    blockId: string,
    rural: boolean,
    houses: readonly { id: string; massing: BuildingMassing }[]
  ): { massing: BuildingMassing; appearance?: BuildingAppearance }[] => {
    const lots = houses.map(house => {
      const input = {
        version: BUILDING_APPEARANCE_VERSION,
        profile,
        context,
        seed,
        stableLotId: house.id,
        blockId,
        rural,
        rich: false,
        wall: house.massing.wall,
        roof: house.massing.roof.material
      };
      const roof = regionalRoofMaterial(input, house.massing.roof.pitchDeg),
        massing =
          roof === house.massing.roof.material
            ? house.massing
            : { ...house.massing, roof: { ...house.massing.roof, material: roof } };
      return { faceId: blockId, massing, appearance: resolveBuildingAppearance({ ...input, roof }) };
    });
    return limitBuildingRoofColors(lots as unknown as BuildingLot[]).map(lot => ({
      massing: lot.massing!,
      appearance: lot.appearance
    }));
  };
}
