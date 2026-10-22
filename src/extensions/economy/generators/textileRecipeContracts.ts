/** Textile material contracts. Yields and quality premiums are explicit model choices (§38–§39). */
import { WAIN_KG } from "./goodMeasureCatalog";

export const HEMP_LOTS_PER_CLOTH = 4000 / 0.8 / WAIN_KG;
export const COTTON_LOTS_PER_CLOTH = 4000 / 0.8 / 200;
export const CLOTH_LOTS_PER_GARMENT = 4000 / 0.9 / 4000;
export const CLOTH_LOTS_PER_FUR_GARMENT = (4000 / 0.9 - 15) / 4000;
export const LINEN_BALES_PER_GARMENT = 12;
export const WOOL_CLOTH_LOTS_PER_BLANKET_LOT = 250 / 0.95 / 4000;
export const HOUSEHOLD_GARMENT_NAMES: ReadonlySet<string> = new Set(["Garments", "Linen Garments", "Wool Garments"]);
export const TEXTILE_RECIPES: Readonly<Record<string, Record<string, number>[]>> = {
  Cloth: [
    { Wool: 6 },
    { Hemp: HEMP_LOTS_PER_CLOTH },
    { Cotton: COTTON_LOTS_PER_CLOTH },
    { Wool: 6, "Synthetic Dye": 0.1 }
  ],
  Garments: [
    { Cloth: CLOTH_LOTS_PER_GARMENT },
    { Cloth: CLOTH_LOTS_PER_FUR_GARMENT, Furs: 1 },
    { Cloth: CLOTH_LOTS_PER_GARMENT, "Synthetic Dye": 0.15 }
  ],
  Linen: [{ Flax: 10 }],
  "Linen Garments": [{ Linen: LINEN_BALES_PER_GARMENT }],
  "Wool Cloth": [{ Wool: 6 }],
  "Wool Blankets": [{ "Wool Cloth": WOOL_CLOTH_LOTS_PER_BLANKET_LOT }],
  "Wool Garments": [{ "Wool Cloth": CLOTH_LOTS_PER_GARMENT }],
  "Fine Wool Cloth": [{ Wool: 0.3 }],
  "Fine Wool Garments": [{ "Fine Wool Cloth": 1 }]
};

/** Productivity changes work time, never the amount of fabric obtained from fibre. */
export function hasPhysicalTextileRecipe(name: string): boolean {
  return Object.hasOwn(TEXTILE_RECIPES, name);
}
