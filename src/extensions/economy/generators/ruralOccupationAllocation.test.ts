import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIVELIHOOD_CODE, simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateFaunaStockTable,
  initEconomyContext,
  setFishingRequiredWorkers,
  setFishingWorkers,
  setGoodCellColumn,
  setGoods,
  setHuntingWorkers,
  setMarketCellColumn,
  setViticultureRequiredWorkers,
  setViticultureWorkers
} from "../economyContext";
import { WORKABLE_DAYS_PER_ADULT, WORKABLE_DAYS_PER_ADULT_PER_MONTH } from "./agriculturalLandUse";
import { Goods } from "./goods-generator";
import { calculateHusbandryDemand } from "./husbandry";
import {
  allocateRuralOccupations,
  GAME_YIELD_PER_HUNTER_PER_MONTH,
  getFishingWorkerFactor,
  getHuntingGameOutput,
  getUrbanHarvestHelpShare
} from "./ruralOccupationAllocation";
import { getViticultureWorkerFactor } from "./viticulture";

const FISH_GOOD = {
  i: 1,
  name: "Fish",
  value: 1,
  tags: ["food"],
  unit: "wain",
  icon: "icon",
  color: "#fff",
  chance: 2,
  demandCoverage: {}
};

// Phase 4: no biomeOutputByTag — viticulture.ts sizes Grapes' harvest from vineyard area/labour
// instead of a flat population x rate (see viticulture.test.ts for that model's own coverage).
const GRAPES_GOOD = {
  i: 2,
  name: "Grapes",
  value: 2,
  tags: ["food", "freshFood"],
  unit: "basket",
  icon: "icon",
  color: "#fff",
  chance: 3,
  demandCoverage: {}
};

/** The consumption-side getters (getFishingWorkerFactor etc.) read persisted economyContext
 * columns, not allocateRuralOccupations()'s return value directly — mirrors how
 * developmentPotential.ts's storeAgriculture() persists the allocator's output in production. */
function persist(result: ReturnType<typeof allocateRuralOccupations>): void {
  setHuntingWorkers(result.huntingWorkers);
  setFishingWorkers(result.fishingWorkers);
  setFishingRequiredWorkers(result.fishingRequiredWorkers);
  setViticultureWorkers(result.viticultureWorkers);
  setViticultureRequiredWorkers(result.viticultureRequiredWorkers);
}

function biomesData(tagsByCode: Record<number, string[]>) {
  const maxCode = Math.max(...Object.keys(tagsByCode).map(Number));
  const tags: string[][] = [];
  for (let i = 0; i <= maxCode; i++) tags[i] = tagsByCode[i] ?? [];
  return { tags, habitability: tags.map(() => 100) };
}

