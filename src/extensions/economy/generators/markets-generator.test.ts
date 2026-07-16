import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import { States, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import { MarketsModule } from "./markets-generator";
import type { Market } from "./marketTypes";

vi.mock("./goods-generator", async importOriginal => {
  const actual = await importOriginal<typeof import("./goods-generator")>();
  return {
    ...actual,
    Goods: {
      getBiomesProduction: vi.fn(() => ({})),
      get: vi.fn((id: number) => actual.Goods.get(id))
    }
  };
});

vi.mock("./production-utils", () => ({
  getCellProduction: vi.fn(() => ({}))
}));

describe("MarketsModule", () => {
  describe("buy logic and budget constraints", () => {
    let marketsModule: MarketsModule;
    afterEach(() => {
      clearEconomyContext();
      clearCharactersContext();
    });

    beforeEach(() => {
      const api = { worldContext } as unknown as ExtensionAPI;
      initEconomyContext(api);
      initCharactersContext(api);
      marketsModule = new MarketsModule();
      worldContext.graphWidth = 1000;
      worldContext.graphHeight = 800;
      worldContext.distanceScale = 1;
      worldContext.options = { gunpowderEraEnabled: true } as typeof worldContext.options;
      worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
      worldContext.pack = {
        characters: [],
        cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
        goods: [
          {
            i: 0,
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
        markets: [],
        burgs: [],
        deals: [],
        states: [{ i: 0, salesTax: 0 }]
      } as unknown as PackedGraph;
    });

    it("buy() should floor units, enforce min unit, and keep cost within budget", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 10 } }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market1];
      worldContext.pack.markets = [market1];
      const burg: Burg = { i: 1, market: 1, treasury: 15 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      const deal = marketsModule.buy({ burg, good: worldContext.pack.goods[0], units: 5, budget: 15 });
      expect(deal).not.toBeNull();
      expect(deal!.units).toBe(1.36);
      expect(deal!.price).toBe(11);
      expect(deal!.units * deal!.price).toBeLessThanOrEqual(15);
      expect(market1.goods[0].stock).toBeCloseTo(100 - 1.36, 2);
    });

    it("buy() should return null if units floor below 0.01 due to low budget", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 10 } }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1];
      worldContext.pack.markets = [market1];
      const burg: Burg = { i: 1, market: 1, treasury: 0.05 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      const deal = marketsModule.buy({ burg, good: worldContext.pack.goods[0], units: 5, budget: 0.05 });
      expect(deal).toBeNull();
    });

    it("does not buy a gunpowder-era good while the era is disabled", () => {
      const market: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 10 } }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market, market];
      worldContext.pack.markets = [market];
      const burg: Burg = { i: 1, market: 1, treasury: 100 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      worldContext.pack.goods[0].name = "Gunpowder";
      worldContext.options.gunpowderEraEnabled = false;

      expect(marketsModule.buy({ burg, good: worldContext.pack.goods[0], units: 5 })).toBeNull();
      expect(worldContext.pack.deals).toEqual([]);
    });

    it("runGlobalTrade() should transfer excess stock to importers", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 5 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 0, price: 20 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];
      marketsModule.runGlobalTrade();
      expect(worldContext.pack.deals).toHaveLength(1);
      // Goods remain in transit until the spawned caravan reaches the importer.
      expect(market2.goods[0].stock).toBe(0);
      expect(market1.goods[0].stock).toBeLessThan(100);
    });

    it("caches market routes until a market centre changes", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 5 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 0, price: 20 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];

      const getMarketTradeRoute = vi.spyOn(
        marketsModule as unknown as { getMarketTradeRoute(source: Burg, target: Burg): unknown },
        "getMarketTradeRoute"
      );

      marketsModule.runGlobalTrade();
      expect(getMarketTradeRoute).toHaveBeenCalledTimes(4); // every ordered pair, including self-pairs

      marketsModule.runGlobalTrade();
      expect(getMarketTradeRoute).toHaveBeenCalledTimes(4);

      burg2.x = 250;
      marketsModule.runGlobalTrade();
      expect(getMarketTradeRoute).toHaveBeenCalledTimes(8);
    });

    it("runGlobalTrade() should add exporter sales tax to landed cost and record it on the deal", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 5 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 0, price: 20 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1, state: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2, state: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      worldContext.pack.states = [
        { i: 0, salesTax: 0 },
        { i: 1, salesTax: 0.2 },
        { i: 2, salesTax: 0.1 }
      ] as unknown as PackedGraph["states"];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];
      marketsModule.runGlobalTrade();

      const tradeDeal = worldContext.pack.deals.find(
        d => d.sellerType === "market" && d.seller === 1 && d.buyerType === "market"
      );
      expect(tradeDeal).toBeDefined();
      expect(tradeDeal!.tax).toBeGreaterThan(0);
      expect(tradeDeal!.tax).toBeCloseTo(0.2 * 5 * tradeDeal!.units, 1);
      expect(tradeDeal!.price).toBeGreaterThan(5);
      expect(tradeDeal!.distance).toBe(100);
      expect(tradeDeal!.durationDays).toBeGreaterThanOrEqual(3);
      expect(tradeDeal!.accountingPeriodDays).toBe(7);
    });

    it("initializeMarketPrices() should create local price spread for nearby markets with equal stock", () => {
      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: { 0: { stock: 10, price: 10 } } };
      const market2: Market = { i: 2, centerBurgId: 2, color: "#00ff00", goods: { 0: { stock: 10, price: 10 } } };
      const burg1: Burg = { i: 1, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, population: 100, market: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];

      marketsModule.initializeMarketPrices();

      expect(market1.goods[0].price).not.toBe(market2.goods[0].price);
      expect(market1.goods[0].price).toBeGreaterThan(0);
      expect(market2.goods[0].price).toBeGreaterThan(0);
    });

    it("runGlobalTrade() should skip low-value trades beyond their value-density day limit", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 5 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 0, price: 100 } }
      };
      const burg1: Burg = { i: 1, x: 0, y: 0, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 900, y: 0, population: 100, market: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];
      marketsModule.runGlobalTrade();

      expect(worldContext.pack.deals).toEqual([]);
      expect(market2.goods[0].stock).toBe(0);
      expect(market1.goods[0].stock).toBe(100);
    });

    it("runGlobalTrade() should fabricate nearby market trades when natural spread is absent", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 100, price: 10 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 5, price: 10 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];

      marketsModule.runGlobalTrade();

      expect(worldContext.pack.deals.some(deal => deal.sellerType === "market" && deal.buyerType === "market")).toBe(
        true
      );
      expect(market2.goods[0].stock).toBe(5);
      expect(market1.goods[0].stock).toBeLessThan(100);
    });

    it("runGlobalTrade() should fabricate one-way nearby trades when stock and prices match", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 10, price: 10 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 10, price: 10 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2 } as unknown as Burg;
      worldContext.pack.markets = [market1, market2];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];

      marketsModule.runGlobalTrade();

      const tradeDeals = worldContext.pack.deals.filter(
        deal => deal.sellerType === "market" && deal.buyerType === "market"
      );
      expect(tradeDeals).toHaveLength(1);
      const [tradeDeal] = tradeDeals;
      const seller = tradeDeal.seller === market1.i ? market1 : market2;
      const buyer = tradeDeal.buyer === market1.i ? market1 : market2;
      expect(seller.goods[0].stock).toBeLessThan(10);
      expect(buyer.goods[0].stock).toBe(10);
    });

    it("addMarket() should claim only the center burg's cell and preserve existing borders", () => {
      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      worldContext.pack.markets = [market1];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1];

      const centerBurg: Burg = { i: 2, cell: 3 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, cell: 0 } as unknown as Burg, centerBurg];
      worldContext.pack.cells = {
        i: [0, 1, 2, 3],
        market: Uint16Array.from([1, 1, 1, 1])
      } as unknown as PackedGraph["cells"];

      const newMarket = marketsModule.addMarket(2);

      expect(newMarket).not.toBeNull();
      expect(newMarket!.i).toBe(2);
      expect(Array.from(worldContext.pack.cells.market)).toEqual([1, 1, 1, 2]);
      expect(centerBurg.market).toBe(2);
      expect(centerBurg.plaza).toBe(1);
      expect(marketsModule.get(2)).toBe(newMarket);
    });

    it("addMarket() should reject a burg that already centers a market", () => {
      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      worldContext.pack.markets = [market1];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, cell: 0 } as unknown as Burg];
      worldContext.pack.cells = { i: [0], market: Uint16Array.from([1]) } as unknown as PackedGraph["cells"];

      expect(marketsModule.addMarket(1)).toBeNull();
      expect(worldContext.pack.markets).toHaveLength(1);
    });

    it("collectRuralProduction() should ignore cells with no market (market 0)", async () => {
      const { Goods } = await import("./goods-generator");
      const { getCellProduction } = await import("./production-utils");
      const good = worldContext.pack.goods[0];

      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      worldContext.pack.markets = [market1];
      const index: Market[] = [];
      index[market1.i] = market1;
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = index;

      worldContext.pack.cells = {
        i: [0, 1, 2],
        market: Uint16Array.from([1, 0, 1])
      } as unknown as PackedGraph["cells"];

      vi.mocked(Goods.getBiomesProduction).mockReturnValue({} as ReturnType<typeof Goods.getBiomesProduction>);
      vi.mocked(Goods.get).mockImplementation((id: number) => (id === good.i ? good : undefined));
      vi.mocked(getCellProduction).mockReturnValue({ [good.i]: 5 });

      marketsModule.collectRuralProduction();

      expect(market1.goods[good.i].stock).toBe(10);
    });

    it("getName() should prefer a custom name, fall back to the center burg, then to a generic label", () => {
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, name: "Riverton" } as unknown as Burg];

      const named: Market = { i: 1, centerBurgId: 1, color: "#fff", goods: {}, name: "Grand Bazaar" };
      expect(marketsModule.getName(named)).toBe("Grand Bazaar");

      const derived: Market = { i: 1, centerBurgId: 1, color: "#fff", goods: {} };
      expect(marketsModule.getName(derived)).toBe("Riverton");

      const blank: Market = { i: 2, centerBurgId: 1, color: "#fff", goods: {}, name: "" };
      expect(marketsModule.getName(blank)).toBe("Riverton");

      const orphan: Market = { i: 7, centerBurgId: 99, color: "#fff", goods: {} };
      expect(marketsModule.getName(orphan)).toBe("Market 7");
    });

    it("sell() should record sales tax on burg deals when state has a sales tax", () => {
      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 0, price: 10 } }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market1];
      worldContext.pack.markets = [market1];
      const burg: Burg = { i: 1, market: 1, state: 1 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      worldContext.pack.states = [
        { i: 0, salesTax: 0 },
        { i: 1, salesTax: 0.2 }
      ] as unknown as PackedGraph["states"];
      const taxRate = States.getSalesTax(burg);
      const deal = marketsModule.sell({ burg, good: worldContext.pack.goods[0], units: 5, taxRate });
      expect(deal).not.toBeNull();
      expect(deal!.tax).toBeGreaterThan(0);
      expect(deal!.tax).toBeCloseTo(deal!.units * deal!.price * 0.2, 2);
    });

    it("sync() should rebuild the id index so get() resolves markets after a load", () => {
      const market3: Market = { i: 3, centerBurgId: 30, color: "#fff", goods: {} };
      const market7: Market = { i: 7, centerBurgId: 70, color: "#fff", goods: {} };
      worldContext.pack.markets = [market3, market7];
      expect(marketsModule.get(3)).toBeUndefined();

      marketsModule.sync();

      expect(marketsModule.get(3)).toBe(market3);
      expect(marketsModule.get(7)).toBe(market7);
      expect(marketsModule.get(99)).toBeUndefined();
    });

    it("sync() should tolerate holes in pack.markets", () => {
      const market2: Market = { i: 2, centerBurgId: 20, color: "#fff", goods: {} };
      worldContext.pack.markets = [null as unknown as Market, market2];
      expect(() => marketsModule.sync()).not.toThrow();
      expect(marketsModule.get(2)).toBe(market2);
    });
  });
});

