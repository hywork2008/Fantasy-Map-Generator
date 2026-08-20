import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext, setMarkets, setPowerStations } from "../economyContext";
import {
  ELECTRICITY_ADOPTION_RATE,
  PowerGridInvestment,
  TARGET_ELECTRICITY_PER_1000_POPULATION
} from "./powerGridInvestment";

describe("PowerGridInvestmentModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1890 } as typeof worldContext.options;
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("raises electricityStock from same-market PowerStation capacity even without powerGrid adopted", () => {
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, population: 1000, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    // Exactly matches requestedUnits (1000/1000 * 0.4) for full coverage this year.
    setPowerStations([
      {
        burgId: 1,
        stateId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 5,
        lastFundedYear: 1889,
        generationCapacity: TARGET_ELECTRICITY_PER_1000_POPULATION
      }
    ]);

    expect(PowerGridInvestment.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.electricityStock).toBeCloseTo(ELECTRICITY_ADOPTION_RATE, 5);
  });

  it("decays electricityStock toward zero for a market with no population", () => {
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, population: 0, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {}, electricityStock: 0.5 }]);
    setPowerStations([]);

    expect(PowerGridInvestment.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.electricityStock).toBeCloseTo(0.5 * (1 - ELECTRICITY_ADOPTION_RATE), 5);
  });

  it("does not pool State-wide PowerStation capacity before powerGrid is adopted, but does after", () => {
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false }],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, market: 1, population: 1000, removed: false },
        { i: 2, state: 1, market: 2, population: 1000, removed: false }
      ]
    } as unknown as PackedGraph;
    setMarkets([
      { i: 1, centerBurgId: 1, color: "#111", goods: {} },
      { i: 2, centerBurgId: 2, color: "#222", goods: {} }
    ]);
    // A single plant sits only in market 1's burg, but its capacity (0.8) is double what market 1
    // alone needs (0.4) — enough to fully cover both markets once pooled State-wide.
    setPowerStations([
      {
        burgId: 1,
        stateId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 5,
        lastFundedYear: 1889,
        generationCapacity: 2 * TARGET_ELECTRICITY_PER_1000_POPULATION
      }
    ]);
    setTechnologyProgressForTests([]); // powerGrid stays "locked" -> not adopted

    expect(PowerGridInvestment.settleAnnual()).toBe(true);
    // getMarkets() returns live references, not snapshots — read the numeric values out now so
    // they are not silently mutated by the second settleAnnual() call below.
    const market1BeforeStock = getMarkets().find(entry => entry.i === 1)?.electricityStock ?? 0;
    const market2BeforeStock = getMarkets().find(entry => entry.i === 2)?.electricityStock ?? 0;
    expect(market1BeforeStock).toBeCloseTo(ELECTRICITY_ADOPTION_RATE, 5); // fully covered alone
    expect(market2BeforeStock).toBeCloseTo(0, 5); // no PowerStation of its own

    worldContext.options = { year: 1891 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "powerGrid", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);

    expect(PowerGridInvestment.settleAnnual()).toBe(true);
    const market1AfterStock = getMarkets().find(entry => entry.i === 1)?.electricityStock ?? 0;
    const market2AfterStock = getMarkets().find(entry => entry.i === 2)?.electricityStock ?? 0;
    // Population-weighted 50/50 split of the 0.8 pool now covers both markets fully — market 1
    // was already fully covered alone, so its rate of growth is unaffected; market 2, which had no
    // PowerStation of its own, now gains real coverage for the first time.
    expect(market1AfterStock).toBeGreaterThan(0);
    expect(market2AfterStock).toBeGreaterThan(market2BeforeStock);
  });

  it("does not touch market.marketTreasury", () => {
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, population: 1000, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {},
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    setPowerStations([
      {
        burgId: 1,
        stateId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 5,
        lastFundedYear: 1889,
        generationCapacity: TARGET_ELECTRICITY_PER_1000_POPULATION
      }
    ]);

    PowerGridInvestment.settleAnnual();

    expect(getMarkets()[0]?.marketTreasury?.balance).toBe(1000);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, population: 1000, removed: false }]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setPowerStations([]);

    expect(PowerGridInvestment.settleAnnual()).toBe(true);
    expect(PowerGridInvestment.settleAnnual()).toBe(false);
  });
});
