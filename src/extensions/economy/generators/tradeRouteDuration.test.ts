import { describe, expect, it } from "vitest";
import {
  getCaravanMaintenanceCost,
  getGoodMaxTradeDurationDays,
  getNetTradeProfit,
  isGoodTradePermitted
} from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays } from "./tradeRouteDuration";

describe("trade route duration and viability", () => {
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

  it("subtracts daily caravan maintenance before applying the minimum-profit threshold", () => {
    expect(getCaravanMaintenanceCost(8)).toBe(4);
    expect(getNetTradeProfit(1, 4, 8)).toBe(0);
  });
});
