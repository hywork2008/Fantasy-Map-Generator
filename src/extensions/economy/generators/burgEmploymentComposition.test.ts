import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setBasicEmploymentSummary,
  setConstructionOperations
} from "../economyContext";
import { formatEmploymentCompositionSummary, getBurgEmploymentComposition } from "./burgEmploymentComposition";
import type { ConstructionOperation } from "./constructionEmploymentTypes";

describe("getBurgEmploymentComposition", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.pack = {
      burgs: [
        { i: 0, removed: 1 },
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          removed: 0,
          population: 5,
          group: "town",
          demographics: {
            capacity: 1000,
            effectiveCapacity: 1000,
            children: 20,
            maleAdults: 40,
            femaleAdults: 40,
            elders: 10
          }
        }
      ]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("returns null for missing burgs", () => {
    expect(getBurgEmploymentComposition(99)).toBeNull();
  });

  it("counts household care so not all adults are market labor", () => {
    const composition = getBurgEmploymentComposition(1);
    expect(composition).not.toBeNull();
    expect(composition!.adults).toBe(80);
    expect(composition!.householdCare).toBeGreaterThan(0);
    expect(composition!.marketLaborForce).toBeLessThan(composition!.adults);
    expect(composition!.marketLaborForce).toBeCloseTo(composition!.adults - composition!.householdCare, 2);
  });

  it("assigns construction workers and reduces residual", () => {
    setConstructionOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        masonWorkers: 5,
        carpenterWorkers: 5,
        buildingStock: 0.2,
        dwellingStock: 200,
        hasQuarryAccess: true,
        active: true
      } as ConstructionOperation
    ]);
    setBasicEmploymentSummary([{ burgId: 1, basicEmploymentDemand: 20, serviceEmploymentDemand: 30 }]);

    const composition = getBurgEmploymentComposition(1);
    expect(composition!.construction).toBe(10);
    expect(composition!.assignedMarket).toBeGreaterThanOrEqual(10);
    expect(composition!.recommendedFocus.length).toBeGreaterThan(0);
  });

  it("recommends construction when housing gap is large and residual remains", () => {
    setConstructionOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        masonWorkers: 0,
        carpenterWorkers: 0,
        buildingStock: 0,
        dwellingStock: 0,
        hasQuarryAccess: false,
        active: true
      } as ConstructionOperation
    ]);
    // large required dwellings from population 5 * 1000 / 4.5, stock 0 → gap 1
    const composition = getBurgEmploymentComposition(1);
    expect(composition!.housingGap).toBeGreaterThan(0.5);
    expect(composition!.residual).toBeGreaterThan(0);
    expect(composition!.recommendedFocus).toMatch(/Construction/i);
  });

  it("formats a short summary for the editor", () => {
    const composition = getBurgEmploymentComposition(1)!;
    const text = formatEmploymentCompositionSummary(composition);
    expect(text).toContain("Adults");
    expect(text).toContain("Focus:");
  });
});
