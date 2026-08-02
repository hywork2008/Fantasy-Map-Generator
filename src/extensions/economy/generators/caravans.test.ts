import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getCaravans,
  getDeals,
  getMarkets,
  initEconomyContext,
  setCaravans
} from "../economyContext";
import { CaravanMovement } from "./caravanMovement";
import { bakeCaravanTravelLegs, Caravans, getCaravanTravelTime } from "./caravans";
import type { Good } from "./goods-generator";
import type { Caravan } from "./marketTypes";
import { TradeAnimation } from "./trade-animation";

describe("caravan viability", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = {
      goods: [
        {
          i: 0,
          name: "Wood",
          value: 1,
          tags: ["construction"],
          unit: "pile",
          icon: "wood",
          color: "#000"
        } as Good
      ],
      markets: [
        { i: 0, centerBurgId: 0, color: "#000", goods: {} },
        { i: 1, centerBurgId: 2, color: "#000", goods: {} }
      ],
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, cell: 1, x: 0, y: 0 } as unknown as Burg,
        { i: 2, cell: 2, x: 2295, y: 0 } as unknown as Burg
      ],
      deals: [
        { i: 0, seller: 1, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 0.2, price: 1, tax: 0 }
      ],
      caravans: []
    } as unknown as PackedGraph;
    vi.spyOn(TradeAnimation, "findRoutePath").mockReturnValue({
      points: [
        [0, 0],
        [2295, 0]
      ],
      segments: [
        {
          type: "land",
          points: [
            [0, 0],
            [2295, 0]
          ]
        }
      ]
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEconomyContext();
  });

  it("does not animate an uneconomic long-distance burg-to-market delivery", () => {
    Caravans.spawnFromDeals(getDeals());

    expect(getCaravans()).toEqual([]);
  });
});

describe("caravan loading accumulation", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = {
      goods: [
        {
          i: 0,
          name: "Silk",
          value: 40,
          tags: ["luxury"],
          unit: "bolt",
          icon: "silk",
          color: "#f0f",
          cargo: { cargoSlotsPerUnit: 1, handlingClass: "crated" },
          trade: { weight: 1, bulk: 1, rarity: 4, distancePremium: 2, timeValueTrend: 0, durability: 4, lossRisk: 1 }
        } as Good
      ],
      markets: [
        {
          i: 0,
          centerBurgId: 1,
          color: "#000",
          goods: { 0: { stock: 100, price: 40 } }
        },
        {
          i: 1,
          centerBurgId: 2,
          color: "#000",
          goods: { 0: { stock: 0, price: 60 } }
        }
      ],
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, cell: 1, x: 0, y: 0, market: 0 } as unknown as Burg,
        { i: 2, cell: 2, x: 100, y: 0, market: 1 } as unknown as Burg
      ],
      deals: [
        {
          i: 0,
          seller: 0,
          sellerType: "market",
          buyer: 1,
          buyerType: "market",
          good: 0,
          units: 2,
          price: 50,
          tax: 0
        }
      ],
      caravans: [],
      merchantTransportLedgers: [],
      transportReservations: []
    } as unknown as PackedGraph;
    vi.spyOn(TradeAnimation, "findRoutePath").mockReturnValue({
      points: [
        [0, 0],
        [100, 0]
      ],
      segments: [
        {
          type: "land",
          points: [
            [0, 0],
            [100, 0]
          ]
        }
      ]
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEconomyContext();
  });

  it("holds a thin market-to-market load in loading until max wait and then cancels below min fill", () => {
    Caravans.spawnFromDeals(getDeals());

    const loading = getCaravans().filter(c => c.state === "loading");
    // 2 silk slots on a wagon-scale plan (~80–240) is well under 20% min sail.
    expect(loading.length).toBeGreaterThanOrEqual(1);
    expect(getCaravans().every(c => c.state !== "transit")).toBe(true);

    const originStockBefore = getMarkets()[0].goods[0].stock;
    // Exceed land max wait (14 days) with a thin hold → cancel and restore exporter stock.
    const result = Caravans.tick(15);

    expect(result.lost.length).toBeGreaterThanOrEqual(1);
    expect(getCaravans()).toEqual([]);
    expect(getMarkets()[0].goods[0].stock).toBeCloseTo(originStockBefore + 2, 5);
  });

  it("departs immediately when the first load already meets target utilization", () => {
    getDeals()[0].units = 200;
    Caravans.spawnFromDeals(getDeals());

    const transit = getCaravans().filter(c => c.state === "transit");
    expect(transit.length).toBeGreaterThanOrEqual(1);
    expect(transit[0].transportReservationId).toBeDefined();
  });
});

