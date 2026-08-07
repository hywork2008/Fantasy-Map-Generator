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

    it("computes required workers from land capacity over the dogless baseline heads-per-herder (2026-08-07 Phase B)", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD] as never);
      // ceiling = 10,000 * terrainShare(0.9) * grassland(0.85) = 7,650 ha; desiredArea =
      // min(7650, 600*HUSBANDRY_LAND_AREA_PER_POPULATION_POINT(1)) = 600 ha; landCapacity = 600*0.5 = 300;
      // requiredWorkers = 300 / 60 (Cattle's dogless baseline) = 5.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo(5, 5);
      expect(demand.value).toBeCloseTo(5, 5);
    });

    it("reduces required workers once Dogs stock provides full team coverage (§10.3 dog multiplier)", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD] as never);
      // landCapacity = 300 (see above); workersNoDogs = 300/60 = 5 -> dogsNeededForFullCoverage =
      // 5 * DOGS_PER_HERDER_FOR_FULL_COVERAGE(3) = 15.
      const table = getOrCreateFaunaStockTable()!;
      table["0:Dogs"] = { young: 0, breeding: 3, old: 0 }; // coverage = 3/15 = 0.2
      // effectiveHeadsPerHerder = 60 * (1 + (dogMultiplier(8)-1)*0.2) = 144 -> requiredWorkers = 300/144.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo(300 / 144, 5);
    });

    it("weights value by each grazed good's share of land capacity", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      // desiredArea = 600 ha for both; landCapacity_Cattle = 600*0.5 = 300, landCapacity_Sheep = 600*3 = 1800
      // (Sheep's stocking density is much higher); weighted value = (300*5 + 1800*1) / 2100 = 11/7.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.value).toBeCloseTo(11 / 7, 5);
    });

    it("is bounded by population, not just land suitability, avoiding the 2026-08-06 'tiny population owns a huge herd' bug", () => {
      // ceiling = 7,650 ha regardless of population; a small population must NOT be able to claim it.
      grasslandCellWorld(50);
      setGoods([CATTLE_GOOD] as never);
      // desiredArea = min(7650, 50*1) = 50 ha -> requiredWorkers = 50*0.5/60, far below what the full
      // 7,650 ha ceiling would imply (7650*0.5/60 = 63.75).
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.requiredWorkers).toBeCloseTo((50 * 0.5) / 60, 5);
      expect(demand.requiredWorkers).toBeLessThan((7650 * 0.5) / 60);
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
      // ceiling = 10,000 * terrainShare(0.9) * PASTURE_DEFAULT_CEILING(0.1) = 900 ha; desiredArea =
      // min(900, population(50)*HUSBANDRY_LAND_AREA_PER_POPULATION_POINT(1)) = 50 ha (2026-08-07
      // Phase B — population-bounded, not the raw land ceiling).
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(50, 1);
    });

    it("is 0 when husbandry has no assigned workers (workerFactor 0)", () => {
      grasslandCellWorld();
      expect(getPastureAreaUsedHectares(0)).toBe(0);
    });

    it("scales the population-bounded desired area by the husbandry worker factor", () => {
      grasslandCellWorld(); // population defaults to 50
      // ceiling = 10,000 * terrainShare(0.9) * grassland-tag ceiling(0.85) = 7,650 ha; desiredArea =
      // min(7650, 50*1) = 50 ha.
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(25, 1);
    });

    it("is bounded well below the land ceiling for a small population even at full staffing", () => {
      grasslandCellWorld(50);
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(50, 1); // not anywhere near the 7,650 ha ceiling
    });
  });

  describe("getGrazedCarryingCapacity", () => {
    it("is 0 when no pasture area is in use", () => {
      grasslandCellWorld();
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBe(0);
    });

    it("multiplies the used (population-bounded, labour-gated) pasture area by the species' stocking density", () => {
      grasslandCellWorld(600);
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage -> pastureAreaUsed = min(7650, 600) = 600 ha
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBeCloseTo(600 * 0.5, 5);
    });

    it("does not let a tiny population claim a land-ceiling-sized herd, even at full staffing (2026-08-06 bug)", () => {
      grasslandCellWorld(50); // far below the 7,650 ha ceiling's population-equivalent
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage
      const capacity = getGrazedCarryingCapacity(0, CATTLE_GOOD as never);
      expect(capacity).toBeCloseTo(50 * 0.5, 5); // population-bounded desiredArea(50) x density(0.5)
      expect(capacity).toBeLessThan(7650 * 0.5); // nowhere near the full ecological ceiling
    });

    it("scales down proportionally when understaffed", () => {
      grasslandCellWorld(600);
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBeCloseTo(600 * 0.5 * 0.5, 5);
    });

    it("is 0 when this species has no biome rate, even if another co-located grazed species keeps pastureAreaUsed positive", () => {
      grasslandCellWorld(600);
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      const desertOnlyCamels = { ...CATTLE_GOOD, name: "Camels", biomeOutputByTag: { desert: 0.05 } }; // no grassland rate
      expect(getGrazedCarryingCapacity(0, desertOnlyCamels as never)).toBe(0);
    });
  });
});
