import { WOOD_M3_PER_UNIT } from "../../../generators/forestStock";
import { STAPLE_NEED_KG_PER_PERSON_YEAR } from "../../../generators/settlementClearance";
import { GROSS_FOOD_NEED } from "./foodConstants";
import type { Good } from "./goodsGeneratorTypes";

/**
 * Cargo slots measured from what one market unit weighs and how much room it takes when packed,
 * for the goods whose unit is fixed elsewhere in the model (docs/plan/goods-physical-units.md §5.4,
 * §12). Other goods keep their trade-profile slots until their unit is defined.
 *
 * A slot is 150 kg or 250 L, whichever the cargo fills first: a convoy of twenty carts takes 80
 * slots, some 12 t of grain. Heavy cargo fills it by weight, light cargo by bulk.
 */
export const CARGO_SLOT_KG = 150;
export const CARGO_SLOT_LITERS = 250;

/** One wain of staple crops: the gross food a person needs a year is 0.43 wain, 200 kg. */
export const WAIN_KG = STAPLE_NEED_KG_PER_PERSON_YEAR / GROSS_FOOD_NEED;
/** Sacks round the grain: a filled sack stows about 15% more room than its grain. */
const SACK_STOWAGE = 1.15;
const SACK_TARE_SHARE = 0.01;
/** Stacked wood holds 0.6–0.8 m³ of solid wood in each m³ (a cord about two thirds). */
const STACKED_WOOD_STOWAGE = 1.5;

type CargoMeasure = { unit: string; kg: number; stowedLiters: number };

function sackedWain(bulkKgPerLiter: number): CargoMeasure {
  return {
    unit: "wain",
    kg: WAIN_KG * (1 + SACK_TARE_SHARE),
    stowedLiters: (WAIN_KG / bulkKgPerLiter) * SACK_STOWAGE
  };
}

function stackedWood(kgPerCubicMeter: number): CargoMeasure {
  return {
    unit: "pile",
    kg: WOOD_M3_PER_UNIT * kgPerCubicMeter,
    stowedLiters: WOOD_M3_PER_UNIT * 1000 * STACKED_WOOD_STOWAGE
  };
}

/**
 * Bulk densities of the staple crops (kg/L, FAO and stowage-factor tables: wheat 0.72–0.83, heavy
 * grain 1.30 m³/t). Grain is the wheat-like staple aggregate.
 */
const MEASURED_CARGO: Readonly<Record<string, CargoMeasure>> = {
  Grain: sackedWain(0.77),
  Wheat: sackedWain(0.77),
  Rye: sackedWain(0.72),
  Barley: sackedWain(0.62),
  Oats: sackedWain(0.45),
  Millet: sackedWain(0.7),
  Maize: sackedWain(0.72),
  Rice: sackedWain(0.75),
  Buckwheat: sackedWain(0.6),
  Spelt: sackedWain(0.45),
  Peas: sackedWain(0.78),
  "Broad Beans": sackedWain(0.75),
  Lentils: sackedWain(0.8),
  Chickpeas: sackedWain(0.75),
  Soybeans: sackedWain(0.75),
  Potatoes: sackedWain(0.67),
  Turnips: sackedWain(0.6),
  Wood: stackedWood(650),
  Mahogany: stackedWood(700)
};

/** Slots one unit of a shipped good takes, measured; undefined for goods not measured yet. */
export function measuredCargoSlotsPerUnit(good: Pick<Good, "name" | "unit">): number | undefined {
  const measure = MEASURED_CARGO[good.name];
  if (!measure || measure.unit !== good.unit) return undefined;
  return Math.max(measure.kg / CARGO_SLOT_KG, measure.stowedLiters / CARGO_SLOT_LITERS);
}