describe("caravan arrival volume tracking", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = {
      burgs: [{ i: 0 } as unknown as Burg, { i: 1, cell: 1, x: 0, y: 0, market: 1 } as unknown as Burg],
      markets: [{ i: 1, centerBurgId: 1, color: "#000", goods: {}, caravanArrivalVolume: 40 }],
      caravans: [],
      states: []
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEconomyContext();
  });

  it("decays a market's existing volume and adds newly delivered cargo units on arrival", () => {
    setCaravans([
      {
        i: 1,
        seller: 0,
        sellerType: "burg",
        buyer: 1,
        buyerType: "market",
        payload: [],
        units: 15,
        value: 0,
        draftAnimalId: "horse",
        routeSegments: [],
        totalDistance: 0,
        currentDistance: 0,
        travelLegs: [{ endKm: 0, speedKmPerDay: 1 }],
        state: "transit"
      } as Caravan
    ]);

    const result = Caravans.tick(1);

    expect(result.arrived).toHaveLength(1);
    // 40 decays slightly over one day, then +15 newly delivered units.
    const volume = getMarkets()[0].caravanArrivalVolume ?? 0;
    expect(volume).toBeGreaterThan(15);
    expect(volume).toBeLessThan(40 + 15);
  });

  it("resolves the delivery market through the destination Burg for burg-type buyers", () => {
    setCaravans([
      {
        i: 1,
        seller: 0,
        sellerType: "burg",
        buyer: 1,
        buyerType: "burg",
        payload: [],
        units: 8,
        value: 0,
        draftAnimalId: "horse",
        routeSegments: [],
        totalDistance: 0,
        currentDistance: 0,
        travelLegs: [{ endKm: 0, speedKmPerDay: 1 }],
        state: "transit"
      } as Caravan
    ]);

    Caravans.tick(1);

    expect(getMarkets()[0].caravanArrivalVolume ?? 0).toBeGreaterThan(40);
  });

  it("decays volume toward zero even when no caravans are in transit", () => {
    Caravans.tick(120);

    expect(getMarkets()[0].caravanArrivalVolume ?? 0).toBeLessThan(40);
  });
});

describe("bakeCaravanTravelLegs", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    CaravanMovement.configure({
      landKmPerDay: 32,
      seaKmPerDay: 60,
      seaCurrentStrength: 0,
      gradeEffectStrength: 1,
      merchantRoutePreference: "preferSpeed"
    });
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("slows land hops on steep grade while keeping planar endKm", () => {
    const movement = CaravanMovement.getOptions();
    // 15% grade over 32 km → minMultiplier speed
    const heights = [20, 20 + 150 * 32];
    const legs = bakeCaravanTravelLegs(
      [
        {
          type: "land",
          points: [
            [0, 0, 0],
            [32, 0, 1]
          ]
        }
      ],
      1,
      "horse",
      movement,
      0,
      heights,
      1
    );
    expect(legs).toHaveLength(1);
    expect(legs[0].endKm).toBeCloseTo(32, 5);
    // grade → minMultiplier 0.15, and hard ascent window stacks passWindowMultiplier 0.5
    // → speed 32 * 0.15 * 0.5 = 2.4
    expect(legs[0].speedKmPerDay).toBeLessThan(32);
    expect(legs[0].speedKmPerDay).toBeCloseTo(2.4, 5);
  });

  it("uses full land speed when gradeEffectStrength is 0", () => {
    CaravanMovement.configure({ gradeEffectStrength: 0 });
    const movement = CaravanMovement.getOptions();
    const heights = [20, 20 + 150 * 32];
    const legs = bakeCaravanTravelLegs(
      [
        {
          type: "land",
          points: [
            [0, 0, 0],
            [32, 0, 1]
          ]
        }
      ],
      1,
      "horse",
      movement,
      0,
      heights,
      1
    );
    expect(legs[0].speedKmPerDay).toBeCloseTo(32, 5);
  });
});

describe("getCaravanTravelTime", () => {
  it("reports remaining and total days from the caravan's baked travel legs", () => {
    const caravan = {
      currentDistance: 30,
      travelLegs: [
        { endKm: 20, speedKmPerDay: 10 },
        { endKm: 50, speedKmPerDay: 15 }
      ]
    } as Caravan;

    expect(getCaravanTravelTime(caravan)).toEqual({ totalDays: 4, remainingDays: 2 });
  });
});
