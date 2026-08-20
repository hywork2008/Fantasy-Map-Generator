import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getCraftDomainEmploymentRecords,
  getMarkets,
  getPowerStations,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { POWER_STATION_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { POWER_STATION_BASE_CAPACITY, PowerStations } from "./powerStations";

describe("PowerStationsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1880 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false, capital: 1, treasury: 200 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Coal", tags: [], value: 3, unit: "wain", icon: "good-coal", color: "#333" },
      { i: 2, name: "Copper Wire", tags: [], value: 16, unit: "coil", icon: "good-unknown", color: "#c98a4b" },
      { i: 3, name: "Machine Parts", tags: [], value: 18, unit: "crate", icon: "good-unknown", color: "#6d7380" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 3 },
          2: { stock: 100, price: 16 },
          3: { stock: 100, price: 18 }
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

  it("does not create a plant for a State where generatorAndMotor has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(PowerStations.settleAnnual()).toBe(true);
    expect(getPowerStations()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(200);
  });

  it("creates a plant, debits the budget, consumes Coal/Copper Wire/Machine Parts, computes generationCapacity, and grows instruments once known", () => {
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(PowerStations.settleAnnual()).toBe(true);

    const plants = getPowerStations();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    // Trial-role capacity: POWER_STATION_BASE_CAPACITY * 0.25 * utilization(1).
    expect(plants[0]?.generationCapacity).toBe(POWER_STATION_BASE_CAPACITY * 0.25);
    // Same double-debit shape as SteelConverters: one charge to found, one for this year's run.
    expect(worldContext.pack.states[1].treasury).toBe(200 - POWER_STATION_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 4); // Coal consumed
    expect(market?.goods[2]?.stock).toBe(100 - 1); // Copper Wire consumed
    expect(market?.goods[3]?.stock).toBe(100 - 1.5); // Machine Parts consumed

    const instruments = getCraftDomainEmploymentRecords().find(row => row.burgId === 1 && row.domain === "instruments");
    expect(instruments?.workers).toBe(2);
  });

  it("reduces utilization and leaves generationCapacity at 0 when Coal stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.5, price: 3 },
          2: { stock: 100, price: 16 },
          3: { stock: 100, price: 18 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(PowerStations.settleAnnual()).toBe(true);

    const plants = getPowerStations();
    expect(plants[0]?.utilization).toBeLessThan(0.5);
    expect(plants[0]).toMatchObject({
      documentedRuns: 0,
      generationCapacity: 0,
      lastFailureReason: "materialShortage"
    });
  });

  it("marks the plant inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = POWER_STATION_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(PowerStations.settleAnnual()).toBe(true);

    const plants = getPowerStations();
    expect(plants[0]).toMatchObject({ active: false, generationCapacity: 0, lastFailureReason: "fundingCut" });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial plant to service once generatorAndMotor reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(PowerStations.settleAnnual()).toBe(true);
    expect(getPowerStations()[0]?.role).toBe("trial");
    expect(getPowerStations()[0]?.generationCapacity).toBe(POWER_STATION_BASE_CAPACITY * 0.25);

    worldContext.options = { year: 1881 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(PowerStations.settleAnnual()).toBe(true);
    expect(getPowerStations()[0]?.role).toBe("service");
    // Full-scale capacity once promoted to service (role factor 1 instead of 0.25).
    expect(getPowerStations()[0]?.generationCapacity).toBe(POWER_STATION_BASE_CAPACITY);
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(PowerStations.settleAnnual()).toBe(true);
    expect(PowerStations.settleAnnual()).toBe(false);
  });
});
