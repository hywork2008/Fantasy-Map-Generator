import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import type { Caravan } from "../generators/marketTypes";
import { TradeAnimation } from "../generators/trade-animation";
import { getCaravanHighlightPoints, getCaravanInstanceKey } from "./draw-trade-animation";

describe("trade animation highlight", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { cells: { routes: {} }, burgs: [] } as typeof worldContext.pack;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEconomyContext();
  });

  it("does not paint a long start-to-end chord when no land or sea path exists", () => {
    vi.spyOn(TradeAnimation, "findRoutePath").mockReturnValue(null);
    const caravan = {
      i: 1,
      seller: 1,
      sellerType: "market",
      buyer: 2,
      buyerType: "market",
      payload: [],
      units: 1,
      value: 1,
      draftAnimalId: "horse",
      routeSegments: [
        {
          type: "land",
          points: [
            [10, 10, 1],
            [900, 700, 9]
          ]
        }
      ],
      totalDistance: 1200,
      currentDistance: 0,
      state: "transit"
    } as Caravan;

    expect(getCaravanHighlightPoints(caravan)).toEqual([]);
  });

  it("uses a distinct instance key when a finished numeric id is reused", () => {
    const first = {
      i: 3,
      seller: 1,
      sellerType: "market",
      buyer: 2,
      buyerType: "market",
      payload: [{ dealId: 0, goodId: 1, units: 1, value: 1 }],
      totalDistance: 80,
      state: "transit"
    } as Caravan;
    const reused = {
      ...first,
      seller: 4,
      buyer: 5,
      totalDistance: 640
    };

    expect(getCaravanInstanceKey(first)).not.toBe(getCaravanInstanceKey(reused));
  });
});
