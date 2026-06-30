import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { PackedGraph } from "../types/PackedGraph";
import { States } from "./states-generator";

describe("StatesModule.collectTaxes", () => {
  beforeEach(() => {
    worldContext.pack = {
      states: [],
      burgs: [],
      markets: [],
      deals: []
    } as unknown as PackedGraph;
  });

  it("credits sales-tax deal.tax to the seller's state and adds poll tax", () => {
    worldContext.pack.states = [
      { i: 0, name: "Neutrals", salesTax: 0, pollTax: 0, treasury: 0 },
      { i: 1, name: "A", salesTax: 0.2, pollTax: 0.5, treasury: 0, rural: 100, urban: 50 },
      { i: 2, name: "B", salesTax: 0.1, pollTax: 0.1, treasury: 0, rural: 200, urban: 100 }
    ] as unknown as PackedGraph["states"];

    worldContext.pack.burgs = [
      { i: 0 },
      { i: 1, state: 1, cell: 1 },
      { i: 2, state: 2, cell: 2 }
    ] as unknown as PackedGraph["burgs"];

    worldContext.pack.markets = [
      { i: 1, centerBurgId: 1, color: "", goods: {} },
      { i: 2, centerBurgId: 2, color: "", goods: {} }
    ] as unknown as PackedGraph["markets"];

    worldContext.pack.deals = [
      {
        i: 0,
        seller: 1,
        sellerType: "burg",
        buyer: 1,
        buyerType: "market",
        good: 0,
        units: 10,
        price: 5,
        tax: 10 // 0.2 * 10 * 5
      },
      {
        i: 1,
        seller: 1,
        sellerType: "market",
        buyer: 2,
        buyerType: "market",
        good: 0,
        units: 4,
        price: 3,
        tax: 2 // exporter market 1 -> state 1
      },
      {
        i: 2,
        seller: 2,
        sellerType: "burg",
        buyer: 2,
        buyerType: "market",
        good: 1,
        units: 2,
        price: 6,
        tax: 1.2
      },
      {
        i: 3,
        seller: 2,
        sellerType: "market",
        buyer: 1,
        buyerType: "burg",
        good: 1,
        units: 1,
        price: 8,
        tax: 0 // no tax — pure buy from market
      }
    ] as unknown as PackedGraph["deals"];

    States.collectTaxes();

    // State 1: sales tax 10 + 2 = 12; poll tax 0.5 * (100+50) = 75; treasury = 87
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(87, 2);
    // State 2: sales tax 1.2; poll tax 0.1 * (200+100) = 30; treasury = 31.2
    expect(worldContext.pack.states[2].treasury).toBeCloseTo(31.2, 2);
    // Neutrals always 0
    expect(worldContext.pack.states[0].treasury).toBe(0);
  });

  it("leaves neutrals at zero even with deals from neutral burgs", () => {
    worldContext.pack.states = [
      { i: 0, name: "Neutrals", salesTax: 0, pollTax: 0, treasury: 0 },
      { i: 1, name: "A", salesTax: 0.1, pollTax: 0, treasury: 0, rural: 10, urban: 0 }
    ] as unknown as PackedGraph["states"];
    worldContext.pack.burgs = [
      { i: 0 },
      { i: 1, state: 0, cell: 0 } // neutral burg
    ] as unknown as PackedGraph["burgs"];
    worldContext.pack.markets = [] as unknown as PackedGraph["markets"];
    worldContext.pack.deals = [
      {
        i: 0,
        seller: 1,
        sellerType: "burg",
        buyer: 1,
        buyerType: "market",
        good: 0,
        units: 5,
        price: 5,
        tax: 2.5
      }
    ] as unknown as PackedGraph["deals"];

    States.collectTaxes();

    expect(worldContext.pack.states[0].treasury).toBe(0);
    // State 1 has no deal credit and only poll tax (0 here), so treasury stays 0
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });
});
