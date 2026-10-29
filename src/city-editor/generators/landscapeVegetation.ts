import { STANDARD_BIOME_KEYS, type StandardBiomeKey } from "../../types/biome";
import type { CityDocument } from "../types/document";

type TreeBiome =
  | "none"
  | "preferred"
  | "temperate"
  | "palm"
  | "desert"
  | "savanna"
  | "rainforest"
  | "cedar"
  | "boreal"
  | "alder"
  | "olive"
  | "conifer"
  | "fir"
  | "rowan"
  | "mangrove"
  | "xeric"
  | "flooded"
  | "volcanic";

/** Explicit coverage: adding a standard biome requires choosing its tree policy. */
export const TREE_BIOME_POLICY = {
  marine: "none",
  hotDesert: "palm",
  coldDesert: "desert",
  savanna: "savanna",
  grassland: "preferred",
  tropicalSeasonalForest: "savanna",
  temperateDeciduousForest: "temperate",
  tropicalRainforest: "rainforest",
  temperateRainforest: "cedar",
  taiga: "boreal",
  tundra: "none",
  glacier: "none",
  wetland: "alder",
  centralEuropeanGreatForest: "temperate",
  mediterraneanWoodlandScrub: "olive",
  temperateConiferousForest: "conifer",
  montaneForest: "fir",
  alpineTundra: "rowan",
  mangrove: "mangrove",
  xericShrubland: "xeric",
  cloudForest: "rainforest",
  heathMoorland: "rowan",
  floodedForest: "flooded",
  coldSteppe: "desert",
  tropicalDryForest: "savanna",
  borealPeatland: "boreal",
  volcanicBarrens: "volcanic",
  lavaField: "none",
  volcanicSoil: "volcanic"
} satisfies Record<StandardBiomeKey, TreeBiome>;

function standardKey(key?: string): StandardBiomeKey | undefined {
  return STANDARD_BIOME_KEYS.find(candidate => candidate.toLowerCase() === key?.toLowerCase());
}

export function landscapeTemperature(document?: CityDocument): number | undefined {
  return (
    document?.fabric?.generation?.settings.descriptor?.climate?.temperatureC ??
    document?.buildingAppearanceContext?.temperatureC
  );
}

/** Identity before tags before generation climate. Unknown identity alone never means treeless. */
export function landscapeTreeBiome(document?: CityDocument): TreeBiome {
  const biome = document?.biome;
  const key = standardKey(biome?.key);
  if (key) return TREE_BIOME_POLICY[key];
  const tags = new Set(biome?.tags?.map(tag => tag.toLowerCase()));
  if (tags.has("marine")) return "none";
  for (const tag of tags) {
    const known = standardKey(tag);
    if (known) return TREE_BIOME_POLICY[known];
  }
  if (tags.has("wetland")) return "alder";
  if (tags.has("desert")) return tags.has("cold") || (landscapeTemperature(document) ?? 20) <= 3 ? "desert" : "palm";
  if (tags.has("forest")) {
    if (tags.has("tropical")) return tags.has("dry") ? "savanna" : "rainforest";
    return tags.has("cold") || (landscapeTemperature(document) ?? 10) <= 3 ? "boreal" : "temperate";
  }
  if (tags.has("snow")) return "none";
  const climateKey = standardKey(document?.fabric?.generation?.settings.descriptor?.climate?.biomeKey);
  return climateKey ? TREE_BIOME_POLICY[climateKey] : "preferred";
}

/** Shared by generation and both renderers; stored layouts and explicit overrides remain intact. */
export function landscapeHasTrees(document?: CityDocument): boolean {
  return landscapeTreeBiome(document) !== "none";
}
