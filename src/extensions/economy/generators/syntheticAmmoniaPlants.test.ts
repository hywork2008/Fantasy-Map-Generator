import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getChemistryTrials,
  getMarkets,
  getSyntheticAmmoniaPlants,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { SYNTHETIC_AMMONIA_PLANT_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { SyntheticAmmoniaPlants } from "./syntheticAmmoniaPlants";

describe("SyntheticAmmoniaPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1913 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Ferrum", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Coke", tags: [], value: 4, unit: "wain", icon: "good-coal", color: "#2b2b2b" },
      { i: 2, name: "Synthetic Ammonia", tags: [], value: 26, unit: "barrel", icon: "good-unknown", color: "#8fb8c9" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 4 },
          2: { stock: 0, price: 26 }
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

  it("does not create a plant for a State where syntheticAmmonia has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);
    expect(getSyntheticAmmoniaPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a plant, debits the budget, and consumes Coke once known — but produces no output while catalyticChemistry is not yet demonstrated anywhere", () => {
    setTechnologyProgressForTests([
      { technologyId: "syntheticAmmonia", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);

    const plants = getSyntheticAmmoniaPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1 });
    // Same double-debit shape as AcidPlants/PhosphateFertilizerPlants: one charge to found the
    // plant, one for this year's operation.
    expect(worldContext.pack.states[1].treasury).toBe(200 - SYNTHETIC_AMMONIA_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 1.2); // Coke consumed
    expect(market?.goods[2]?.stock).toBe(0); // no Synthetic Ammonia output yet

    const trial = getChemistryTrials().find(entry => entry.kind === "syntheticAmmoniaPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ status: "running", documentedRuns: 1, operatingYears: 1 });
  });

  it("produces Synthetic Ammonia once catalyticChemistry is demonstrated somewhere in the world", () => {
    setTechnologyProgressForTests([
      { technologyId: "syntheticAmmonia", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[2]?.stock).toBe(0.1); // trial-role output rate

    const trial = getChemistryTrials().find(entry => entry.kind === "syntheticAmmoniaPlant" && entry.stateId === 1);
    expect(trial?.outputsDelivered).toBe(0.1);
  });

  it("reduces utilization and fails the trial run when Coke stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.1, price: 4 },
          2: { stock: 0, price: 26 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "syntheticAmmonia", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);

    const plants = getSyntheticAmmoniaPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);

    const trial = getChemistryTrials().find(entry => entry.kind === "syntheticAmmoniaPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ documentedRuns: 0, failureCount: 1, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[2]?.stock).toBe(0); // still no output — the run failed
  });

  it("promotes a trial plant to service once syntheticAmmonia reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "syntheticAmmonia", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);
    expect(getSyntheticAmmoniaPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1914 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "syntheticAmmonia", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);
    expect(getSyntheticAmmoniaPlants()[0]?.role).toBe("service");
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "syntheticAmmonia", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(true);
    expect(SyntheticAmmoniaPlants.settleAnnual()).toBe(false);
  });
});
