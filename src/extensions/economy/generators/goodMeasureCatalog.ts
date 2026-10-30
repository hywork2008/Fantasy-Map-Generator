/**
 * What one market unit of each shipped good physically is, in the units the market counts today
 * (docs/plan/goods-physical-units.md §7 stage 2, §13). Nothing here rescales a good: a Wool unit is
 * still a lot of a thousand fleeces, a Horses unit still twenty-five horses. Each entry says where
 * its quantity comes from, so a later stage can tell a fixed contract from a model figure.
 *
 * - `code`: another module already counts the unit in these terms (food lots, salt bags, mined and
 *   smelted tonnes, Wood's 10 m³, the wain from the grain ration, Harnesses' hundred sets).
 * - `label`: the catalogue unit names its own size ("200 L cask", "1,000 kg grape lot", "kg").
 * - `recipe`: the mass of what the recipe consumes, less what is lost making it.
 * - `model`: a chosen size for a unit nothing else defines (goods-physical-units.md §4.3).
 */

import { WOOD_M3_PER_UNIT } from "../../../generators/forestStock";
import { STAPLE_NEED_KG_PER_PERSON_YEAR } from "../../../generators/settlementClearance";
import { HARNESS_SETS_PER_LOT } from "./craftDemandCalibration";
import { GROSS_FOOD_NEED } from "./foodConstants";
import {
  KILOGRAMS_PER_CHEESE_LOT,
  KILOGRAMS_PER_GRAPES_LOT,
  KILOGRAMS_PER_RAISINS_LOT,
  LITERS_PER_BEER_LOT,
  LITERS_PER_MILK_LOT,
  LITERS_PER_ORCHARD_DRINK_LOT,
  LITERS_PER_WINE_LOT
} from "./foodLots";
import { HORSES_PER_MARKET_HEAD } from "./liveAnimalScale";
import { WOOD_KG_PER_LITER } from "./woodRecipeContracts";
import { FLEECES_PER_WOOL_MARKET_LOT, WOOL_KG_PER_MARKET_LOT } from "./woolProductionPolicy";

export { FLEECES_PER_WOOL_MARKET_LOT } from "./woolProductionPolicy";

/** One wain of staple crops: the gross food a person needs a year is 0.43 wain, 200 kg. */
export const WAIN_KG = STAPLE_NEED_KG_PER_PERSON_YEAR / GROSS_FOOD_NEED;
/** Mines, smelters and quarries count their output in tonnes (goodUnits.ts, quarryOperations.ts). */
const TONNE_KG = 1000;
/** A barrel holds 120 L; a "barrel" of a solid is that much room filled (goods-physical-units.md §4.3). */
const BARREL_LITERS = 120;
const SACK_KG = 50;
const BALE_KG = 200;
const CHEST_KG = 50;
const BUNDLE_KG = 25;
/** saltLogistics.ts `SALT_KILOGRAMS_PER_BAG` (not imported: that module needs the catalogue). */
export const SALT_KILOGRAMS_PER_BAG = 60;

/**
 * How a unit is packed for the road and the hold. Packed room is net room × `stowage`; gross weight
 * is net weight plus the container's tare (goods-physical-units.md §5.2, §5.4).
 */
export type GoodPack =
  | "sack"
  | "bale"
  | "bundle"
  | "barrel"
  | "emptyBarrel"
  | "cask"
  | "crate"
  | "bulk"
  | "stack"
  | "walk"
  | "self"
  | "pipe"
  | "none";

export const PACK_PROFILES: Readonly<
  Record<GoodPack, { stowage: number; tareKgPerKg: number; tareKgPerLiter: number }>
