import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getCaravans, getDeals, initEconomyContext } from "../economyContext";
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
