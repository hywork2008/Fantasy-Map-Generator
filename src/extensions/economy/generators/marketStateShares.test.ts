import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { getMarketStateShares } from "./marketStateShares";
import type { Market } from "./marketTypes";

describe("getMarketStateShares()", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { states: [], burgs: [], markets: [], deals: [] } as unknown as PackedGraph;
  });

  it("attributes 100% to the single state when every member burg belongs to it", () => {
    const market = { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market;
    worldContext.pack.burgs = [
      { i: 0 } as unknown as Burg,
      { i: 1, market: 1, state: 5, population: 10 } as unknown as Burg,
      { i: 2, market: 1, state: 5, population: 20 } as unknown as Burg
    ];

    const shares = getMarketStateShares(market);

    expect(shares.get(5)).toBe(1);
    expect(shares.size).toBe(1);
  });

  it("weights shares by burg population across states", () => {
    const market = { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market;
    worldContext.pack.burgs = [
      { i: 0 } as unknown as Burg,
      { i: 1, market: 1, state: 1, population: 30 } as unknown as Burg,
      { i: 2, market: 1, state: 2, population: 10 } as unknown as Burg
    ];

    const shares = getMarketStateShares(market);

    expect(shares.get(1)).toBeCloseTo(0.75, 5);
    expect(shares.get(2)).toBeCloseTo(0.25, 5);
  });

  it("ignores removed burgs and burgs belonging to a different market", () => {
    // pack.burgs is index-aligned with burg.i (index 0 is the conventional dummy/neutral slot).
    const market = { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market;
    worldContext.pack.burgs = [
      { i: 0 } as unknown as Burg,
      { i: 1, market: 1, state: 1, population: 10 } as unknown as Burg,
      { i: 2, market: 1, state: 2, population: 999, removed: true } as unknown as Burg,
      { i: 3, market: 2, state: 3, population: 999 } as unknown as Burg
    ];

    const shares = getMarketStateShares(market);

    expect(shares.get(1)).toBe(1);
    expect(shares.size).toBe(1);
  });

  it("falls back to the center burg's state when no member burg carries a usable population weight", () => {
    const market = { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market;
    worldContext.pack.burgs = [
      { i: 0 } as unknown as Burg,
      { i: 1, market: 1, state: 7, population: 0 } as unknown as Burg
    ];

    const shares = getMarketStateShares(market);

    expect(shares.get(7)).toBe(1);
    expect(shares.size).toBe(1);
  });

  it("returns an empty map when there is no population signal and no center-burg state", () => {
    const market = { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market;
    worldContext.pack.burgs = [
      { i: 0 } as unknown as Burg,
      { i: 1, market: 1, state: 0, population: 0 } as unknown as Burg
    ];

    const shares = getMarketStateShares(market);

    expect(shares.size).toBe(0);
  });
});
