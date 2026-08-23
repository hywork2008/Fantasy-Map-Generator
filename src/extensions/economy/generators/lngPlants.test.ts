import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getChemistryTrials,
  getLNGPlants,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { LNG_PLANT_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { LNGPlants } from "./lngPlants";
import { Markets } from "./markets-generator";

describe("LNGPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1910 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Gasfield", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Natural Gas", tags: [], value: 5, unit: "therm", icon: "good-unknown", color: "#3a5f6b" },
      { i: 2, name: "Coal", tags: [], value: 3, unit: "wain", icon: "good-coal", color: "#2b2b2b" },
      { i: 3, name: "Machine Parts", tags: [], value: 18, unit: "crate", icon: "good-unknown", color: "#6d7380" },
      { i: 4, name: "LNG", tags: [], value: 12, unit: "therm", icon: "good-unknown", color: "#cfe8f0" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 5 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 18 },
          4: { stock: 0, price: 12 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("does not create a plant for a State where naturalGasLiquefaction has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(LNGPlants.settleAnnual()).toBe(true);
    expect(getLNGPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a plant, debits the budget, and consumes Natural Gas/Coal/Machine Parts once known — but produces no output while modernDrillingAndFieldOperations is not yet demonstrated anywhere", () => {
    setTechnologyProgressForTests([
      { technologyId: "naturalGasLiquefaction", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(LNGPlants.settleAnnual()).toBe(true);

    const plants = getLNGPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1 });
    // Same double-debit shape as OilRefineryPlants: one charge to found the plant, one for this
    // year's operation.
    expect(worldContext.pack.states[1].treasury).toBe(200 - LNG_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 1.0); // Natural Gas consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.3); // Coal consumed
    expect(market?.goods[3]?.stock).toBe(100 - 0.15); // Machine Parts consumed
    expect(market?.goods[4]?.stock).toBe(0); // no LNG output yet

    const trial = getChemistryTrials().find(entry => entry.kind === "lngPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ status: "running", documentedRuns: 1, operatingYears: 1 });
  });

  it("produces LNG once modernDrillingAndFieldOperations is demonstrated somewhere in the world", () => {
    setTechnologyProgressForTests([
      { technologyId: "naturalGasLiquefaction", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      {
        technologyId: "modernDrillingAndFieldOperations",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);

    expect(LNGPlants.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0.4); // trial-role LNG output rate

    const trial = getChemistryTrials().find(entry => entry.kind === "lngPlant" && entry.stateId === 1);
    expect(trial?.outputsDelivered).toBeCloseTo(0.4, 4);
  });

  it("reduces utilization and fails the trial run when Natural Gas stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.1, price: 5 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 18 },
          4: { stock: 0, price: 12 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "naturalGasLiquefaction", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      {
        technologyId: "modernDrillingAndFieldOperations",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);

    expect(LNGPlants.settleAnnual()).toBe(true);

    const plants = getLNGPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);

    const trial = getChemistryTrials().find(entry => entry.kind === "lngPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ documentedRuns: 0, failureCount: 1, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0); // still no output — the run failed
  });

  it("promotes a trial plant to service once naturalGasLiquefaction reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "naturalGasLiquefaction", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(LNGPlants.settleAnnual()).toBe(true);
    expect(getLNGPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1911 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "naturalGasLiquefaction", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(LNGPlants.settleAnnual()).toBe(true);
    expect(getLNGPlants()[0]?.role).toBe("service");
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "naturalGasLiquefaction", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(LNGPlants.settleAnnual()).toBe(true);
    expect(LNGPlants.settleAnnual()).toBe(false);
  });
});
