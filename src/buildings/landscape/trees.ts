import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createArabicaCoffee } from "./arabicaCoffee";
import { createAridTree } from "./aridTrees";
import { createBorealTree } from "./borealTrees";
import { createCacao } from "./cacao";
import { createCommonFig } from "./commonFig";
import { createDomesticApple } from "./domesticApple";
import { createEuropeanBeech } from "./europeanBeech";
import { createEuropeanHornbeam } from "./europeanHornbeam";
import { createEuropeanPear } from "./europeanPear";
import { createEuropeanPlum } from "./europeanPlum";
import { createEuropeanYew } from "./europeanYew";
import { createLemon } from "./lemon";
import { createMediterraneanMontaneTree } from "./mediterraneanMontaneTrees";
import { createPedunculateOak } from "./pedunculateOak";
import { createKapok } from "./rainforestTrees";
import { createSacredGardenTree } from "./sacredGardenTrees";
import { createSaltTolerantTree } from "./saltTolerantTrees";
import { createScotsPine } from "./scotsPine";
import {
  applySeasonalLook,
  FRUIT_LAYER_LOOKS,
  generatorOptions,
  SEASONAL_LOOKS,
  type SeasonalLookSpecies
} from "./seasonalLooks";
import { createSmallLeavedLime } from "./smallLeavedLime";
import { createSweetChestnut } from "./sweetChestnut";
import { TREE_PHENOLOGY, type TreeAppearance } from "./treePhenology";
import { TREE_QUALITIES, type TreeQuality } from "./treeQuality";
import type { TreeAppearanceOptions } from "./treeSeasonLayers";
import { TREE_SPECIES, type TreeSpecies } from "./treeSpecies";
import { createUplandTree } from "./uplandTrees";
import { createWetTemperateTree } from "./wetTemperateTrees";

export { TREE_SPECIES, type TreeSpecies } from "./treeSpecies";

/** Factories without seasonal layers ignore the options and keep their static model. */
type TreeFactory = (options?: TreeAppearanceOptions) => CityStructureMeshes;
export interface TreeLodProfile {
  selection: "distance" | "pixels";
  /** Quality-first trees retain their selected tier regardless of the city's geometry budget. */
  budget: "quality-first" | "bounded";
  /** Appearances the factories can draw (docs/plan/bv-tree-seasonal-appearance.md); absent for static models. */
  seasonal?: readonly TreeAppearance[];
  heightMeters: number;
  /** Natural stand proportions (height / crown radius); explicit park dimensions remain authoritative. */
  forestHeightToRadius?: number;
  models: Record<TreeQuality, TreeFactory>;
}
type TreeDefinition = { create: TreeFactory; lod?: undefined } | { lod: TreeLodProfile };