describe("MarketsModule shipbuilding material consumption", () => {
  let marketsModule: MarketsModule;
  let market: Market;

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    marketsModule = new MarketsModule();
    worldContext.options = { gunpowderEraEnabled: true } as typeof worldContext.options;
    worldContext.pack = {
      goods: [
        { i: 0, name: "Wood", value: 4, tags: [], unit: "pile", icon: "", color: "", distribution: "", recipes: [] },
        { i: 1, name: "Sails", value: 8, tags: [], unit: "set", icon: "", color: "", distribution: "", recipes: [] },
        { i: 2, name: "Ropes", value: 6, tags: [], unit: "coil", icon: "", color: "", distribution: "", recipes: [] },
        { i: 3, name: "Tar", value: 3, tags: [], unit: "barrel", icon: "", color: "", distribution: "", recipes: [] }
      ],
      markets: [],
      burgs: [],
      deals: []
    } as unknown as PackedGraph;
    market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {
        0: { stock: 10, price: 4 },
        1: { stock: 10, price: 8 },
        2: { stock: 10, price: 6 },
        3: { stock: 10, price: 3 }
      }
    };
    worldContext.pack.markets = [market];
    // biome-ignore lint/complexity/useLiteralKeys: public consumption is tested against a controlled market index
    marketsModule["marketById"] = [market, market];
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("atomically consumes every construction material and raises its market pressure", () => {
    const result = marketsModule.tryConsumeShipbuildingMaterials(1, { Wood: 2, Sails: 2, Ropes: 2, Tar: 1 });

    expect(result).toEqual({ status: "fulfilled" });
    expect(market.goods[0]).toMatchObject({ stock: 8 });
    expect(market.goods[1]).toMatchObject({ stock: 8 });
    expect(market.goods[2]).toMatchObject({ stock: 8 });
    expect(market.goods[3]).toMatchObject({ stock: 9 });
    expect(market.goods[0].price).toBeGreaterThan(4);
  });

  it("does not consume any material when one required stock is insufficient", () => {
    market.goods[2].stock = 0.25;
    const before = structuredClone(market.goods);

    const result = marketsModule.tryConsumeShipbuildingMaterials(1, { Wood: 2, Sails: 2, Ropes: 2, Tar: 1 });

    expect(result).toEqual({ status: "insufficientMaterials", missing: { Ropes: 1.75 } });
    expect(market.goods).toEqual(before);
  });

  it("does not create an empty stock row when a material has never reached the market", () => {
    delete market.goods[3];
    const before = structuredClone(market.goods);

    expect(marketsModule.tryConsumeShipbuildingMaterials(1, { Wood: 2, Sails: 2, Ropes: 2, Tar: 1 })).toEqual({
      status: "insufficientMaterials",
      missing: { Tar: 1 }
    });
    expect(market.goods).toEqual(before);
  });

  it("reports a missing market without mutating any stock", () => {
    const before = structuredClone(market.goods);

    expect(marketsModule.tryConsumeShipbuildingMaterials(99, { Wood: 2, Sails: 2, Ropes: 2, Tar: 1 })).toEqual({
      status: "noMarket"
    });
    expect(market.goods).toEqual(before);
  });

  it("resolves a loaded market before the transient market index is synchronized", () => {
    // biome-ignore lint/complexity/useLiteralKeys: emulate a loaded map before Markets.sync()
    marketsModule["marketById"] = [];

    expect(marketsModule.tryConsumeShipbuildingMaterials(1, { Wood: 2, Sails: 2, Ropes: 2, Tar: 1 })).toEqual({
      status: "fulfilled"
    });
    expect(market.goods[0].stock).toBe(8);
  });
});
