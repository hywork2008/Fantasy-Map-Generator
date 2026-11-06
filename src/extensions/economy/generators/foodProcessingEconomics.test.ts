import { describe, expect, it } from "vitest";
import { getRecipeCostBasis, hasViableFoodProcessingMargin } from "./foodProcessingEconomics";

describe("food-processing economics", () => {
  it("rejects a Cheese or Wine recipe that cannot pay tax and a minimum craft margin", () => {
    expect(hasViableFoodProcessingMargin("Cheese", 14, 13, 0.1)).toBe(false);
    expect(hasViableFoodProcessingMargin("Wine", 8, 7.3, 0)).toBe(false);
  });

  it("accepts viable recipes and leaves non-food recipes on their existing rule", () => {
    expect(hasViableFoodProcessingMargin("Cheese", 14, 10.75, 0.05)).toBe(true);
    expect(hasViableFoodProcessingMargin("Barrels", 2, 1.99, 0.5)).toBe(true);
  });

  it("prices ale from the cheapest grain the market holds, and other goods from the mean of their recipes", () => {
    // Barley 1, Wheat 2, Oats 3, Barrels 4; one recipe per grain, each with 0.4 Barrels.
    const price = [0, 0.72, 0.96, 0.68, 0.03];
    const recipes = [1, 2, 3].map(grain => [
      { goodId: grain, amount: 1 },
      { goodId: 4, amount: 0.4 }
    ]);
    const mean = (0.72 + 0.96 + 0.68) / 3 + 0.012;
    const beforeHarvest = [0, 0, 500, 0, 100];

    expect(
      getRecipeCostBasis(
        "Beer",
        recipes,
        id => price[id],
        id => beforeHarvest[id]
      )
    ).toBeCloseTo(0.972, 6);
    expect(
      getRecipeCostBasis(
        "Beer",
        recipes,
        id => price[id],
        () => 100
      )
    ).toBeCloseTo(0.692, 6);
    expect(
      getRecipeCostBasis(
        "Beer",
        recipes,
        id => price[id],
        () => 0
      )
    ).toBeCloseTo(mean, 6);
    expect(
      getRecipeCostBasis(
        "Liquor",
        recipes,
        id => price[id],
        id => beforeHarvest[id]
      )
    ).toBeCloseTo(mean, 6);
  });
});
