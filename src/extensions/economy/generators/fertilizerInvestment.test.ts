import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  initEconomyContext,
  setCultivatedArea,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { FERTILIZER_ADOPTION_RATE, FertilizerInvestment } from "./fertilizerInvestment";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

const FERTILIZER_ID = 1;

describe("FertilizerInvestmentModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [1, 1]
        ],
        h: Uint8Array.from([55, 55]),
        r: Uint16Array.from([0, 0]),
        routes: {}
      }
    } as unknown as PackedGraph;
    setGoods([
      {
        i: FERTILIZER_ID,
        name: "Phosphate Fertilizer",
        tags: ["industrial", "agriculture"],
        value: 20,
        unit: "sack",
        icon: "good-salt",
        color: "#c7b98a"
      }
    ]);
    setGoodCellColumn(new Uint16Array([0, 0]));
    setMarketCellColumn(new Uint16Array([1, 1]));
    setCultivatedArea(new Float32Array([50, 50])); // 100 ha total under this market
    Goods.sync();
  });

  afterEach(() => clearEconomyContext());

  it("spends market treasury on available Phosphate Fertilizer stock and raises fertilizerStock", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [FERTILIZER_ID]: { stock: 100, price: 20 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    FertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.fertilizerStock).toBeGreaterThan(0);
    expect(market.fertilizerStock).toBeLessThanOrEqual(FERTILIZER_ADOPTION_RATE + 1e-6);
    expect(market.marketTreasury?.balance).toBeLessThan(1000);
    expect(market.goods[FERTILIZER_ID].stock).toBeLessThan(100);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [FERTILIZER_ID]: { stock: 100, price: 20 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    FertilizerInvestment.settleAnnual();
    const stockAfterFirstCall = getMarkets()[0].fertilizerStock;
    FertilizerInvestment.settleAnnual();

    expect(getMarkets()[0].fertilizerStock).toBe(stockAfterFirstCall);
  });

  it("caps the purchase at the market's available treasury balance", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [FERTILIZER_ID]: { stock: 100, price: 20 } },
        // Too little treasury to fund the full requested coverage this year.
        marketTreasury: { balance: 0.5, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    FertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.marketTreasury?.balance).toBeGreaterThanOrEqual(0);
    expect(market.fertilizerStock).toBeGreaterThan(0);
    expect(market.fertilizerStock).toBeLessThan(FERTILIZER_ADOPTION_RATE);
  });

  it("decays existing fertilizerStock toward zero once a market has no cultivated land", () => {
    setCultivatedArea(new Float32Array([0, 0]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [FERTILIZER_ID]: { stock: 100, price: 20 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 },
        fertilizerStock: 0.5
      }
    ]);
    Markets.sync();

    FertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.fertilizerStock).toBeLessThan(0.5);
    expect(market.fertilizerStock).toBeGreaterThan(0);
  });

  it("does not touch a market's agTechStock — separate stock/budget from Tools investment", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [FERTILIZER_ID]: { stock: 100, price: 20 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 },
        agTechStock: 0.3
      }
    ]);
    Markets.sync();

    FertilizerInvestment.settleAnnual();

    expect(getMarkets()[0].agTechStock).toBe(0.3);
  });
});
