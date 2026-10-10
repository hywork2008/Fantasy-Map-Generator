import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getSimulationYear,
  initEconomyContext,
  setBurgWholesaleInventories,
  setCraftDomainEmploymentRecords,
  setGoods,
  setGuildChapters,
  setGuildKnowledgeStocks,
  setInnFacilities,
  setMarkets,
  setQuarryOperations,
  setTradeCorridors
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { buildBurgSiteEconomy, projectBurgGuilds, projectLodging } from "./burgSiteEconomy";
import type { Good } from "./goodsGeneratorTypes";
import type { Market } from "./marketTypes";
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

describe("projectLodging", () => {
  it("sends wayside inns and caravanserais to the gate and leaves town lodging out", () => {
    expect(
      projectLodging(
        [
          {
            burgId: 1,
            innClass: "wayside",
            buildingCount: 1,
            stableSpaces: 4,
            condition: 0.8
          },
          {
            burgId: 1,
            innClass: "market",
            buildingCount: 2,
            stableSpaces: 8,
            condition: 0.9
          },
          {
            burgId: 1,
            innClass: "caravanserai",
            buildingCount: 1,
            stableSpaces: 36,
            condition: 0.7
          },
          {
            burgId: 2,
            innClass: "wayside",
            buildingCount: 1,
            stableSpaces: 3,
            condition: 1
          }
        ],
        1
      )
    ).toEqual([
      { kind: "inn", count: 1, scale: 0.8, stableSpaces: 4 },
      { kind: "caravanserai", count: 1, scale: 0.7, stableSpaces: 36 }
    ]);
  });
});

describe("buildBurgSiteEconomy", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { currentYear: 1348 } } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.pack = { burgs: [{}, { i: 1, cell: 0 }] } as unknown as PackedGraph;
    setEconomyCalibrationState({ applyCalibration: false });
    setMarkets([]);
    setGoods([]);
    setBurgWholesaleInventories([]);
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
    expect(profile?.facilities).toEqual([]);
  });

  it("projects the burg's wayside inn onto the profile", () => {
    setInnFacilities([
      {
        burgId: 1,
        innClass: "wayside",
        buildingCount: 1,
        privateRooms: 1,
        sharedBeds: 6,
        privateBeds: 1,
        commonSeats: 12,
        stableSpaces: 4,
        condition: 0.8
      },
      {
        burgId: 1,
        innClass: "waterside",
        buildingCount: 1,
        privateRooms: 3,
        sharedBeds: 10,
        privateBeds: 3,
        commonSeats: 26,
        stableSpaces: 4,
        condition: 0.9
      }
    ]);
    expect(buildBurgSiteEconomy(1)?.facilities).toEqual([{ kind: "inn", count: 1, scale: 0.8, stableSpaces: 4 }]);
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

  it("stores a market center's grain from the ledger ages, not the wholesale mirror", () => {
    worldContext.pack.burgs = [
      {},
      { i: 1, cell: 0, name: "Paris", x: 100, y: 200, population: 10, walls: 1 },
      { i: 4, cell: 1, name: "Tegrad", x: 100, y: 100 }
    ] as unknown as PackedGraph["burgs"];
    setGoods([
      { i: 1, name: "Maize", tags: ["food", "stapleCrop"], unit: "wain", value: 1 },
      { i: 2, name: "Wood", tags: ["construction", "fuel"], unit: "pile", value: 1 },
      { i: 3, name: "Grain", tags: ["stapleFood"], unit: "wain", value: 1 }
    ] as Good[]);
    setBurgWholesaleInventories([{ burgId: 1, marketId: 1, goods: { 1: 9999, 2: 2, 3: 50_000 } }]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: {},
        foodLedger: {
          stapleCropInventories: {
            1: { age0: 10, age1: 0, age2: 0, age0UnitCost: 0, age1UnitCost: 0, age2UnitCost: 0, overflow: 8000 }
          }
        }
      } as Market
    ]);
    const corridor: TradeCorridor = {
      burgA: 1,
      burgB: 4,
      departures: 2,
      cargoSlots: 8,
      value: 1,
      byMode: { land: 0, river: 8, sea: 0 },
      meanTravelDays: 4,
      idealTravelDays: 4,
      threat: 0,
      routeIds: [],
      ferryCrossings: 0,
      routeHits: {},
      goodsSlots: { 2: 8 }
    };
    setTradeCorridors([corridor]);
    expect(buildBurgSiteEconomy(1)?.storage).toEqual([
      { form: "timberYard", areaM2: 12, mainGoods: ["Wood"], inflowAzimuthDeg: 0, waterborne: true },
      { form: "granary", areaM2: 12, mainGoods: ["Maize"], inflowAzimuthDeg: null, waterborne: false }
    ]);
  });

  it("adds the public granary and points land yards at the forest and the quarry", () => {
    const biomes = worldContext.biomesData;
    worldContext.biomesData = { tags: [[], ["forest"]] } as typeof biomes;
    worldContext.pack = {
      burgs: [{}, { i: 1, cell: 0, name: "Quarry", x: 0, y: 0, population: 10, publicWorks: { granary: 1 } }],
      cells: {
        c: [[1], [0]],
        v: [
          [0, 1, 2],
          [3, 4, 5]
        ],
        biomeCode: [0, 1],
        h: [10, 55]
      },
      vertices: {
        x: [0, 1, 0, 10, 12, 11],
        y: [0, 0, 1, 0, 1, -1]
      }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Wood", tags: ["construction"], unit: "pile", value: 1 },
      { i: 2, name: "Stone", tags: ["construction", "mineral"], unit: "lot", value: 1 }
    ] as Good[]);
    setBurgWholesaleInventories([{ burgId: 1, marketId: 1, goods: { 1: 2, 2: 2 } }]);
    setQuarryOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        quarryWorkers: 3,
        stoneRatio: 0.4,
        marbleRatio: 0,
        annualOutputTons: {},
        active: true
      }
    ]);
    try {
      const storage = buildBurgSiteEconomy(1)?.storage ?? [];
      const timber = storage.find(yard => yard.form === "timberYard");
      const stone = storage.find(yard => yard.form === "stoneYard");
      const granary = storage.find(yard => yard.origin === "publicWorks");
      expect(timber).toMatchObject({ areaM2: 12, waterborne: false, supplyAzimuthDeg: 90 });
      expect(stone).toMatchObject({ areaM2: 8, waterborne: false, supplyAzimuthDeg: 90 });
      expect(granary).toMatchObject({ form: "granary", areaM2: 141, origin: "publicWorks" });
    } finally {
      worldContext.biomesData = biomes;
      setQuarryOperations([]);
    }
  });

  it("returns null before the economy context exists", () => {
    clearEconomyContext();
    expect(buildBurgSiteEconomy(1)).toBeNull();
  });
});
