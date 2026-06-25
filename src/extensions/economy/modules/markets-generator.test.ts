import { beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../../context/worldContext";
import type { Burg } from "../../../modules/burgs-generator";
import { States } from "../../../modules/states-generator";
import type { PackedGraph } from "../../../types/PackedGraph";
import { type Market, MarketsModule } from "./markets-generator";

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

vi.mock("./production-generator", () => ({
  Production: {
    getCellProduction: vi.fn(() => ({}))
  }
}));

describe("MarketsModule", () => {
  describe("buy logic and budget constraints", () => {
    let marketsModule: MarketsModule;
    beforeEach(() => {
      marketsModule = new MarketsModule();
      worldContext.graphWidth = 1000;
      worldContext.graphHeight = 800;
      worldContext.pack = {
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
      expect(market2.goods[0].stock).toBeGreaterThan(0);
      expect(market1.goods[0].stock).toBeLessThan(100);
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
      const { Production } = await import("./production-generator");
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
      vi.mocked(Production.getCellProduction).mockReturnValue({ [good.i]: 5 });

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
