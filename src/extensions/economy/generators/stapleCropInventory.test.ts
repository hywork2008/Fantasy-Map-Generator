import { describe, expect, it } from "vitest";
import { emptyFoodLedger } from "./foodProduction";
import { drawStapleCropFood, getStapleCropInventory } from "./stapleCropInventory";

describe("drawStapleCropFood", () => {
  it("eats each age tier across its crops in proportion to their stock, oldest first", () => {
    const ledger = emptyFoodLedger();
    const wheat = getStapleCropInventory(ledger, 25);
    const oats = getStapleCropInventory(ledger, 28);
    wheat.age1 = 30;
    oats.age1 = 90;
    wheat.age2 = 10;

    // The older wheat goes first; the next 40 come 1:3 from the age1 wheat and oats.
    expect(drawStapleCropFood(ledger, 50)).toBe(50);
    expect(wheat.age2).toBe(0);
    expect(wheat.age1).toBeCloseTo(20, 2);
    expect(oats.age1).toBeCloseTo(60, 2);
  });

  it("never draws more than requested or held", () => {
    const ledger = emptyFoodLedger();
    for (const goodId of [25, 26, 27]) getStapleCropInventory(ledger, goodId).age0 = 3.33;

    expect(drawStapleCropFood(ledger, 1)).toBe(1);
    const left = Object.values(ledger.stapleCropInventories!).reduce((sum, inventory) => sum + inventory.age0, 0);
    expect(left).toBeCloseTo(8.99, 2);
    expect(drawStapleCropFood(ledger, 100)).toBeCloseTo(8.99, 2);
  });
});
