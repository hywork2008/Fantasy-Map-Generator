import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import { States, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getBurgWholesaleInventories,
  getDeals,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  initEconomyContext,
  setBurgMarketLedgers,
  setGoods,
  setMarkets,
  setMetallurgWorkOrders
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { DEMAND_TARGET_FACTORS, type Good, Goods } from "./goods-generator";
import {
  getCommercialRecipeByproducts,
  isWartimeImportDemandGood,
  MarketsModule,
  wartimeTradeReserveMultiplier
} from "./markets-generator";
import type { Market } from "./marketTypes";
import type { MetallurgWorkOrder } from "./metallurgWorkTypes";
import { applyPriceElasticity } from "./priceElasticity";
import { validateRetailInventory } from "./retailInventory";

vi.mock("./goods-generator", async importOriginal => {
  const actual = await importOriginal<typeof import("./goods-generator")>();
  return {
    ...actual,
    Goods: {
      getBiomesProduction: vi.fn(() => ({})),
      get: vi.fn((id: number) => actual.Goods.get(id)),
      // Real sync(), needed for tests whose recipes require Goods.get() to resolve an ingredient
      // (goodById is only rebuilt by sync(), matching how production code refreshes it).
      sync: vi.fn(() => actual.Goods.sync())
    }
  };
});

vi.mock("./production-utils", () => ({
  getRuralProductionContributions: vi.fn(() => []),
  getSeasonalFoodProductionMultiplier: vi.fn(() => 1)
}));

describe("wartime trade demand (docs/plan/economy-coupling-audit.md L5)", () => {
  it("hoards military and essential goods, not luxury", () => {
    expect(isWartimeImportDemandGood({ name: "Arms", tags: ["military"], warEconomyType: "military" })).toBe(true);
    expect(isWartimeImportDemandGood({ name: "Grain", tags: ["food"], warEconomyType: "essential" })).toBe(true);
    expect(isWartimeImportDemandGood({ name: "Silk", tags: ["luxury"], warEconomyType: "luxury" })).toBe(false);
    expect(isWartimeImportDemandGood({ name: "Timber", tags: ["construction"] })).toBe(false);
  });

  it("scales the import reserve with warIntensity only for hoarded goods", () => {
    const arms = { name: "Arms", tags: ["military"], warEconomyType: "military" as const };
    expect(wartimeTradeReserveMultiplier(0, arms)).toBe(1);
    expect(wartimeTradeReserveMultiplier(2, arms)).toBe(2);
    expect(wartimeTradeReserveMultiplier(2, { name: "Silk", tags: ["luxury"], warEconomyType: "luxury" })).toBe(1);
  });
});

describe("MarketsModule", () => {
  it("keeps Wine pomace when cell-local grape processing supplies a market directly", () => {
    const wine = {
      recipes: [{ 7: 0.26, 8: 0.08 }],
      byproducts: [{ 9: 0.0572 }]
    };

    expect(getCommercialRecipeByproducts(wine, 7, 0.26, 411.24)).toEqual([{ goodId: 9, units: 23.522928 }]);
  });

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
        goods: { 0: { stock: 100, price: 10 } },
        marketTreasury: { balance: 0, ruralGrainPayable: 0 }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market1];
      setMarkets([market1]);
      const burg: Burg = { i: 1, market: 1, treasury: 15 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      const deal = marketsModule.buy({ burg, good: getGoods()[0], units: 5, budget: 15 });
      expect(deal).not.toBeNull();
      expect(deal!.units).toBe(1.36);
      expect(deal!.price).toBe(11);
      expect(deal!.units * deal!.price).toBeLessThanOrEqual(15);
      expect(market1.goods[0].stock).toBeCloseTo(100 - 1.36, 2);
      expect(market1.marketTreasury?.balance).toBeCloseTo(deal!.units * deal!.price, 2);
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
      setMarkets([market1]);
      const burg: Burg = { i: 1, market: 1, treasury: 0.05 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      const deal = marketsModule.buy({ burg, good: getGoods()[0], units: 5, budget: 0.05 });
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
      setMarkets([market]);
      const burg: Burg = { i: 1, market: 1, treasury: 100 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      getGoods()[0].name = "Gunpowder";
      worldContext.options.gunpowderEraEnabled = false;

      expect(marketsModule.buy({ burg, good: getGoods()[0], units: 5 })).toBeNull();
      expect(getDeals()).toEqual([]);
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
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];
      marketsModule.runGlobalTrade();
      expect(getDeals()).toHaveLength(1);
      // Goods remain in transit until the spawned caravan reaches the importer.
      expect(market2.goods[0].stock).toBe(0);
      expect(market1.goods[0].stock).toBeLessThan(100);
    });

    it("imports more military goods into a warIntensity=2 market than an otherwise identical peacetime market", () => {
      Object.assign(getGoods()[0], {
        name: "Arms",
        tags: ["military"],
        warEconomyType: "military",
        demandCoverage: { military: 1 }
      });
      Goods.sync();

      const exporter: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 200, price: 5 } }
      };
      const peaceImporter: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 0, price: 20 } }
      };
      const warImporter: Market = {
        i: 3,
        centerBurgId: 3,
        color: "#0000ff",
        goods: { 0: { stock: 0, price: 20 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2 } as unknown as Burg;
      const burg3: Burg = { i: 3, x: 300, y: 100, population: 100, market: 3 } as unknown as Burg;
      setMarkets([exporter, peaceImporter, warImporter]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2, burg3];
      setBurgMarketLedgers([
        { burgId: 1, marketId: 1, merchants: [], warIntensity: 0 },
        { burgId: 2, marketId: 2, merchants: [], warIntensity: 0 },
        { burgId: 3, marketId: 3, merchants: [], warIntensity: 2 }
      ]);
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [undefined as unknown as Market, exporter, peaceImporter, warImporter];

      marketsModule.runGlobalTrade();

      const imported = (marketId: number) =>
        getDeals()
          .filter(deal => deal.sellerType === "market" && deal.buyerType === "market" && deal.buyer === marketId)
          .reduce((sum, deal) => sum + deal.units, 0);

      expect(imported(3)).toBeGreaterThan(imported(2));
      expect(imported(3)).toBeGreaterThan(0);
    });

    it("routes finished armory goods to a market with an outstanding State order", () => {
      Object.assign(getGoods()[0], {
        name: "Artillery",
        tags: ["military"],
        unit: "cannon",
        retailLotSize: 0.01,
        demandCoverage: {}
      });
      Goods.sync();

      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 1, price: 5 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 0, price: 200 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 0, market: 1, state: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 0, market: 2, state: 2 } as unknown as Burg;
      const order: MetallurgWorkOrder = {
        id: 1,
        ownerKind: "state",
        ownerId: 2,
        destinationMarketId: 2,
        productGoodId: 0,
        kind: "newBuild",
        recipeIndex: 0,
        requestedUnits: 0.2,
        completedUnits: 0,
        plannedWork: 0.2,
        completedWork: 0,
        materials: [],
        status: "queued",
        createdMonth: 0,
        updatedMonth: 0
      };

      setMarkets([market1, market2]);
      setMetallurgWorkOrders([order]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];

      marketsModule.runGlobalTrade();

      const deal = getDeals().find(
        candidate => candidate.good === 0 && candidate.seller === 1 && candidate.buyer === 2
      );
      expect(deal).toBeDefined();
      expect(deal!.units).toBeCloseTo(0.24, 6);
      expect(market1.goods[0].stock).toBeCloseTo(0.76, 6);
    });

    it("runGlobalTrade() should round liveAnimal ('head'-unit) goods to a whole-unit deal instead of fractioning them", () => {
      const liveAnimalGood = {
        ...getGoods()[0],
        i: 998,
        name: "Cats",
        tags: ["liveAnimal"],
        unit: "head"
      };
      worldContext.pack.goods = [...getGoods(), liveAnimalGood];

      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { [liveAnimalGood.i]: { stock: 6.7, price: 5 } }
      };
      const market2: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { [liveAnimalGood.i]: { stock: 0, price: 20 } }
      };
      const burg1: Burg = { i: 1, x: 100, y: 100, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, x: 200, y: 100, population: 100, market: 2 } as unknown as Burg;
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];

      marketsModule.runGlobalTrade();

      const deal = getDeals().find(candidate => candidate.good === liveAnimalGood.i);
      expect(deal).toBeDefined();
      expect(Number.isInteger(deal!.units)).toBe(true);
      expect(deal!.units).toBeGreaterThan(0);
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
      setMarkets([market1, market2]);
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
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      worldContext.pack.states = [
        { i: 0, salesTax: 0 },
        { i: 1, salesTax: 0.2 },
        { i: 2, salesTax: 0.1 }
      ] as unknown as PackedGraph["states"];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];
      marketsModule.runGlobalTrade();

      const tradeDeal = getDeals().find(d => d.sellerType === "market" && d.seller === 1 && d.buyerType === "market");
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
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];

      marketsModule.initializeMarketPrices();

      expect(market1.goods[0].price).not.toBe(market2.goods[0].price);
      expect(market1.goods[0].price).toBeGreaterThan(0);
      expect(market2.goods[0].price).toBeGreaterThan(0);
    });

    it("initializeMarketPrices() should leave stapleFood-tagged goods' price untouched", () => {
      const grain = {
        i: 1,
        name: "Grain",
        value: 1,
        tags: ["food", "stapleFood"],
        unit: "wain",
        icon: "icon",
        color: "#fff",
        distribution: "1",
        recipes: []
      };
      worldContext.pack = { ...worldContext.pack, goods: [...getGoods(), grain] } as unknown as PackedGraph;

      const market1: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 10, price: 10 }, 1: { stock: 500, price: 1.23 } }
      };
      const burg1: Burg = { i: 1, population: 100, market: 1 } as unknown as Burg;
      setMarkets([market1]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1];

      marketsModule.initializeMarketPrices();

      expect(market1.goods[grain.i].price).toBe(1.23);
    });

    it("initializeMarketPrices() should compress a manufactured good's markup toward cost when oversupplied, and set costBasis", () => {
      const bread = {
        i: 1,
        name: "Bread",
        value: 20,
        tags: [],
        unit: "loaf",
        icon: "icon",
        color: "#fff",
        recipes: [{ 0: 1 }],
        demandCoverage: { utilities: 1 }
      };
      worldContext.pack = { ...worldContext.pack, goods: [...getGoods(), bread] } as unknown as PackedGraph;
      Goods.sync();

      const scarceMarket: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 10, price: 10 }, 1: { stock: 1, price: 20 } }
      };
      const glutMarket: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 0: { stock: 10, price: 10 }, 1: { stock: 1000, price: 20 } }
      };
      const burg1: Burg = { i: 1, population: 100, market: 1 } as unknown as Burg;
      const burg2: Burg = { i: 2, population: 100, market: 2 } as unknown as Burg;
      setMarkets([scarceMarket, glutMarket]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];

      marketsModule.initializeMarketPrices();

      const scarcePrice = scarceMarket.goods[bread.i].price;
      const glutPrice = glutMarket.goods[bread.i].price;
      const costBasis = glutMarket.goods[bread.i].costBasis;

      // Flooding a market with an already-manufactured good pulls its price down toward the
      // ingredient cost basis (compressed markup), while a scarce market keeps a fuller markup.
      expect(costBasis).toBeGreaterThan(0);
      expect(scarcePrice).toBeGreaterThan(glutPrice);
      expect(glutPrice - costBasis!).toBeLessThan(scarcePrice - costBasis!);
    });

    it("relaxes prices toward the demand/stock target instead of snapping (L1)", () => {
      const spice = {
        i: 1,
        name: "Spice",
        value: 10,
        tags: [],
        unit: "sack",
        icon: "icon",
        color: "#fff",
        distribution: "1",
        recipes: [],
        demandCoverage: { utilities: 1 },
        priceElasticity: 0
      };
      worldContext.pack = { ...worldContext.pack, goods: [...getGoods(), spice] } as unknown as PackedGraph;
      Goods.sync();

      const market: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 1: { stock: 0, price: 10 } }
      };
      setMarkets([market]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, population: 100, market: 1 } as unknown as Burg];

      marketsModule.initializeMarketPrices();

      // Empty stock would snap to the 3× ceiling without relaxation; a single cycle only
      // closes PRICE_ADJUSTMENT_RATE of that gap (local-trade bias may nudge it further).
      expect(market.goods[1].price).toBeGreaterThan(10);
      expect(market.goods[1].price).toBeLessThan(30);
    });

    it("drops demand and eases the price spike when an elastic good's stock is halved (L1)", () => {
      const silk = {
        i: 1,
        name: "Silk",
        value: 10,
        tags: [],
        unit: "bolt",
        icon: "icon",
        color: "#fff",
        distribution: "1",
        recipes: [],
        demandCoverage: { utilities: 1 },
        priceElasticity: -1
      };
      worldContext.pack = { ...worldContext.pack, goods: [...getGoods(), silk] } as unknown as PackedGraph;
      Goods.sync();

      const glut: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 1: { stock: 40, price: 10 } }
      };
      const scarce: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#00ff00",
        goods: { 1: { stock: 20, price: 10 } }
      };
      setMarkets([glut, scarce]);
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, population: 100, market: 1 } as unknown as Burg,
        { i: 2, population: 100, market: 2 } as unknown as Burg
      ];

      marketsModule.initializeMarketPrices();

      const glutPrice = glut.goods[1].price;
      const scarcePrice = scarce.goods[1].price;
      expect(scarcePrice).toBeGreaterThan(glutPrice);

      const glutDemand = applyPriceElasticity(15, silk, glutPrice);
      const scarceDemand = applyPriceElasticity(15, silk, scarcePrice);
      expect(scarceDemand).toBeLessThan(glutDemand);

      marketsModule.initializeMarketPrices();
      expect(scarce.goods[1].price).toBeGreaterThan(glut.goods[1].price);
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
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];
      marketsModule.runGlobalTrade();

      expect(getDeals()).toEqual([]);
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
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];

      marketsModule.runGlobalTrade();

      expect(getDeals().some(deal => deal.sellerType === "market" && deal.buyerType === "market")).toBe(true);
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
      setMarkets([market1, market2]);
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg1, burg2];
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market2];

      marketsModule.runGlobalTrade();

      const tradeDeals = getDeals().filter(deal => deal.sellerType === "market" && deal.buyerType === "market");
      expect(tradeDeals).toHaveLength(1);
      const [tradeDeal] = tradeDeals;
      const seller = tradeDeal.seller === market1.i ? market1 : market2;
      const buyer = tradeDeal.buyer === market1.i ? market1 : market2;
      expect(seller.goods[0].stock).toBeLessThan(10);
      expect(buyer.goods[0].stock).toBe(10);
    });

    it("addMarket() should claim only the center burg's cell and preserve existing borders", () => {
      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      setMarkets([market1]);
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
      expect(Array.from(getMarketCellColumn())).toEqual([1, 1, 1, 2]);
      expect(centerBurg.market).toBe(2);
      expect(centerBurg.plaza).toBe(1);
      expect(marketsModule.get(2)).toBe(newMarket);
    });

    it("addMarket() should reject a burg that already centers a market", () => {
      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      setMarkets([market1]);
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, cell: 0 } as unknown as Burg];
      worldContext.pack.cells = { i: [0], market: Uint16Array.from([1]) } as unknown as PackedGraph["cells"];

      expect(marketsModule.addMarket(1)).toBeNull();
      expect(getMarkets()).toHaveLength(1);
    });

    it("collectRuralProduction() should ignore cells with no market (market 0)", async () => {
      const { Goods } = await import("./goods-generator");
      const { getRuralProductionContributions } = await import("./production-utils");
      const good = getGoods()[0];

      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      setMarkets([market1]);
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
      vi.mocked(getRuralProductionContributions).mockReturnValue([{ goodId: good.i, amount: 5 }]);

      marketsModule.collectRuralProduction();

      expect(market1.goods[good.i].stock).toBe(10);
      expect(getRuralProductionContributions).toHaveBeenCalledTimes(2);

      marketsModule.collectRuralProduction();
      expect(getRuralProductionContributions).toHaveBeenCalledTimes(2);

      marketsModule.invalidateRuralProductionCache();
      marketsModule.collectRuralProduction();
      expect(getRuralProductionContributions).toHaveBeenCalledTimes(4);
    });

    it("collectRuralProduction() should skip stapleFood-tagged goods entirely", async () => {
      const { Goods } = await import("./goods-generator");
      const { getRuralProductionContributions } = await import("./production-utils");

      const grain = {
        i: 1,
        name: "Grain",
        value: 1,
        tags: ["food", "stapleFood"],
        unit: "wain",
        icon: "icon",
        color: "#fff",
        distribution: "1",
        recipes: []
      };
      worldContext.pack = { ...worldContext.pack, goods: [...getGoods(), grain] } as unknown as PackedGraph;

      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      setMarkets([market1]);
      const index: Market[] = [];
      index[market1.i] = market1;
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = index;

      worldContext.pack.cells = {
        i: [0, 1],
        market: Uint16Array.from([1, 1])
      } as unknown as PackedGraph["cells"];

      vi.mocked(Goods.getBiomesProduction).mockReturnValue({} as ReturnType<typeof Goods.getBiomesProduction>);
      vi.mocked(Goods.get).mockImplementation((id: number) => (id === grain.i ? grain : undefined));
      vi.mocked(getRuralProductionContributions).mockReturnValue([{ goodId: grain.i, amount: 5 }]);

      marketsModule.collectRuralProduction();

      expect(market1.goods[grain.i]).toBeUndefined();
    });

    it("collectRuralProduction() should place rural output at the nearest same-market collection burg", async () => {
      const { getRuralProductionContributions } = await import("./production-utils");
      const good = getGoods()[0];
      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      setMarkets([market1]);
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market1];
      worldContext.pack.burgs = [
        { i: 0 } as Burg,
        { i: 1, market: 1, x: 0, y: 0 } as Burg,
        { i: 2, market: 1, x: 100, y: 0 } as Burg
      ];
      worldContext.pack.cells = {
        i: [0, 1],
        p: [
          [10, 0],
          [90, 0]
        ],
        market: Uint16Array.from([1, 1]),
        state: Uint16Array.from([0, 0])
      } as unknown as PackedGraph["cells"];
      vi.mocked(Goods.get).mockImplementation((id: number) => (id === good.i ? good : undefined));
      vi.mocked(getRuralProductionContributions).mockReturnValue([{ goodId: good.i, amount: 5 }]);

      marketsModule.collectRuralProduction();

      expect(market1.goods[good.i].stock).toBe(10);
      expect(getBurgWholesaleInventories()).toEqual([
        { burgId: 1, marketId: 1, goods: { [good.i]: 5 } },
        { burgId: 2, marketId: 1, goods: { [good.i]: 5 } }
      ]);
      expect(validateRetailInventory()).toEqual([]);
    });

    it("collectRuralProduction() should convert liveAnimal-tagged goods to integer catches instead of a continuous trickle", async () => {
      const { getRuralProductionContributions } = await import("./production-utils");
      const liveAnimalGood = { ...getGoods()[0], i: 999, name: "Cats", tags: ["liveAnimal"] };

      const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: {} };
      setMarkets([market1]);
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market1];
      worldContext.pack.cells = {
        i: [0],
        market: Uint16Array.from([1])
      } as unknown as PackedGraph["cells"];
      vi.mocked(Goods.get).mockImplementation((id: number) => (id === liveAnimalGood.i ? liveAnimalGood : undefined));
      vi.mocked(getRuralProductionContributions).mockReturnValue([{ goodId: liveAnimalGood.i, amount: 0.2 }]);

      // Fixed at 0.999 so only the deterministic "guaranteed" branch of the accumulator (once
      // the banked amount reaches 1) ever produces a catch — the fractional Bernoulli bonus never wins.
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);

      for (let i = 0; i < 4; i++) {
        marketsModule.invalidateRuralProductionCache();
        marketsModule.collectRuralProduction();
        // 0.2/month banked but never reaches the 1-unit threshold -> no stock yet, not a fractional trickle.
        expect(market1.goods[liveAnimalGood.i]?.stock ?? 0).toBe(0);
      }

      marketsModule.invalidateRuralProductionCache();
      marketsModule.collectRuralProduction();
      // 5th month: 0.2 * 5 = 1.0 banked -> one whole catch lands at once.
      expect(market1.goods[liveAnimalGood.i].stock).toBe(1);

      randomSpy.mockRestore();
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
        goods: { 0: { stock: 0, price: 10 } },
        marketTreasury: { balance: 100, ruralGrainPayable: 0 }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market1, market1];
      setMarkets([market1]);
      const burg: Burg = { i: 1, market: 1, state: 1 } as unknown as Burg;
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, burg];
      worldContext.pack.states = [
        { i: 0, salesTax: 0 },
        { i: 1, salesTax: 0.2 }
      ] as unknown as PackedGraph["states"];
      const taxRate = States.getSalesTax(burg);
      const deal = marketsModule.sell({ burg, good: getGoods()[0], units: 5, taxRate });
      expect(deal).not.toBeNull();
      expect(deal!.tax).toBeGreaterThan(0);
      expect(deal!.tax).toBeCloseTo(deal!.units * deal!.price * 0.2, 2);
      expect(market1.marketTreasury?.balance).toBe(55);
      expect(getBurgWholesaleInventories()).toEqual([{ burgId: 1, marketId: 1, goods: { 0: 5 } }]);
      expect(validateRetailInventory()).toEqual([]);
    });

    it("does not credit a Burg sale when the Market cannot pay for it", () => {
      const market: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 0, price: 10 } },
        marketTreasury: { balance: 0, ruralGrainPayable: 0 }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market, market];
      setMarkets([market]);
      const burg: Burg = { i: 1, market: 1 } as unknown as Burg;

      expect(marketsModule.sell({ burg, good: getGoods()[0], units: 5, taxRate: 0 })).toBeNull();
      expect(market.goods[0].stock).toBe(0);
      expect(market.marketTreasury?.balance).toBe(0);
    });

    it("limits a Burg sale to its reserved Market purchase budget", () => {
      const market: Market = {
        i: 1,
        centerBurgId: 1,
        color: "#ff0000",
        goods: { 0: { stock: 0, price: 10 } },
        marketTreasury: { balance: 100, ruralGrainPayable: 0 }
      };
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [market, market];
      setMarkets([market]);
      const burg: Burg = { i: 1, market: 1 } as unknown as Burg;

      const deal = marketsModule.sell({ burg, good: getGoods()[0], units: 5, taxRate: 0, budget: 18 });

      expect(deal?.units).toBe(2);
      expect(market.goods[0].stock).toBe(2);
      expect(market.marketTreasury?.balance).toBe(82);
    });

    it("sync() should rebuild the id index so get() resolves markets after a load", () => {
      const market3: Market = { i: 3, centerBurgId: 30, color: "#fff", goods: {} };
      const market7: Market = { i: 7, centerBurgId: 70, color: "#fff", goods: {} };
      setMarkets([market3, market7]);
      expect(marketsModule.get(3)).toBe(market3);

      marketsModule.sync();

      expect(marketsModule.get(3)).toBe(market3);
      expect(marketsModule.get(7)).toBe(market7);
      expect(marketsModule.get(99)).toBeUndefined();
    });

    it("sync() should tolerate holes in pack.markets", () => {
      const market2: Market = { i: 2, centerBurgId: 20, color: "#fff", goods: {} };
      setMarkets([null as unknown as Market, market2]);
      expect(() => marketsModule.sync()).not.toThrow();
      expect(marketsModule.get(2)).toBe(market2);
    });

    it("addMineSupply writes to a loaded market before the transient index is synchronized", () => {
      const ore = { i: 4, name: "Iron Ore", tags: ["ore"], value: 2, unit: "wagon", icon: "iron", color: "#777" };
      const destination: Market = { i: 4, centerBurgId: 1, color: "#111", goods: {} };
      setMarkets([destination]);
      setGoods([ore]);
      vi.mocked(Goods.get).mockImplementation((id: number) => (id === ore.i ? ore : undefined));
      // biome-ignore lint/complexity/useLiteralKeys: emulate a loaded map before Markets.sync()
      marketsModule["marketById"] = [];

      expect(marketsModule.addMineSupply(4, 4, 2.5)).toBe(2.5);
      expect(destination.goods[4].stock).toBe(2.5);
    });
  });

  describe("frontier state-bounded territories", () => {
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
      worldContext.pack = {
        characters: [],
        cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
        goods: [],
        markets: [],
        burgs: [],
        deals: [],
        states: [{ i: 0, salesTax: 0 }]
      } as unknown as PackedGraph;
    });

    function installFrontierWorld(): void {
      worldContext.graphWidth = 2000;
      worldContext.graphHeight = 1600;
      worldContext.options = {
        ...worldContext.options,
        initialSettlementPattern: "frontier"
      } as typeof worldContext.options;
      worldContext.pack.states = [
        { i: 0 },
        { i: 1, capital: 1 },
        { i: 2, capital: 2 },
        { i: 3, capital: 3 }
      ] as unknown as PackedGraph["states"];
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, cell: 0, state: 1, capital: 1, x: 50, y: 50, name: "North" } as unknown as Burg,
        { i: 2, cell: 5, state: 2, capital: 1, x: 1900, y: 50, name: "East" } as unknown as Burg,
        { i: 3, cell: 8, state: 3, capital: 1, x: 50, y: 1500, name: "South" } as unknown as Burg
      ];
      worldContext.pack.cells = {
        i: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        h: [25, 25, 25, 25, 25, 25, 10, 25, 25],
        c: [[1], [0, 2], [1, 3], [2, 4], [3], [4], [5], [8], [7]],
        state: Uint16Array.from([1, 0, 0, 0, 0, 2, 0, 0, 3]),
        f: [1, 1, 1, 1, 1, 1, 2, 1, 1]
      } as unknown as PackedGraph["cells"];
    }

    it("places one market per state instead of one continent-wide catchment", () => {
      installFrontierWorld();
      // biome-ignore lint/complexity/useLiteralKeys: private factory under test
      const markets = marketsModule["createMarkets"]() as Market[];

      expect(markets).toHaveLength(3);
      expect(markets.map(market => market.centerBurgId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it("assigns only governed land to each state's market and leaves wilderness empty", () => {
      installFrontierWorld();
      // biome-ignore lint/complexity/useLiteralKeys: private factory under test
      const markets = marketsModule["createMarkets"]() as Market[];
      setMarkets(markets);
      // biome-ignore lint/complexity/useLiteralKeys: private expansion under test
      const territories = marketsModule["expandMarkets"](markets) as Uint16Array;

      const marketByBurg = Object.fromEntries(markets.map(market => [market.centerBurgId, market.i]));
      expect(territories[0]).toBe(marketByBurg[1]);
      expect(territories[5]).toBe(marketByBurg[2]);
      expect(territories[8]).toBe(marketByBurg[3]);
      expect(territories[1]).toBe(0);
      expect(territories[2]).toBe(0);
      expect(territories[3]).toBe(0);
      expect(territories[4]).toBe(0);
      expect(worldContext.pack.burgs[1].market).toBe(marketByBurg[1]);
    });

    it("expands a state's market onto newly incorporated cells of that state only", () => {
      installFrontierWorld();
      // biome-ignore lint/complexity/useLiteralKeys: private factory under test
      const markets = marketsModule["createMarkets"]() as Market[];
      setMarkets(markets);
      marketsModule.expandTerritories(markets);

      worldContext.pack.cells.state[1] = 1;
      worldContext.pack.cells.state[2] = 1;
      expect(marketsModule.syncStateBoundedTerritories()).toBe(true);

      const column = getMarketCellColumn();
      const homeMarket = worldContext.pack.burgs[1].market;
      expect(column[1]).toBe(homeMarket);
      expect(column[2]).toBe(homeMarket);
      expect(column[3]).toBe(0);
      expect(column[5]).not.toBe(homeMarket);
    });

    it("rejects a river-connected foreign market even when pathfinding finds a route", () => {
      installFrontierWorld();
      setGoods([
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
      ]);
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
      setMarkets([market1, market2]);
      marketsModule.sync();

      expect(marketsModule.isDomesticTradePair(worldContext.pack.burgs[1], worldContext.pack.burgs[2])).toBe(false);
      expect(marketsModule.isDomesticTradePair(worldContext.pack.burgs[1], worldContext.pack.burgs[1])).toBe(true);

      marketsModule.runGlobalTrade();
      expect(getDeals().filter(deal => deal.sellerType === "market" && deal.buyerType === "market")).toEqual([]);
    });

    it("does not invent inter-state trade deals across trail-less wilderness", () => {
      installFrontierWorld();
      setGoods([
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
      ]);
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
      setMarkets([market1, market2]);
      // biome-ignore lint/complexity/useLiteralKeys: private access for testing
      marketsModule["marketById"] = [];
      marketsModule.sync();

      marketsModule.runGlobalTrade();

      expect(getDeals().filter(deal => deal.sellerType === "market" && deal.buyerType === "market")).toEqual([]);
    });

    it("adds a new burg to the existing state market instead of opening a rival", () => {
      installFrontierWorld();
      // biome-ignore lint/complexity/useLiteralKeys: private factory under test
      const markets = marketsModule["createMarkets"]() as Market[];
      setMarkets(markets);
      marketsModule.expandTerritories(markets);

      const village: Burg = { i: 4, cell: 1, state: 1, x: 80, y: 50, name: "Outpost" } as unknown as Burg;
      worldContext.pack.burgs.push(village);
      worldContext.pack.cells.state[1] = 1;

      expect(marketsModule.addMarket(4)).toBeNull();
      expect(village.market).toBe(worldContext.pack.burgs[1].market);
      expect(getMarkets()).toHaveLength(3);
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
    setMarkets([market]);
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

describe("MarketsModule craft calibration demand", () => {
  let marketsModule: MarketsModule;

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    marketsModule = new MarketsModule();
    worldContext.options = { gunpowderEraEnabled: true } as typeof worldContext.options;
    setEconomyCalibrationState({ applyCalibration: false });
  });

  afterEach(() => {
    setEconomyCalibrationState({ applyCalibration: false });
    clearEconomyContext();
  });

  it("leaves Barrels in the utilities residual while applyCalibration is off", () => {
    const wood = { i: 1, name: "Wood", demandCoverage: { utilities: 1 } } as Good;
    const barrels = { i: 2, name: "Barrels", demandCoverage: { utilities: 1 } } as Good;
    const goods = [wood, barrels];
    // biome-ignore lint/complexity/useLiteralKeys: private collector
    const off = marketsModule["collectConsumerDemand"](goods);
    expect(off[2]).toBeCloseTo(off[1]);
    expect(off[2]).toBeCloseTo(DEMAND_TARGET_FACTORS.utilities / 2);
  });

  it("gives remaining utilities residual to uncalibrated goods when applyCalibration is on", () => {
    const wood = { i: 1, name: "Wood", demandCoverage: { utilities: 1 } } as Good;
    const barrels = { i: 2, name: "Barrels", demandCoverage: { utilities: 1 } } as Good;
    setEconomyCalibrationState({ applyCalibration: true });
    // biome-ignore lint/complexity/useLiteralKeys: private collector
    const on = marketsModule["collectConsumerDemand"]([wood, barrels]);
    expect(on[2]).toBe(0);
    expect(on[1]).toBeCloseTo(DEMAND_TARGET_FACTORS.utilities);
  });

  it("counts Beer barrel industrial demand four times off and once on", () => {
    const barley = { i: 1, name: "Barley", value: 1 } as Good;
    const barrels = { i: 2, name: "Barrels", value: 2 } as Good;
    const beer = {
      i: 10,
      name: "Beer",
      value: 4,
      recipes: [
        { 1: 1, 2: 0.08 },
        { 1: 1, 2: 0.08 },
        { 1: 1, 2: 0.08 },
        { 1: 1, 2: 0.08 }
      ]
    } as Good;
    const previousGet = vi.mocked(Goods.get).getMockImplementation();
    vi.mocked(Goods.get).mockImplementation((id: number) => {
      if (id === 1) return barley;
      if (id === 2) return barrels;
      if (id === 10) return beer;
      return undefined;
    });
    try {
      const consumer: number[] = [];
      consumer[10] = 1;
      // biome-ignore lint/complexity/useLiteralKeys: private collector
      const off = marketsModule["collectIndustrialDemand"]([beer], consumer);
      expect(off[2]).toBeCloseTo(0.32);
      setEconomyCalibrationState({ applyCalibration: true });
      // biome-ignore lint/complexity/useLiteralKeys: private collector
      const on = marketsModule["collectIndustrialDemand"]([beer], consumer);
      expect(on[2]).toBeCloseTo(0.08);
    } finally {
      if (previousGet) vi.mocked(Goods.get).mockImplementation(previousGet);
    }
  });
});
