import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../hostCore";
import type { Burg, ExtensionAPI } from "../hostTypes";
import { getBurgProductPerThousandResidents } from "./burgEconomySummary";
import { clearEconomyContext, initEconomyContext } from "./economyContext";

describe("burg product per thousand residents", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 2;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("uses actual urban inhabitants instead of raw population points", () => {
    const burg = { population: 3, product: 120 } as Burg;

    // 3 points × 1,000 × 2 = 6,000 residents; 120 product / 6,000 × 1,000 = 20.
    expect(getBurgProductPerThousandResidents(burg)).toBeCloseTo(20);
  });
});