describe("ruralOccupationAllocation", () => {
  it("exports the same seasonal husbandry work that the rural calendar actually reserves", () => {
    worldContext.options = { ...worldContext.options, winterLivestockSlaughter: "off" };
    worldContext.pack = {
      cells: {
        i: Uint16Array.from([0]),
        h: Uint8Array.from([30]),
        biomeCode: Uint8Array.from([0]),
        pop: Float32Array.from([100]),
        maleAdults: Float32Array.from([20]),
        femaleAdults: Float32Array.from([20]),
        area: Float32Array.from([100]),
        state: Uint16Array.from([0]),
        burg: Uint16Array.from([0]),
        c: [[]]
      },
      burgs: [],
      states: []
    } as unknown as PackedGraph;
    worldContext.populationRate = 1;
    worldContext.biomesData = { tags: [["grassland"]], habitability: [100] } as never;
    setGoods([Goods.getDefaultGood("Sheep")!]);
    getOrCreateFaunaStockTable()!["0:Sheep"] = { young: 30, breeding: 40, old: 20 };
    const days = new Float32Array(12);
    const allocation = allocateRuralOccupations(worldContext, {
      cropLaborDaysByMonth: days,
      minimumCropLaborDaysByMonth: days.slice(),
      farmLaborRequired: new Float32Array([0]),
      migratableAdults: new Float32Array([40])
    });
    const demand = calculateHusbandryDemand(worldContext, 0);
    expect(allocation.husbandryWorkers[0]).toBeGreaterThan(0);
    for (let month = 0; month < 12; month++) {
      expect(allocation.husbandryMonthlyWorkDays[month]).toBeCloseTo(
        allocation.husbandryWorkers[0] * WORKABLE_DAYS_PER_ADULT * demand.monthlyLaborWeights![month],
        4
      );
    }
    expect(Math.max(...allocation.husbandryMonthlyWorkDays)).toBeGreaterThan(
      Math.min(...allocation.husbandryMonthlyWorkDays)
    );
    // Unfunded herd-care vacancies are not unworked staple days.
    getOrCreateFaunaStockTable()!["0:Sheep"] = { young: 0, breeding: 100_000, old: 0 };
    const modestCrop = new Float32Array(12).fill(100);
    const vacancies = allocateRuralOccupations(worldContext, {
      cropLaborDaysByMonth: modestCrop,
      minimumCropLaborDaysByMonth: modestCrop.slice(),
      farmLaborRequired: new Float32Array([0]),
      migratableAdults: new Float32Array([40])
    });
    expect(vacancies.seasonalLaborShortage.some(days => days > 100)).toBe(true);
    expect(Array.from(vacancies.cropLaborShortage!)).toEqual(Array(12).fill(0));
    getOrCreateFaunaStockTable()!["0:Sheep"] = { young: 30, breeding: 40, old: 20 };
    // A fully occupied harvest month cannot cancel all other monthly reservations.
    const busy = new Float32Array(12);
    busy[6] = 10_000;
    const seasonal = allocateRuralOccupations(worldContext, {
      cropLaborDaysByMonth: busy,
      minimumCropLaborDaysByMonth: busy.slice(),
      farmLaborRequired: new Float32Array([0]),
      migratableAdults: new Float32Array([40])
    });
    expect(seasonal.husbandryMonthlyWorkDays[6]).toBe(0);
    expect(seasonal.cropLaborShortage![6]).toBeGreaterThan(0);
    expect(seasonal.husbandryMonthlyWorkDays[0]).toBeCloseTo(allocation.husbandryMonthlyWorkDays[0], 4);
    expect(seasonal.husbandryWorkers[0]).toBeGreaterThan(0);
    expect(seasonal.husbandryWorkers[0]).toBeCloseTo(
      seasonal.husbandryMonthlyWorkDays.reduce((sum, days) => sum + days, 0) / WORKABLE_DAYS_PER_ADULT,
      5
    );
    for (let month = 0; month < 12; month++) {
      if (month !== 6)
        expect(seasonal.husbandryMonthlyWorkDays[month]).toBeLessThanOrEqual(40 * WORKABLE_DAYS_PER_ADULT_PER_MONTH);
    }
  });
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("reserves household textile work after farm work in every month and reduces migration surplus", () => {
    worldContext.pack = {
      cells: {
        i: Uint16Array.from([0]),
        h: Uint8Array.from([30]),
        biomeCode: Uint8Array.from([0]),
        pop: Float32Array.from([100]),
        maleAdults: Float32Array.from([30]),
        femaleAdults: Float32Array.from([30]),
        c: [[]]
      },
      burgs: []
    } as unknown as PackedGraph;
    worldContext.populationRate = 1;
    worldContext.biomesData = { tags: [[]], habitability: [0] } as never;
    setGoodCellColumn(Uint16Array.from([0]));
    const days = new Float32Array(12);
    const run = (reserved = 0) =>
      allocateRuralOccupations(worldContext, {
        cropLaborDaysByMonth: days,
        minimumCropLaborDaysByMonth: days.slice(),
        farmLaborRequired: new Float32Array([0]),
        migratableAdults: new Float32Array([60]),
        reservedLaborExport: new Float32Array([reserved])
      });
    setGoods([]);
    const without = run();
    setGoods(["Wool", "Wool Cloth", "Wool Garments", "Wool Blankets"].map(name => Goods.getDefaultGood(name)!));
    const withTextiles = run();
    expect(withTextiles.householdTextileWorkers[0]).toBeGreaterThan(0);
    expect(withTextiles.farmLaborRequired[0]).toBeGreaterThan(without.farmLaborRequired[0]);
    expect(withTextiles.migratableAdults[0]).toBeLessThan(without.migratableAdults[0]);
    expect(withTextiles.ruralReleasePressure[0]).toBeLessThan(without.ruralReleasePressure[0]);
    expect(run(60).householdTextileWorkers[0]).toBe(0);
    days.fill(60 * WORKABLE_DAYS_PER_ADULT_PER_MONTH);
    expect(run().householdTextileWorkers[0]).toBeCloseTo(0, 4);
  });

  it("claims a small fixed hunting headcount from a forest cell's surplus, leaving the rest as release pressure", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0]),
        h: new Uint8Array([30]),
        biomeCode: new Uint8Array([1]),
        pop: new Float32Array([10]),
        c: [[]]
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = biomesData({ 1: ["forest"] }) as never;
    setGoods([] as never);
    setGoodCellColumn(new Uint16Array([0]));

    const migratableAdults = new Float32Array([5]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    expect(result.huntingWorkers[0]).toBeCloseTo(3, 5); // floor(3) beats the 1% share of 5
    expect(result.ruralReleasePressure[0]).toBeCloseTo(2, 5);
  });

  it("combines a staple peak and routine fishing before calculating migration and records the unmet peak", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0]),
        h: new Uint8Array([30]),
        biomeCode: new Uint8Array([0]),
        pop: new Float32Array([20]),
        maleAdults: new Float32Array([2]),
        femaleAdults: new Float32Array([0]),
        c: [[]]
      }
    } as unknown as PackedGraph;
    worldContext.populationRate = 1;
    worldContext.biomesData = { tags: [[]], habitability: [0] } as never;
    setGoods([FISH_GOOD] as never);
    setGoodCellColumn(new Uint16Array([1]));
    const cropLaborDaysByMonth = new Float32Array(12);
    cropLaborDaysByMonth[6] = 140 / 12; // one resident adult's cereal harvest month

    const result = allocateRuralOccupations(worldContext, {
      cropLaborDaysByMonth,
      minimumCropLaborDaysByMonth: cropLaborDaysByMonth.slice(),
      farmLaborRequired: new Float32Array([1]),
      migratableAdults: new Float32Array([1])
    });

    // The harvest month is a peak, so both adults work double days then (PEAK_MONTH_WORK_MULTIPLIER)
    // and the crew is bound by an ordinary month instead: two fishers. The annual surplus argument
    // supplied by the legacy path is deliberately ignored by the calendar path.
    expect(result.fishingRequiredWorkers[0]).toBeCloseTo(30, 5);
    expect(result.fishingWorkers[0]).toBeCloseTo(2, 5);
    // Year-round residents: one cereal-harvest month (11.7 days) plus two fishers (140 days each).
    expect(result.farmLaborRequired[0]).toBeCloseTo((140 / 12 + 2 * 140) / 140, 5);
    // Both adults now work year-round (crop month plus fishing), so none can leave.
    expect(result.migratableAdults[0]).toBe(0);
    expect(result.seasonalLaborShortage[6]).toBeGreaterThan(0);
  });

  it("lets market-town adults and travelling rural hands cover part of a harvest-month shortage, more in later periods", () => {
    const run = (historicalPeriod: string) => {
      worldContext.pack = {
        cells: {
          i: new Uint16Array([0]),
          h: new Uint8Array([30]),
          biomeCode: new Uint8Array([0]),
          pop: new Float32Array([2]),
          maleAdults: new Float32Array([0.5]),
          femaleAdults: new Float32Array([0.5]),
          c: [[]]
        },
        burgs: [{}, { i: 1, market: 1, population: 10, demographics: { maleAdults: 3, femaleAdults: 3 } }]
      } as unknown as PackedGraph;
      worldContext.populationRate = 1;
      worldContext.urbanization = 1;
      worldContext.options = { ...worldContext.options, historicalPeriod } as never;
      worldContext.biomesData = { tags: [[]], habitability: [0] } as never;
      setGoods([] as never);
      setMarketCellColumn(new Uint16Array([1]));
      const cropLaborDaysByMonth = new Float32Array(12);
      cropLaborDaysByMonth[6] = 100; // a harvest month far beyond one adult's peak capacity
      return allocateRuralOccupations(worldContext, {
        cropLaborDaysByMonth,
        minimumCropLaborDaysByMonth: cropLaborDaysByMonth.slice(),
        farmLaborRequired: new Float32Array([1]),
        migratableAdults: new Float32Array([0])
      }).seasonalLaborShortage[6];
    };

    const medieval = run("highMedieval");
    const later = run("preIndustrialEra");
    expect(getUrbanHarvestHelpShare("highMedieval")).toBeLessThan(getUrbanHarvestHelpShare("preIndustrialEra"));
    expect(later).toBeLessThan(medieval);
    expect(medieval).toBeGreaterThan(0);
  });

  it("gates Grapes' harvest by the assigned/required viticulture workerFactor", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0]),
        h: new Uint8Array([30]),
        biomeCode: new Uint8Array([1]),
        pop: new Float32Array([140]),
        area: new Float32Array([50]), // physicalHectares = 50 * 1^2 * 100 = 5,000 ha
        c: [[]]
      }
    } as unknown as PackedGraph;
    worldContext.distanceScale = 1;
    worldContext.biomesData = biomesData({ 1: ["scrub"] }) as never;
    worldContext.grid = { cells: { temp: new Int8Array([12]), prec: new Uint8Array([8]) } } as never;
    setGoods([GRAPES_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0]));

    const migratableAdults = new Float32Array([6]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // Hunting is no longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase A) —
    // it now claims its fixed floor from ANY habitable biome first: min(6, max(3, 6*0.01)) = 3,
    // leaving only 3 of the 6-adult budget for viticulture.
    // desiredArea = min(2250, 140*0.04) = 5.6 ha; required = 0.8, so it is fully staffed.
    expect(result.huntingWorkers[0]).toBeCloseTo(3, 5);
    expect(result.viticultureWorkers[0]).toBeCloseTo(0.8, 5);
    expect(result.viticultureRequiredWorkers[0]).toBeCloseTo(0.8, 5);
    expect(result.ruralReleasePressure[0]).toBeCloseTo(2.2, 5);
    persist(result);
    expect(getViticultureWorkerFactor(0)).toBeCloseTo(1, 5);
  });

  it("splits a water-held Fish slot's required workers across its land neighbors", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        h: new Uint8Array([30, 30, 10]),
        biomeCode: new Uint8Array([0, 0, 0]),
        pop: new Float32Array([20, 30, 0]),
        c: [[2], [2], [0, 1]]
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = biomesData({ 0: [] }) as never;
    setGoods([FISH_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0, 0, 1])); // cell 2 (water) holds the Fish slot

    const migratableAdults = new Float32Array([10, 10, 0]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // Hunting is no longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase A) —
    // both land cells claim their fixed floor first: min(10, max(3, 10*0.01)) = 3 each, leaving 7.
    // holder popProxy = 20 + 30 = 50; rawOutput = min(50*0.25, 5) = 5; required = 5*6 = 30,
    // split evenly across the two land neighbors -> 15 each, each staffs all of its post-hunting
    // remainder (7).
    expect(result.huntingWorkers[0]).toBeCloseTo(3, 5);
    expect(result.huntingWorkers[1]).toBeCloseTo(3, 5);
    expect(result.fishingRequiredWorkers[2]).toBeCloseTo(30, 5);
    expect(result.fishingWorkers[2]).toBeCloseTo(14, 5); // 7 (cell 0) + 7 (cell 1)
    expect(result.ruralReleasePressure[0]).toBeCloseTo(0, 5);
    expect(result.ruralReleasePressure[1]).toBeCloseTo(0, 5);
    persist(result);
    expect(getFishingWorkerFactor(2)).toBeCloseTo(14 / 30, 5);
  });

  it("prioritizes the higher-value occupation (Grapes over Fish) when labour can't cover both", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([30, 10]),
        biomeCode: new Uint8Array([1, 0]),
        pop: new Float32Array([140, 0]),
        area: new Float32Array([50, 10]),
        c: [[1], [0]]
      }
    } as unknown as PackedGraph;
    worldContext.distanceScale = 1;
    worldContext.biomesData = biomesData({ 1: ["scrub"], 0: [] }) as never;
    worldContext.grid = { cells: { temp: new Int8Array([12, 12]), prec: new Uint8Array([8, 8]) } } as never;
    setGoods([FISH_GOOD, GRAPES_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0, 1])); // cell 1 (water) holds the Fish slot

    const migratableAdults = new Float32Array([8, 0]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // Hunting is no longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase A) —
    // it claims its fixed floor first: min(8, max(3, 8*0.01)) = 3, leaving 5. Viticulture (Grapes,
    // value 2) is offered next and needs 0.8 workers before fishing
    // (value 1) gets anything, even though both are eligible at cell 0.
    expect(result.huntingWorkers[0]).toBeCloseTo(3, 5);
    expect(result.viticultureWorkers[0]).toBeCloseTo(0.8, 5);
    expect(result.fishingWorkers[1]).toBeCloseTo(4.2, 5);
    expect(result.ruralReleasePressure[0]).toBeCloseTo(0, 5);
  });

  it("derives Game output from hunter headcount rather than population", () => {
    // Phase 2's fauna stock model (faunaPopulation.ts) would otherwise cap this cell's Game
    // output by wildHabitatArea, which needs cells.area/distanceScale this fixture doesn't set
    // up — pin "simplified" so this test keeps exercising Phase 1's labour-only formula in
    // isolation. Detailed-mode stock capping is covered by faunaPopulation.test.ts.
    worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0]),
        h: new Uint8Array([30]),
        biomeCode: new Uint8Array([1]),
        pop: new Float32Array([1000]), // large population must NOT drive Game output directly
        c: [[]]
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = biomesData({ 1: ["forest"] }) as never;
    setGoods([] as never);
    setGoodCellColumn(new Uint16Array([0]));

    const migratableAdults = new Float32Array([3]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);
    persist(result);

    // huntingWorkers assigned = min(3, max(3, 3*0.01)) = 3 (population never enters this formula).
    expect(getHuntingGameOutput(0)).toBeCloseTo(3 * GAME_YIELD_PER_HUNTER_PER_MONTH, 5);
  });

  it("lets a slack neighbour absorb a same-state harvest shortage as mutual-aid employment", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([30, 30]),
        biomeCode: new Uint8Array([0, 0]),
        pop: new Float32Array([4, 4]),
        maleAdults: new Float32Array([2, 2]),
        femaleAdults: new Float32Array([0, 0]),
        children: new Float32Array([0, 0]),
        elders: new Float32Array([0, 0]),
        state: new Uint16Array([1, 1]),
        c: [[1], [0]]
      }
    } as unknown as PackedGraph;
    worldContext.populationRate = 1;
    worldContext.biomesData = { tags: [[]], habitability: [0] } as never;
    setGoods([] as never);
    setGoodCellColumn(new Uint16Array([0, 0]));

    const cropLaborDaysByMonth = new Float32Array(24);
    cropLaborDaysByMonth[6] = 140; // cell 0 harvest needs ~12 resident adults
    const minimumCropLaborDaysByMonth = new Float32Array(24);

    const result = allocateRuralOccupations(worldContext, {
      cropLaborDaysByMonth,
      minimumCropLaborDaysByMonth,
      farmLaborRequired: new Float32Array([2, 2]),
      migratableAdults: new Float32Array([0, 2])
    });

    // Cell 1 had no staple work, so its two adults take the neighbour's harvest days.
    expect(result.farmLaborRequired[1]).toBeGreaterThan(0);
    expect(result.migratableAdults[1]).toBeLessThan(2);
    expect(result.seasonalLaborShortage[6]).toBeLessThan(140);
  });

  it("counts leftover highland adults as subsistence workers instead of unemployed surplus", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0]),
        h: new Uint8Array([30]),
        biomeCode: new Uint8Array([0]),
        pop: new Float32Array([4]),
        maleAdults: new Float32Array([2]),
        femaleAdults: new Float32Array([0]),
        children: new Float32Array([0]),
        elders: new Float32Array([0]),
        livelihood: new Uint8Array([LIVELIHOOD_CODE.foraging]),
        c: [[]]
      }
    } as unknown as PackedGraph;
    worldContext.populationRate = 1;
    worldContext.biomesData = { tags: [[]], habitability: [0] } as never;
    setGoods([] as never);
    setGoodCellColumn(new Uint16Array([0]));

    const result = allocateRuralOccupations(worldContext, {
      cropLaborDaysByMonth: new Float32Array(12),
      minimumCropLaborDaysByMonth: new Float32Array(12),
      farmLaborRequired: new Float32Array([0]),
      migratableAdults: new Float32Array([2])
    });

    expect(result.farmLaborRequired[0]).toBeCloseTo(2, 5);
    expect(result.migratableAdults[0]).toBe(0);
  });
});
