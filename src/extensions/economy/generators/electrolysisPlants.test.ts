import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getElectrolysisPlants,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { ELECTROLYSIS_PLANT_BUDGET } from "./chemMedCommon";
import { ElectrolysisPlants } from "./electrolysisPlants";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

describe("ElectrolysisPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1892 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Voltania", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Alumina", tags: [], value: 16, unit: "sack", icon: "good-unknown", color: "#e8e4dc" },
      { i: 2, name: "Coke", tags: [], value: 4, unit: "wain", icon: "good-coal", color: "#2b2b2b" },
      { i: 3, name: "Firebrick", tags: [], value: 6, unit: "wain", icon: "good-clay", color: "#8a4a30" },
      { i: 4, name: "Aluminum", tags: [], value: 34, unit: "bar", icon: "good-unknown", color: "#c7c9cc" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        electricityStock: 1,
        goods: {
          1: { stock: 100, price: 16 },
          2: { stock: 100, price: 4 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 34 }
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
    expect(ElectrolysisPlants.settleAnnual()).toBe(true);
    expect(getElectrolysisPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a plant, debits the budget, consumes Alumina/Coke/Firebrick, and produces Aluminum once known", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ElectrolysisPlants.settleAnnual()).toBe(true);

    const plants = getElectrolysisPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    // Same double-debit shape as SteelConverters: one charge to found the plant, one to operate.
    expect(worldContext.pack.states[1].treasury).toBe(200 - ELECTROLYSIS_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 2); // Alumina consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.4); // Coke consumed
    expect(market?.goods[3]?.stock).toBe(100 - 0.3); // Firebrick consumed
    expect(market?.goods[4]?.stock).toBe(0.1); // trial-role Aluminum output rate
  });

  it("reduces utilization and skips output when Alumina stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        electricityStock: 1,
        goods: {
          1: { stock: 0.2, price: 16 },
          2: { stock: 100, price: 4 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 34 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ElectrolysisPlants.settleAnnual()).toBe(true);

    const plants = getElectrolysisPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);
    expect(plants[0]).toMatchObject({ documentedRuns: 0, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0); // still no output — the run failed
  });

  it("caps utilization by Market.electricityStock even when material inputs are plentiful", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        electricityStock: 0.2,
        goods: {
          1: { stock: 100, price: 16 },
          2: { stock: 100, price: 4 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 34 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ElectrolysisPlants.settleAnnual()).toBe(true);

    const plants = getElectrolysisPlants();
    expect(plants[0]?.utilization).toBe(0.2);
    expect(plants[0]).toMatchObject({ documentedRuns: 0, lastFailureReason: "powerShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    // Material inputs were still fully consumed up to the coverage-limited scale used to compute
    // utilization... but since utilization < 0.5, no Aluminum output is produced.
    expect(market?.goods[4]?.stock).toBe(0);
  });

  it("marks the plant inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = ELECTROLYSIS_PLANT_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ElectrolysisPlants.settleAnnual()).toBe(true);

    const plants = getElectrolysisPlants();
    expect(plants[0]).toMatchObject({ active: false, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial plant to service once electrolyticIndustry reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(ElectrolysisPlants.settleAnnual()).toBe(true);
    expect(getElectrolysisPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1893 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(ElectrolysisPlants.settleAnnual()).toBe(true);
    expect(getElectrolysisPlants()[0]?.role).toBe("service");

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0.1 + 0.4); // trial-year output, then service-role output
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "electrolyticIndustry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(ElectrolysisPlants.settleAnnual()).toBe(true);
    expect(ElectrolysisPlants.settleAnnual()).toBe(false);
  });
});
