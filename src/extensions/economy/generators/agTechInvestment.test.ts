import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getStateAgriculturalProductivity,
  initEconomyContext,
  setCultivatedArea,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { AGTECH_ADOPTION_RATE, AgTechInvestment, STATE_ADOPTION_RATE } from "./agTechInvestment";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

const TOOLS_ID = 1;

describe("AgTechInvestmentModule", () => {
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
        i: TOOLS_ID,
        name: "Tools",
        tags: ["construction", "military"],
        value: 14,
        unit: "set",
        icon: "tools",
        color: "#808080"
      }
    ]);
    setGoodCellColumn(new Uint16Array([0, 0]));
    setMarketCellColumn(new Uint16Array([1, 1]));
    setCultivatedArea(new Float32Array([50, 50])); // 100 ha total under this market
    Goods.sync();
  });

  afterEach(() => clearEconomyContext());

  it("spends market treasury on available Tools stock and raises agTechStock", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    AgTechInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.agTechStock).toBeGreaterThan(0);
    expect(market.agTechStock).toBeLessThanOrEqual(AGTECH_ADOPTION_RATE + 1e-6);
    expect(market.marketTreasury?.balance).toBeLessThan(1000);
    expect(market.goods[TOOLS_ID].stock).toBeLessThan(100);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    AgTechInvestment.settleAnnual();
    const stockAfterFirstCall = getMarkets()[0].agTechStock;
    AgTechInvestment.settleAnnual();

    expect(getMarkets()[0].agTechStock).toBe(stockAfterFirstCall);
  });

  it("caps the purchase at the market's available treasury balance", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        // Too little treasury to fund the full requested coverage this year.
        marketTreasury: { balance: 0.5, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    AgTechInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.marketTreasury?.balance).toBeGreaterThanOrEqual(0);
    expect(market.agTechStock).toBeGreaterThan(0);
    expect(market.agTechStock).toBeLessThan(AGTECH_ADOPTION_RATE);
  });

  it("decays existing agTechStock toward zero once a market has no cultivated land", () => {
    setCultivatedArea(new Float32Array([0, 0]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 },
        agTechStock: 0.5
      }
    ]);
    Markets.sync();

    AgTechInvestment.settleAnnual();

    const market = getMarkets()[0];
    expect(market.agTechStock).toBeLessThan(0.5);
    expect(market.agTechStock).toBeGreaterThan(0);
  });

  it("also funds stateAgriculturalProductivity from the state treasury, separately from the market's", () => {
    worldContext.pack.cells.state = Uint16Array.from([1, 1]);
    worldContext.pack.states = [
      { i: 0, name: "Neutral" },
      { i: 1, name: "Test State", treasury: 1000 }
    ] as unknown as PackedGraph["states"];
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    AgTechInvestment.settleAnnual();

    const state = worldContext.pack.states[1];
    expect(state.treasury).toBeLessThan(1000);
    const productivity = getStateAgriculturalProductivity();
    expect(productivity[1]).toBeGreaterThan(0);
    expect(productivity[1]).toBeLessThanOrEqual(STATE_ADOPTION_RATE + 1e-6);
    // Market-level agTech (funded from marketTreasury) is unaffected by the state's own spend.
    expect(getMarkets()[0].agTechStock).toBeGreaterThan(0);
  });

  it("decays stateAgriculturalProductivity for a state with no cultivated cells", () => {
    worldContext.pack.cells.state = Uint16Array.from([0, 0]);
    worldContext.pack.states = [
      { i: 0, name: "Neutral" },
      { i: 1, name: "Test State", treasury: 1000 }
    ] as unknown as PackedGraph["states"];
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { [TOOLS_ID]: { stock: 100, price: 14 } },
        marketTreasury: { balance: 1000, ruralGrainPayable: 0 }
      }
    ]);
    Markets.sync();

    AgTechInvestment.settleAnnual();

    expect(getStateAgriculturalProductivity()[1] ?? 0).toBe(0);
    expect(worldContext.pack.states[1].treasury).toBe(1000);
  });
});
