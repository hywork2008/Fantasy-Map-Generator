import { TOWN_WALL_PART_VARIANTS, TOWN_WALL_STUDY_VARIANTS } from "./fortifications/townWallVariants";
import { TREE_VARIANTS } from "./landscape/treeVariants";
import type { ModelVariantInfo } from "./modelVariants";
import { SHIP_VARIANTS } from "./ships/shipVariants";
import { BASILICA_VARIANTS } from "./temples/basilicaVariants";

/** Every BV model variant with a registered family. Families migrate here one at a time. */
export const MODEL_VARIANTS: readonly ModelVariantInfo[] = [
  ...TREE_VARIANTS,
  ...SHIP_VARIANTS,
  ...TOWN_WALL_STUDY_VARIANTS,
  ...TOWN_WALL_PART_VARIANTS,
  ...BASILICA_VARIANTS
];

export function familyVariants(family: string): ModelVariantInfo[] {
  return MODEL_VARIANTS.filter(variant => variant.family === family);
}
