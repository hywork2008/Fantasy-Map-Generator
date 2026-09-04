import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import {
  clearEconomyContext,
  getAgTechLastSettledYear,
  getFoodPotential,
  getMarketById,
  initEconomyContext,
  setAgTechLastSettledYear,
  setFoodPotential,
  setMarkets
} from "./economyContext";
import type { Market } from "./generators/marketTypes";

function market(i: number): Market {
  return { i, centerBurgId: i, color: "#111", goods: {} };
}

beforeEach(() => {
  initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  worldContext.pack = { markets: [] } as unknown as PackedGraph;
});

afterEach(() => {
  clearEconomyContext();
});

describe("getMarketById", () => {
  it("finds a market by id", () => {
    setMarkets([market(1), market(2)]);
    expect(getMarketById(2)?.i).toBe(2);
    expect(getMarketById(99)).toBeUndefined();
  });

  it("stays live against in-place mutation of a cached market (no stale copy)", () => {
    const target = market(5);
    setMarkets([target]);
    getMarketById(5); // populate the cache
    target.color = "#changed";
    expect(getMarketById(5)?.color).toBe("#changed");
  });

  it("picks up a new market set after setMarkets() replaces the backing array", () => {
    setMarkets([market(1)]);
    expect(getMarketById(1)).toBeDefined();
    expect(getMarketById(2)).toBeUndefined();

    setMarkets([market(2)]);
    expect(getMarketById(1)).toBeUndefined();
    expect(getMarketById(2)).toBeDefined();
  });
});

/**
 * The accessors' module-scope fallbacks live in the per-domain `./context/*` modules now, and
 * `clearEconomyContext()` runs them through a registry instead of assigning each one by name
 * (docs/plan/economy-coupling-audit.md T3). A domain module that forgets to register its reset
 * would leak state between tests silently, so assert the wiring rather than the list.
 */
describe("clearEconomyContext", () => {
  it("resets fallbacks owned by the domain context modules", () => {
    setFoodPotential(Float32Array.from([1, 2, 3]));
    setAgTechLastSettledYear(1234);
    expect(getFoodPotential()).toHaveLength(3);
    expect(getAgTechLastSettledYear()).toBe(1234);

    clearEconomyContext();

    expect(getFoodPotential()).toHaveLength(0);
    expect(getAgTechLastSettledYear()).toBeNull();
  });
});
