import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getCaravans, getDeals, initEconomyContext } from "../economyContext";
import { Caravans } from "./caravans";
import type { Good } from "./goods-generator";
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
