import type { LandscapeClimate } from "../types/contracts/landscape";

export type { LandscapeClimate } from "../types/contracts/landscape";

import { STANDARD_BIOME_KEYS, type StandardBiomeKey } from "../../types/biome";
import type { CityDocument } from "../types/document";

export type TreeBiome =
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

export function landscapeClimate(document?: CityDocument): LandscapeClimate {
  return {
    ...(document?.biome ? { biome: document.biome } : {}),
    temperatureC:
      document?.fabric?.generation?.settings.descriptor?.climate?.temperatureC ??
      document?.buildingAppearanceContext?.temperatureC,
    climateBiomeKey: document?.fabric?.generation?.settings.descriptor?.climate?.biomeKey
  };
}
export function landscapeTemperature(document?: CityDocument): number | undefined {
  return landscapeClimate(document).temperatureC;
}
/** Identity before tags before generation climate. Unknown identity alone never means treeless. */
export function treeBiomeForClimate(climate: LandscapeClimate): TreeBiome {
  const biome = climate.biome;
  const key = standardKey(biome?.key);
  if (key) return TREE_BIOME_POLICY[key];
  const tags = new Set(biome?.tags?.map(tag => tag.toLowerCase()));
  if (tags.has("marine")) return "none";
  for (const tag of tags) {
    const known = standardKey(tag);
    if (known) return TREE_BIOME_POLICY[known];
  }
  if (tags.has("wetland")) return "alder";
  if (tags.has("desert")) return tags.has("cold") || (climate.temperatureC ?? 20) <= 3 ? "desert" : "palm";
  if (tags.has("forest")) {
    if (tags.has("tropical")) return tags.has("dry") ? "savanna" : "rainforest";
    return tags.has("cold") || (climate.temperatureC ?? 10) <= 3 ? "boreal" : "temperate";
  }
  if (tags.has("snow")) return "none";
  const climateKey = standardKey(climate.climateBiomeKey);
  return climateKey ? TREE_BIOME_POLICY[climateKey] : "preferred";
}
export function landscapeTreeBiome(document?: CityDocument): TreeBiome {
  return treeBiomeForClimate(landscapeClimate(document));
}

/** Shared by generation and both renderers; stored layouts and explicit overrides remain intact. */
export function landscapeHasTrees(document?: CityDocument): boolean {
  return landscapeTreeBiome(document) !== "none";
}

/** Natural cover for terrain previews: biome productivity, local slope, and temperature lapse with height. */
export function naturalTreeSuitability(
  document: CityDocument,
  point: [number, number],
  heightAt?: (point: [number, number]) => number
): number {
  if (document.fabric?.generation?.settings.mode !== "terrain") return 1;
  const biome = landscapeTreeBiome(document);
  if (biome === "none") return 0;
  const productivity =
    biome === "palm" || biome === "desert"
      ? 0.03
      : biome === "xeric" || biome === "volcanic"
        ? 0.08
        : biome === "preferred" || biome === "rowan"
          ? 0.15
          : biome === "savanna" || biome === "olive"
            ? 0.3
            : 1;
  if (!heightAt) return productivity;
  const height = heightAt(point);
  const dx = (heightAt([point[0] + 2, point[1]]) - heightAt([point[0] - 2, point[1]])) / 4;
  const dy = (heightAt([point[0], point[1] + 2]) - heightAt([point[0], point[1] - 2])) / 4;
  // Forest can cover a 45-degree hillside; thin it only as the ground approaches a cliff.
  const slope = Math.max(0, Math.min(1, 2 - Math.hypot(dx, dy)));
  const temperature = (landscapeTemperature(document) ?? 15) - Math.max(0, height) * 0.0065;
  return productivity * slope * Math.max(0, Math.min(1, (temperature + 2) / 7));
}
