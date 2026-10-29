import type { TreeSpecies } from "../../buildings/landscape/trees";
import { growthRandom } from "../../utils/urbanMorphology";
import { landscapeTemperature, landscapeTreeBiome } from "../generators/landscapeVegetation";
import type { CityDocument, Point } from "../types/document";

/** Site climate adapts a preferred planting; undefined explicitly forbids generated trees. */
export function landscapeTreeSpecies(
  preferred: TreeSpecies,
  document: CityDocument | undefined,
  point: Point,
  context: "planting" | "woodland" = "planting"
): TreeSpecies | undefined {
  if (!document) return preferred;
  const zone = landscapeTreeBiome(document);
  const temperature = landscapeTemperature(document);
  const seed = document.generationSeed ?? document.fabric?.seed ?? "landscape";
  switch (zone) {
    case "none":
      return undefined;
    case "preferred":
      return preferred;
    case "palm":
      return "date_palm";
    case "xeric":
      return preferred === "garden_parkland" && growthRandom(`${seed}:dry-tree:${point[0]}:${point[1]}`) < 0.3
        ? "date_palm"
        : "tamarisk";
    case "rowan":
      return "rowan";
    case "volcanic":
      return "canary_pine";
    case "mangrove":
      return "red_mangrove";
    case "desert":
      return "saxaul";
    case "rainforest":
      return "kapok";
    case "flooded":
      return temperature !== undefined && temperature >= 20 ? "kapok" : "black_alder";
    case "olive":
      return preferred === "mediterranean_cypress" ? preferred : "olive";
    case "fir":
      return "silver_fir";
    case "cedar":
      return "western_red_cedar";
    case "alder":
      return "black_alder";
    case "savanna":
      return preferred === "garden_parkland" && growthRandom(`${seed}:dry-tree:${point[0]}:${point[1]}`) < 0.3
        ? "date_palm"
        : "umbrella_thorn";
    case "conifer":
      if (temperature === undefined || temperature > 3) return "western_red_cedar";
      break;
    case "temperate":
      if (temperature === undefined || temperature > 3) {
        const key = document.biome?.key?.toLowerCase();
        if (
          context === "woodland" &&
          preferred === "garden_parkland" &&
          (key === "temperatedeciduousforest" || key === "centraleuropeangreatforest")
        ) {
          // A deterministic visual mixture, not a calibrated natural species distribution.
          if (growthRandom(`${seed}:european-tree:${point[0]}:${point[1]}`) < 0.5) return "european_beech";
          return growthRandom(`${seed}:oak-tree:${point[0]}:${point[1]}`) < 0.5 ? "pedunculate_oak" : preferred;
        }
        return preferred;
      }
      break;
  }
  // Retain the evergreen role of funerary planting in colder woodland.
  if (preferred !== "garden_parkland") return "norway_spruce";
  return growthRandom(`${seed}:boreal-tree:${point[0]}:${point[1]}`) < 0.65 ? "norway_spruce" : "silver_birch";
}
