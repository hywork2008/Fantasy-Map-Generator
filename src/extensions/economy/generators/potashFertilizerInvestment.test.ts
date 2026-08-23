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
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { POTASH_ADOPTION_RATE, PotashFertilizerInvestment } from "./potashFertilizerInvestment";

const POTASH_ID = 1;

describe("PotashFertilizerInvestmentModule", () => {
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
    // No requiredTechnology, matching the real "Potash" Good (goods-generator.ts) — wood-ash
    // potash has been producible since antiquity, so this module has no technology gate.
    setGoods([
      {
        i: POTASH_ID,
        name: "Potash",
        tags: ["mineral"],
        value: 3,
        unit: "barrel",
        icon: "good-unknown",
        color: "#c9c2a6"
      }
    ]);
    setGoodCellColumn(new Uint16Array([0, 0]));
    setMarketCellColumn(new Uint16Array([1, 1]));
    setCultivatedArea(new Float32Array([50, 50])); // 100 ha total under this market
    Goods.sync();
  });

  afterEach(() => clearEconomyContext());

  it("spends market treasury on available Potash stock and raises potashFertilizerStock", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [POTASH_ID]: { stock: 100, price: 3 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    PotashFertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.potashFertilizerStock).toBeGreaterThan(0);
    expect(market.potashFertilizerStock).toBeLessThanOrEqual(POTASH_ADOPTION_RATE + 1e-6);
    expect(market.marketTreasury?.balance).toBeLessThan(1000);
    expect(market.goods[POTASH_ID].stock).toBeLessThan(100);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [POTASH_ID]: { stock: 100, price: 3 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    PotashFertilizerInvestment.settleAnnual();
    const stockAfterFirstCall = getMarkets()[0].potashFertilizerStock;
    PotashFertilizerInvestment.settleAnnual();

    expect(getMarkets()[0].potashFertilizerStock).toBe(stockAfterFirstCall);
  });

  it("caps the purchase at the market's available treasury balance", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [POTASH_ID]: { stock: 100, price: 3 } },
        // Too little treasury to fund the full requested coverage this year.
        marketTreasury: { balance: 0.05, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    PotashFertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.marketTreasury?.balance).toBeGreaterThanOrEqual(0);
    expect(market.potashFertilizerStock).toBeGreaterThan(0);
    expect(market.potashFertilizerStock).toBeLessThan(POTASH_ADOPTION_RATE);
  });

  it("returns zero purchases when the market's Potash stock is empty", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [POTASH_ID]: { stock: 0, price: 3 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    PotashFertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.potashFertilizerStock ?? 0).toBe(0);
    expect(market.marketTreasury?.balance).toBe(1000);
  });

  it("decays existing potashFertilizerStock toward zero once a market has no cultivated land", () => {
    setCultivatedArea(new Float32Array([0, 0]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [POTASH_ID]: { stock: 100, price: 3 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 },
        potashFertilizerStock: 0.5
      }
    ]);
    Markets.sync();

    PotashFertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.potashFertilizerStock).toBeLessThan(0.5);
    expect(market.potashFertilizerStock).toBeGreaterThan(0);
  });

  it("does not touch a market's fertilizerStock/nitrogenFertilizerStock — separate accounts", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [POTASH_ID]: { stock: 100, price: 3 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 },
        fertilizerStock: 0.3,
        nitrogenFertilizerStock: 0.4
      }
    ]);
    Markets.sync();

    PotashFertilizerInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.fertilizerStock).toBe(0.3);
    expect(market.nitrogenFertilizerStock).toBe(0.4);
  });
});
