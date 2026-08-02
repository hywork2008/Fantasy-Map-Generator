import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../hostTypes";
import { getBurgEconomySummary, getBurgProductPerThousandResidents } from "./burgEconomySummary";
import { clearEconomyContext, initEconomyContext, setBasicEmploymentSummary } from "./economyContext";

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

describe("getBurgEconomySummary employment fields (Phase 5)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, population: 100 }]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("reports basicEmploymentSummary's employment fields when present", () => {
    setBasicEmploymentSummary([{ burgId: 1, basicEmploymentDemand: 12.34, serviceEmploymentDemand: 18.51 }]);

    const summary = getBurgEconomySummary(1);

    expect(summary?.basicEmploymentDemand).toBe("12.3");
    expect(summary?.serviceEmploymentDemand).toBe("18.5");
    expect(summary?.dwellings).toBe("—");
    expect(summary?.housingGap).toBe("—");
    expect(summary?.pregnant).toBe("—");
    expect(summary?.expectedBirths).toBe("—");
    expect(summary?.settlementValue).toBe("—");
  });

  it("falls back to '—' when the burg has no recorded employment demand", () => {
    const summary = getBurgEconomySummary(1);

    expect(summary?.basicEmploymentDemand).toBe("—");
    expect(summary?.serviceEmploymentDemand).toBe("—");
    expect(summary?.dwellings).toBe("—");
    expect(summary?.housingGap).toBe("—");
    expect(summary?.pregnant).toBe("—");
    expect(summary?.expectedBirths).toBe("—");
    expect(summary?.settlementValue).toBe("—");
  });
});
