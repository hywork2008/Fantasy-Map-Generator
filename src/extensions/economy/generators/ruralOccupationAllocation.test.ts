import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setFishingRequiredWorkers,
  setFishingWorkers,
  setGoodCellColumn,
  setGoods,
  setHuntingWorkers,
  setViticultureRequiredWorkers,
  setViticultureWorkers
} from "../economyContext";
import {
  allocateRuralOccupations,
  GAME_YIELD_PER_HUNTER_PER_MONTH,
  getFishingWorkerFactor,
  getHuntingGameOutput,
  getViticultureWorkerFactor
} from "./ruralOccupationAllocation";

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

const WINE_GOOD = {
  i: 2,
  name: "Wine",
  value: 5,
  tags: ["food", "luxury"],
  unit: "barrel",
  icon: "icon",
  color: "#fff",
  chance: 3,
  biomeOutputByTag: { scrub: 0.12 },
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
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
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

  it("gates Wine's continuous biome output by the assigned/required viticulture workerFactor", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0]),
        h: new Uint8Array([30]),
        biomeCode: new Uint8Array([1]),
        pop: new Float32Array([100]),
        c: [[]]
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = biomesData({ 1: ["scrub"] }) as never;
    setGoods([WINE_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0]));

    const migratableAdults = new Float32Array([50]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // rawOutput = 100 * 0.12 = 12; required = 12 * 10 = 120; only 50 of that is staffed.
    expect(result.viticultureWorkers[0]).toBeCloseTo(50, 5);
    expect(result.viticultureRequiredWorkers[0]).toBeCloseTo(120, 5);
    expect(result.ruralReleasePressure[0]).toBeCloseTo(0, 5);
    persist(result);
    expect(getViticultureWorkerFactor(0)).toBeCloseTo(50 / 120, 5);
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

    // holder popProxy = 20 + 30 = 50; rawOutput = min(50*0.25, 5) = 5; required = 5*6 = 30,
    // split evenly across the two land neighbors -> 15 each, each staffs all it can (10).
    expect(result.fishingRequiredWorkers[2]).toBeCloseTo(30, 5);
    expect(result.fishingWorkers[2]).toBeCloseTo(20, 5); // 10 (cell 0) + 10 (cell 1)
    expect(result.ruralReleasePressure[0]).toBeCloseTo(0, 5);
    expect(result.ruralReleasePressure[1]).toBeCloseTo(0, 5);
    persist(result);
    expect(getFishingWorkerFactor(2)).toBeCloseTo(20 / 30, 5);
  });

  it("prioritizes the higher-value occupation (Wine over Fish) when labour can't cover both", () => {
    worldContext.pack = {
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([30, 10]),
        biomeCode: new Uint8Array([1, 0]),
        pop: new Float32Array([100, 0]),
        c: [[1], [0]]
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = biomesData({ 1: ["scrub"], 0: [] }) as never;
    setGoods([FISH_GOOD, WINE_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0, 1])); // cell 1 (water) holds the Fish slot

    const migratableAdults = new Float32Array([40, 0]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // Viticulture (value 5) is offered first and consumes the entire budget before fishing
    // (value 1) gets anything, even though both are eligible at cell 0.
    expect(result.viticultureWorkers[0]).toBeCloseTo(40, 5);
    expect(result.fishingWorkers[1]).toBeCloseTo(0, 5);
    expect(result.ruralReleasePressure[0]).toBeCloseTo(0, 5);
  });

  it("derives Game output from hunter headcount rather than population", () => {
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
});