/** Static factories as written per species; seasonal looks are layered on below. */
const BASE_DEFINITIONS: Record<TreeSpecies, TreeDefinition> = {
  arabica_coffee: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 2.4,
      models: {
        low: options => createArabicaCoffee("low", options),
        medium: options => createArabicaCoffee("medium", options),
        high: options => createArabicaCoffee("high", options),
        ultra: options => createArabicaCoffee("ultra", options)
      }
    }
  },
  cacao: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 4.5,
      models: {
        low: options => createCacao("low", options),
        medium: options => createCacao("medium", options),
        high: options => createCacao("high", options),
        ultra: options => createCacao("ultra", options)
      }
    }
  },
  sweet_chestnut: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 8.8,
      models: {
        low: options => createSweetChestnut("low", options),
        medium: options => createSweetChestnut("medium", options),
        high: options => createSweetChestnut("high", options),
        ultra: options => createSweetChestnut("ultra", options)
      }
    }
  },
  lemon: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 3.8,
      models: {
        low: options => createLemon("low", options),
        medium: options => createLemon("medium", options),
        high: options => createLemon("high", options),
        ultra: options => createLemon("ultra", options)
      }
    }
  },
  common_fig: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 4.9,
      models: {
        low: options => createCommonFig("low", options),
        medium: options => createCommonFig("medium", options),
        high: options => createCommonFig("high", options),
        ultra: options => createCommonFig("ultra", options)
      }
    }
  },
  european_plum: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 6,
      models: {
        low: options => createEuropeanPlum("low", options),
        medium: options => createEuropeanPlum("medium", options),
        high: options => createEuropeanPlum("high", options),
        ultra: options => createEuropeanPlum("ultra", options)
      }
    }
  },
  european_pear: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 8.8,
      models: {
        low: options => createEuropeanPear("low", options),
        medium: options => createEuropeanPear("medium", options),
        high: options => createEuropeanPear("high", options),
        ultra: options => createEuropeanPear("ultra", options)
      }
    }
  },
  domestic_apple: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 6.1,
      models: {
        low: options => createDomesticApple("low", options),
        medium: options => createDomesticApple("medium", options),
        high: options => createDomesticApple("high", options),
        ultra: options => createDomesticApple("ultra", options)
      }
    }
  },
  scots_pine: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 21,
      forestHeightToRadius: 3.8,
      models: {
        low: () => createScotsPine("low"),
        medium: () => createScotsPine("medium"),
        high: () => createScotsPine("high"),
        ultra: () => createScotsPine("ultra")
      }
    }
  },
  european_hornbeam: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 16.5,
      forestHeightToRadius: 3.3,
      models: {
        low: options => createEuropeanHornbeam("low", options),
        medium: options => createEuropeanHornbeam("medium", options),
        high: options => createEuropeanHornbeam("high", options),
        ultra: options => createEuropeanHornbeam("ultra", options)
      }
    }
  },
  pedunculate_oak: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 18,
      forestHeightToRadius: 2.3,
      models: {
        low: options => createPedunculateOak("low", options),
        medium: options => createPedunculateOak("medium", options),
        high: options => createPedunculateOak("high", options),
        ultra: options => createPedunculateOak("ultra", options)
      }
    }
  },
  european_beech: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 20,
      forestHeightToRadius: 3.2,
      models: {
        low: options => createEuropeanBeech("low", options),
        medium: options => createEuropeanBeech("medium", options),
        high: options => createEuropeanBeech("high", options),
        ultra: options => createEuropeanBeech("ultra", options)
      }
    }
  },
  garden_parkland: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 11.2,
      models: {
        low: options => createSmallLeavedLime("low", options),
        medium: options => createSmallLeavedLime("medium", options),
        high: options => createSmallLeavedLime("high", options),
        ultra: options => createSmallLeavedLime("ultra", options)
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
        low: options => createBorealTree("silver_birch", "low", options),
        medium: options => createBorealTree("silver_birch", "medium", options),
        high: options => createBorealTree("silver_birch", "high", options),
        ultra: options => createBorealTree("silver_birch", "ultra", options)
      }
    }
  },
  date_palm: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 12,
      forestHeightToRadius: 2.109,
      models: {
        low: () => createAridTree("date_palm", "low"),
        medium: () => createAridTree("date_palm", "medium"),
        high: () => createAridTree("date_palm", "high"),
        ultra: () => createAridTree("date_palm", "ultra")
      }
    }
  },
  umbrella_thorn: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 7.8,
      forestHeightToRadius: 1.128,
      models: {
        low: () => createAridTree("umbrella_thorn", "low"),
        medium: () => createAridTree("umbrella_thorn", "medium"),
        high: () => createAridTree("umbrella_thorn", "high"),
        ultra: () => createAridTree("umbrella_thorn", "ultra")
      }
    }
  },
  saxaul: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 4.2,
      forestHeightToRadius: 1.38,
      models: {
        low: () => createAridTree("saxaul", "low"),
        medium: () => createAridTree("saxaul", "medium"),
        high: () => createAridTree("saxaul", "high"),
        ultra: () => createAridTree("saxaul", "ultra")
      }
    }
  },
  kapok: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 18.2,
      forestHeightToRadius: 1.814,
      models: {
        low: () => createKapok("low"),
        medium: () => createKapok("medium"),
        high: () => createKapok("high"),
        ultra: () => createKapok("ultra")
      }
    }
  },
  western_red_cedar: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 18.5,
      models: {
        low: () => createWetTemperateTree("western_red_cedar", "low"),
        medium: () => createWetTemperateTree("western_red_cedar", "medium"),
        high: () => createWetTemperateTree("western_red_cedar", "high"),
        ultra: () => createWetTemperateTree("western_red_cedar", "ultra")
      }
    }
  },
  black_alder: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 13.1,
      forestHeightToRadius: 3.181,
      models: {
        low: options => createWetTemperateTree("black_alder", "low", options),
        medium: options => createWetTemperateTree("black_alder", "medium", options),
        high: options => createWetTemperateTree("black_alder", "high", options),
        ultra: options => createWetTemperateTree("black_alder", "ultra", options)
      }
    }
  },
  olive: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 6.2,
      forestHeightToRadius: 1.14,
      models: {
        low: () => createMediterraneanMontaneTree("olive", "low"),
        medium: () => createMediterraneanMontaneTree("olive", "medium"),
        high: () => createMediterraneanMontaneTree("olive", "high"),
        ultra: () => createMediterraneanMontaneTree("olive", "ultra")
      }
    }
  },
  silver_fir: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 19.5,
      models: {
        low: () => createMediterraneanMontaneTree("silver_fir", "low"),
        medium: () => createMediterraneanMontaneTree("silver_fir", "medium"),
        high: () => createMediterraneanMontaneTree("silver_fir", "high"),
        ultra: () => createMediterraneanMontaneTree("silver_fir", "ultra")
      }
    }
  },
  red_mangrove: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 7.8,
      forestHeightToRadius: 1.6,
      models: {
        low: () => createSaltTolerantTree("red_mangrove", "low"),
        medium: () => createSaltTolerantTree("red_mangrove", "medium"),
        high: () => createSaltTolerantTree("red_mangrove", "high"),
        ultra: () => createSaltTolerantTree("red_mangrove", "ultra")
      }
    }
  },
  tamarisk: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 4.9,
      forestHeightToRadius: 1.228,
      models: {
        low: options => createSaltTolerantTree("tamarisk", "low", options),
        medium: options => createSaltTolerantTree("tamarisk", "medium", options),
        high: options => createSaltTolerantTree("tamarisk", "high", options),
        ultra: options => createSaltTolerantTree("tamarisk", "ultra", options)
      }
    }
  },
  rowan: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 9.5,
      forestHeightToRadius: 2.504,
      models: {
        low: options => createUplandTree("rowan", "low", options),
        medium: options => createUplandTree("rowan", "medium", options),
        high: options => createUplandTree("rowan", "high", options),
        ultra: options => createUplandTree("rowan", "ultra", options)
      }
    }
  },
  canary_pine: {
    lod: {
      selection: "distance",
      budget: "quality-first",
      heightMeters: 15.5,
      forestHeightToRadius: 3.007,
      models: {
        low: () => createUplandTree("canary_pine", "low"),
        medium: () => createUplandTree("canary_pine", "medium"),
        high: () => createUplandTree("canary_pine", "high"),
        ultra: () => createUplandTree("canary_pine", "ultra")
      }
    }
  },
  mediterranean_cypress: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 14.4,
      forestHeightToRadius: 12.385,
      models: {
        low: () => createSacredGardenTree("mediterranean_cypress", "low"),
        medium: () => createSacredGardenTree("mediterranean_cypress", "medium"),
        high: () => createSacredGardenTree("mediterranean_cypress", "high"),
        ultra: () => createSacredGardenTree("mediterranean_cypress", "ultra")
      }
    }
  },
  oriental_evergreen: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 9.6,
      forestHeightToRadius: 3.448,
      models: {
        low: () => createSacredGardenTree("oriental_evergreen", "low"),
        medium: () => createSacredGardenTree("oriental_evergreen", "medium"),
        high: () => createSacredGardenTree("oriental_evergreen", "high"),
        ultra: () => createSacredGardenTree("oriental_evergreen", "ultra")
      }
    }
  },
  sacred_bodhi_and_fig: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 10.4,
      forestHeightToRadius: 1.24,
      models: {
        low: () => createSacredGardenTree("sacred_bodhi_and_fig", "low"),
        medium: () => createSacredGardenTree("sacred_bodhi_and_fig", "medium"),
        high: () => createSacredGardenTree("sacred_bodhi_and_fig", "high"),
        ultra: () => createSacredGardenTree("sacred_bodhi_and_fig", "ultra")
      }
    }
  },
  peaceful_willow: {
    lod: {
      selection: "pixels",
      budget: "bounded",
      heightMeters: 9.4,
      forestHeightToRadius: 1.378,
      models: {
        low: options => createSacredGardenTree("peaceful_willow", "low", options),
        medium: options => createSacredGardenTree("peaceful_willow", "medium", options),
        high: options => createSacredGardenTree("peaceful_willow", "high", options),
        ultra: options => createSacredGardenTree("peaceful_willow", "ultra", options)
      }
    }
  }
};