> = {
  // A filled sack stows about 15% more room than its grain; the sack weighs about 1%.
  sack: { stowage: 1.15, tareKgPerKg: 0.01, tareKgPerLiter: 0 },
  bale: { stowage: 1.1, tareKgPerKg: 0.01, tareKgPerLiter: 0 },
  bundle: { stowage: 1.1, tareKgPerKg: 0.01, tareKgPerLiter: 0 },
  // A 120 L barrel stows in some 180 L and weighs about 25 kg; a 200 L cask 300 L and 40 kg.
  emptyBarrel: { stowage: 1.5, tareKgPerKg: 0, tareKgPerLiter: 0 },
  barrel: { stowage: 1.5, tareKgPerKg: 0, tareKgPerLiter: 25 / 120 },
  cask: { stowage: 1.5, tareKgPerKg: 0, tareKgPerLiter: 0.2 },
  crate: { stowage: 1.25, tareKgPerKg: 0.08, tareKgPerLiter: 0 },
  // Trimmed bulk loses little to the corners of the hold or the cart bed.
  bulk: { stowage: 1.05, tareKgPerKg: 0, tareKgPerLiter: 0 },
  // Stacked wood holds 0.6–0.8 m³ of solid wood in each m³ (a cord about two thirds).
  stack: { stowage: 1.5, tareKgPerKg: 0, tareKgPerLiter: 0 },
  // Animals and people walk overland and take deck room afloat; ships and locomotives move
  // themselves; gas goes by pipe; a service is not carried.
  walk: { stowage: 1, tareKgPerKg: 0, tareKgPerLiter: 0 },
  self: { stowage: 1, tareKgPerKg: 0, tareKgPerLiter: 0 },
  pipe: { stowage: 1, tareKgPerKg: 0, tareKgPerLiter: 0 },
  none: { stowage: 1, tareKgPerKg: 0, tareKgPerLiter: 0 }
};

export type GoodMeasureSource = "code" | "label" | "recipe" | "model";

export type GoodMeasure = {
  /** The catalogue unit this entry describes; a renamed unit is not this good any more. */
  unit: string;
  /** What one unit is, in words: "465 kg", "200 L", "25 horses", "100 sets". */
  content: string;
  /** Net mass of one unit. */
  kg: number;
  /** Room one unit's contents fill before packing (bulk density for loose goods, outer size for items). */
  liters: number;
  pack: GoodPack;
  source: GoodMeasureSource;
};

function byMass(
  unit: string,
  content: string,
  kg: number,
  kgPerLiter: number,
  pack: GoodPack,
  source: GoodMeasureSource
): GoodMeasure {
  return { unit, content, kg, liters: kg / kgPerLiter, pack, source };
}

function byVolume(
  unit: string,
  content: string,
  liters: number,
  kgPerLiter: number,
  pack: GoodPack,
  source: GoodMeasureSource
): GoodMeasure {
  return { unit, content, kg: liters * kgPerLiter, liters, pack, source };
}

const wain = (kgPerLiter: number, pack: GoodPack = "sack", source: GoodMeasureSource = "code") =>
  byMass("wain", `${Math.round(WAIN_KG)} kg`, WAIN_KG, kgPerLiter, pack, source);
const tonne = (unit: string, kgPerLiter: number, pack: GoodPack = "bulk") =>
  byMass(unit, "1 t", TONNE_KG, kgPerLiter, pack, "code");
const barrelOf = (kgPerLiter: number, source: GoodMeasureSource = "model") =>
  byVolume("barrel", `${BARREL_LITERS} L`, BARREL_LITERS, kgPerLiter, "barrel", source);
const head = (count: number, kgEach: number, source: GoodMeasureSource = "code") => ({
  unit: "head",
  content: count === 1 ? "1 animal" : `${count} animals`,
  kg: count * kgEach,
  liters: 0,
  pack: "walk" as const,
  source
});

