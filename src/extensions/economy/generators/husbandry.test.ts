import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateFaunaStockTable,
  initEconomyContext,
  setCultivatedArea,
  setGoods,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers
} from "../economyContext";
import {
  calculateHusbandryDemand,
  getGrazedCarryingCapacity,
  getHusbandryWorkerFactor,
  getPastureAreaUsedHectares,
  isGrazedLivestockGood
} from "./husbandry";

const CATTLE_GOOD = {
  i: 1,
  name: "Cattle",
  value: 5,
  tags: ["food", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 4,
  biomeOutputByTag: { grassland: 0.1 },
  demandCoverage: {}
};

const SHEEP_GOOD = {
  i: 2,
  name: "Sheep",
  value: 1,
  tags: ["clothing", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 3,
  biomeOutputByTag: { grassland: 0.1 },
  demandCoverage: {}
};

const PIG_GOOD = {
  i: 3,
  name: "Pig",
  value: 2,
  tags: ["food", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 3,
  biomeOutputByTag: { forest: 0.08 },
  demandCoverage: {}
};

function biomesData(tagsByCode: Record<number, string[]>) {
  const maxCode = Math.max(...Object.keys(tagsByCode).map(Number));
  const tags: string[][] = [];
  for (let i = 0; i <= maxCode; i++) tags[i] = tagsByCode[i] ?? [];
  return { tags, habitability: tags.map(() => 100) };
}

/** physicalHectares = area(100) * distanceScale(1)^2 * 100 = 10,000 ha. */
function grasslandCellWorld(population = 50): void {
  worldContext.pack = {
    cells: {
      i: new Uint16Array([0]),
      h: new Uint8Array([30]),
      biomeCode: new Uint8Array([1]),
      pop: new Float32Array([population]),
      area: new Float32Array([100]),
      burg: new Uint16Array([0]),
      c: [[]]
    },
    burgs: []
  } as unknown as PackedGraph;
  worldContext.distanceScale = 1;
  worldContext.biomesData = biomesData({ 1: ["grassland"] }) as never;
  setCultivatedArea(new Float32Array([0]));
}

describe("husbandry", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("isGrazedLivestockGood", () => {
    it("is true for open-pasture herded species", () => {
      for (const name of ["Cattle", "Sheep", "Goats", "Horses", "Camels"])
        expect(isGrazedLivestockGood(name)).toBe(true);
    });

    it("is false for yard/woodland species that don't compete for dedicated pasture", () => {
      for (const name of ["Pig", "Chicken", "Cats", "Dogs"]) expect(isGrazedLivestockGood(name)).toBe(false);
    });
  });

  describe("calculateHusbandryDemand", () => {
    it("returns zero demand when the cell has no population", () => {
      grasslandCellWorld(0);
      setGoods([CATTLE_GOOD] as never);
      expect(calculateHusbandryDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
    });

    it("returns zero demand when no grazed good is enabled/present", () => {
      grasslandCellWorld(600);
      setGoods([PIG_GOOD] as never); // yard species, not in HUSBANDRY_SPECIES_PROFILES
      expect(calculateHusbandryDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
    });

    it("computes required workers from raw demand over the dogless baseline heads-per-herder", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD] as never);
      // rawDemand = 600 * 0.1 = 60; Cattle's baseline is 60 heads/herder -> exactly 1 worker needed.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo(1, 5);
      expect(demand.value).toBeCloseTo(5, 5);
    });

    it("reduces required workers once Dogs stock provides full team coverage (§10.3 dog multiplier)", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD] as never);
      // workersNoDogs = 1 -> dogsNeededForFullCoverage = 1 * DOGS_PER_HERDER_FOR_FULL_COVERAGE(3) = 3.
      const table = getOrCreateFaunaStockTable()!;
      table["0:Dogs"] = { young: 0, breeding: 3, old: 0 };
      // effectiveHeadsPerHerder = 60 * (1 + (dogMultiplier(8)-1)*1) = 480 -> requiredWorkers = 60/480.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo(0.125, 5);
    });

    it("weights value by each grazed good's share of raw demand", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      // Both produce rawDemand 60 (600 * 0.1); weighted value = (60*5 + 60*1) / 120 = 3.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.value).toBeCloseTo(3, 5);
    });
  });

  describe("getHusbandryWorkerFactor", () => {
    it("returns 0 when no husbandry demand is required", () => {
      expect(getHusbandryWorkerFactor(0)).toBe(0);
    });

    it("returns assigned/required, capped at 1", () => {
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5]));
      expect(getHusbandryWorkerFactor(0)).toBeCloseTo(0.5, 5);

      setHusbandryWorkers(new Float32Array([20]));
      expect(getHusbandryWorkerFactor(0)).toBe(1);
    });
  });

  describe("getPastureAreaUsedHectares", () => {
    it("falls back to the marginal default ceiling outside a pasture-tagged biome", () => {
      worldContext.pack = {
        cells: {
          i: new Uint16Array([0]),
          h: new Uint8Array([30]),
          biomeCode: new Uint8Array([1]),
          pop: new Float32Array([50]),
          area: new Float32Array([100]),
          burg: new Uint16Array([0]),
          c: [[]]
        },
        burgs: []
      } as unknown as PackedGraph;
      worldContext.distanceScale = 1;
      worldContext.biomesData = biomesData({ 1: ["forest"] }) as never; // no PASTURE_BIOME_TAG_CEILING entry
      setCultivatedArea(new Float32Array([0]));
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage
      // ceiling = 10,000 * terrainShare(0.9) * PASTURE_DEFAULT_CEILING(0.1) = 900 ha.
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(900, 1);
    });

    it("is 0 when husbandry has no assigned workers (workerFactor 0)", () => {
      grasslandCellWorld();
      expect(getPastureAreaUsedHectares(0)).toBe(0);
    });

    it("scales the land-suitability ceiling by the husbandry worker factor", () => {
      grasslandCellWorld();
      // ceiling = 10,000 * terrainShare(0.9) * grassland-tag ceiling(0.85) = 7,650 ha.
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(3825, 1);
    });
  });

  describe("getGrazedCarryingCapacity", () => {
    it("is 0 when no pasture area is in use", () => {
      grasslandCellWorld();
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBe(0);
    });

    it("multiplies the used pasture area by the species' stocking density", () => {
      grasslandCellWorld();
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage -> pastureAreaUsed = 7,650 ha
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBeCloseTo(7650 * 0.5, 1);
    });
  });
});