/** Species whose generators draw every appearance themselves. */
const NATIVE_SEASONS: Partial<Record<TreeSpecies, true>> = { domestic_apple: true, european_beech: true };

/**
 * One registration supplies BV factories and CE's woodland, park and churchyard LOD policy.
 * Seasonal looks that only recolour or drop parts wrap the base factories (seasonalLooks.ts).
 */
export const TREE_DEFINITIONS = Object.fromEntries(
  TREE_SPECIES.map(species => {
    const definition = BASE_DEFINITIONS[species];
    if (!definition.lod) return [species, definition];
    if (NATIVE_SEASONS[species])
      return [species, { lod: { ...definition.lod, seasonal: TREE_PHENOLOGY[species].appearances } }];
    const look = SEASONAL_LOOKS[species as SeasonalLookSpecies];
    if (!look) return [species, definition];
    const base = definition.lod.models;
    const models = Object.fromEntries(
      TREE_QUALITIES.map(quality => [
        quality,
        (options?: TreeAppearanceOptions) =>
          applySeasonalLook(look, quality, base[quality](generatorOptions(look, quality, options)), options)
      ])
    ) as Record<TreeQuality, TreeFactory>;
    return [species, { lod: { ...definition.lod, seasonal: look.appearances, models } }];
  })
) as Record<TreeSpecies, TreeDefinition>;

