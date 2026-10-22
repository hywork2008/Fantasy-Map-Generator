import { CARGO_SLOT_KG, CARGO_SLOT_LITERS } from "../../../types/cargoSlot";
import { GOOD_MEASURES, packedMeasure } from "./goodMeasureCatalog";
import type { Good } from "./goodsGeneratorTypes";

/**
 * Cargo slots measured from what one market unit weighs and how much room it takes when packed
 * (docs/plan/goods-physical-units.md §5.4, §12). Only the goods whose slots have been switched to
 * the measure use it; the others keep their trade-profile slots until their turn (§13).
 */
export { CARGO_SLOT_KG, CARGO_SLOT_LITERS };

/**
 * Goods switched to measured slots, group by group (goods-physical-units.md §13.5): first the staple
 * crops by the wain and Wood by 10 m³ (§12.6), then everything mined, smelted or quarried, which
 * the mines and smelters already count in tonnes (precious metals in kg) (§14), then the food lots
 * whose size foodLots.ts or the unit name fixes (§18), then the light dear goods (§19) and the
 * art, craft and other light goods (§20), then the textiles, flour and bread repriced by weight (§21).
 */
const MEASURED_SLOT_GOODS: ReadonlySet<string> = new Set([
  // Staple crops and wood (§12.6).
  "Grain",
  "Wheat",
  "Rye",
  "Barley",
  "Oats",
  "Millet",
  "Maize",
  "Rice",
  "Buckwheat",
  "Spelt",
  "Peas",
  "Broad Beans",
  "Lentils",
  "Chickpeas",
  "Soybeans",
  "Potatoes",
  "Turnips",
  "Wood",
  "Mahogany",
  // Mined fuels and minerals, ores, metals and quarried stone (§14).
  "Coal",
  "Coke",
  "Phosphate Rock",
  "Bauxite",
  "Sulfur",
  "Saltpeter",
  "Cinnabar",
  "Crude Oil",
  "Iron Ore",
  "Copper Ore",
  "Tin Ore",
  "Lead Ore",
  "Chromium Ore",
  "Nickel Ore",
  "Molybdenum Ore",
  "Silicon Ore",
  "Silver Ore",
  "Gold Ore",
  "Iron Ingot",
  "Copper Ingot",
  "Tin Ingot",
  "Lead Ingot",
  "Chromium Ingot",
  "Nickel Ingot",
  "Molybdenum Ingot",
  "Silicon Ingot",
  "Silver Ingot",
  "Gold Ingot",
  "Bronze",
  "Steel",
  "Stainless Steel",
  "Aluminum",
  "Stone",
  "Marble",
  // Food lots (§18). The casks of wine, ale, cider and perry wait for their prices: a kilogram of
  // ale is worth nine of grain here, where the sources put it at about one.
  "Milk",
  "Cheese",
  "Grapes",
  "Apples",
  "Pears",
  "Plums",
  "Figs",
  "Lemons",
  "Chestnuts",
  "Pomace",
  "Raisins",
  "Dried Fruits",
  // Light dear goods: jewels, spices and colonial crops, drugs, incense, silk, dyes and furs (§19).
  "Pearls",
  "Gemstones",
  "Jewelry",
  "Amber",
  "Coral",
  "Ivory",
  "Spices",
  "Coffee",
  "Cocoa",
  "Tea",
  "Medicines",
  "Medicinal herbs",
  "Incense",
  "Perfume",
  "Silk",
  "Dyes",
  "Furs",
  // Art, craft and other light goods whose price per kilogram agrees with the sources (§20).
  "Artworks",
  "Relics",
  "Instruments",
  "Tapestries",
  "Sculptures",
  "Obsidian",
  "Tobacco",
  "Liquor",
  "Soap",
  "Candles",
  // Textiles, flour and bread, priced by weight with the slot switch (§21).
  "Wool",
  "Cloth",
  "Wool Blankets",
  "Wool Cloth",
  "Wool Garments",
  "Fine Wool Cloth",
  "Fine Wool Garments",
  "Garments",
  "Linen Garments",
  "Flour",
  "Bread",
  // Salt, priced by weight with the slot switch (§22).
  "Salt",
  // Linen, in the 200 kg bale that keeps a lot's value (§24).
  "Linen",
  // Ink, in the 120 L barrel that keeps a lot's value (§25).
  "Ink",
  // Beeswax and candles, priced by weight (§26).
  "Beeswax",
  // Rennet, in the 120 L barrel (§27).
  "Rennet",
  // Leather, a 25 kg hide priced by weight (§28).
  "Leather"
]);

/** Slots one packed unit of `good` fills, from its measure; undefined for goods that walk or move themselves. */
export function packedCargoSlotsPerUnit(good: Pick<Good, "name" | "unit">): number | undefined {
  const measure = GOOD_MEASURES[good.name];
  if (!measure || measure.unit !== good.unit) return undefined;
  const packed = packedMeasure(measure);
  if (!packed) return undefined;
  return Math.max(packed.kg / CARGO_SLOT_KG, packed.liters / CARGO_SLOT_LITERS);
}

/** Slots one unit of a shipped good takes, measured; undefined for goods not switched to the measure yet. */
export function measuredCargoSlotsPerUnit(good: Pick<Good, "name" | "unit">): number | undefined {
  return MEASURED_SLOT_GOODS.has(good.name) ? packedCargoSlotsPerUnit(good) : undefined;
}

/** Slots a wain of grain fills: the yardstick freight is set by (tradeOpportunityEstimator.ts). */
export const WAIN_FREIGHT_SLOTS = packedCargoSlotsPerUnit({ name: "Grain", unit: "wain" }) ?? 4;
