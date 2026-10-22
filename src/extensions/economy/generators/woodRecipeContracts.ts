/** Physical Wood recipe contracts (goods-physical-units.md §37).
 * All unspecified historical details below are explicit model choices, not measured yields.
 * Wood is air-seasoned roundwood, 20% water by wet mass, including bark.
 */
import { WOOD_M3_PER_UNIT } from "../../../generators/forestStock";

export const WOOD_KG_PER_LITER = 0.65;
export const WOOD_KG_PER_LOT = WOOD_M3_PER_UNIT * 1000 * WOOD_KG_PER_LITER;
export const WOOD_WATER_SHARE = 0.2;
export const WOOD_DRY_ASH_SHARE = 0.01;
export const WOOD_ASH_RECOVERY = 0.8;
export const WOOD_NET_MJ_PER_KG = 14;
export const RECOVERED_ASH_KG_PER_WOOD_LOT =
  WOOD_KG_PER_LOT * (1 - WOOD_WATER_SHARE) * WOOD_DRY_ASH_SHARE * WOOD_ASH_RECOVERY;
export const ASH_LOTS_PER_WOOD_LOT = RECOVERED_ASH_KG_PER_WOOD_LOT / 50;
/** Whole-kiln yield, including wood burned for heat: FAO earth-mound range 1/6–1/4. */
export const CHARCOAL_AIR_DRY_YIELD = 0.2;
export const CHARCOAL_WOOD_PER_LOT = 50 / CHARCOAL_AIR_DRY_YIELD / WOOD_KG_PER_LOT;
/** Tar-focused kiln model: 5% collected tar, 20% collected charcoal, both on wet wood mass.
 * Ash retained in the char is not sold independently. Other vapours/residues are uncollected.
 */
export const TAR_WOOD_PER_LOT = 144 / 0.05 / WOOD_KG_PER_LOT;
export const TAR_CHARCOAL_PER_LOT = (TAR_WOOD_PER_LOT * WOOD_KG_PER_LOT * 0.2) / 50;
export const TAR_RESIN_PER_LOT = 144 / 0.9 / 132;
/** Whole wooden barrel, including wooden hoops; 40% roundwood-to-finished-body mass recovery. */
export const BARREL_WOOD_PER_LOT = 25 / 0.4 / WOOD_KG_PER_LOT;
/** Useful process heat divided by boiler/kiln efficiency and net fuel energy. */
export function woodLotsForHeat(usefulMJ: number, efficiency: number): number {
  return usefulMJ / efficiency / WOOD_NET_MJ_PER_KG / WOOD_KG_PER_LOT;
}
export const BRICK_WOOD_PER_LOT = woodLotsForHeat((200 / 0.43) * 1.5, 0.25);
/** Smoking uses 0.5 kg seasoned fuel / kg finished food; not a drying-yield claim. */
export const SMOKING_WOOD_PER_LOT = ((200 / 0.43) * 0.5) / WOOD_KG_PER_LOT;
/** 100 L of 40% spirit: 4 MJ useful heat/L at 25% efficiency, modeled double distillation. */
export const LIQUOR_WOOD_PER_LOT = woodLotsForHeat(100 * 4, 0.25);
export const RAIL_WOOD_PER_LOT = woodLotsForHeat(1000 * 1.5, 0.25);

export type NamedRecipe = Record<string, number>;
export type WoodRecipeContract = { recipes: NamedRecipe[]; byproducts?: (NamedRecipe | undefined)[] };
const ashFor = (wood: number): NamedRecipe => ({ Ash: wood * ASH_LOTS_PER_WOOD_LOT });
const grainAndWine = ["Wheat", "Rye", "Barley", "Wine", "Pomace"];
const liquorRecipes = ["Barrels", "Ceramics", "Glass"].flatMap(container =>
  grainAndWine.slice(0, 4).map(name => ({
    [name]: name === "Wine" ? 3 : 0.6,
    Wood: LIQUOR_WOOD_PER_LOT,
    [container]: container === "Barrels" ? 0.04 : 0.01
  }))
);
liquorRecipes.push(
  ...["Barrels", "Ceramics", "Glass"].map(container => ({
    Pomace: 0.8,
    Wood: LIQUOR_WOOD_PER_LOT,
    [container]: container === "Barrels" ? 0.04 : 0.01
  }))
);

/** Fixed finished-lot ratios. Woodworking offcuts and metal scrap are not recovered as market goods.
 * Timber retains its existing 15 m³ -> 7.5 m³ contract; its residues remain uncollected.
 */
