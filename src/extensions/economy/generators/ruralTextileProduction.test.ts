import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  initEconomyContext,
  setBurgMarketLedgers,
  setFarmLaborRequired,
  setGoods,
  setHouseholdTextileWorkers,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { getGoodDemandCalibration } from "./craftDemandCalibration";
import { type Good, Goods } from "./goods-generator";
import { type GoodFlowRecord, setGoodFlowObserver } from "./goodsBalanceLedger";
import { Markets } from "./markets-generator";
import type { FoodLedger } from "./marketTypes";
import { settleRuralTextileProduction } from "./ruralTextileProduction";
import {
  getMarketBlanketDemandProfile,
  getMarketTextileDemandProfile,
  getTextileMarketOrders,
  settleTextileHouseholdDemand
} from "./textileDemand";
import { getRuralTextileRequiredWorkers } from "./textileHouseholdPolicy";
import { TEXTILE_RECIPES } from "./textileRecipeContracts";

const byName = (name: string) => getGoods().find(good => good.name === name)!;

describe("rural household wool processing", () => {
  let flows: GoodFlowRecord[];
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.grid = { cells: { temp: Int8Array.from([10]) } } as typeof worldContext.grid;
    worldContext.pack = {
      burgs: [],
      states: [],
      cells: {
        i: [0],
        h: Uint8Array.from([30]),
        pop: Float32Array.from([100]),
        g: Uint16Array.from([0]),
        maleAdults: Float32Array.from([20]),
        femaleAdults: Float32Array.from([20])
      }
    } as unknown as PackedGraph;
    setGoods(["Wool", "Wool Cloth", "Wool Garments", "Wool Blankets"].map(name => Goods.getDefaultGood(name)!));
    Goods.sync();
    setMarketCellColumn(Uint16Array.from([1]));
    setBurgMarketLedgers([]);
    setHouseholdTextileWorkers(Float32Array.from([5000]));
    setFarmLaborRequired(Float32Array.from([30]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 0,
        color: "",
        goods: Object.fromEntries(
          getGoods().map(good => [good.i, { stock: good.name === "Wool" ? 1000 : 0, price: good.value }])
        ),
        foodLedger: { ruralHouseholdWealth: 100_000 } as FoodLedger,
        marketTreasury: { balance: 10, ruralGrainPayable: 0 }
      }
    ]);
    flows = [];
    setGoodFlowObserver(flow => flows.push(flow));
  });
  afterEach(() => {
    setGoodFlowObserver(null);
    clearEconomyContext();
  });

  const addPlantRoutes = () => {
    setGoods(
      [
        "Wool",
        "Wool Cloth",
        "Wool Garments",
        "Wool Blankets",
        "Flax",
        "Linen",
        "Linen Garments",
        "Hemp",
        "Cotton",
        "Cloth",
        "Garments"
      ].map(name => Goods.getDefaultGood(name)!)
    );
    Goods.sync();
    const market = getMarkets()[0];
    market.goods = Object.fromEntries(getGoods().map(good => [good.i, { stock: 0, price: good.value }]));
    return market;
  };

  it.each([
    ["Flax", "Linen", "Linen Garments"],
    ["Hemp", "Cloth", "Garments"],
    ["Cotton", "Cloth", "Garments"]
  ])(
    "self-supplies from paid %s with both processing stages and the shared wardrobe target",
    (fiber, cloth, product) => {
      const market = addPlantRoutes();
      market.goods[byName(fiber).i].stock = 5000;
      const before = market.foodLedger!.ruralHouseholdWealth!;
      settleTextileHouseholdDemand();
      const home = market.ruralTextileProduction!;
      expect(home.garments).toBeGreaterThan(0);
      expect(home.garments).toBeLessThanOrEqual(getMarketTextileDemandProfile(1).monthlyDemand);
      expect(home.blankets).toBe(0);
      const fiberPerProduct =
        TEXTILE_RECIPES[cloth].find(recipe => recipe[fiber])![fiber] * TEXTILE_RECIPES[product][0][cloth];
      const used = 5000 - market.goods[byName(fiber).i].stock;
      expect(used).toBeCloseTo(home.garments * fiberPerProduct, 8);
      expect(used * byName(fiber).value).toBeCloseTo(home.garmentSpending, 8);
      expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(before - home.garmentSpending, 8);
      expect(market.marketTreasury!.balance).toBeCloseTo(10 + home.garmentSpending, 8);
      expect(home.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
      for (const name of [cloth, product]) {
        expect(market.goods[byName(name).i].stock).toBe(0);
        const balance = flows
          .filter(flow => flow.goodId === byName(name).i)
          .reduce((sum, flow) => sum + (flow.direction === "source" ? flow.units : -flow.units), 0);
        expect(balance).toBeCloseTo(0, 8);
      }
      expect(flows.some(flow => flow.goodId === byName(product).i && flow.category === "householdTextiles")).toBe(true);
    }
  );

  it("uses cheaper fiber first then falls back within one need, budget and labor limit", () => {
    const market = addPlantRoutes();
    const cottonPerGarment = TEXTILE_RECIPES.Cloth[2].Cotton * TEXTILE_RECIPES.Garments[0].Cloth;
    market.goods[byName("Cotton").i] = { stock: cottonPerGarment / 4, price: 1 };
    market.goods[byName("Wool").i] = { stock: 100, price: 100 };
    const home = settleRuralTextileProduction(market, 1, 0, 1000, 0);
    expect(home.garments).toBeCloseTo(1, 3);
    expect(home.garments).toBeLessThanOrEqual(1);
    expect(home.garmentSpending).toBeLessThanOrEqual(1000);
    expect(home.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
    expect(market.goods[byName("Cotton").i].stock).toBeLessThan(0.01);
    expect(market.goods[byName("Wool").i].stock).toBeLessThan(100);
    expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(100_000 - home.garmentSpending, 8);
  });

  it("reserves labor with no wool chain and counts alternative fibers only once", () => {
    addPlantRoutes();
    const goods = getGoods();
    const linenOnly = goods.filter(good => ["Flax", "Linen", "Linen Garments"].includes(good.name));
    const woolOnly = goods.filter(good => ["Wool", "Wool Cloth", "Wool Garments"].includes(good.name));
    const linen = getRuralTextileRequiredWorkers(worldContext, 0, linenOnly);
    const wool = getRuralTextileRequiredWorkers(worldContext, 0, woolOnly);
    expect(linen).toBeGreaterThan(0);
    expect(getRuralTextileRequiredWorkers(worldContext, 0, [...linenOnly, ...woolOnly])).toBeCloseTo(
      Math.max(linen, wool),
      8
    );
  });

  it.each(["technology", "byproduct", "multiple inputs"])("leaves linen recipes with %s to workshops", gate => {
    const market = addPlantRoutes();
    market.goods[byName("Flax").i].stock = 5000;
    const linen = byName("Linen");
    if (gate === "technology") linen.recipeTechnologies = ["restricted"];
    if (gate === "byproduct") linen.byproducts = [{ 12345: 1 }];
    if (gate === "multiple inputs") linen.recipes![0][12345] = 1;
    expect(settleRuralTextileProduction(market, 1, 0, 1000, 0).garments).toBe(0);
    expect(market.goods[byName("Flax").i].stock).toBe(5000);
  });

  it.each([
    ["Wool Cloth", "Wool Garments"],
    ["Cloth", "Garments"],
    ["Linen", "Linen Garments"],
    ["Wool Cloth", "Wool Blankets"]
  ])("buys %s for %s and charges tailoring without repeating weaving", (cloth, product) => {
    const market = addPlantRoutes();
    const bedding = product === "Wool Blankets";
    market.goods[byName(cloth).i] = { stock: 100, price: 10 };
    const home = settleRuralTextileProduction(market, bedding ? 0 : 1, bedding ? 1 : 0, 1000, 1000);
    const produced = bedding ? home.blankets : home.garments;
    expect(produced).toBeGreaterThan(0);
    const clothPerProduct = TEXTILE_RECIPES[product][0][cloth];
    expect(100 - market.goods[byName(cloth).i].stock).toBeCloseTo(produced * clothPerProduct, 8);
    expect(home.laborUsed).toBeCloseTo(
      produced * getGoodDemandCalibration(product)!.laborPointsPerLotAtDefaultRate * 1000,
      8
    );
    expect(home.purchasedClothSpending).toBeCloseTo(produced * clothPerProduct * 10, 8);
    expect(home.purchasedClothGarments).toBe(home.garments);
    expect(home.purchasedClothBlankets).toBe(home.blankets);
    expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(100_000 - home.purchasedClothSpending!, 8);
    expect(market.marketTreasury!.balance).toBeCloseTo(10 + home.purchasedClothSpending!, 8);
    expect(flows.filter(flow => flow.goodId === byName(cloth).i && flow.direction === "source")).toHaveLength(0);
    expect(flows.filter(flow => flow.goodId === byName(cloth).i && flow.direction === "sink")).toHaveLength(1);
    expect(market.goods[byName(product).i].stock).toBe(0);
  });

  it("shares the target and labor between home weaving and bought cloth without recreating market cloth", () => {
    const market = addPlantRoutes();
    const wool = byName("Wool");
    const cloth = byName("Wool Cloth");
    const woolPerProduct = 6 * TEXTILE_RECIPES["Wool Garments"][0]["Wool Cloth"];
    market.goods[wool.i] = { stock: woolPerProduct / 4, price: 1 };
    market.goods[cloth.i] = { stock: 100, price: 100 };
    const home = settleRuralTextileProduction(market, 1, 0, 1000, 0);
    expect(home.garments).toBeCloseTo(1, 3);
    expect(home.garments).toBeLessThanOrEqual(1);
    expect(home.purchasedClothGarments).toBeGreaterThan(0);
    expect(home.purchasedClothGarments).toBeLessThan(home.garments);
    expect(home.garmentSpending).toBeLessThanOrEqual(1000);
    const woven = flows
      .filter(flow => flow.goodId === cloth.i && flow.direction === "source")
      .reduce((sum, flow) => sum + flow.units, 0);
    const consumed = flows
      .filter(flow => flow.goodId === cloth.i && flow.direction === "sink")
      .reduce((sum, flow) => sum + flow.units, 0);
    expect(woven + 100 - market.goods[cloth.i].stock).toBeCloseTo(consumed, 8);
    expect(home.laborUsed).toBeCloseTo(home.garments * 972 + woven * 259, 8);
  });

  it("plans tailoring with no raw fiber and limits bought-cloth output by the remaining work and cash", () => {
    const market = addPlantRoutes();
    const supported = getGoods().filter(good => ["Linen", "Linen Garments"].includes(good.name));
    expect(getRuralTextileRequiredWorkers(worldContext, 0, supported)).toBeGreaterThan(0);
    setHouseholdTextileWorkers(Float32Array.from([1]));
    setFarmLaborRequired(Float32Array.from([0]));
    market.goods[byName("Linen").i] = { stock: 100, price: 10 };
    const home = settleRuralTextileProduction(market, 1, 0, 0.01, 0);
    expect(home.garments).toBeGreaterThan(0);
    expect(home.garmentSpending).toBeLessThanOrEqual(0.01);
    expect(home.laborUsed).toBeLessThanOrEqual(1);
    expect(home.garments).toBeLessThanOrEqual(1 / 972);
  });

  it("quotes affordable missing inputs without consuming stock, cash, work or flows", () => {
    const market = addPlantRoutes();
    market.foodLedger!.ruralHouseholdWealth = 100;
    const before = structuredClone(market);
    const orders = getTextileMarketOrders(market);
    expect(Object.values(orders.inputs).reduce((sum, units) => sum + units, 0)).toBeGreaterThan(0);
    const inputBill = Object.entries(orders.inputs).reduce(
      (sum, [id, units]) => sum + units * market.goods[+id].price,
      0
    );
    const garmentPrice = Math.min(
      ...["Garments", "Wool Garments", "Linen Garments"].map(name => market.goods[byName(name).i].price)
    );
    expect(
      inputBill + orders.wardrobes * garmentPrice + orders.blankets * market.goods[byName("Wool Blankets").i].price
    ).toBeLessThanOrEqual(5 + 1e-8);
    expect(getTextileMarketOrders(market)).toEqual(orders);
    expect(market).toEqual(before);
    expect(flows).toHaveLength(0);
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.garments).toBe(0);
  });

  it("does not quote inputs without rural cash or workers, or when finished supply meets the need", () => {
    const market = addPlantRoutes();
    market.goods[byName("Wool Garments").i].stock = 100;
    market.goods[byName("Wool Blankets").i].stock = 100;
    expect(getTextileMarketOrders(market).inputs).toEqual({});
    expect(getTextileMarketOrders(market).wardrobes).toBeGreaterThan(0);
    market.goods[byName("Wool Garments").i].stock = 0;
    market.goods[byName("Wool Blankets").i].stock = 0;
    setHouseholdTextileWorkers(new Float32Array());
    expect(getTextileMarketOrders(market).inputs).toEqual({});
    setHouseholdTextileWorkers(Float32Array.from([5000]));
    market.foodLedger!.ruralHouseholdWealth = 0;
    expect(getTextileMarketOrders(market)).toEqual({ wardrobes: 0, blankets: 0, inputs: {} });
  });

  it("adds the same paid input orders to price and trade demand while retaining custom demand", () => {
    const market = addPlantRoutes();
    Markets.sync();
    const orders = getTextileMarketOrders(market);
    const [id, units] = Object.entries(orders.inputs).find(([, units]) => units > 0)!;
    const good = getGoods().find(good => good.i === +id)!;
    good.priceElasticity = -1;
    const api = Markets as unknown as {
      calculateGoodDemand(
        good: Good,
        urban: number,
        textile: number,
        consumer: number,
        industrial: number,
        price: number,
        marketId: number
      ): number;
      calculateMarketTradeDemand(
        good: Good,
        marketId: number,
        urban: number,
        textile: number,
        consumer: number,
        industrial: number,
        ctx: unknown
      ): number;
    };
    expect(api.calculateGoodDemand(good, 10, 100, 0.2, 0.3, good.value * 2, 1)).toBeCloseTo(units + 2.5, 8);
    const ctx = {
      strategicDemandByMarket: new Map(),
      luxuryBudgets: null,
      textileOrdersByMarket: new Map([[1, orders]])
    };
    const expected = api.calculateGoodDemand(good, 10, 100, 0.2, 0.3, market.goods[good.i].price, 1);
    expect(api.calculateMarketTradeDemand(good, 1, 10, 100, 0.2, 0.3, ctx)).toBeCloseTo(expected, 8);
  });

  it.each([0, 0.5, 100])(
    "releases wardrobe savings to bedding and prefers the available %s blanket lots",
    blanketStock => {
      const market = getMarkets()[0];
      market.foodLedger!.ruralHouseholdWealth = 2000;
      market.goods[byName("Wool").i].price = 1;
      market.goods[byName("Wool Garments").i].price = 130;
      market.goods[byName("Wool Blankets").i] = { stock: blanketStock, price: 8 };
      const initial = structuredClone(market);
      const orders = getTextileMarketOrders(market);
      expect(market).toEqual(initial);
      const inputBill = Object.entries(orders.inputs).reduce(
        (sum, [id, units]) => sum + units * market.goods[+id].price,
        0
      );
      expect(inputBill + orders.wardrobes * 130 + orders.blankets * 8).toBeLessThanOrEqual(100 + 1e-8);
      settleTextileHouseholdDemand();
      const home = market.ruralTextileProduction!;
      expect(home.garments).toBeGreaterThan(0);
      expect(market.blanketLedger!.householdConsumption).toBeGreaterThan(0);
      expect(home.beddingDiagnostic!.beddingBudget).toBeGreaterThan(0);
      expect(home.beddingDiagnostic!.wardrobeHomeLots).toBe(home.garments);
      expect(home.beddingDiagnostic!.routes.reduce((sum, route) => sum + route.producedLots, 0)).toBeCloseTo(
        home.blankets,
        10
      );
      const spent = market.textileLedger!.householdSpending! + market.blanketLedger!.householdSpending!;
      expect(spent).toBeLessThanOrEqual(100);
      expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(2000 - spent, 2);
      expect(market.marketTreasury!.balance).toBeCloseTo(10 + spent, 2);
      expect(home.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
      if (blanketStock === 100) {
        expect(home.blankets).toBe(0);
        expect(orders.blankets).toBeGreaterThan(0);
        expect(market.goods[byName("Wool Blankets").i].stock).toBeLessThan(100);
      } else {
        expect(home.blankets).toBeGreaterThan(0);
        expect(market.goods[byName("Wool Blankets").i].stock).toBeCloseTo(0, 2);
      }
    }
  );

  it("keeps the wardrobe cash reservation when little home work leaves clothing unaffordable", () => {
    const market = getMarkets()[0];
    market.foodLedger!.ruralHouseholdWealth = 2000;
    market.goods[byName("Wool").i].price = 1;
    market.goods[byName("Wool Garments").i].price = 130;
    market.goods[byName("Wool Blankets").i] = { stock: 100, price: 8 };
    setHouseholdTextileWorkers(Float32Array.from([10]));
    expect(getTextileMarketOrders(market).blankets).toBe(0);
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.garments).toBeGreaterThan(0);
    expect(market.ruralTextileProduction!.blankets).toBe(0);
    expect(market.ruralTextileProduction!.beddingDiagnostic!.beddingBudget).toBe(0);
    expect(market.ruralTextileProduction!.beddingDiagnostic!.remainingWardrobeCost).toBeGreaterThan(100);
    expect(market.blanketLedger!.householdConsumption).toBe(0);
    expect(market.goods[byName("Wool Blankets").i].stock).toBe(100);
  });

  it.each(["labor", "stock", "cash", "price", "rounding"])(
    "captures the actual bedding %s constraint without inventing production",
    constraint => {
      const market = getMarkets()[0];
      market.goods[byName("Wool").i].price = 1;
      market.goods[byName("Wool Cloth").i] = { stock: 0, price: 100 };
      if (constraint === "labor") setHouseholdTextileWorkers(new Float32Array());
      if (constraint === "stock") market.goods[byName("Wool").i].stock = 0;
      if (constraint === "price") {
        market.goods[byName("Wool").i].price = 0;
        market.goods[byName("Wool Cloth").i].price = 0;
      }
      if (constraint === "rounding") market.goods[byName("Wool").i].stock = 0.000001;
      const result = settleRuralTextileProduction(market, 0, 1, 0, constraint === "cash" ? 0 : 100);
      const diagnostic = result.beddingDiagnostic!;
      expect(result.blankets).toBe(0);
      if (constraint === "labor") {
        expect(diagnostic.laborAfterGarments).toBe(0);
        expect(diagnostic.routes).toHaveLength(0);
      } else {
        const route = diagnostic.routes.find(route => route.weavesCloth)!;
        if (constraint === "stock") expect(route.stockLimitLots).toBe(0);
        if (constraint === "cash") expect(route.cashLimitLots).toBe(0);
        if (constraint === "price") expect(route.inputPrice).toBeNull();
        if (constraint === "rounding") expect(route.belowPaymentPrecision).toBe(true);
        expect(route.producedLots).toBe(0);
      }
    }
  );

  it("pays for real fiber and uses shared labor to self-supply independent replacements without buying them twice", () => {
    const market = getMarkets()[0];
    const wool = byName("Wool");
    const woolBefore = market.goods[wool.i].stock;
    settleTextileHouseholdDemand();
    const home = market.ruralTextileProduction!;
    expect(home.garments).toBeGreaterThan(0);
    expect(home.blankets).toBeGreaterThan(0);
    expect(home.laborUsed).toBeGreaterThan(0);
    expect(home.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
    const paid = home.garmentSpending + home.blanketSpending;
    expect(market.foodLedger!.ruralHouseholdWealth).toBeCloseTo(100_000 - paid, 8);
    expect(market.marketTreasury!.balance).toBeCloseTo(10 + paid, 8);
    expect((woolBefore - market.goods[wool.i].stock) * wool.value).toBeCloseTo(paid, 8);
    expect(market.textileLedger!.householdConsumption).toBeCloseTo(home.garments, 2);
    expect(market.blanketLedger!.householdConsumption).toBeCloseTo(home.blankets, 2);
    expect(home.garments).toBeLessThanOrEqual(getMarketTextileDemandProfile(1).monthlyDemand);
    expect(home.blankets).toBeLessThanOrEqual(getMarketBlanketDemandProfile(1).monthlyDemand);
    for (const good of getGoods().filter(good => good.name !== "Wool")) {
      expect(market.goods[good.i].stock).toBe(0);
      const produced = flows
        .filter(flow => flow.goodId === good.i && flow.direction === "source")
        .reduce((sum, flow) => sum + flow.units, 0);
      const consumed = flows
        .filter(flow => flow.goodId === good.i && flow.direction === "sink")
        .reduce((sum, flow) => sum + flow.units, 0);
      expect(produced).toBeCloseTo(consumed, 10);
    }
    expect(market.textileLedger!.ruralHomeProduction).toBe(home.garments);
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.laborUsed).toBeLessThanOrEqual(home.laborCapacity);
    expect(market.textileLedger!.cumulativeRuralHomeProduction).toBeCloseTo(
      home.garments + market.ruralTextileProduction!.garments,
      10
    );
  });

  it.each(["cash", "fiber", "labor", "population"])("does not create products without %s", missing => {
    const market = getMarkets()[0];
    if (missing === "cash") market.foodLedger!.ruralHouseholdWealth = 0;
    if (missing === "fiber") market.goods[byName("Wool").i].stock = 0;
    if (missing === "labor") setHouseholdTextileWorkers(new Float32Array());
    if (missing === "population") {
      worldContext.pack.cells.maleAdults.fill(0);
      worldContext.pack.cells.femaleAdults.fill(0);
    }
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.garments).toBe(0);
    expect(market.ruralTextileProduction!.blankets).toBe(0);
    expect(market.marketTreasury!.balance).toBe(10);
  });

  it("uses the same labor for weaving and both final goods and caps work after adult losses", () => {
    setHouseholdTextileWorkers(Float32Array.from([10]));
    setFarmLaborRequired(Float32Array.from([0.01]));
    settleTextileHouseholdDemand();
    expect(getMarkets()[0].ruralTextileProduction!.laborUsed).toBeLessThanOrEqual(10);
    const home = getMarkets()[0].ruralTextileProduction!;
    expect(home.laborUsed).toBeCloseTo(
      home.garments * (0.972 + 0.259 / 0.9) * 1000 + home.blankets * (0.0151875 + (0.259 * 250) / 0.95 / 4000) * 1000,
      8
    );
    worldContext.pack.cells.maleAdults[0] = 0.001;
    worldContext.pack.cells.femaleAdults[0] = 0.001;
    settleTextileHouseholdDemand();
    expect(getMarkets()[0].ruralTextileProduction!.laborCapacity).toBeCloseTo(2, 5);
  });

  it("can buy fiber for self-supply when finished stock exists but households cannot afford enough", () => {
    const market = getMarkets()[0];
    market.foodLedger!.ruralHouseholdWealth = 100;
    market.goods[byName("Wool Garments").i].stock = 100;
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.garments).toBeGreaterThan(5 / byName("Wool Garments").value);
    expect(market.ruralTextileProduction!.garmentSpending).toBeLessThanOrEqual(5);
    expect(market.foodLedger!.ruralHouseholdWealth).toBeGreaterThanOrEqual(95);
  });

  it("keeps edited multi-input recipes with the workshops and gives existing finished supply priority", () => {
    byName("Wool Cloth").recipes = [{ [byName("Wool").i]: 6, 12345: 1 }];
    settleTextileHouseholdDemand();
    expect(getMarkets()[0].ruralTextileProduction!.laborUsed).toBe(0);
    byName("Wool Cloth").recipes = [{ [byName("Wool").i]: 6 }];
    const market = getMarkets()[0];
    market.goods[byName("Wool Garments").i].stock = 100;
    market.goods[byName("Wool Blankets").i].stock = 100;
    settleTextileHouseholdDemand();
    expect(market.ruralTextileProduction!.laborUsed).toBe(0);
    expect(market.textileLedger!.ruralConsumption).toBeGreaterThan(0);
  });
});