export const GOOD_MEASURES: Readonly<Record<string, GoodMeasure>> = {
  // Staple crops: the wain, sacked; bulk densities from FAO and the stowage-factor tables.
  Grain: wain(0.77),
  Wheat: wain(0.77),
  Rye: wain(0.72),
  Barley: wain(0.62),
  Oats: wain(0.45),
  Millet: wain(0.7),
  Maize: wain(0.72),
  Rice: wain(0.75),
  Buckwheat: wain(0.6),
  Spelt: wain(0.45),
  Peas: wain(0.78),
  "Broad Beans": wain(0.75),
  Lentils: wain(0.8),
  Chickpeas: wain(0.75),
  Soybeans: wain(0.75),
  Potatoes: wain(0.67),
  Turnips: wain(0.6),
  // Other goods counted by the wain take the same weight.
  Fish: wain(0.6, "crate", "model"),
  Game: wain(0.5, "crate", "model"),
  Meat: wain(0.5, "crate", "model"),
  Hemp: wain(0.3, "bale", "model"),
  Clay: wain(1.6, "bulk", "model"),
  Brick: wain(1.6, "bulk", "model"),
  Firebrick: wain(1.8, "bulk", "model"),
  "White sand": wain(1.5, "bulk", "model"),
  Ceramics: wain(0.4, "crate", "model"),
  Glass: wain(0.6, "crate", "model"),
  "Preserved food": wain(0.9, "barrel", "model"),
  "Smoked Cheese": wain(0.6, "crate", "model"),
  Slag: wain(1.5, "bulk", "model"),
  // Mined and smelted goods are counted in tonnes whatever their label says.
  Coal: tonne("wain", 0.8),
  Coke: tonne("wain", 0.45),
  "Phosphate Rock": tonne("wain", 1.5),
  Bauxite: tonne("wain", 1.3),
  Sulfur: tonne("barrel", 1.1),
  Saltpeter: tonne("barrel", 1.2),
  Cinnabar: tonne("sack", 2.5),
  "Crude Oil": tonne("barrel", 0.85),
  "Iron Ore": tonne("wagon", 2.4),
  "Copper Ore": tonne("wagon", 2.0),
  "Tin Ore": tonne("wagon", 2.5),
  "Lead Ore": tonne("wagon", 2.8),
  "Chromium Ore": tonne("wagon", 2.4),
  "Nickel Ore": tonne("wagon", 2.2),
  "Molybdenum Ore": tonne("wagon", 2.0),
  "Silicon Ore": tonne("wagon", 1.5),
  // Bars stack at about seven tenths of the metal's density.
  "Iron Ingot": tonne("wagon", 5.5, "crate"),
  "Copper Ingot": tonne("wagon", 6.2, "crate"),
  "Tin Ingot": tonne("wagon", 5.1, "crate"),
  "Lead Ingot": tonne("wagon", 7.9, "crate"),
  "Chromium Ingot": tonne("wagon", 5.0, "crate"),
  "Nickel Ingot": tonne("wagon", 6.2, "crate"),
  "Molybdenum Ingot": tonne("wagon", 7.1, "crate"),
  "Silicon Ingot": tonne("wagon", 1.6, "crate"),
  Bronze: tonne("wagon", 6.2, "crate"),
  "Silver Ore": byMass("kg", "1 kg", 1, 2.4, "sack", "label"),
  "Gold Ore": byMass("kg", "1 kg", 1, 2.4, "sack", "label"),
  "Silver Ingot": byMass("kg", "1 kg", 1, 7.3, "crate", "label"),
  "Gold Ingot": byMass("kg", "1 kg", 1, 13.5, "crate", "label"),
  // Steel is made one bar from an ingot's tonne; stainless and aluminium the same.
  Steel: byMass("bar", "1 t", TONNE_KG, 5.5, "crate", "recipe"),
  "Stainless Steel": byMass("bar", "1 t", TONNE_KG, 5.5, "crate", "recipe"),
  Aluminum: byMass("bar", "1 t", TONNE_KG, 1.9, "crate", "model"),
  // Quarried stone is counted in tonnes.
  Stone: tonne("pallet", 1.6),
  Marble: tonne("pallet", 2.0),
  "Roman Concrete": byMass("pallet", "1 t", TONNE_KG, 1.4, "sack", "model"),
  Wood: byVolume("pile", `${WOOD_M3_PER_UNIT} m³`, WOOD_M3_PER_UNIT * 1000, WOOD_KG_PER_LITER, "stack", "code"),
  Mahogany: byVolume("pile", `${WOOD_M3_PER_UNIT} m³`, WOOD_M3_PER_UNIT * 1000, 0.7, "stack", "label"),
  // A Timber beam is sawn from 1.5 Wood: half of 15 m³ of roundwood.
  Timber: byVolume("beam", "7.5 m³", 7500, WOOD_KG_PER_LITER, "stack", "recipe"),
  // Food lots and casks.
  Wine: byVolume("200 L cask", `${LITERS_PER_WINE_LOT} L`, LITERS_PER_WINE_LOT, 0.99, "cask", "code"),
  "Pomace Wine": byVolume("200 L cask", "200 L", 200, 1.0, "cask", "label"),
  Beer: byVolume("1,000 L ale tun", `${LITERS_PER_BEER_LOT} L`, LITERS_PER_BEER_LOT, 1.01, "cask", "code"),
  Cider: byVolume(
    "1,000 L cider tun",
    `${LITERS_PER_ORCHARD_DRINK_LOT} L`,
    LITERS_PER_ORCHARD_DRINK_LOT,
    1.01,
    "cask",
    "label"
  ),
  Perry: byVolume(
    "1,000 L perry tun",
    `${LITERS_PER_ORCHARD_DRINK_LOT} L`,
    LITERS_PER_ORCHARD_DRINK_LOT,
    1.01,
    "cask",
    "label"
  ),
  Milk: byVolume("1,000 L dairy lot", `${LITERS_PER_MILK_LOT} L`, LITERS_PER_MILK_LOT, 1.03, "cask", "code"),
  Cheese: byMass(
    "1,000 kg cheese lot",
    `${KILOGRAMS_PER_CHEESE_LOT} kg`,
    KILOGRAMS_PER_CHEESE_LOT,
    0.9,
    "crate",
    "code"
  ),
  Grapes: byMass(
    "1,000 kg grape lot",
    `${KILOGRAMS_PER_GRAPES_LOT} kg`,
    KILOGRAMS_PER_GRAPES_LOT,
    0.45,
    "crate",
    "code"
  ),
  Apples: byMass("1,000 kg apple lot", "1,000 kg", 1000, 0.5, "crate", "label"),
  Pears: byMass("1,000 kg pear lot", "1,000 kg", 1000, 0.5, "crate", "label"),
  Plums: byMass("1,000 kg plum lot", "1,000 kg", 1000, 0.55, "crate", "label"),
  Figs: byMass("1,000 kg fig lot", "1,000 kg", 1000, 0.55, "crate", "label"),
  Lemons: byMass("1,000 kg lemon lot", "1,000 kg", 1000, 0.5, "crate", "label"),
  Chestnuts: byMass("1,000 kg chestnut lot", "1,000 kg", 1000, 0.6, "sack", "label"),
  Pomace: byMass("1,000 kg pomace lot", "1,000 kg", 1000, 0.6, "bulk", "label"),
  Raisins: byMass(
    "250 kg raisins lot",
    `${KILOGRAMS_PER_RAISINS_LOT} kg`,
    KILOGRAMS_PER_RAISINS_LOT,
    0.6,
    "crate",
    "code"
  ),
  "Dried Fruits": byMass("250 kg dried-fruit lot", "250 kg", 250, 0.6, "crate", "label"),
  // Bags are the salt bag's 60 kg.
  Salt: byMass("bag", `${SALT_KILOGRAMS_PER_BAG} kg`, SALT_KILOGRAMS_PER_BAG, 1.2, "sack", "code"),
  Dyes: byMass("bag", "60 kg", SALT_KILOGRAMS_PER_BAG, 0.6, "sack", "model"),
  Cocoa: byMass("bag", "60 kg", SALT_KILOGRAMS_PER_BAG, 0.55, "sack", "model"),
  Coffee: byMass("bag", "60 kg", SALT_KILOGRAMS_PER_BAG, 0.65, "sack", "model"),
  Tea: byMass("bag", "60 kg", SALT_KILOGRAMS_PER_BAG, 0.35, "crate", "model"),
  Tobacco: byMass("bag", "60 kg", SALT_KILOGRAMS_PER_BAG, 0.3, "bale", "model"),
  Sugarcane: byMass("bag", "60 kg", SALT_KILOGRAMS_PER_BAG, 0.3, "bundle", "model"),
  // Sacks hold 50 kg.
  Charcoal: byMass("sack", "50 kg", SACK_KG, 0.25, "sack", "model"),
  "Volcanic Ash": byMass("sack", "50 kg", SACK_KG, 1.0, "sack", "model"),
  Pumice: byMass("sack", "50 kg", SACK_KG, 0.6, "sack", "model"),
  Lime: byMass("sack", "50 kg", SACK_KG, 1.0, "sack", "model"),
  "Slaked Lime": byMass("sack", "50 kg", SACK_KG, 0.5, "sack", "model"),
  Ash: byMass("sack", "50 kg", SACK_KG, 0.6, "sack", "model"),
  Flour: byMass("sack", "50 kg", SACK_KG, 0.61, "sack", "model"),
  Alum: byMass("sack", "50 kg", SACK_KG, 1.0, "sack", "model"),
  Alumina: byMass("sack", "50 kg", SACK_KG, 1.0, "sack", "model"),
  "Phosphate Fertilizer": byMass("sack", "50 kg", SACK_KG, 1.0, "sack", "model"),
  "Nitrogen Fertilizer": byMass("sack", "50 kg", SACK_KG, 0.8, "sack", "model"),
  // Bales hold 200 kg pressed.
  Fodder: byMass("bale", "200 kg", BALE_KG, 0.15, "bale", "model"),
  Rubber: byMass("bale", "200 kg", BALE_KG, 0.9, "bale", "model"),
  Peat: byMass("bale", "200 kg", BALE_KG, 0.35, "bale", "model"),
  Cotton: byMass("bale", "200 kg", BALE_KG, 0.35, "bale", "model"),
  Wool: byMass("fleece", `${FLEECES_PER_WOOL_MARKET_LOT} fleeces`, WOOL_KG_PER_MARKET_LOT, 0.3, "bale", "code"),
  Flax: byMass("bundle", "25 kg", BUNDLE_KG, 0.2, "bundle", "model"),
  Reeds: byMass("bundle", "25 kg", BUNDLE_KG, 0.1, "bundle", "model"),
  "Medicinal herbs": byMass("bundle", "25 kg", BUNDLE_KG, 0.15, "bundle", "model"),
  Stockfish: byMass("bundle", "25 kg", BUNDLE_KG, 0.3, "bundle", "model"),
  // Chests hold 50 kg.
  Dates: byMass("chest", "50 kg", CHEST_KG, 0.7, "crate", "model"),
  Incense: byMass("chest", "50 kg", CHEST_KG, 0.6, "crate", "model"),
  Spices: byMass("chest", "50 kg", CHEST_KG, 0.5, "crate", "model"),
  Medicines: byMass("chest", "50 kg", CHEST_KG, 0.5, "crate", "model"),
  // Barrels of liquids, and of solids filled to the same room.
  Olives: barrelOf(1.0),
  Honey: barrelOf(1.4),
  Tar: barrelOf(1.2),
  Oil: barrelOf(0.92),
  Whales: barrelOf(0.92),
  Vinegar: barrelOf(1.01),
  Gunpowder: barrelOf(0.9),
  Soap: barrelOf(1.0),
  Resin: barrelOf(1.1),
  Tallow: barrelOf(0.9),
  Potash: barrelOf(1.0),
  "Sulfuric Acid": barrelOf(1.84),
  Chlorine: barrelOf(1.47),
  "Bleaching Powder": barrelOf(0.6),
  "Nitric Acid": barrelOf(1.5),
  "Coal Tar": barrelOf(1.2),
  "Soda Ash": barrelOf(1.0),
  "Caustic Soda": barrelOf(1.3),
  Kerosene: barrelOf(0.8),
  "Synthetic Resin": barrelOf(1.1),
  "Synthetic Ammonia": barrelOf(0.68),
  Barrels: { unit: "barrel", content: "1 empty barrel", kg: 25, liters: 120, pack: "emptyBarrel", source: "model" },
  // Flasks: the mercury flask of 76 lb; lubricating oil in the same small iron flask.
  Mercury: byMass("flask", "34.5 kg", 34.5, 13.5, "crate", "model"),
  "Lubricating Oil": byVolume("flask", "20 L", 20, 0.9, "crate", "model"),
  "Synthetic Dye": byMass("vat", "100 kg", 100, 1.0, "barrel", "model"),
  Rennet: barrelOf(1.0),
  Ink: barrelOf(1.1),
  Perfume: byVolume("bottle", "1 L", 1, 0.9, "crate", "model"),
  Liquor: byVolume("vessel", "100 L", 100, 0.95, "cask", "model"),
  Egg: byMass("basket", "30 kg (about 500 eggs)", 30, 0.35, "crate", "model"),
  Shellfish: byMass("basket", "25 kg", 25, 0.6, "crate", "model"),
  // Textiles and leather. Cloth and Garments are lots for a thousand wardrobes, woven from six
  // thousand fleeces (goods-generator.ts); Leather a roll from one hide.
  Leather: byMass("roll", "1 hide, 25 kg", 25, 0.8, "bale", "recipe"),
  Cloth: byMass("wardrobe bolt", "1,000 wardrobes of cloth, 4 t", 4000, 0.4, "bale", "recipe"),
  "Linen Garments": byMass("wardrobe lot", "1,000 lighter linen wardrobes, 2.16 t", 2160, 0.25, "bale", "model"),
  Garments: byMass("wardrobe lot", "1,000 wardrobes, 4 t", 4000, 0.25, "bale", "recipe"),
  "Wool Blankets": byMass("blanket lot", "100 wool blankets, 250 kg", 250, 0.25, "bale", "model"),
  "Wool Cloth": byMass("wardrobe bolt", "4 t ordinary finished wool fabric", 4000, 0.4, "bale", "model"),
  "Wool Garments": byMass("wardrobe lot", "1,000 wool wardrobes, 4 t", 4000, 0.25, "bale", "model"),
  "Fine Wool Cloth": byMass("bale", "200 kg selected finished wool fabric", 200, 0.4, "bale", "model"),
  "Fine Wool Garments": byMass("wardrobe lot", "50 fine wardrobes, 180 kg", 180, 0.25, "bale", "model"),
  Linen: byMass("bale", "200 kg, 10 bolts", 200, 0.4, "bale", "recipe"),
  Silk: byMass("bolt", "10 kg", 10, 0.4, "bale", "model"),
  Sails: byMass("set", "one ship's sails, 1 t", 1000, 0.4, "bale", "recipe"),
  Furs: byMass("pelt", "10 pelts, 15 kg", 15, 0.15, "bale", "model"),
  Paper: byMass("ream", "200 kg", 200, 0.7, "crate", "recipe"),
  Books: byMass("volume", "200 kg", 200, 0.5, "crate", "recipe"),
  // Made goods counted by lots the recipes imply: the metal they consume, less waste.
  Boots: byMass("pair", "20 pairs", 30, 0.35, "crate", "code"),
  Bread: byMass("loaf", "20 loaves", 20, 0.3, "crate", "code"),
  Harnesses: byMass("set", `${HARNESS_SETS_PER_LOT} sets`, HARNESS_SETS_PER_LOT * 10, 0.4, "crate", "code"),
  Tools: byMass("set", "500 kg of tools", 500, 0.6, "crate", "recipe"),
  Arms: byMass("set", "500 kg of arms", 500, 0.5, "crate", "recipe"),
  Arrows: byMass("quiver", "100 kg", 100, 0.3, "crate", "model"),
  Bullets: byMass("pouch", "1 t of shot", TONNE_KG, 6.0, "crate", "recipe"),
  Muskets: byMass("piece", "500 kg (about 100 muskets)", 500, 0.5, "crate", "recipe"),
  // A gun on its carriage is drawn by its own team but loads a cart or hold like any heavy piece.
  Artillery: byMass("cannon", "2 t", 2000, 1.5, "bulk", "recipe"),
  Candles: byMass("block", "100 kg", 100, 0.9, "crate", "recipe"),
  Beeswax: byMass("block", "100 kg", 100, 0.9, "crate", "model"),
  Ropes: byMass("coil", "450 kg", 450, 0.6, "bundle", "recipe"),
  "Copper Wire": byMass("coil", "1 t", TONNE_KG, 4.0, "bundle", "recipe"),
  Rail: byMass("length", "1 t", TONNE_KG, 3.0, "bundle", "recipe"),
  "Machine Parts": byMass("crate", "1 t", TONNE_KG, 3.0, "crate", "recipe"),
  "Light Alloy Parts": byMass("crate", "1 t", TONNE_KG, 1.0, "crate", "recipe"),
  "Lab Glassware": byMass("crate", "465 kg", WAIN_KG, 0.3, "crate", "recipe"),
  "Precision Instruments": byMass("case", "500 kg", 500, 0.5, "crate", "recipe"),
  "Spinning Wheel": byMass("wheel", "1 wheel", 8, 0.1, "crate", "model"),
  Instruments: byMass("set", "10 kg", 10, 0.2, "crate", "model"),
  Jewelry: byMass("piece", "0.2 kg", 0.2, 1.0, "crate", "model"),
  Artworks: byMass("piece", "5 kg", 5, 0.2, "crate", "model"),
  Sculptures: byMass("piece", "200 kg", 200, 1.0, "crate", "recipe"),
  Tapestries: byMass("hanging", "20 kg", 20, 0.3, "bale", "model"),
  Relics: byMass("relic", "2 kg", 2, 0.5, "crate", "model"),
  Pearls: byMass("pearl", "0.1 kg", 0.1, 1.0, "crate", "model"),
  Gemstones: byMass("gem", "0.1 kg", 0.1, 1.5, "crate", "model"),
  Amber: byMass("stone", "1 kg", 1, 0.7, "crate", "model"),
  Obsidian: byMass("shard", "5 kg", 5, 1.5, "crate", "model"),
  Ivory: byMass("tusk", "1 tusk, 20 kg", 20, 0.8, "crate", "recipe"),
  Coral: byMass("branch", "1 kg", 1, 0.5, "crate", "model"),
  // Machines and vessels.
  "Stationary Steam Engine": byMass("engine", "5 t", 5000, 1.0, "crate", "model"),
  "Marine Steam Engine": byMass("engine", "10 t", 10000, 1.0, "crate", "model"),
  Locomotive: byMass("engine", "20 t", 20000, 0.5, "self", "model"),
  Sloop: byMass("ship", "1 ship", 30000, 0.2, "self", "model"),
  Caravel: byMass("ship", "1 ship", 80000, 0.2, "self", "model"),
  Galleon: byMass("ship", "1 ship", 400000, 0.2, "self", "model"),
  Steamship: byMass("ship", "1 ship", 1000000, 0.2, "self", "model"),
  // Gas is counted in mined tonnes and goes by pipe; LNG in tonnes of liquid.
  "Natural Gas": { unit: "therm", content: "1 t", kg: TONNE_KG, liters: 0, pack: "pipe", source: "code" },
  LNG: byMass("therm", "1 t", TONNE_KG, 0.45, "barrel", "model"),
  // Animals: the herds count single animals; a Horses unit is twenty-five (liveAnimalScale.ts).
  Horses: head(HORSES_PER_MARKET_HEAD, 450),
  Cattle: head(1, 450),
  Camels: head(1, 500),
  Elephants: head(1, 4000),
  Sheep: head(1, 45),
  Goats: head(1, 40),
  Pig: head(1, 100),
  Chicken: head(1, 2),
  Cats: head(1, 4),
  Dogs: head(1, 25),
  Slaves: { unit: "slave", content: "1 person", kg: 60, liters: 0, pack: "walk", source: "label" },
  Coins: { unit: "service", content: "a minting service", kg: 0, liters: 0, pack: "none", source: "code" }
};

/** Gross weight and packed room of one unit; undefined for goods that walk, sail themselves or are not carried. */
export function packedMeasure(measure: GoodMeasure): { kg: number; liters: number } | undefined {
  if (measure.pack === "walk" || measure.pack === "self" || measure.pack === "pipe" || measure.pack === "none")
    return undefined;
  const pack = PACK_PROFILES[measure.pack];
  return {
    kg: measure.kg * (1 + pack.tareKgPerKg) + measure.liters * pack.tareKgPerLiter,
    liters: measure.liters * pack.stowage
  };
}
