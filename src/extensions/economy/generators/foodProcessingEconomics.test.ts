import { describe, expect, it } from "vitest";
import { hasViableFoodProcessingMargin } from "./foodProcessingEconomics";

describe("food-processing economics", () => {
  it("rejects a Cheese or Wine recipe that cannot pay tax and a minimum craft margin", () => {
    expect(hasViableFoodProcessingMargin("Cheese", 14, 13, 0.1)).toBe(false);
    expect(hasViableFoodProcessingMargin("Wine", 8, 7.3, 0)).toBe(false);
  });

  it("accepts viable recipes and leaves non-food recipes on their existing rule", () => {
    expect(hasViableFoodProcessingMargin("Cheese", 14, 10.75, 0.05)).toBe(true);
    expect(hasViableFoodProcessingMargin("Barrels", 2, 1.99, 0.5)).toBe(true);
  });
});
