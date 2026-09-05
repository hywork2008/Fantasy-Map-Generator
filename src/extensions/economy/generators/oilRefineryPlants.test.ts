import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  clearEconomyContext,
  getChemistryTrials,
  getMarkets,
  getOilRefineryPlants,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { FACILITY_MAINTENANCE_RATE, OIL_REFINERY_PLANT_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { OilRefineryPlants } from "./oilRefineryPlants";

describe("OilRefineryPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1900 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Petrolia", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Crude Oil", tags: [], value: 6, unit: "barrel", icon: "good-unknown", color: "#2b1f18" },
      { i: 2, name: "Coal", tags: [], value: 3, unit: "wain", icon: "good-coal", color: "#2b2b2b" },
      { i: 3, name: "Firebrick", tags: [], value: 6, unit: "wain", icon: "good-clay", color: "#8a4a30" },
      { i: 4, name: "Kerosene", tags: [], value: 14, unit: "barrel", icon: "good-unknown", color: "#c9a869" },
      { i: 5, name: "Lubricating Oil", tags: [], value: 18, unit: "flask", icon: "good-unknown", color: "#4a3620" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 6 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 14 },
          5: { stock: 0, price: 18 }
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

  it("does not create a plant for a State where oilRefiningAndFractionation has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(OilRefineryPlants.settleAnnual()).toBe(true);
    expect(getOilRefineryPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a plant, debits the budget, and consumes Crude Oil/Coal/Firebrick once known — but produces no output while modernDrillingAndFieldOperations is not yet demonstrated anywhere", () => {
    setTechnologyProgressForTests([
      { technologyId: "oilRefiningAndFractionation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(OilRefineryPlants.settleAnnual()).toBe(true);

    const plants = getOilRefineryPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1 });
    // Same double-debit shape as MercuryPlants: one charge to found the plant, one for this
    // year's operation.
    // One full charge to found the plant, one reduced FACILITY_MAINTENANCE_RATE renewal charge for
    // this year's operation (docs/plan/treasury-structural-deficit-investigation.md §8.2, fix "A").
    expect(worldContext.pack.states[1].treasury).toBe(
      200 - OIL_REFINERY_PLANT_BUDGET - rn(OIL_REFINERY_PLANT_BUDGET * FACILITY_MAINTENANCE_RATE, 2)
    );

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 1.0); // Crude Oil consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.2); // Coal consumed
    expect(market?.goods[3]?.stock).toBe(100 - 0.1); // Firebrick consumed
    expect(market?.goods[4]?.stock).toBe(0); // no Kerosene output yet
    expect(market?.goods[5]?.stock).toBe(0); // no Lubricating Oil output yet

    const trial = getChemistryTrials().find(entry => entry.kind === "oilRefineryPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ status: "running", documentedRuns: 1, operatingYears: 1 });
  });

  it("produces both Kerosene and Lubricating Oil in the same year once modernDrillingAndFieldOperations is demonstrated somewhere in the world", () => {
    setTechnologyProgressForTests([
      { technologyId: "oilRefiningAndFractionation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      {
        technologyId: "modernDrillingAndFieldOperations",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);

    expect(OilRefineryPlants.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0.4); // trial-role Kerosene output rate
    expect(market?.goods[5]?.stock).toBe(0.08); // trial-role Lubricating Oil output rate

    const trial = getChemistryTrials().find(entry => entry.kind === "oilRefineryPlant" && entry.stateId === 1);
    expect(trial?.outputsDelivered).toBeCloseTo(0.48, 4);
  });

  it("reduces utilization and fails the trial run when Crude Oil stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.1, price: 6 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 14 },
          5: { stock: 0, price: 18 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "oilRefiningAndFractionation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      {
        technologyId: "modernDrillingAndFieldOperations",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        diffusion: 0
      }
    ]);

    expect(OilRefineryPlants.settleAnnual()).toBe(true);

    const plants = getOilRefineryPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);

    const trial = getChemistryTrials().find(entry => entry.kind === "oilRefineryPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ documentedRuns: 0, failureCount: 1, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0); // still no output — the run failed
    expect(market?.goods[5]?.stock).toBe(0);
  });

  it("promotes a trial plant to service once oilRefiningAndFractionation reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "oilRefiningAndFractionation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(OilRefineryPlants.settleAnnual()).toBe(true);
    expect(getOilRefineryPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1901 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "oilRefiningAndFractionation", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(OilRefineryPlants.settleAnnual()).toBe(true);
    expect(getOilRefineryPlants()[0]?.role).toBe("service");
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "oilRefiningAndFractionation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(OilRefineryPlants.settleAnnual()).toBe(true);
    expect(OilRefineryPlants.settleAnnual()).toBe(false);
  });
});
