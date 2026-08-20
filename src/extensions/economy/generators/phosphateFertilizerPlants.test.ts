import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getChemistryTrials,
  getMarkets,
  getPhosphateFertilizerPlants,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { PHOSPHATE_FERTILIZER_PLANT_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { PhosphateFertilizerPlants } from "./phosphateFertilizerPlants";

describe("PhosphateFertilizerPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1850 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Ferrum", removed: false, capital: 1, treasury: 100 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Phosphate Rock", tags: [], value: 6, unit: "wain", icon: "good-stone", color: "#9c8a5e" },
      { i: 2, name: "Sulfuric Acid", tags: [], value: 18, unit: "barrel", icon: "good-sulfur", color: "#c9b44a" },
      { i: 3, name: "Phosphate Fertilizer", tags: [], value: 20, unit: "sack", icon: "good-salt", color: "#c7b98a" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 6 },
          2: { stock: 100, price: 18 },
          3: { stock: 0, price: 20 }
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

  it("does not create a plant for a State where phosphateFertilizer has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);
    expect(getPhosphateFertilizerPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(100);
  });

  it("creates a plant, debits the budget, and consumes Phosphate Rock/Sulfuric Acid once known — but produces no output while industrialSulfuricAcid is not yet demonstrated anywhere", () => {
    setTechnologyProgressForTests([
      { technologyId: "phosphateFertilizer", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);

    const plants = getPhosphateFertilizerPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1 });
    // Same double-debit shape as AcidPlants: one charge to found the plant, one for this year's operation.
    expect(worldContext.pack.states[1].treasury).toBe(100 - PHOSPHATE_FERTILIZER_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 0.5); // Phosphate Rock consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.3); // Sulfuric Acid consumed
    expect(market?.goods[3]?.stock).toBe(0); // no Phosphate Fertilizer output yet

    const trial = getChemistryTrials().find(entry => entry.kind === "phosphateFertilizerPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ status: "running", documentedRuns: 1, operatingYears: 1 });
  });

  it("produces Phosphate Fertilizer once industrialSulfuricAcid is demonstrated somewhere in the world", () => {
    setTechnologyProgressForTests([
      { technologyId: "phosphateFertilizer", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "industrialSulfuricAcid", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(0.2); // trial-role output rate

    const trial = getChemistryTrials().find(entry => entry.kind === "phosphateFertilizerPlant" && entry.stateId === 1);
    expect(trial?.outputsDelivered).toBe(0.2);
  });

  it("reduces utilization and fails the trial run when Phosphate Rock stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.05, price: 6 },
          2: { stock: 100, price: 18 },
          3: { stock: 0, price: 20 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "phosphateFertilizer", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "industrialSulfuricAcid", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);

    const plants = getPhosphateFertilizerPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);

    const trial = getChemistryTrials().find(entry => entry.kind === "phosphateFertilizerPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ documentedRuns: 0, failureCount: 1, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(0); // still no output — the run failed
  });

  it("promotes a trial plant to service once phosphateFertilizer reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "phosphateFertilizer", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);
    expect(getPhosphateFertilizerPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1851 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "phosphateFertilizer", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);
    expect(getPhosphateFertilizerPlants()[0]?.role).toBe("service");
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "phosphateFertilizer", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(true);
    expect(PhosphateFertilizerPlants.settleAnnual()).toBe(false);
  });
});
