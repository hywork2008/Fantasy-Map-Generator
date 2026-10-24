import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateFaunaStockTable,
  initEconomyContext,
  setCultivatedArea,
  setGoods,
  setHusbandryMonthlyWorkDays,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers
} from "../economyContext";
import {
  calculateDesiredPastureAreaHectares,
  calculateGrazingLandAllocation,
  calculateHusbandryDemand,
  getForageAreaHectares,
  getGrazedCarryingCapacity,
  getGrazedFallowPastureEquivalentHectares,
  getHusbandryCareFactor,
  getHusbandryWorkerFactor,
  getLivestockHerdTargets,
  getPastureAreaUsedHectares,
  isGrazedLivestockGood
} from "./husbandry";
import { withLivestockFeedPeriod } from "./livestockFeedState";

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

/** 10,000 physical hectares with an explicit legacy pasture footprint for capacity tests. */
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
    burgs: [],
    landUse: { cells: [{ allocatedAreaHa: 0, diagnostics: [], patches: [{ kind: "pasture", areaHa: population }] }] }
  } as unknown as PackedGraph;
  worldContext.distanceScale = 1;
  worldContext.populationRate = 1;
  worldContext.biomesData = biomesData({ 1: ["grassland"] }) as never;
  setCultivatedArea(new Float32Array([0]));
}

// The minimal fixture grows 1,500 kg DM/ha; at 80% utilization one head needs need/1,200 ha.
const CATTLE_HA = 3000 / 1200;
const SHEEP_HA = 500 / 1200;

