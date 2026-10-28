import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createAridTree } from "./aridTrees";
import { createBorealTree } from "./borealTrees";
import { createEuropeanYew } from "./europeanYew";
import { createMediterraneanMontaneTree } from "./mediterraneanMontaneTrees";
import { createKapok } from "./rainforestTrees";
import { createSacredGardenTree } from "./sacredGardenTrees";
import { createSaltTolerantTree } from "./saltTolerantTrees";
import { createSmallLeavedLime } from "./smallLeavedLime";
import type { TreeQuality } from "./treeQuality";
import { createUplandTree } from "./uplandTrees";
import { createWetTemperateTree } from "./wetTemperateTrees";

export const TREE_SPECIES = [
  "garden_parkland",
  "norway_spruce",
  "silver_birch",
  "sacred_yew",
  "date_palm",
  "umbrella_thorn",
  "saxaul",
  "kapok",
  "western_red_cedar",
  "black_alder",
  "olive",
  "silver_fir",
  "red_mangrove",
  "tamarisk",
  "rowan",
  "canary_pine",
  "mediterranean_cypress",
  "oriental_evergreen",
  "sacred_bodhi_and_fig",
  "peaceful_willow"
] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];

type TreeFactory = () => CityStructureMeshes;
export interface TreeLodProfile {
  selection: "distance" | "pixels";
  /** Quality-first trees retain their selected tier regardless of the city's geometry budget. */
  budget: "quality-first" | "bounded";
  heightMeters: number;
  models: Record<TreeQuality, TreeFactory>;
}
type TreeDefinition = { create: TreeFactory; lod?: undefined } | { lod: TreeLodProfile };

/** One registration supplies BV factories and CE's woodland, park and churchyard LOD policy. */
export const TREE_DEFINITIONS: Record<TreeSpecies, TreeDefinition> = {
  garden_parkland: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 11.2,
      models: {
        low: () => createSmallLeavedLime("low"),
        medium: () => createSmallLeavedLime("medium"),
        high: () => createSmallLeavedLime("high"),
        ultra: () => createSmallLeavedLime("ultra")
      }
    }
  },
  sacred_yew: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 7.8,
      models: {
        low: () => createEuropeanYew("low"),
        medium: () => createEuropeanYew("medium"),
        high: () => createEuropeanYew("high"),
        ultra: () => createEuropeanYew("ultra")
      }
    }
  },
  norway_spruce: {
    lod: {
      selection: "distance",
      // Taiga draws spruce and birch at the same distance tiers as the lime forest, not a thinned budget.
      budget: "quality-first",
      heightMeters: 12,
      models: {
        low: () => createBorealTree("norway_spruce", "low"),
        medium: () => createBorealTree("norway_spruce", "medium"),
        high: () => createBorealTree("norway_spruce", "high"),
        ultra: () => createBorealTree("norway_spruce", "ultra")
      }
    }
  },
  silver_birch: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 11,
      models: {
        low: () => createBorealTree("silver_birch", "low"),
        medium: () => createBorealTree("silver_birch", "medium"),
        high: () => createBorealTree("silver_birch", "high"),
        ultra: () => createBorealTree("silver_birch", "ultra")
      }
    }
  },
  date_palm: { create: () => createAridTree("date_palm") },
  umbrella_thorn: { create: () => createAridTree("umbrella_thorn") },
  saxaul: { create: () => createAridTree("saxaul") },
  kapok: { create: createKapok },
  western_red_cedar: { create: () => createWetTemperateTree("western_red_cedar") },
  black_alder: { create: () => createWetTemperateTree("black_alder") },
  olive: { create: () => createMediterraneanMontaneTree("olive") },
  silver_fir: { create: () => createMediterraneanMontaneTree("silver_fir") },
  red_mangrove: { create: () => createSaltTolerantTree("red_mangrove") },
  tamarisk: { create: () => createSaltTolerantTree("tamarisk") },
  rowan: { create: () => createUplandTree("rowan") },
  canary_pine: { create: () => createUplandTree("canary_pine") },
  mediterranean_cypress: { create: () => createSacredGardenTree("mediterranean_cypress") },
  oriental_evergreen: { create: () => createSacredGardenTree("oriental_evergreen") },
  sacred_bodhi_and_fig: { create: () => createSacredGardenTree("sacred_bodhi_and_fig") },
  peaceful_willow: { create: () => createSacredGardenTree("peaceful_willow") }
};

export function treeLodProfile(species: TreeSpecies): TreeLodProfile | undefined {
  return TREE_DEFINITIONS[species].lod;
}

export function hasTreeQualityLevels(species: TreeSpecies): boolean {
  return treeLodProfile(species) !== undefined;
}

/** Meter-scale species models shared by BV and CE. Radius is set by the saved canopy. */
export function createLandscapeTree(species: TreeSpecies, quality: TreeQuality = "ultra") {
  const definition = TREE_DEFINITIONS[species];
  return definition.lod ? definition.lod.models[quality]() : definition.create();
}
