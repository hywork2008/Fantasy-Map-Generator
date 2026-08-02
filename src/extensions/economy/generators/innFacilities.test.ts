import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getInnConstructionOrders,
  getInnFacilities,
  initEconomyContext,
  setConstructionOperations,
  setGoods,
  setInnFacilities,
  setMarkets
} from "../economyContext";
import {
  generateInnFacilitiesForBurgs,
  getInnFacilityTotals,
  InnFacilities,
  reconcileInnFacilities
} from "./innFacilities";
import { Markets } from "./markets-generator";

function burg(overrides: Partial<Burg>): Burg {
  return {
    i: 1,
    cell: 0,
    x: 0,
    y: 0,
    population: 1,
    ...overrides
  };
}

describe("generateInnFacilitiesForBurgs", () => {
  const baseArgs = {
    marketBurgIds: new Set([1]),
    populationRate: 1000,
    urbanization: 1,
    seed: "inn-test"
  };

  it("is deterministic and creates aggregate building-backed capacity", () => {
    const burgs = [undefined, burg({ i: 1, market: 1, population: 10 })];
    const first = generateInnFacilitiesForBurgs({ ...baseArgs, burgs });
    const second = generateInnFacilitiesForBurgs({ ...baseArgs, burgs });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    for (const facility of first) {
      expect(facility.buildingCount).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(facility.buildingCount)).toBe(true);
      expect(facility.privateBeds + facility.sharedBeds).toBeGreaterThan(0);
      expect(facility.condition).toBeGreaterThanOrEqual(0);
      expect(facility.condition).toBeLessThanOrEqual(1);
    }
  });

  it("adds port, capital, and caravanserai facilities while excluding forts", () => {
    const burgs = [
      undefined,
      burg({ i: 1, market: 1, port: 1, capital: 1, population: 40 }),
      burg({ i: 2, group: "caravanserai", population: 2 }),
      burg({ i: 3, group: "fort", market: 3, port: 1, population: 40 })
    ];
    const facilities = generateInnFacilitiesForBurgs({
      ...baseArgs,
      burgs,
      marketBurgIds: new Set([1, 3])
    });

    expect(facilities.some(facility => facility.burgId === 1 && facility.innClass === "waterside")).toBe(true);
    expect(facilities.some(facility => facility.burgId === 1 && facility.innClass === "grand")).toBe(true);
    expect(facilities.some(facility => facility.burgId === 2 && facility.innClass === "caravanserai")).toBe(true);
    expect(facilities.some(facility => facility.burgId === 3)).toBe(false);
  });

  it("totals buildings, rooms, beds, common seats, and stable spaces separately", () => {
    const totals = getInnFacilityTotals([
      {
        burgId: 1,
        innClass: "market",
        buildingCount: 2,
        privateRooms: 4,
        privateBeds: 8,
        sharedBeds: 12,
        commonSeats: 30,
        stableSpaces: 7,
        condition: 0.8
      },
      {
        burgId: 1,
        innClass: "waterside",
        buildingCount: 1,
        privateRooms: 3,
        privateBeds: 5,
        sharedBeds: 10,
        commonSeats: 20,
        stableSpaces: 2,
        condition: 0.9
      }
    ]);

    expect(totals).toEqual({ buildingCount: 3, privateRooms: 7, beds: 35, commonSeats: 50, stableSpaces: 9 });
  });

  it("only adds one completed inn building at a time and declines excess stock slowly", () => {
    const current = {
      burgId: 1,
      innClass: "market" as const,
      buildingCount: 1,
      privateRooms: 2,
      privateBeds: 3,
      sharedBeds: 8,
      commonSeats: 20,
      stableSpaces: 4,
      condition: 0.8
    };
    const desired = {
      ...current,
      buildingCount: 3,
      privateRooms: 9,
      privateBeds: 12,
      sharedBeds: 30,
      commonSeats: 60,
      stableSpaces: 15
    };

    expect(
      reconcileInnFacilities({ current: [current], desired: [desired], completedOrderKeys: new Set(["1:market"]) })[0]
    ).toMatchObject({
      buildingCount: 2,
      privateRooms: 6,
      sharedBeds: 20
    });
    expect(
      reconcileInnFacilities({
        current: [{ ...current, buildingCount: 2, condition: 0.5 }],
        desired: [],
        completedOrderKeys: new Set()
      })[0]
    ).toMatchObject({
      buildingCount: 2,
      condition: 0.45
    });
  });
});

describe("InnFacilities lifecycle", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.seed = "inn-lifecycle";
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.pack = {
      burgs: [undefined, burg({ i: 1, market: 1, population: 4 })]
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#000", goods: {} }]);
  });

  afterEach(() => clearEconomyContext());

  it("writes only its own Economy facility ledger and clears it", () => {
    InnFacilities.generate();
    expect(getInnFacilities().length).toBeGreaterThan(0);
    InnFacilities.clear();
    expect(getInnFacilities()).toEqual([]);
  });

  it("completes an additional building through a separate material-backed work order", () => {
    worldContext.options.year = 100;
    worldContext.pack = {
      burgs: [undefined, burg({ i: 1, market: 1, population: 10, group: "town" })]
    } as unknown as PackedGraph;
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: { 1: { stock: 1000, price: 1 }, 2: { stock: 1000, price: 1 } }
      }
    ]);
    Markets.sync();
    setGoods([
      { i: 1, name: "Wood", tags: ["construction"], value: 1, unit: "pile", icon: "wood", color: "#000" },
      { i: 2, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "stone", color: "#000" }
    ]);
    setConstructionOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        masonWorkers: 10,
        carpenterWorkers: 10,
        buildingStock: 0,
        dwellingStock: 0,
        hasQuarryAccess: true,
        active: true
      }
    ]);
    setInnFacilities([
      {
        burgId: 1,
        innClass: "market",
        buildingCount: 1,
        privateRooms: 2,
        privateBeds: 3,
        sharedBeds: 8,
        commonSeats: 20,
        stableSpaces: 4,
        condition: 0.8
      }
    ]);

    expect(InnFacilities.settleAnnual()).toBe(true);
    expect(getInnFacilities().find(facility => facility.innClass === "market")?.buildingCount).toBe(2);
    expect(getInnConstructionOrders()).toEqual([]);
    expect(worldContext.pack.markets?.[0]?.goods[1]?.stock).toBeLessThan(1000);
    expect(InnFacilities.settleAnnual()).toBe(false);
  });
});