describe("husbandry", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    setGoods([CATTLE_GOOD] as never);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("annual pasture planning", () => {
    it("sizes pasture for the demand-based herd, not the recorded herd, without seeding herds", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      // Pastoral grassland: 0.5 cattle and 1 + 2 sheep per person.
      expect(getLivestockHerdTargets(worldContext, 0)).toEqual({ Cattle: 300, Sheep: 1800 });
      const planned = 300 * CATTLE_HA + 1800 * SHEEP_HA;
      expect(calculateDesiredPastureAreaHectares(worldContext, 0, true)).toBeCloseTo(planned);
      expect(calculateDesiredPastureAreaHectares(worldContext, 0)).toBe(600);
      const stock = getOrCreateFaunaStockTable()!;
      stock["0:Cattle"] = { young: 10, breeding: 40, old: 10 };
      stock["0:Sheep"] = { young: 0, breeding: 0, old: 0 };
      const before = structuredClone(stock);
      expect(calculateDesiredPastureAreaHectares(worldContext, 0, true)).toBeCloseTo(planned);
      expect(stock).toEqual(before);
    });

    it("draws draught animals from cropland, credits grazed fallow and keeps goats to their biome", () => {
      grasslandCellWorld(100);
      worldContext.biomesData = biomesData({ 1: ["forest"] }) as never;
      worldContext.options = { ...worldContext.options, historicalPeriod: "highMedieval" };
      const horses = { ...CATTLE_GOOD, i: 4, name: "Horses" };
      const goats = { ...CATTLE_GOOD, i: 5, name: "Goats", biomeOutputByTag: { scrub: 0.1 } };
      setGoods([CATTLE_GOOD, SHEEP_GOOD, horses, goats] as never);
      worldContext.pack.landUse!.cells[0]!.allocatedAreaHa = 200;
      // 16 working beasts, a quarter horses; each ox has one follower. No pastoral herds in forest.
      const targets = getLivestockHerdTargets(worldContext, 0);
      expect(targets.Horses).toBeCloseTo(4);
      expect(targets.Cattle).toBeCloseTo(24);
      expect(targets.Sheep).toBeCloseTo(100);
      expect(targets.Goats).toBeUndefined();
      const fallowHa = (200 * 0.33 * 400) / 1500;
      expect(getGrazedFallowPastureEquivalentHectares(worldContext, 0)).toBeCloseTo(fallowHa);
      expect(calculateDesiredPastureAreaHectares(worldContext, 0, true)).toBeCloseTo(
        24 * CATTLE_HA + 4 * (3500 / 1200) + 100 * SHEEP_HA - fallowHa
      );
    });

    it("bounds an unrecorded initial herd by residual labor rather than resident count", () => {
      grasslandCellWorld(50);
      delete worldContext.pack.landUse;
      worldContext.populationRate = 1;
      worldContext.pack.cells.maleAdults = Float32Array.from([1]);
      worldContext.pack.cells.femaleAdults = Float32Array.from([0]);
      // Target 25 cattle need 62.5 ha; 70 workable days herd 70 / (140 / 60) = 30 cattle.
      expect(calculateDesiredPastureAreaHectares(worldContext, 0, true, 0)).toBe(0);
      expect(calculateDesiredPastureAreaHectares(worldContext, 0, true, 35)).toBeCloseTo(15 * CATTLE_HA);
      expect(calculateDesiredPastureAreaHectares(worldContext, 0, true, 70)).toBeCloseTo(25 * CATTLE_HA);
      expect(calculateDesiredPastureAreaHectares(worldContext, 0)).toBeCloseTo(25 * CATTLE_HA);
      expect(Object.keys(getOrCreateFaunaStockTable()!)).toHaveLength(0);
    });
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
      // 600 ha of established pasture feed 240 of the 300 target cattle;
      // requiredWorkers = 240 / 60 (Cattle's dogless baseline) = 4.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.careWorkers).toBeCloseTo(4, 5);
      // The utilization margin leaves summer grass to cut for winter.
      expect(demand.hayWorkers).toBeGreaterThan(0);
      expect(demand.requiredWorkers).toBeCloseTo(demand.careWorkers! + demand.hayWorkers!, 8);
      expect(demand.value).toBeCloseTo(5, 5);
    });

    it("reduces required workers once Dogs stock provides full team coverage (§10.3 dog multiplier)", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD] as never);
      // landCapacity = 240 (see above); workersNoDogs = 4 -> dogsNeededForFullCoverage =
      // 4 * DOGS_PER_HERDER_FOR_FULL_COVERAGE(3) = 12.
      const withoutDogs = calculateHusbandryDemand(worldContext, 0);
      const table = getOrCreateFaunaStockTable()!;
      table["0:Dogs"] = { young: 0, breeding: 3, old: 0 }; // coverage = 3/12 = 0.25
      // effectiveHeadsPerHerder = 60 * (1 + (dogMultiplier(8)-1)*0.25) = 165 -> requiredWorkers = 240/165.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.careWorkers).toBeCloseTo(240 / 165, 5);
      expect(demand.hayWorkers).toBe(withoutDogs.hayWorkers);
    });

    it("weights value by each grazed good's share of land capacity", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      // Each target needs 750 ha; 600 ha feeds 40% of each: 120 cattle + 720 sheep.
      // Weighted value = (120 * 5 + 720) / 840 = 11 / 7.
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.value).toBeCloseTo(11 / 7, 5);
    });

    it.each(["unsuitable", "no pasture", "no residents", "disabled", "unregistered"])(
      "counts existing animals even with %s, without creating new land capacity",
      exclusion => {
        grasslandCellWorld(exclusion === "no residents" ? 0 : 600);
        let cattle = { ...CATTLE_GOOD };
        if (exclusion === "unsuitable") cattle = { ...cattle, biomeOutputByTag: {} };
        if (exclusion === "disabled")
          cattle = { ...cattle, requiredTechnology: "unavailableGrazingTestTechnology" } as typeof cattle;
        setGoods(exclusion === "unregistered" ? [] : ([cattle] as never));
        if (exclusion === "no pasture") {
          worldContext.pack.landUse = { cells: [{ diagnostics: ["resolved-livestock-land"], patches: [] }] } as never;
        }
        const stock = getOrCreateFaunaStockTable()!;
        stock["0:Cattle"] = { young: 20, breeding: 80, old: 20 };
        const demand = calculateHusbandryDemand(worldContext, 0);
        expect(demand.careWorkers).toBeCloseTo(120 / 60, 8);
        expect(demand.monthlyLaborWeights!.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 8);
        expect(stock["0:Cattle"]).toEqual({ young: 20, breeding: 80, old: 20 });
        if (exclusion !== "no residents") expect(calculateGrazingLandAllocation(worldContext, 0)).toEqual([]);
        delete stock["0:Cattle"];
        expect(calculateHusbandryDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
      }
    );

    it("uses the established pasture instead of claiming the entire suitable landscape", () => {
      // ceiling = 7,650 ha regardless of population; a small population must NOT be able to claim it.
      grasslandCellWorld(50);
      setGoods([CATTLE_GOOD] as never);
      // Established pasture is 50 ha -> 20 cattle, requiredWorkers = 20/60, far below what the full
      // 7,650 ha ceiling would imply (7650*0.5/60 = 63.75).
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.careWorkers).toBeCloseTo(20 / 60, 5);
      expect(demand.requiredWorkers).toBeLessThan((7650 * 0.5) / 60);
    });
  });

  describe("shared grazing budget", () => {
    it("partitions one pasture by each species' feed need at its target, never above the target", () => {
      grasslandCellWorld(600);
      const goods = ["Cattle", "Sheep", "Goats", "Horses", "Camels"].map((name, i) => ({
        ...CATTLE_GOOD,
        name,
        i: i + 1
      }));
      setGoods([...goods, PIG_GOOD] as never);
      const targets = getLivestockHerdTargets(worldContext, 0);
      const allocation = calculateGrazingLandAllocation(worldContext, 0);
      expect(allocation).toHaveLength(5);
      expect(allocation.reduce((sum, row) => sum + row.areaHa, 0)).toBeCloseTo(600, 8);
      expect(allocation.reduce((sum, row) => sum + row.capacityHeads / row.density, 0)).toBeCloseTo(600, 8);
      const share = allocation[0].capacityHeads / targets[allocation[0].goodName];
      for (const row of allocation) expect(row.capacityHeads / targets[row.goodName]).toBeCloseTo(share, 8);
      const ample = calculateGrazingLandAllocation(worldContext, 0, 1e9);
      for (const row of ample) expect(row.capacityHeads).toBeCloseTo(targets[row.goodName], 8);
      setHusbandryRequiredWorkers(Float32Array.from([10]));
      setHusbandryWorkers(Float32Array.from([5]));
      const usedHa = goods.reduce((sum, good) => {
        const row = allocation.find(row => row.goodName === good.name)!;
        return sum + getGrazedCarryingCapacity(0, good as never) / row.density;
      }, 0);
      expect(usedHa).toBeCloseTo(300, 8);
    });

    it("does not let biome output magnitudes change land shares", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      const before = calculateGrazingLandAllocation(worldContext, 0);
      setGoods([{ ...CATTLE_GOOD, biomeOutputByTag: { grassland: 2.5 } }, SHEEP_GOOD] as never);
      expect(calculateGrazingLandAllocation(worldContext, 0)).toEqual(before);
    });

    it("computes herders from partitioned targets and retains care for existing excess animals", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      expect(calculateHusbandryDemand(worldContext, 0).careWorkers).toBeCloseTo(120 / 60 + 720 / 200, 8);
      const stock = getOrCreateFaunaStockTable()!;
      stock["0:Cattle"] = { young: 100, breeding: 800, old: 100 };
      expect(calculateHusbandryDemand(worldContext, 0).careWorkers).toBeCloseTo(1000 / 60 + 720 / 200, 8);
      expect(stock["0:Cattle"]).toEqual({ young: 100, breeding: 800, old: 100 });
    });

    it("staffs observed herds rather than vacant pasture and does not recreate an empty herd", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD] as never);
      const stock = getOrCreateFaunaStockTable()!;
      stock["0:Cattle"] = { young: 10, breeding: 40, old: 10 };
      const before = structuredClone(stock);
      const capacity = calculateGrazingLandAllocation(worldContext, 0);
      const demand = calculateHusbandryDemand(worldContext, 0);
      expect(demand.careWorkers).toBeCloseTo(1, 8);
      expect(calculateGrazingLandAllocation(worldContext, 0)).toEqual(capacity);
      expect(stock).toEqual(before);

      stock["0:Cattle"] = { young: 0, breeding: 0, old: 0 };
      expect(calculateHusbandryDemand(worldContext, 0)).toEqual({ requiredWorkers: 0, value: 0 });
      expect(stock["0:Cattle"]).toEqual({ young: 0, breeding: 0, old: 0 });
    });

    it("keeps capacity independent of herd seeding, catalog order and repeated queries", () => {
      grasslandCellWorld(600);
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      setHusbandryRequiredWorkers(Float32Array.from([10]));
      setHusbandryWorkers(Float32Array.from([10]));
      const before = getGrazedCarryingCapacity(0, SHEEP_GOOD as never);
      const stock = getOrCreateFaunaStockTable()!;
      stock["0:Cattle"] = { young: 5000, breeding: 5000, old: 5000 };
      getGrazedCarryingCapacity(0, CATTLE_GOOD as never);
      setGoods([SHEEP_GOOD, CATTLE_GOOD] as never);
      expect(getGrazedCarryingCapacity(0, SHEEP_GOOD as never)).toBeCloseTo(before, 8);
      expect(stock["0:Cattle"].breeding).toBe(5000);
    });

    it("uses resolved pasture once despite low labor coverage, without taking cropland or woodland twice", () => {
      grasslandCellWorld(600);
      worldContext.pack.landUse = {
        cells: [
          {
            diagnostics: ["resolved-livestock-land"],
            allocatedAreaHa: 1000,
            patches: [
              { kind: "pasture", areaHa: 60 },
              { kind: "wood_pasture", areaHa: 40 },
              { kind: "field", areaHa: 900 }
            ]
          }
        ]
      } as never;
      setGoods([CATTLE_GOOD, SHEEP_GOOD] as never);
      setHusbandryRequiredWorkers(Float32Array.from([100]));
      setHusbandryWorkers(Float32Array.from([5]));
      expect(getPastureAreaUsedHectares(0)).toBe(100);
      // Grazed fallow adds forage inside the 1,000 ha of cropland, not extra land.
      expect(getForageAreaHectares(0)).toBeCloseTo(100 + (1000 * 0.33 * 400) / 1500, 8);
      expect(
        getGrazedCarryingCapacity(0, CATTLE_GOOD as never) * CATTLE_HA +
          getGrazedCarryingCapacity(0, SHEEP_GOOD as never) * SHEEP_HA
      ).toBeCloseTo(getForageAreaHectares(0), 8);
    });

    it("excludes disabled or unsuitable species without redistributing through a disabled direct query", () => {
      grasslandCellWorld(600);
      const disabled = { ...SHEEP_GOOD, requiredTechnology: "unavailableGrazingTestTechnology" };
      const unsuitable = { ...CATTLE_GOOD, name: "Camels", biomeOutputByTag: { desert: 0.1 } };
      setGoods([CATTLE_GOOD, disabled, unsuitable] as never);
      setHusbandryRequiredWorkers(Float32Array.from([10]));
      setHusbandryWorkers(Float32Array.from([10]));
      expect(calculateGrazingLandAllocation(worldContext, 0).map(row => row.goodName)).toEqual(["Cattle"]);
      expect(getGrazedCarryingCapacity(0, disabled as never)).toBe(0);
      expect(getGrazedCarryingCapacity(0, unsuitable as never)).toBe(0);
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBeCloseTo(600 / CATTLE_HA, 8);
      expect(calculateGrazingLandAllocation(worldContext, 0, 0)).toEqual([]);
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

  it("gates current production by funded care while retaining the annual planning factor", () => {
    grasslandCellWorld(100);
    worldContext.options = { ...worldContext.options, winterLivestockSlaughter: "off" };
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 60, old: 0 };
    const demand = calculateHusbandryDemand(worldContext, 0);
    setHusbandryRequiredWorkers(Float32Array.from([demand.requiredWorkers]));
    setHusbandryWorkers(Float32Array.from([demand.requiredWorkers / 2]));
    const calendar = new Float32Array(12);
    calendar[1] = 1000;
    setHusbandryMonthlyWorkDays(calendar);
    expect(getHusbandryWorkerFactor(0)).toBeCloseTo(0.5);
    withLivestockFeedPeriod(12000, () => expect(getHusbandryCareFactor(0)).toBe(0));
    withLivestockFeedPeriod(12001, () => expect(getHusbandryCareFactor(0)).toBe(1));
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
        burgs: [],
        landUse: { cells: [{ allocatedAreaHa: 0, diagnostics: [], patches: [{ kind: "pasture", areaHa: 50 }] }] }
      } as unknown as PackedGraph;
      worldContext.distanceScale = 1;
      worldContext.biomesData = biomesData({ 1: ["forest"] }) as never; // no PASTURE_BIOME_TAG_CEILING entry
      setCultivatedArea(new Float32Array([0]));
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage
      // The 50 ha legacy pasture stays below the marginal forest ceiling of 900 ha.
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(50, 1);
    });

    it("is 0 when husbandry has no assigned workers (workerFactor 0)", () => {
      grasslandCellWorld();
      expect(getPastureAreaUsedHectares(0)).toBe(0);
    });

    it("scales legacy pasture by the husbandry worker factor", () => {
      grasslandCellWorld(); // population defaults to 50
      // Established pasture is 50 ha, below the 7,650 ha ecological ceiling.
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getPastureAreaUsedHectares(0)).toBeCloseTo(25, 1);
    });

    it("keeps the established footprint below the land ceiling even at full staffing", () => {
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

    it("feeds as many of the target animals as the used legacy pasture grows forage for", () => {
      grasslandCellWorld(600);
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage -> established pastureAreaUsed = 600 ha
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBeCloseTo(600 / CATTLE_HA, 5);
    });

    it("does not expand established pasture to the ecological ceiling at full staffing", () => {
      grasslandCellWorld(50); // far below the 7,650 ha ceiling's population-equivalent
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage
      const capacity = getGrazedCarryingCapacity(0, CATTLE_GOOD as never);
      expect(capacity).toBeCloseTo(50 / CATTLE_HA, 5); // established pasture(50) / 2.5 ha per head
      expect(capacity).toBeLessThan(7650 * 0.5); // nowhere near the full ecological ceiling
    });

    it("scales down proportionally when understaffed", () => {
      grasslandCellWorld(600);
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      expect(getGrazedCarryingCapacity(0, CATTLE_GOOD as never)).toBeCloseTo((600 * 0.5) / CATTLE_HA, 5);
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
