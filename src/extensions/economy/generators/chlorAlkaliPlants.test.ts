import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getChlorAlkaliPlants,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { CHLOR_ALKALI_PLANT_BUDGET } from "./chemMedCommon";
import { ChlorAlkaliPlants } from "./chlorAlkaliPlants";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

describe("ChlorAlkaliPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1892 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Voltania", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Salt", tags: [], value: 3, unit: "wain", icon: "good-unknown", color: "#e0e0e0" },
      { i: 2, name: "Firebrick", tags: [], value: 6, unit: "wain", icon: "good-clay", color: "#8a4a30" },
      { i: 3, name: "Chlorine", tags: [], value: 20, unit: "barrel", icon: "good-unknown", color: "#c9e066" },
      { i: 4, name: "Caustic Soda", tags: [], value: 13, unit: "barrel", icon: "good-unknown", color: "#eae6da" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        electricityStock: 1,
        goods: {
          1: { stock: 100, price: 3 },
          2: { stock: 100, price: 6 },
          3: { stock: 0, price: 20 },
          4: { stock: 0, price: 13 }
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

  it("does not create a plant for a State where electrolyticIndustry has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);
    expect(getChlorAlkaliPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a plant, consumes Salt/Firebrick, and produces both Chlorine and Caustic Soda together once known and both underlying Good technologies are demonstrated", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);

    const plants = getChlorAlkaliPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    // Same double-debit shape as ElectrolysisPlants: one charge to found, one to operate.
    expect(worldContext.pack.states[1].treasury).toBe(200 - CHLOR_ALKALI_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 0.5); // Salt consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.05); // Firebrick consumed
    expect(market?.goods[3]?.stock).toBe(0.15); // trial-role Chlorine output
    expect(market?.goods[4]?.stock).toBe(0.17); // trial-role Caustic Soda output
    // Co-product mass ratio Cl2:NaOH ~= 1:1.13 — neither output fires alone here.
    expect((market?.goods[4]?.stock ?? 0) / (market?.goods[3]?.stock ?? 1)).toBeCloseTo(1.13, 1);
  });

  it("runs the reaction but withholds Chlorine output when catalyticChemistry has not been demonstrated anywhere, while Caustic Soda still ships", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
      // catalyticChemistry intentionally absent: electrolyticIndustry's own prerequisites
      // (practicalElectrochemistry/highPressureChemicalApparatus/powerGrid) don't include it, so
      // this is a reachable world state, not a contrived one.
    ]);

    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);

    const plants = getChlorAlkaliPlants();
    expect(plants[0]).toMatchObject({ utilization: 1, documentedRuns: 1 });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(0); // Chlorine withheld — its own Good gate isn't open
    expect(market?.goods[4]?.stock).toBe(0.17); // Caustic Soda ships independently
  });

  it("reduces utilization and skips both outputs when Salt stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        electricityStock: 1,
        goods: {
          1: { stock: 0.05, price: 3 },
          2: { stock: 100, price: 6 },
          3: { stock: 0, price: 20 },
          4: { stock: 0, price: 13 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);

    const plants = getChlorAlkaliPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);
    expect(plants[0]).toMatchObject({ documentedRuns: 0, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(0);
    expect(market?.goods[4]?.stock).toBe(0);
  });

  it("caps utilization by Market.electricityStock even when material inputs are plentiful", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        electricityStock: 0.2,
        goods: {
          1: { stock: 100, price: 3 },
          2: { stock: 100, price: 6 },
          3: { stock: 0, price: 20 },
          4: { stock: 0, price: 13 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);

    const plants = getChlorAlkaliPlants();
    expect(plants[0]?.utilization).toBe(0.2);
    expect(plants[0]).toMatchObject({ documentedRuns: 0, lastFailureReason: "powerShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(0);
    expect(market?.goods[4]?.stock).toBe(0);
  });

  it("marks the plant inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = CHLOR_ALKALI_PLANT_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);

    const plants = getChlorAlkaliPlants();
    expect(plants[0]).toMatchObject({ active: false, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial plant to service once electrolyticIndustry reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);
    expect(getChlorAlkaliPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1893 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);
    expect(getChlorAlkaliPlants()[0]?.role).toBe("service");

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[3]?.stock).toBe(0.15 + 0.6); // trial-year output, then service-role output
    // 0.17 + 0.68 as a raw JS float sum lands on 0.8500000000000001, not the rn(...,4)-rounded
    // 0.85 the module actually stores — compare against the rounded literal instead.
    expect(market?.goods[4]?.stock).toBe(0.85);
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(ChlorAlkaliPlants.settleAnnual()).toBe(true);
    expect(ChlorAlkaliPlants.settleAnnual()).toBe(false);
  });
});