export const WOOD_RECIPE_CONTRACTS: Readonly<Record<string, WoodRecipeContract>> = {
  Charcoal: { recipes: [{ Wood: CHARCOAL_WOOD_PER_LOT }] },
  Tar: {
    recipes: [{ Wood: TAR_WOOD_PER_LOT }, { Resin: TAR_RESIN_PER_LOT }],
    byproducts: [{ Charcoal: TAR_CHARCOAL_PER_LOT }, undefined]
  },
  Barrels: { recipes: [{ Wood: BARREL_WOOD_PER_LOT }] },
  Ash: { recipes: [{ Wood: 1 / ASH_LOTS_PER_WOOD_LOT }] },
  Timber: { recipes: [{ Wood: 1.5 }] },
  Brick: { recipes: [{ Clay: 1 / 0.95, Wood: BRICK_WOOD_PER_LOT }], byproducts: [ashFor(BRICK_WOOD_PER_LOT)] },
  Arrows: { recipes: [{ Wood: 70 / 0.5 / WOOD_KG_PER_LOT, "Iron Ingot": 30 / 0.9 / 1000 }] },
  Muskets: { recipes: [{ Wood: 200 / 0.5 / WOOD_KG_PER_LOT, "Iron Ingot": 300 / 0.9 / 1000, Charcoal: 1 }] },
  "Spinning Wheel": { recipes: [{ Wood: 7 / 0.5 / WOOD_KG_PER_LOT, "Iron Ingot": 1 / 0.9 / 1000 }] },
  Instruments: {
    recipes: [
      { Wood: 9 / 0.4 / WOOD_KG_PER_LOT, "Copper Ingot": 1 / 0.9 / 1000 },
      { Mahogany: 9 / 0.4 / 7000, "Copper Ingot": 1 / 0.9 / 1000 }
    ]
  },
  "Smoked Cheese": {
    recipes: [{ Cheese: 200 / 0.43 / 0.95 / 1000, Wood: SMOKING_WOOD_PER_LOT }],
    byproducts: [ashFor(SMOKING_WOOD_PER_LOT)]
  },
  Liquor: { recipes: liquorRecipes, byproducts: liquorRecipes.map(() => ashFor(LIQUOR_WOOD_PER_LOT)) },
  Rail: {
    recipes: [{ Steel: 1 / 0.95, "Machine Parts": 0.001, Wood: RAIL_WOOD_PER_LOT }],
    byproducts: [ashFor(RAIL_WOOD_PER_LOT)]
  }
};

/** Legacy recipes recognized for migration; never infer these coefficients from current prices. */
export const LEGACY_WOOD_RECIPES: Readonly<Record<string, NamedRecipe[]>> = {
  Charcoal: [{ Wood: 1.5 }],
  Tar: [{ Wood: 1 }, { Resin: 0.75 }],
  Barrels: [{ Wood: 1 }],
  Ash: [{ Wood: 1 }],
  Timber: [{ Wood: 1.5 }],
  Brick: [{ Clay: 1, Wood: 0.1 }],
  Arrows: [{ Wood: 0.4, "Iron Ingot": 0.1 }],
  Muskets: [{ "Iron Ingot": 1, Charcoal: 1, Wood: 0.5 }],
  "Spinning Wheel": [{ Wood: 1.5, "Iron Ingot": 0.2 }],
  Instruments: [
    { Wood: 1, "Copper Ingot": 0.2 },
    { Mahogany: 1, "Copper Ingot": 0.1 }
  ],
  "Smoked Cheese": [{ Cheese: 1, Wood: 0.5 }],
  Rail: [{ Steel: 1, "Machine Parts": 0.2, Wood: 0.4 }],
  Liquor: ["Barrels", "Ceramics", "Glass"]
    .flatMap(container =>
      grainAndWine
        .slice(0, 4)
        .map(name => ({ [name]: name === "Wine" ? 1 : 2, Wood: 1, [container]: container === "Barrels" ? 0.5 : 0.25 }))
    )
    .concat(
      ["Barrels", "Ceramics", "Glass"].map(container => ({
        Pomace: 1.5,
        Wood: 1,
        [container]: container === "Barrels" ? 0.5 : 0.25
      }))
    ),
  Steamship: [{ Wood: 4, Sails: 1, Ropes: 2, Tar: 1, "Marine Steam Engine": 1 }]
};
export const PRESERVED_FISH_WOOD_RECIPE: NamedRecipe = {
  Fish: 200 / 0.43 / 0.8 / (200 / 0.43),
  Wood: SMOKING_WOOD_PER_LOT
};
export const PRESERVED_FISH_ASH = ashFor(SMOKING_WOOD_PER_LOT);
/** Applies to every alternative of these products, so switching raw materials cannot bypass it. */
export function hasPhysicalWoodRecipe(name: string): boolean {
  return name === "Preserved food" || Object.hasOwn(WOOD_RECIPE_CONTRACTS, name);
}