/**
 * Editions that replace the original fruit markers with the shared fruit layer (§7.1, O02 and
 * D02). They revise the default appearance itself, so they are separate editions that CE adopts,
 * and the original models stay registered for comparison.
 */
export const FRUIT_LAYER_EDITIONS = {
  olive: {
    edition: "drupes",
    models: Object.fromEntries(
      TREE_QUALITIES.map(quality => [
        quality,
        (options?: TreeAppearanceOptions) => createMediterraneanMontaneTree("olive", quality, options, "drupes")
      ])
    ) as Record<TreeQuality, TreeFactory>
  },
  date_palm: {
    edition: "bunches",
    models: Object.fromEntries(
      TREE_QUALITIES.map(quality => [
        quality,
        (options?: TreeAppearanceOptions) => {
          const look = FRUIT_LAYER_LOOKS.date_palm;
          // Flowering starts from the unripe bunches, whose dates mark where the strands open.
          if (options?.appearance !== "bloom") return createAridTree("date_palm", quality, options, "bunches");
          return applySeasonalLook(look, quality, createAridTree("date_palm", quality, {}, "bunches"), options);
        }
      ])
    ) as Record<TreeQuality, TreeFactory>
  }
} as const satisfies Partial<Record<TreeSpecies, { edition: string; models: Record<TreeQuality, TreeFactory> }>>;

export function treeLodProfile(species: TreeSpecies): TreeLodProfile | undefined {
  return TREE_DEFINITIONS[species].lod;
}

export function hasTreeQualityLevels(species: TreeSpecies): boolean {
  return treeLodProfile(species) !== undefined;
}

/** Meter-scale species models shared by BV and CE. Radius is set by the saved canopy. */
export function createLandscapeTree(
  species: TreeSpecies,
  quality: TreeQuality = "ultra",
  options?: TreeAppearanceOptions
) {
  const definition = TREE_DEFINITIONS[species];
  return definition.lod ? definition.lod.models[quality](options) : definition.create(options);
}
