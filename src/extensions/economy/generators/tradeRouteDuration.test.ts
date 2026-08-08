import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { CaravanMovement } from "./caravanMovement";
import {
  getCaravanMaintenanceCost,
  getGoodMaxTradeDurationDays,
  getNetTradeProfit,
  isGoodTradePermitted
} from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, calculateRouteDurationFromDistances } from "./tradeRouteDuration";

describe("trade route duration and viability", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = {
      cells: { h: [20, 20, 20, 20] }
    } as unknown as PackedGraph;
    // Isolate from user localStorage / grade defaults for legacy duration expectations.
    CaravanMovement.configure({
      landKmPerDay: 32,
      seaKmPerDay: 60,
      riverKmPerDay: 72,
      seaCurrentStrength: 0,
      gradeEffectStrength: 0,
      merchantRoutePreference: "preferSpeed"
    });
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("uses land and sea speeds plus a two-day port transfer penalty", () => {
    expect(
      calculateRouteDurationDays(
        [
          {
            type: "land",
            points: [
              [0, 0],
              [32, 0]
            ]
          },
          {
            type: "water",
            points: [
              [32, 0],
              [32, 60]
            ]
          }
        ],
        1
      )
    ).toBe(4);
  });

  it("uses the independent downstream-river speed", () => {
    expect(
      calculateRouteDurationDays(
        [
          {
            type: "river",
            points: [
              [0, 0],
              [72, 0]
            ]
          }
        ],
        1
      )
    ).toBe(1);
  });

  it("includes river distance in graph-based opportunity estimates", () => {
    expect(calculateRouteDurationFromDistances(0, 0, 0, 72)).toBe(1);
  });

  it("increases land duration when grade effect is on and cells climb", () => {
    worldContext.pack = {
      cells: { h: [20, 170] }
    } as unknown as PackedGraph;
    CaravanMovement.configure({ gradeEffectStrength: 1 });

    const planar = calculateRouteDurationDays(
      [
        {
          type: "land",
          points: [
            [0, 0],
            [32, 0]
          ]
        }
      ],
      1
    );
    // Without cells → planar. With cells + 15% grade over 1 km → ceil(1/(32*0.15)) = 1 still...
    // Use a longer hard climb so ceil differs: 32 km at minMultiplier 0.15 ⇒ 32/4.8 ≈ 6.67 → 7 days.
    worldContext.pack = {
      cells: { h: [20, 20 + 150 * 32] } // rise 150*32 m over 32 km ⇒ grade 0.15
    } as unknown as PackedGraph;
    const graded = calculateRouteDurationDays(
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
      { heightExponent: 1 }
    );
    expect(planar).toBe(1);
    expect(graded).toBeGreaterThan(planar);
  });

  it("rejects long-distance low-value cargo while allowing valuable compact cargo", () => {
    const lowValueCargo = {
      i: 1,
      name: "Wood",
      value: 1,
      tags: ["construction"],
      unit: "pile",
      icon: "wood",
      color: "#000"
    };
    const valuableCargo = {
      ...lowValueCargo,
      i: 2,
      name: "Silk",
      value: 10,
      tags: ["luxury"]
    };

    expect(getGoodMaxTradeDurationDays(lowValueCargo)).toBeLessThan(10);
    expect(isGoodTradePermitted(lowValueCargo, 10)).toBe(false);
    expect(isGoodTradePermitted(valuableCargo, 10)).toBe(true);
  });

  it("permits sea-only cargo only on water-only routes", () => {
    const ship = {
      i: 1,
      name: "Sloop",
      value: 80,
      seaOnly: true,
      tags: ["naval"],
      unit: "ship",
      icon: "good-ships",
      color: "#654321"
    };

    expect(isGoodTradePermitted(ship, 1, [{ type: "water" }])).toBe(true);
    expect(isGoodTradePermitted(ship, 1, [{ type: "land" }, { type: "water" }])).toBe(false);
    expect(isGoodTradePermitted({ ...ship, seaOnly: false }, 1, [{ type: "land" }])).toBe(true);
  });

  it("keeps raw milk in its producing market for same-month settlement", () => {
    const milk = {
      i: 1,
      name: "Milk",
      value: 10,
      tags: ["food", "freshFood"],
      unit: "1,000 L dairy lot",
      icon: "milk",
      color: "#fff"
    };

    expect(isGoodTradePermitted(milk, 1, [{ type: "land" }])).toBe(false);
  });

  it("subtracts daily caravan maintenance before applying the minimum-profit threshold", () => {
    expect(getCaravanMaintenanceCost(8)).toBe(4);
    expect(getNetTradeProfit(1, 4, 8)).toBe(0);
  });
});
