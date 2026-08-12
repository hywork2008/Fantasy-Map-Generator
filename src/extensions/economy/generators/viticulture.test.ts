import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PERENNIAL_CROP_PROFILES } from "../../../data/perennialCrops";
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
  getPerennialCropMix,
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

const OLIVES_GOOD = {
  i: 2,
  name: "Olives",
  value: 3,
  tags: ["food", "perennialCrop"],
  unit: "barrel",
  icon: "good-olives",
  color: "#BDBD7D",
  perennialCrop: {
    kind: "orchard" as const,
    temperature: { min: 5, idealMin: 20, idealMax: 34, max: 40 },
    precipitation: { min: 2, idealMin: 4, idealMax: 7, max: 12 },
    soils: ["loam", "sandy", "thin", "alluvial"],
    maximumLandShare: 0.35,
    areaHectaresPerPerson: 0.018,
    laborDaysPerHectare: 16,
    yieldLotsPerHectarePerMonth: 0.018
  }
};

const HIGH_VALUE_FIGS_GOOD = {
  i: 3,
  name: "Figs",
  value: 100,
  tags: ["food", "perennialCrop"],
  unit: "basket",
  icon: "good-figs",
  color: "#8E5B44",
  perennialCrop: PERENNIAL_CROP_PROFILES.Figs
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
  worldContext.grid = { cells: { temp: new Int8Array([12]), prec: new Uint8Array([8]) } } as never;
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

    it("places olives by warm, dry climate even in a non-scrub biome", () => {
      scrubCellWorld();
      worldContext.biomesData = biomesData({ 1: ["forest"] }) as never;
      worldContext.grid = { cells: { temp: new Int8Array([25]), prec: new Uint8Array([5]) } } as never;
      setGoods([OLIVES_GOOD] as never);

      expect(getPerennialCropMix(worldContext, 0)[0]?.good.name).toBe("Olives");
    });

    it("selects the crop with stronger cold and drought reserves, not the higher-value good", () => {
      scrubCellWorld();
      // Both crops are in their optimum bands. Olives retain a much larger
      // lower-rainfall reserve than figs at this climate point.
      worldContext.grid = { cells: { temp: new Int8Array([20]), prec: new Uint8Array([7]) } } as never;
      setGoods([OLIVES_GOOD, HIGH_VALUE_FIGS_GOOD] as never);

      expect(getPerennialCropMix(worldContext, 0)[0]?.good.name).toBe("Olives");
    });

    it("uses climate rather than the legacy vineyard biome tag", () => {
      scrubCellWorld();
      worldContext.biomesData = biomesData({ 1: ["forest"] }) as never;
      worldContext.grid = { cells: { temp: new Int8Array([0]), prec: new Uint8Array([45]) } } as never;
      setGoods([GRAPES_GOOD] as never);
      expect(calculateViticultureDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
    });

    it("computes required workers from the population-bounded desired vineyard area", () => {
      scrubCellWorld(140);
      setGoods([GRAPES_GOOD] as never);
      // desiredArea = min(2250, 140*0.04) = 5.6 ha; required = 5.6 * 20 / 140 = 0.8.
      const demand = calculateViticultureDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo(0.8, 5);
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
      setGoods([GRAPES_GOOD] as never);
      // desiredArea = 5.6 ha (see calculateViticultureDemand test above).
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getVineyardAreaUsedHectares(0)).toBeCloseTo(2.8, 5);
    });
  });

  describe("getGrapeHarvestOutput", () => {
    it("is 0 when no vineyard area is in use", () => {
      scrubCellWorld();
      expect(getGrapeHarvestOutput(0)).toBe(0);
    });

    it("multiplies the used vineyard area by the grape yield per hectare", () => {
      scrubCellWorld(140);
      setGoods([GRAPES_GOOD] as never);
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([10])); // full coverage -> areaUsed = 5.6 ha
      expect(getGrapeHarvestOutput(0)).toBeCloseTo(5.6 * GRAPE_YIELD_PER_HECTARE_PER_MONTH, 5);
    });

    it("applies a river yield bonus when the cell has one", () => {
      scrubCellWorld(140);
      setGoods([GRAPES_GOOD] as never);
      (worldContext.pack.cells as unknown as { r: Uint8Array }).r = new Uint8Array([1]);
      setViticultureRequiredWorkers(new Float32Array([10]));
      setViticultureWorkers(new Float32Array([10]));
      expect(getGrapeHarvestOutput(0)).toBeCloseTo(5.6 * GRAPE_YIELD_PER_HECTARE_PER_MONTH * 1.1, 5);
    });
  });
});
