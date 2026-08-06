import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setCultivatedArea,
  setGoods,
  setViticultureRequiredWorkers,
  setViticultureWorkers
} from "../economyContext";
import {
  calculateViticultureDemand,
  GRAPE_YIELD_PER_HECTARE_PER_MONTH,
  getGrapeHarvestOutput,
  getVineyardAreaUsedHectares,
  getViticultureWorkerFactor
} from "./viticulture";

const GRAPES_GOOD = {
  i: 1,
  name: "Grapes",
  value: 2,
  tags: ["food", "freshFood"],
  unit: "basket",
  icon: "icon",
  color: "#fff",
  chance: 3,
  demandCoverage: {}
};

function biomesData(tagsByCode: Record<number, string[]>) {
  const maxCode = Math.max(...Object.keys(tagsByCode).map(Number));
  const tags: string[][] = [];
  for (let i = 0; i <= maxCode; i++) tags[i] = tagsByCode[i] ?? [];
  return { tags, habitability: tags.map(() => 100) };
}

/** physicalHectares = area(50) * distanceScale(1)^2 * 100 = 5,000 ha. */
function scrubCellWorld(population = 140): void {
  worldContext.pack = {
    cells: {
      i: new Uint16Array([0]),
      h: new Uint8Array([30]),
      biomeCode: new Uint8Array([1]),
      pop: new Float32Array([population]),
      area: new Float32Array([50]),
      burg: new Uint16Array([0]),
      c: [[]]
    },
    burgs: []
  } as unknown as PackedGraph;
  worldContext.distanceScale = 1;
  worldContext.biomesData = biomesData({ 1: ["scrub"] }) as never;
  setCultivatedArea(new Float32Array([0]));
}

describe("viticulture", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("calculateViticultureDemand", () => {
    it("returns zero demand when Grapes isn't present/enabled", () => {
      scrubCellWorld();
      setGoods([] as never);
      expect(calculateViticultureDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
    });

    it("returns zero demand outside a vineyard-suitable biome tag", () => {
      scrubCellWorld();
      worldContext.biomesData = biomesData({ 1: ["forest"] }) as never; // no VINEYARD_BIOME_TAG_CEILING entry
      setGoods([GRAPES_GOOD] as never);
      expect(calculateViticultureDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
    });

    it("computes required workers from the population-bounded desired vineyard area", () => {
      scrubCellWorld(140);
      setGoods([GRAPES_GOOD] as never);
      // ceiling = 5,000 * terrainShare(0.9) * scrub(0.5) = 2,250 ha; desiredArea = min(2250, 140*0.5) = 70 ha;
      // required = 70 * 20 / 140 = 10.
      const demand = calculateViticultureDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo(10, 5);
      expect(demand.value).toBeCloseTo(2, 5);
    });

    it("clamps desired area at the land ceiling for a very large population", () => {
      scrubCellWorld(1_000_000); // population * 0.5 dwarfs the 2,250 ha ceiling
      setGoods([GRAPES_GOOD] as never);
      // desiredArea clamps to the 2,250 ha ceiling; required = 2250 * 20 / 140.
      const demand = calculateViticultureDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo((2250 * 20) / 140, 5);
    });
  });

  describe("getViticultureWorkerFactor", () => {
    it("returns 0 when no viticulture demand is required", () => {
      expect(getViticultureWorkerFactor(0)).toBe(0);
    });

    it("returns assigned/required, capped at 1", () => {
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([6]));
      expect(getViticultureWorkerFactor(0)).toBeCloseTo(0.6, 5);

      setViticultureWorkers(new Float32Array([20]));
      expect(getViticultureWorkerFactor(0)).toBe(1);
    });
  });

  describe("getVineyardAreaUsedHectares", () => {
    it("is 0 when viticulture has no assigned workers (workerFactor 0)", () => {
      scrubCellWorld();
      expect(getVineyardAreaUsedHectares(0)).toBe(0);
    });

    it("scales the desired vineyard area by the viticulture worker factor", () => {
      scrubCellWorld(140);
      // desiredArea = 70 ha (see calculateViticultureDemand test above).
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getVineyardAreaUsedHectares(0)).toBeCloseTo(35, 5);
    });
  });

  describe("getGrapeHarvestOutput", () => {
    it("is 0 when no vineyard area is in use", () => {
      scrubCellWorld();
      expect(getGrapeHarvestOutput(0)).toBe(0);
    });

    it("multiplies the used vineyard area by the grape yield per hectare", () => {
      scrubCellWorld(140);
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([10])); // full coverage -> areaUsed = 70 ha
      expect(getGrapeHarvestOutput(0)).toBeCloseTo(70 * GRAPE_YIELD_PER_HECTARE_PER_MONTH, 5);
    });

    it("applies a river yield bonus when the cell has one", () => {
      scrubCellWorld(140);
      (worldContext.pack.cells as unknown as { r: Uint8Array }).r = new Uint8Array([1]);
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([10]));
      expect(getGrapeHarvestOutput(0)).toBeCloseTo(70 * GRAPE_YIELD_PER_HECTARE_PER_MONTH * 1.1, 5);
    });
  });
});
