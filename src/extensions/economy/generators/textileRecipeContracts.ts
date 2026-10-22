/** Textile material contracts. Yields and quality premiums are explicit model choices (§38). */
import { WAIN_KG } from "./goodMeasureCatalog";

export const HEMP_LOTS_PER_CLOTH = 4000 / 0.8 / WAIN_KG;
export const COTTON_LOTS_PER_CLOTH = 4000 / 0.8 / 200;
export const TEXTILE_RECIPES: Readonly<Record<string, Record<string, number>[]>> = {
  Cloth: [
    { Wool: 6 },
    { Hemp: HEMP_LOTS_PER_CLOTH },
    { Cotton: COTTON_LOTS_PER_CLOTH },
    { Wool: 6, "Synthetic Dye": 0.1 }
  ],
  "Fine Wool Cloth": [{ Wool: 0.3 }],
  "Fine Wool Garments": [{ "Fine Wool Cloth": 1 }]
};

/** Productivity changes work time, never the amount of fabric obtained from fibre. */
export function hasPhysicalTextileRecipe(name: string): boolean {
  return Object.hasOwn(TEXTILE_RECIPES, name);
}
