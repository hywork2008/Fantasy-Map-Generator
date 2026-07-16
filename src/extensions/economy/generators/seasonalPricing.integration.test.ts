import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import { Goods } from "./goods-generator";
import { MarketsModule } from "./markets-generator";
import type { Market } from "./marketTypes";

/**
 * End-to-end validation of the design's core claim (docs/simulation/seasons.md,
 * see the plan's Phase 2 risk note): that a seasonal rural-output multiplier for
 * food-tagged goods, combined with the EXISTING demand/stock price formula in
 * initializeMarketPrices(), is sufficient on its own to make grain cheap right
 * after the autumn harvest and expensive in the lean season before the next one
 * -- with no separate seasonal price-modifier code required.
 */
describe("seasonal grain price cycle (integration)", () => {
  let marketsModule: MarketsModule;

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    marketsModule = new MarketsModule();

    worldContext.mapCoordinates = { latN: 90, latT: 180 };
    worldContext.graphHeight = 100;
    worldContext.pack = {
      goods: [
        {
          i: 0,
          name: "Grain",
          value: 1,
          tags: ["food"],
          unit: "bushel",
          icon: "icon",
          color: "#fff",
          distribution: "1",
          recipes: [],
          demandCoverage: { food: 1 },
          biomeOutput: { 6: 0.5 }
        }
      ],
      cultures: [],
      burgs: [
        { i: 0 } as unknown as PackedGraph["burgs"][number],
        { i: 1, market: 1, population: 100 } as unknown as PackedGraph["burgs"][number]
      ],
      zones: [],
      markets: [],
      cells: {
        i: [0],
        biome: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        market: Uint16Array.from([1]),
        pop: [50],
        h: new Uint8Array([50]),
        c: [[]],
        p: [[0, 40]] // y=40 of 100 -> latitude 18 (northern hemisphere)
      }
    } as unknown as PackedGraph;
    Goods.sync();

    const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
    worldContext.pack.markets = [market1];
    // biome-ignore lint/complexity/useLiteralKeys: private access for testing
    marketsModule["marketById"] = [undefined as unknown as Market, market1];
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("cycles grain stock/price seasonally: cheapest right after harvest, priciest right before it", () => {
    const goodId = worldContext.pack.goods[0].i;
    const monthlyDemandUnits = 100 * 0.2; // burg population(100) * DEMAND_TARGET_FACTORS.food(0.2)
    const priceByMonth: number[] = [];

    for (let month = 1; month <= 24; month++) {
      worldContext.options = { month: ((month - 1) % 12) + 1 } as unknown as PackedGraph["options"];
      marketsModule.collectRuralProduction();

      // Stand in for Production.produce()'s fillBurgsDemand() step (not exercised directly
      // here): burgs draw stock down toward their demand target every tick, so stock doesn't
      // just accumulate forever and the seasonal production curve actually shows up as a
      // stock/price cycle rather than a one-directional drift.
      const marketGood = worldContext.pack.markets[0].goods[goodId];
      marketGood.stock = Math.max(0, marketGood.stock - monthlyDemandUnits);

      marketsModule.initializeMarketPrices();
      priceByMonth.push(worldContext.pack.markets[0].goods[goodId].price);
    }

    // Settle into the second simulated year (index 12-23) so the stock/price series has
    // stabilized past the arbitrary starting-stock transient of year one. Autumn (Sep-Nov)
    // is a 3-month harvest-multiplier window, so stock/price move monotonically across it:
    // August is the leanest month right before the harvest window opens, December is right
    // after it closes (3 straight months of harvest-boosted stock behind it).
    const year2 = priceByMonth.slice(12, 24);
    const augustPrice = year2[7]; // month 8: leanest month, right before harvest
    const decemberPrice = year2[11]; // month 12: right after 3 months of harvest surplus

    expect(decemberPrice).toBeLessThan(augustPrice);
  });
});
