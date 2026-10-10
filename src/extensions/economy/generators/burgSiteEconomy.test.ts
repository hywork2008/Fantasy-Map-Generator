import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getSimulationYear,
  initEconomyContext,
  setCraftDomainEmploymentRecords,
  setGuildChapters,
  setGuildKnowledgeStocks,
  setMarkets,
  setTradeCorridors
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { buildBurgSiteEconomy, projectBurgGuilds } from "./burgSiteEconomy";
import type { TradeCorridor } from "./tradeCorridorLedger";

describe("projectBurgGuilds", () => {
  it("keeps a formal hall when the burg has no craftsmen", () => {
    const guilds = projectBurgGuilds({
      burgId: 4,
      populationRate: 1000,
      chapters: [{ domain: "glassware", foundedYear: 1310, suitability: 0.4 }],
      practitioners: [],
      stocks: []
    });
    expect(guilds).toEqual([
      { domain: "glassware", status: "chapter", practitioners: 0, prestige: 0, foundedYear: 1310 }
    ]);
  });

  it("converts population points into people and ranks prestige against the world", () => {
    const guilds = projectBurgGuilds({
      burgId: 2,
      populationRate: 1000,
      chapters: [{ domain: "metallurgy", foundedYear: 1100, suitability: 0.2 }],
      practitioners: [{ domain: "metallurgy", workers: 0.003 }],
      stocks: [
        { burgId: 2, domain: "metallurgy", stock: 0.8, treasury: 0 },
        { burgId: 9, domain: "metallurgy", stock: 0.2, treasury: 0 }
      ]
    });
    expect(guilds[0].practitioners).toBe(3);
    expect(guilds[0].prestige).toBe(1);
  });

  it("omits an informal stock that has no craftsmen and no hall", () => {
    expect(
      projectBurgGuilds({
        burgId: 1,
        populationRate: 1000,
        chapters: [],
        practitioners: [],
        stocks: [{ burgId: 1, domain: "leather", stock: 0.4, treasury: 10 }]
      })
    ).toEqual([]);
  });
});

describe("buildBurgSiteEconomy", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { currentYear: 1348 } } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.pack = { burgs: [{}, { i: 1, cell: 0 }] } as unknown as PackedGraph;
    setEconomyCalibrationState({ applyCalibration: false });
    setMarkets([]);
    setGuildChapters([]);
    setGuildKnowledgeStocks([]);
    setCraftDomainEmploymentRecords([]);
  });

  afterEach(() => clearEconomyContext());

  it("publishes a chapter whose employment record is missing", () => {
    setGuildChapters([{ burgId: 1, domain: "textiles", foundedYear: 1288, status: "chapter", suitability: 0.55 }]);
    const profile = buildBurgSiteEconomy(1);
    expect(getSimulationYear()).toBe(1348);
    expect(profile?.year).toBe(1348);
    expect(profile?.guilds).toEqual([
      { domain: "textiles", status: "chapter", practitioners: 0, prestige: 0, foundedYear: 1288 }
    ]);
    expect(profile?.tradePartners).toEqual([]);
  });

  it("names the busiest corridor partner", () => {
    worldContext.pack.burgs = [
      {},
      { i: 1, cell: 0, name: "Paris" },
      { i: 4, cell: 1, name: "Tegrad" }
    ] as unknown as PackedGraph["burgs"];
    const corridor: TradeCorridor = {
      burgA: 1,
      burgB: 4,
      departures: 3,
      cargoSlots: 18,
      value: 6,
      byMode: { land: 0, river: 0, sea: 18 },
      meanTravelDays: 9,
      idealTravelDays: 9,
      threat: 0,
      routeIds: [],
      ferryCrossings: 0,
      routeHits: {},
      goodsSlots: {}
    };
    setTradeCorridors([corridor]);
    expect(buildBurgSiteEconomy(1)?.tradePartners).toEqual([
      { burgId: 4, name: "Tegrad", annualSlots: 18, mode: "sea", routeId: null, mainGoods: [] }
    ]);
  });

  it("returns null before the economy context exists", () => {
    clearEconomyContext();
    expect(buildBurgSiteEconomy(1)).toBeNull();
  });
});
