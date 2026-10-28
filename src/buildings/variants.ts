import { TOWN_WALL_PART_VARIANTS, TOWN_WALL_STUDY_VARIANTS } from "./fortifications/townWallVariants";
import { EARTHEN_HOUSE_VARIANTS, POLYGON_HOUSE_VARIANTS, REGIONAL_HOUSE_VARIANTS } from "./houses/houseVariants";
import { TREE_VARIANTS } from "./landscape/treeVariants";
import { MEDIEVAL_VARIANTS } from "./medieval/medievalVariants";
import type { ModelVariantInfo } from "./modelVariants";
import { SHIP_VARIANTS } from "./ships/shipVariants";
import {
  BRIDGE_VARIANTS,
  CEMETERY_VARIANTS,
  CONTAINER_VARIANTS,
  FRIARY_VARIANTS,
  GARRISON_VARIANTS,
  LODGING_VARIANTS,
  OBJECT_VARIANTS,
  RAVELIN_VARIANTS,
  WELL_VARIANTS,
  YARD_VARIANTS
} from "./siteVariants";
import { BASILICA_VARIANTS } from "./temples/basilicaVariants";

/** Every BV model variant with a registered family. Families migrate here one at a time. */
export const MODEL_VARIANTS: readonly ModelVariantInfo[] = [
  ...TREE_VARIANTS,
  ...SHIP_VARIANTS,
  ...TOWN_WALL_STUDY_VARIANTS,
  ...TOWN_WALL_PART_VARIANTS,
  ...BASILICA_VARIANTS,
  ...REGIONAL_HOUSE_VARIANTS,
  ...EARTHEN_HOUSE_VARIANTS,
  ...POLYGON_HOUSE_VARIANTS,
  ...MEDIEVAL_VARIANTS,
  ...OBJECT_VARIANTS,
  ...WELL_VARIANTS,
  ...YARD_VARIANTS,
  ...CONTAINER_VARIANTS,
  ...CEMETERY_VARIANTS,
  ...FRIARY_VARIANTS,
  ...GARRISON_VARIANTS,
  ...LODGING_VARIANTS,
  ...RAVELIN_VARIANTS,
  ...BRIDGE_VARIANTS
];

export function familyVariants(family: string): ModelVariantInfo[] {
  return MODEL_VARIANTS.filter(variant => variant.family === family);
}
