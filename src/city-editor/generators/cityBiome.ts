import type { BurgSiteBiome } from "../types/contracts/burgSiteDescriptor";
import type { CityDocument } from "../types/document";
import { withBuildingAppearance } from "./buildingAppearance";

/** Update the shared vegetation/massing input, including the saved generation recipe. */
export function withCityBiome(document: CityDocument, biome: BurgSiteBiome | undefined): CityDocument {
  const next = withBuildingAppearance({ ...document, biome });
  delete next.ruralFieldSnapshot;
  if (next.fabric?.generation) {
    const generation = next.fabric.generation;
    next.fabric = {
      ...next.fabric,
      generation: { ...generation, input: withCityBiome(generation.input, biome) }
    };
  }
  return next;
}
