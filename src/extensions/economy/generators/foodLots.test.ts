import { describe, expect, it } from "vitest";
import {
  GRAPES_LOTS_PER_RAISINS_LOT,
  GRAPES_LOTS_PER_WINE_LOT,
  KILOGRAMS_PER_CHEESE_LOT,
  KILOGRAMS_PER_GRAPES_LOT,
  KILOGRAMS_PER_RAISINS_LOT,
  LITERS_PER_MILK_LOT,
  LITERS_PER_WINE_LOT,
  MILK_LITERS_PER_CHEESE_KILOGRAM,
  MILK_LOTS_PER_CHEESE_LOT
} from "./foodLots";

describe("food market-lot contracts", () => {
  it("mass-balances the Cheese recipe against the dairy conversion", () => {
    expect(MILK_LOTS_PER_CHEESE_LOT * LITERS_PER_MILK_LOT).toBe(
      KILOGRAMS_PER_CHEESE_LOT * MILK_LITERS_PER_CHEESE_KILOGRAM
    );
  });

  it("defines Wine and Raisins from a physical Grape lot", () => {
    expect(GRAPES_LOTS_PER_WINE_LOT * KILOGRAMS_PER_GRAPES_LOT).toBeCloseTo(LITERS_PER_WINE_LOT * 1.3, 8);
    expect(GRAPES_LOTS_PER_RAISINS_LOT * KILOGRAMS_PER_GRAPES_LOT * 0.25).toBe(KILOGRAMS_PER_RAISINS_LOT);
  });
});
