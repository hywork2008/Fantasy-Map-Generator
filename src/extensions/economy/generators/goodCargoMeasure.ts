import { GOOD_MEASURES, packedMeasure } from "./goodMeasureCatalog";
import type { Good } from "./goodsGeneratorTypes";

/**
 * Cargo slots measured from what one market unit weighs and how much room it takes when packed
 * (docs/plan/goods-physical-units.md §5.4, §12). Only the goods whose slots have been switched to
 * the measure use it; the others keep their trade-profile slots until their turn (§13).
 *
 * A slot is 150 kg or 250 L, whichever the cargo fills first: a convoy of twenty carts takes 80
 * slots, some 12 t of grain. Heavy cargo fills it by weight, light cargo by bulk.
 */
export const CARGO_SLOT_KG = 150;
export const CARGO_SLOT_LITERS = 250;

/** Goods whose unit is fixed by another module: the staple crops by the wain, Wood by 10 m³ (§12.6). */
const MEASURED_SLOT_GOODS: ReadonlySet<string> = new Set([
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
  "Mahogany"
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
