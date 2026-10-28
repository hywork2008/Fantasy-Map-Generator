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
  const seed = document.generationSeed ?? document.fabric?.seed ?? "landscape";
  // Irrigated oasis plantings in hot deserts; open umbrella thorns in savanna and dry tropical woodland.
  if (/hotdesert/.test(biome)) return "date_palm";
  if (/xericshrubland/.test(biome))
    return preferred === "garden_parkland" && growthRandom(`${seed}:dry-tree:${point[0]}:${point[1]}`) < 0.3
      ? "date_palm"
      : "tamarisk";
  if (/^mangrove/.test(biome)) return "red_mangrove";
  if (/colddesert|coldsteppe/.test(biome)) return "saxaul";
  if (/tropicalrainforest|cloudforest/.test(biome)) return "kapok";
  // Riparian woodland is tropical only where the site is hot; otherwise it is alder carr.
  if (/floodedforest/.test(biome)) return temperature !== undefined && temperature >= 20 ? "kapok" : "black_alder";
  if (/mediterraneanwoodlandscrub/.test(biome)) return preferred === "mediterranean_cypress" ? preferred : "olive";
  if (/montaneforest/.test(biome)) return "silver_fir";
  if (/temperaterainforest/.test(biome)) return "western_red_cedar";
  if (/^wetland/.test(biome)) return "black_alder";
  if (/savanna|tropicalseasonalforest|tropicaldryforest/.test(biome))
    return preferred === "garden_parkland" && growthRandom(`${seed}:dry-tree:${point[0]}:${point[1]}`) < 0.3
      ? "date_palm"
      : "umbrella_thorn";
  const boreal =
    /taiga|boreal/.test(biome) || (temperature !== undefined && temperature <= 3 && /forest|woodland/.test(biome));
  if (!boreal) return preferred;
  // Retain the evergreen role of traditional funerary planting in a colder flora.
  if (preferred !== "garden_parkland") return "norway_spruce";
  return growthRandom(`${seed}:boreal-tree:${point[0]}:${point[1]}`) < 0.65 ? "norway_spruce" : "silver_birch";
}
