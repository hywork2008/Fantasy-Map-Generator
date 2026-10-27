import type { TreeSpecies } from "../../buildings/landscape/trees";
import { growthRandom } from "../../utils/urbanMorphology";
import type { CityDocument, Point } from "../types/document";

/** The site's actual vegetation and climate choose trees independently of housing culture. */
export function landscapeTreeSpecies(
  preferred: TreeSpecies,
  document: CityDocument | undefined,
  point: Point
): TreeSpecies {
  if (!document) return preferred;
  const climate = document.fabric?.generation?.settings.descriptor?.climate;
  const temperature = climate?.temperatureC ?? document.buildingAppearanceContext?.temperatureC;
  const biome = [document.biome?.key ?? climate?.biomeKey ?? "", ...(document.biome?.tags ?? [])]
    .join(" ")
    .toLowerCase();
  const boreal =
    /taiga|boreal/.test(biome) || (temperature !== undefined && temperature <= 3 && /forest|woodland/.test(biome));
  if (!boreal) return preferred;
  // Retain the evergreen role of traditional funerary planting in a colder flora.
  if (preferred !== "garden_parkland") return "norway_spruce";
  const seed = document.generationSeed ?? document.fabric?.seed ?? "landscape";
  return growthRandom(`${seed}:boreal-tree:${point[0]}:${point[1]}`) < 0.65 ? "norway_spruce" : "silver_birch";
}
