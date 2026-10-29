import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createAridTree } from "./aridTrees";
import { createBorealTree } from "./borealTrees";
import { createEuropeanBeech } from "./europeanBeech";
import { createEuropeanHornbeam } from "./europeanHornbeam";
import { createEuropeanYew } from "./europeanYew";
import { createMediterraneanMontaneTree } from "./mediterraneanMontaneTrees";
import { createPedunculateOak } from "./pedunculateOak";
import { createKapok } from "./rainforestTrees";
import { createSacredGardenTree } from "./sacredGardenTrees";
import { createSaltTolerantTree } from "./saltTolerantTrees";
import { createScotsPine } from "./scotsPine";
import { createSmallLeavedLime } from "./smallLeavedLime";
import type { TreeQuality } from "./treeQuality";
import { createUplandTree } from "./uplandTrees";
import { createWetTemperateTree } from "./wetTemperateTrees";

export const TREE_SPECIES = [
  "scots_pine",
  "european_hornbeam",
  "pedunculate_oak",
  "european_beech",
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
  /** Natural stand proportions (height / crown radius); explicit park dimensions remain authoritative. */
  forestHeightToRadius?: number;
  models: Record<TreeQuality, TreeFactory>;
}
type TreeDefinition = { create: TreeFactory; lod?: undefined } | { lod: TreeLodProfile };

/** One registration supplies BV factories and CE's woodland, park and churchyard LOD policy. */
export const TREE_DEFINITIONS: Record<TreeSpecies, TreeDefinition> = {
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
        low: () => createEuropeanHornbeam("low"),
        medium: () => createEuropeanHornbeam("medium"),
        high: () => createEuropeanHornbeam("high"),
        ultra: () => createEuropeanHornbeam("ultra")
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
        low: () => createPedunculateOak("low"),
        medium: () => createPedunculateOak("medium"),
        high: () => createPedunculateOak("high"),
        ultra: () => createPedunculateOak("ultra")
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
        low: () => createEuropeanBeech("low"),
        medium: () => createEuropeanBeech("medium"),
        high: () => createEuropeanBeech("high"),
        ultra: () => createEuropeanBeech("ultra")
      }
    }
  },
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
        low: () => createWetTemperateTree("black_alder", "low"),
        medium: () => createWetTemperateTree("black_alder", "medium"),
        high: () => createWetTemperateTree("black_alder", "high"),
        ultra: () => createWetTemperateTree("black_alder", "ultra")
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
        low: () => createSaltTolerantTree("tamarisk", "low"),
        medium: () => createSaltTolerantTree("tamarisk", "medium"),
        high: () => createSaltTolerantTree("tamarisk", "high"),
        ultra: () => createSaltTolerantTree("tamarisk", "ultra")
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
        low: () => createUplandTree("rowan", "low"),
        medium: () => createUplandTree("rowan", "medium"),
        high: () => createUplandTree("rowan", "high"),
        ultra: () => createUplandTree("rowan", "ultra")
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
        low: () => createSacredGardenTree("peaceful_willow", "low"),
        medium: () => createSacredGardenTree("peaceful_willow", "medium"),
        high: () => createSacredGardenTree("peaceful_willow", "high"),
        ultra: () => createSacredGardenTree("peaceful_willow", "ultra")
      }
    }
  }
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
