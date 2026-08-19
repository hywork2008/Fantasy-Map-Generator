import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getSteelConverterPlants,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { STEEL_CONVERTER_PLANT_BUDGET, SteelConverters } from "./steelConverters";

describe("SteelConvertersModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1856 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Ferrum", removed: false, capital: 1, treasury: 100 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Iron Ingot", tags: [], value: 8, unit: "bar", icon: "good-iron", color: "#8a8a8a" },
      { i: 2, name: "Coke", tags: [], value: 4, unit: "wain", icon: "good-coal", color: "#2b2b2b" },
      { i: 3, name: "Lime", tags: [], value: 3, unit: "sack", icon: "good-stone", color: "#e5e5df" },
      { i: 4, name: "Steel", tags: [], value: 14, unit: "bar", icon: "good-unknown", color: "#7a8490" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 8 },
          2: { stock: 100, price: 4 },
          3: { stock: 100, price: 3 },
          4: { stock: 0, price: 14 }
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

  it("does not create a plant for a State where modernSteelmaking has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(SteelConverters.settleAnnual()).toBe(true);
    expect(getSteelConverterPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(100);
  });

  it("creates a plant, debits the budget, consumes Iron Ingot/Coke/Lime, and produces Steel once known", () => {
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(SteelConverters.settleAnnual()).toBe(true);

    const plants = getSteelConverterPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    // Same double-debit shape as AcidPlants/PhosphateFertilizerPlants: one charge to found the
    // plant, one for this year's operation.
    expect(worldContext.pack.states[1].treasury).toBe(100 - STEEL_CONVERTER_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 3); // Iron Ingot consumed
    expect(market?.goods[2]?.stock).toBe(100 - 1.8); // Coke consumed
    expect(market?.goods[3]?.stock).toBe(100 - 0.6); // Lime consumed
    expect(market?.goods[4]?.stock).toBe(0.6); // trial-role Steel output rate
  });

  it("reduces utilization and skips output when Iron Ingot stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.5, price: 8 },
          2: { stock: 100, price: 4 },
          3: { stock: 100, price: 3 },
          4: { stock: 0, price: 14 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(SteelConverters.settleAnnual()).toBe(true);

    const plants = getSteelConverterPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);
    expect(plants[0]).toMatchObject({ documentedRuns: 0, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0); // still no output — the run failed
  });

  it("marks the plant inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = STEEL_CONVERTER_PLANT_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(SteelConverters.settleAnnual()).toBe(true);

    const plants = getSteelConverterPlants();
    expect(plants[0]).toMatchObject({ active: false, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial plant to service once modernSteelmaking reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(SteelConverters.settleAnnual()).toBe(true);
    expect(getSteelConverterPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1857 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(SteelConverters.settleAnnual()).toBe(true);
    expect(getSteelConverterPlants()[0]?.role).toBe("service");

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0.6 + 2.4); // trial-year output, then service-role output
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "modernSteelmaking", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(SteelConverters.settleAnnual()).toBe(true);
    expect(SteelConverters.settleAnnual()).toBe(false);
  });
});
