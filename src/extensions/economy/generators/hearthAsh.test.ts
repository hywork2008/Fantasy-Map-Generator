import { describe, expect, it } from "vitest";
import { getHearthAshPurchase, HEARTH_ASH_MIN_STOCK_SACKS, HEARTH_ASH_RESERVE_MONTHS } from "./hearthAsh";
import { ASH_LOTS_PER_WOOD_LOT } from "./woodRecipeContracts";

describe("town hearth ash", () => {
  it("buys the hearths' ash only up to the market's reserve of its own use", () => {
    // Plenty of ash: the market fills its reserve and no more.
    expect(getHearthAshPurchase(1_000, 10, 20)).toBeCloseTo(HEARTH_ASH_RESERVE_MONTHS * 20 - 10);
    // Little Wood burned: all the ash it left.
    expect(getHearthAshPurchase(2, 0, 20)).toBeCloseTo(2 * ASH_LOTS_PER_WOOD_LOT);
    // Already stocked: nothing.
    expect(getHearthAshPurchase(1_000, 100, 20)).toBe(0);
  });

  it("keeps a barrel of potash's ash before any use, so the first boiling can start", () => {
    expect(getHearthAshPurchase(1_000, 0, 0)).toBeCloseTo(HEARTH_ASH_MIN_STOCK_SACKS);
  });
});
