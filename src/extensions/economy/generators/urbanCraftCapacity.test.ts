import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateUrbanCraftCapacityTable,
  initEconomyContext,
  setGoods
} from "../economyContext";
import { Goods } from "./goods-generator";
import {
  getUrbanCraftCapacityRecords,
  getUrbanTextileHandworkReference,
  recordUrbanCraftCapacity
} from "./urbanCraftCapacity";

describe("observed urban work budgets", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 4;
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 5;
    worldContext.pack = { burgs: [{ i: 0 }, { i: 1, market: 1 }, { i: 2, market: 1 }] } as unknown as PackedGraph;
    setGoods(["Wool", "Wool Cloth", "Wool Garments", "Wool Blankets"].map(name => Goods.getDefaultGood(name)!));
  });
  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("replaces repeated cycle observations and retains overuse rather than hiding it", () => {
    recordUrbanCraftCapacity(1, 1, 3, 1, 0.4, true);
    recordUrbanCraftCapacity(1, 1, 3, 2, 0.5, true);
    expect(getUrbanCraftCapacityRecords()).toHaveLength(1);
    expect(getUrbanCraftCapacityRecords()[0]).toMatchObject({
      workforcePoints: 3,
      chargedPoints: 2,
      unusedPoints: 1,
      textilePoints: 0.5
    });
    recordUrbanCraftCapacity(1, 1, 3, 4, 1, true);
    expect(getUrbanCraftCapacityRecords()[0]).toMatchObject({ unusedPoints: 0, overusedPoints: 1 });
  });

  it("excludes moved, removed, future and stale towns while keeping the previous monthly cycle", () => {
    recordUrbanCraftCapacity(1, 1, 3, 1, 0, true);
    recordUrbanCraftCapacity(2, 1, 3, 1, 0, true);
    worldContext.pack.burgs[2].market = 2;
    expect(getUrbanCraftCapacityRecords()).toHaveLength(1);
    simulationContext.currentMonth = 5;
    expect(getUrbanCraftCapacityRecords()).toHaveLength(1);
    simulationContext.currentMonth = 6;
    expect(getUrbanCraftCapacityRecords()).toHaveLength(0);
    simulationContext.currentMonth = 3;
    expect(getUrbanCraftCapacityRecords()).toHaveLength(0);
    simulationContext.currentMonth = 4;
    worldContext.pack.burgs[1].removed = true;
    expect(getUrbanCraftCapacityRecords()).toHaveLength(0);
  });

  it.each([500, 1000])(
    "converts unused points at rate %s without multiplying urbanization or reusing charged work",
    rate => {
      worldContext.populationRate = rate;
      recordUrbanCraftCapacity(1, 1, 3000 / rate, 2000 / rate, 500 / rate, true);
      const row = getUrbanCraftCapacityRecords()[0];
      const before = structuredClone(getOrCreateUrbanCraftCapacityTable());
      const reference = getUrbanTextileHandworkReference(row)!;
      expect(reference["Wool Garments:tailoring"]).toBeCloseTo(1000 / 972, 10);
      expect(reference["Wool Garments:fullChain"]).toBeLessThan(reference["Wool Garments:tailoring"]);
      expect(reference["Wool Blankets:fullChain"]).toBeLessThan(reference["Wool Blankets:tailoring"]);
      expect(getOrCreateUrbanCraftCapacityTable()).toEqual(before);
    }
  );

  it("does not reinterpret legacy uncalibrated attempts as calibrated textile capacity", () => {
    recordUrbanCraftCapacity(1, 1, 3, 1, 0, false);
    expect(getUrbanTextileHandworkReference(getUrbanCraftCapacityRecords()[0])).toBeNull();
  });
});
