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
  getHuntingGameOutput
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
    setGoods([GRAPES_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0]));

    const migratableAdults = new Float32Array([6]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // Hunting is no longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase A) —
    // it now claims its fixed floor from ANY habitable biome first: min(6, max(3, 6*0.01)) = 3,
    // leaving only 3 of the 6-adult budget for viticulture.
    // ceiling = 5,000 * terrainShare(0.9) * scrub(0.5) = 2,250 ha; desiredArea = min(2250, 140*0.5) = 70 ha;
    // required = 70 * 20 / 140 = 10; only 3 of that is staffed after hunting's claim.
    expect(result.huntingWorkers[0]).toBeCloseTo(3, 5);
    expect(result.viticultureWorkers[0]).toBeCloseTo(3, 5);
    expect(result.viticultureRequiredWorkers[0]).toBeCloseTo(10, 5);
    expect(result.ruralReleasePressure[0]).toBeCloseTo(0, 5);
    persist(result);
    expect(getViticultureWorkerFactor(0)).toBeCloseTo(0.3, 5);
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
    setGoods([FISH_GOOD, GRAPES_GOOD] as never);
    setGoodCellColumn(new Uint16Array([0, 1])); // cell 1 (water) holds the Fish slot

    const migratableAdults = new Float32Array([8, 0]);
    const result = allocateRuralOccupations(worldContext, migratableAdults);

    // Hunting is no longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase A) —
    // it claims its fixed floor first: min(8, max(3, 8*0.01)) = 3, leaving 5. Viticulture (Grapes,
    // value 2) is offered next and consumes the rest of the budget (required 10 > 5) before fishing
    // (value 1) gets anything, even though both are eligible at cell 0.
    expect(result.huntingWorkers[0]).toBeCloseTo(3, 5);
    expect(result.viticultureWorkers[0]).toBeCloseTo(5, 5);
    expect(result.fishingWorkers[1]).toBeCloseTo(0, 5);
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
});
