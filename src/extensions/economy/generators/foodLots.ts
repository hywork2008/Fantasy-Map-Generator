/**
 * Physical contracts for the food-processing goods that are represented as market lots.
 *
 * A market unit is deliberately not a household purchase. Keeping these conversions in one
 * module prevents a recipe, a rural yield, and a household ledger from silently using three
 * incompatible meanings for the same number.
 */

export const LITERS_PER_MILK_LOT = 1_000;
export const KILOGRAMS_PER_CHEESE_LOT = 1_000;
export const KILOGRAMS_PER_GRAPES_LOT = 1_000;
export const LITERS_PER_WINE_LOT = 200;
export const KILOGRAMS_PER_RAISINS_LOT = 250;

/** Ten litres of whole milk make approximately one kilogram of hard cheese. */
export const MILK_LITERS_PER_CHEESE_KILOGRAM = 10;
export const MILK_LOTS_PER_CHEESE_LOT =
  (KILOGRAMS_PER_CHEESE_LOT * MILK_LITERS_PER_CHEESE_KILOGRAM) / LITERS_PER_MILK_LOT;

/** Approximate pressed-grape input for one 200 L cask of wine. */
export const GRAPES_LOTS_PER_WINE_LOT = (LITERS_PER_WINE_LOT * 1.3) / KILOGRAMS_PER_GRAPES_LOT;
/** Drying removes roughly three quarters of grape mass. */
export const GRAPES_LOTS_PER_RAISINS_LOT = KILOGRAMS_PER_RAISINS_LOT / (KILOGRAMS_PER_GRAPES_LOT * 0.25);

export const DAIRY_TARGETS = {
  /**
   * Cheese is the affordable, durable animal-protein complement to grain: a substantial dietary
   * staple rather than the former luxury-sized 5 kg annual ration.
   */
  cheeseKilogramsPerPersonYear: 25,
  freshMilkLitersPerPersonYear: 20
} as const;

export const WINE_TARGETS = {
  /** Wine-country residents; this is not a claim that all medieval Germans drank this amount. */
  regionalLitersPerAdultYear: 8,
  importedLitersPerAdultYear: 1,
  adultShare: 0.65
} as const;

export const GRAPE_TARGETS = {
  freshKilogramsPerPersonYear: 2,
  raisinsKilogramsPerPersonYear: 0.5
} as const;
