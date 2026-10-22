import { describe, expect, it } from "vitest";
import { GOOD_MEASURES, packedMeasure } from "./goodMeasureCatalog";
import { GOODS_DATA } from "./goods-generator";
import {
  CHARCOAL_AIR_DRY_YIELD,
  CHARCOAL_WOOD_PER_LOT,
  WOOD_KG_PER_LOT,
  WOOD_RECIPE_CONTRACTS
} from "./woodRecipeContracts";

describe("physical Wood recipes", () => {
  it("keeps every audited recipe's main product plus recovered co-products within its material input", () => {
    for (const good of GOODS_DATA) {
      if (!WOOD_RECIPE_CONTRACTS[good.name] && good.name !== "Preserved food") continue;
      for (const [index, recipe] of (good.recipes ?? []).entries()) {
        if (good.name === "Preserved food" && !recipe.Wood) continue;
        const input = Object.entries(recipe).reduce((sum, [name, amount]) => sum + GOOD_MEASURES[name].kg * amount, 0);
        const output =
          GOOD_MEASURES[good.name].kg +
          Object.entries(good.byproducts?.[index] ?? {}).reduce(
            (sum, [name, amount]) => sum + GOOD_MEASURES[name].kg * amount,
            0
          );
        expect(output, `${good.name} recipe ${index}`).toBeLessThanOrEqual(input + 1e-9);
      }
    }
  });

  it("uses a whole-kiln charcoal yield within the FAO air-dry 1/6 to 1/4 range without recovered ash", () => {
    const yieldRatio = GOOD_MEASURES.Charcoal.kg / (CHARCOAL_WOOD_PER_LOT * WOOD_KG_PER_LOT);
    expect(yieldRatio).toBeCloseTo(CHARCOAL_AIR_DRY_YIELD, 10);
    expect(yieldRatio).toBeGreaterThanOrEqual(1 / 6);
    expect(yieldRatio).toBeLessThanOrEqual(1 / 4);
    expect(WOOD_RECIPE_CONTRACTS.Charcoal.byproducts).toBeUndefined();
  });

  it("does not put an empty barrel inside another barrel or offer shipbuilding as a Burg recipe", () => {
    expect(packedMeasure(GOOD_MEASURES.Barrels)).toEqual({ kg: 25, liters: 180 });
    expect(GOODS_DATA.find(good => good.name === "Steamship")!.recipes).toBeUndefined();
  });
});
