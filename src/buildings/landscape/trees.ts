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

/** Meter-scale species models shared by BV and CE. Radius is set by the saved canopy. */
export function hasTreeQualityLevels(species: TreeSpecies): boolean {
  return species === "garden_parkland" || species === "sacred_yew";
}

export function createLandscapeTree(species: TreeSpecies, quality: TreeQuality = "ultra") {
  if (species === "norway_spruce" || species === "silver_birch") return createBorealTree(species);
  if (species === "date_palm" || species === "umbrella_thorn" || species === "saxaul") return createAridTree(species);
  if (species === "kapok") return createKapok();
  if (species === "rowan" || species === "canary_pine") return createUplandTree(species);
  if (species === "red_mangrove" || species === "tamarisk") return createSaltTolerantTree(species);
  if (species === "olive" || species === "silver_fir") return createMediterraneanMontaneTree(species);
  if (species === "western_red_cedar" || species === "black_alder") return createWetTemperateTree(species);
  if (species === "garden_parkland") return createSmallLeavedLime(quality);
  if (species === "sacred_yew") return createEuropeanYew(quality);
  return createSacredGardenTree(species);
}
