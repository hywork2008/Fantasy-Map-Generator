import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import { Goods } from "../generators/goods-generator";
import { getMarketTradeOpportunitiesState } from "../store/marketTradeOpportunitiesState";
import { refresh, setSelectedGoodId } from "./marketTradeOpportunities";

vi.mock("../../hostUi", () => ({
  openDialog: vi.fn()
}));

describe("market trade opportunities", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.graphWidth = 1000;
    worldContext.graphHeight = 1000;
    worldContext.pack = {
      goods: [
        {
          i: 1,
          name: "Wheat",
          value: 10,
          tags: ["food"],
          unit: "unit",
          icon: "icon",
          color: "#fff",
          distribution: "1",
          recipes: [],
          demandCoverage: { food: 1 }
        }
      ],
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, cell: 1, name: "Cheapport", x: 0, y: 0 } as unknown as Burg,
        { i: 2, cell: 2, name: "Dearport", x: 100, y: 0 } as unknown as Burg,
        { i: 3, cell: 3, name: "Remoteport", x: 900, y: 0 } as unknown as Burg
      ],
      markets: [
        { i: 1, centerBurgId: 1, color: "#f00", goods: { 1: { stock: 20, price: 5 } } },
        { i: 2, centerBurgId: 2, color: "#0f0", goods: { 1: { stock: 5, price: 30 } } },
        { i: 3, centerBurgId: 3, color: "#00f", goods: { 1: { stock: 0, price: 8 } } }
      ],
      routes: []
    } as unknown as PackedGraph;
    Goods.sync();
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("lists profitable buy-low / sell-high routes for the selected good", () => {
    setSelectedGoodId(1);
    refresh();

    const rows = getMarketTradeOpportunitiesState().rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceMarketName).toBe("Cheapport");
    expect(rows[0].targetMarketName).toBe("Dearport");
    expect(rows[0].distance).toBe(100);
    expect(rows[0].landDistance).toBe(100);
    expect(rows[0].seaDistance).toBe(0);
    expect(rows[0].transferCount).toBe(0);
    expect(rows[0].unitProfit).toBeGreaterThan(0);
    expect(rows[0].totalProfit).toBeCloseTo(rows[0].unitProfit * 20, 1);
  });

  it("uses route distance and reports land / sea legs for transport cost", () => {
    worldContext.pack.routes = [
      {
        i: 1,
        group: "roads",
        feature: 0,
        points: [
          [0, 0, 1],
          [100, 0, 10]
        ]
      },
      {
        i: 2,
        group: "searoutes",
        feature: 0,
        points: [
          [100, 0, 10],
          [100, 300, 20]
        ]
      },
      {
        i: 3,
        group: "trails",
        feature: 0,
        points: [
          [100, 300, 20],
          [100, 500, 2]
        ]
      }
    ];

    setSelectedGoodId(1);
    refresh();

    const rows = getMarketTradeOpportunitiesState().rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceMarketName).toBe("Cheapport");
    expect(rows[0].targetMarketName).toBe("Dearport");
    expect(rows[0].distance).toBe(600);
    expect(rows[0].landDistance).toBe(300);
    expect(rows[0].seaDistance).toBe(300);
    expect(rows[0].transferCount).toBe(2);
    expect(rows[0].transportCost).toBeCloseTo(2.12, 2);
  });

  it("skips market pairs that are not connected by routes when a trade route graph exists", () => {
    worldContext.pack.markets[2].goods[1].price = 30;
    worldContext.pack.routes = [
      {
        i: 1,
        group: "roads",
        feature: 0,
        points: [
          [0, 0, 1],
          [100, 0, 2]
        ]
      }
    ];

    setSelectedGoodId(1);
    refresh();

    const rows = getMarketTradeOpportunitiesState().rows;
    expect(rows.map(row => row.targetMarketName)).not.toContain("Remoteport");
  });
});
