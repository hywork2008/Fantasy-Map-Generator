import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoods,
  getGuildChapters,
  getMarkets,
  initEconomyContext,
  setBurgMarketLedgers,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { GuildChapters } from "./guildChapters";
import { getRuralHouseholdWealth } from "./householdWealth";
import type { FoodLedger } from "./marketTypes";
import {
  getAffordableTextileDemand,
  getBlanketProductionHeadroom,
  getGarmentProductionHeadroom,
  getMarketBlanketDemandProfile,
  getMarketTextileDemandProfile,
  getTextileGuildWorkPlan,
  settleTextileHouseholdDemand,
  WARDROBE_REPLACEMENT_YEARS
} from "./textileDemand";

describe("textile household demand", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1_000;
    worldContext.urbanization = 1;
    worldContext.grid = { cells: { temp: Int8Array.from([-2]) } } as typeof worldContext.grid;
    worldContext.pack = {
      burgs: [undefined, { i: 1, cell: 0, market: 1, population: 2, state: 1, removed: false }],
      states: [undefined, { i: 1, capital: 1 }],
      cells: {
        i: [0],
        g: Uint16Array.from([0]),
        h: Uint8Array.from([55]),
        pop: Float32Array.from([98])
      }
    } as unknown as PackedGraph;
    setMarketCellColumn(Uint16Array.from([1]));
    setGoods([
      { i: 0, name: "Wool", value: 2, tags: ["clothing"], unit: "bale", icon: "", color: "" },
      { i: 1, name: "Hemp", value: 1, tags: ["clothing"], unit: "bale", icon: "", color: "" },
      { i: 2, name: "Cotton", value: 2, tags: ["clothing"], unit: "bale", icon: "", color: "" },
      { i: 3, name: "Cloth", value: 15, tags: ["clothing"], unit: "wardrobe bolt", icon: "", color: "" },
      { i: 4, name: "Linen", value: 6, tags: ["clothing"], unit: "wardrobe bolt", icon: "", color: "" },
      {
        i: 5,
        name: "Garments",
        value: 20,
        tags: ["clothing"],
        unit: "wardrobe lot",
        icon: "",
        color: "",
        demandCoverage: { clothing: 1 }
      }
    ]);
    setBurgMarketLedgers([{ burgId: 1, marketId: 1, merchants: [], householdWealth: 100_000 }]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        foodLedger: { ruralHouseholdWealth: 100_000 } as FoodLedger,
        goods: {
          0: { stock: 60, price: 2 },
          1: { stock: 0, price: 1 },
          2: { stock: 0, price: 2 },
          3: { stock: 0, price: 15 },
          4: { stock: 0, price: 6 },
          5: { stock: 4, price: 20 }
        }
      }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("derives four-year replacement demand from real urban and rural residents with a cold-climate multiplier", () => {
    const profile = getMarketTextileDemandProfile(1);
    // 2 urban population points + 98 rural points, each worth 1,000 people = 100 market lots.
    expect(profile.populationLots).toBe(100);
    expect(profile.climateMultiplier).toBe(1.4);
    expect(profile.annualDemand).toBeCloseTo((100 / WARDROBE_REPLACEMENT_YEARS) * 1.4, 6);
    expect(profile.monthlyDemand).toBeCloseTo(((100 / WARDROBE_REPLACEMENT_YEARS) * 1.4) / 12, 6);
  });

  it("records household consumption separately from wholesale intake and retains unmet demand", () => {
    settleTextileHouseholdDemand();
    const market = getMarkets()[0];
    expect(market.goods[5].stock).toBeCloseTo(1.08, 2);
    expect(market.textileLedger).toMatchObject({
      householdConsumption: 2.92,
      unmetDemand: 0,
      cumulativeHouseholdConsumption: 2.92
    });

    const first = structuredClone(market.textileLedger!.settlementDiagnostics);
    expect(first!.buyers.reduce((sum, row) => sum + row.need, 0)).toBeCloseTo(
      getMarketTextileDemandProfile(1).monthlyDemand,
      10
    );
    market.goods[5].stock = 0.5;
    settleTextileHouseholdDemand();
    expect(market.textileLedger).toMatchObject({
      householdConsumption: 0.5,
      unmetDemand: 2.42,
      cumulativeUnmetDemand: 2.42
    });
    const rows = market.textileLedger!.settlementDiagnostics!.buyers;
    expect(rows.reduce((sum, row) => sum + row.stockGap, 0)).toBeGreaterThan(2);
    for (const row of rows)
      expect(
        row.priorityGap + row.budgetGap + row.stockGap + row.noPricedRouteGap + row.allocationOrRoundingGap
      ).toBeCloseTo(row.unmet, 10);
    expect(first!.buyers.reduce((sum, row) => sum + row.supplied, 0)).toBeCloseTo(
      getMarketTextileDemandProfile(1).monthlyDemand,
      2
    );
  });

  it("shares replacement demand across wool, linen and ordinary garments, without consuming fine apparel", () => {
    const garments = getGoods()[5];
    setGoods([
      ...getGoods(),
      { ...garments, i: 6, name: "Linen Garments" },
      { ...garments, i: 8, name: "Wool Garments" },
      { ...garments, i: 7, name: "Fine Wool Garments", demandCoverage: { luxury: 1 } }
    ]);
    const market = getMarkets()[0];
    market.goods[6] = { stock: 2, price: 10 };
    market.goods[8] = { stock: 0.5, price: 9 };
    market.goods[7] = { stock: 9, price: 30 };
    expect(getGarmentProductionHeadroom(market, 0)).toBe(0);
    const demand = getMarketTextileDemandProfile(1).monthlyDemand;
    settleTextileHouseholdDemand();
    expect(market.goods[6].stock).toBe(0);
    expect(market.goods[8].stock).toBe(0);
    expect(4 - market.goods[5].stock + 2 - market.goods[6].stock + 0.5).toBeCloseTo(demand, 2);
    expect(market.goods[7].stock).toBe(9);
    market.goods[5].stock = 0;
    market.goods[6].stock = 0.5;
    expect(getGarmentProductionHeadroom(market, 0.25)).toBeCloseTo(demand - 0.75, 10);
  });

  it("uses independent bedding ownership and cold-climate additions", () => {
    expect(getMarketBlanketDemandProfile(1).annualDemand).toBe(100);
    worldContext.grid.cells.temp[0] = 5;
    expect(getMarketBlanketDemandProfile(1).annualDemand).toBe(50);
    expect(getMarketTextileDemandProfile(1).annualDemand).toBe(25);
  });

  function addBlankets(): void {
    setGoods([...getGoods(), { ...getGoods()[5], i: 9, name: "Wool Blankets", value: 8, demandCoverage: {} }]);
    getMarkets()[0].goods[9] = { stock: 20, price: 8 };
  }

  it("pays for wardrobes and bedding from separate urban and rural purses into market cash", () => {
    addBlankets();
    const market = getMarkets()[0];
    const urbanBefore = getHouseholdWealth(1);
    const ruralBefore = getRuralHouseholdWealth(market);
    const cashBefore = market.marketTreasury?.balance ?? 0;
    const garmentsBefore = market.goods[5].stock;
    const blanketsBefore = market.goods[9].stock;
    settleTextileHouseholdDemand();
    const wardrobeCost = (garmentsBefore - market.goods[5].stock) * 20;
    const beddingCost = (blanketsBefore - market.goods[9].stock) * 8;
    const paid = urbanBefore - getHouseholdWealth(1) + ruralBefore - getRuralHouseholdWealth(market);
    expect(paid).toBeCloseTo(wardrobeCost + beddingCost, 8);
    expect(market.marketTreasury!.balance - cashBefore).toBeCloseTo(paid, 8);
    expect(market.blanketLedger!.ruralConsumption).toBeGreaterThan(0);
    expect(market.blanketLedger!.urbanConsumption).toBeGreaterThan(0);
    expect(market.blanketLedger!.householdConsumption).toBeCloseTo(getMarketBlanketDemandProfile(1).monthlyDemand, 2);
    expect(market.textileLedger!.householdConsumption).toBeCloseTo(getMarketTextileDemandProfile(1).monthlyDemand, 2);
  });

  it("does not manufacture or consume unpaid replacements or spend another population's cash", () => {
    addBlankets();
    const market = getMarkets()[0];
    setBurgMarketLedgers([{ burgId: 1, marketId: 1, merchants: [], householdWealth: 0 }]);
    market.foodLedger!.ruralHouseholdWealth = 0;
    expect(getAffordableTextileDemand(market, false)).toBe(0);
    expect(getAffordableTextileDemand(market, true)).toBe(0);
    expect(getGarmentProductionHeadroom(market, 0)).toBe(0);
    expect(getBlanketProductionHeadroom(market, 0)).toBe(0);
    settleTextileHouseholdDemand();
    expect(market.goods[5].stock).toBe(4);
    expect(market.goods[9].stock).toBe(20);
    expect(market.blanketLedger!.householdConsumption).toBe(0);
    for (const row of market.blanketLedger!.settlementDiagnostics!.buyers) {
      expect(row.budgetGap).toBeCloseTo(row.unmet, 10);
      expect(row.stockGap).toBe(0);
    }
    market.foodLedger!.ruralHouseholdWealth = 100_000;
    settleTextileHouseholdDemand();
    expect(market.textileLedger!.urbanConsumption).toBe(0);
    expect(market.blanketLedger!.urbanConsumption).toBe(0);
    expect(market.blanketLedger!.ruralConsumption).toBeGreaterThan(0);
  });

  it("shares one monthly cash allocation between clothing and bedding and preserves missing-goods reserves", () => {
    addBlankets();
    const market = getMarkets()[0];
    worldContext.pack.burgs[1]!.population = 0;
    market.foodLedger!.ruralHouseholdWealth = 100;
    const before = market.goods[9].stock;
    // The five-unit cash allocation cannot cover wardrobes; bedding has no paid order.
    expect(getAffordableTextileDemand(market, true)).toBe(0);
    market.goods[5].stock = 0;
    settleTextileHouseholdDemand();
    expect(market.goods[9].stock).toBe(before);
    expect(getRuralHouseholdWealth(market)).toBe(100);
    const bedding = market.blanketLedger!.settlementDiagnostics!.buyers[0];
    expect(bedding.priorityGap).toBeGreaterThan(0);
    expect(bedding.priorityGap + bedding.budgetGap).toBeCloseTo(bedding.unmet, 10);
    expect(bedding.stockGap).toBe(0);
    expect(bedding.constraints).toContain("priority");
    expect(bedding.constraints).toContain("budget");
    market.goods[5].stock = 10;
    settleTextileHouseholdDemand();
    expect(getRuralHouseholdWealth(market)).toBe(95);
    expect(market.goods[9].stock).toBe(before);
  });

  it("allocates scarce bedding to both populations and preserves old cumulative ledgers", () => {
    addBlankets();
    const market = getMarkets()[0];
    market.goods[9].stock = 1;
    market.blanketLedger = {
      ...getMarketBlanketDemandProfile(1),
      householdConsumption: 0,
      unmetDemand: 0,
      cumulativeHouseholdConsumption: 2,
      cumulativeUnmetDemand: 3
    };
    settleTextileHouseholdDemand();
    expect(market.blanketLedger.householdConsumption).toBe(1);
    expect(market.blanketLedger.ruralConsumption).toBe(0.98);
    expect(market.blanketLedger.urbanConsumption).toBe(0.02);
    expect(market.blanketLedger.cumulativeHouseholdConsumption).toBe(3);
    expect(market.blanketLedger.cumulativeHouseholdSpending).toBe(8);
    expect(market.goods[9].stock).toBeCloseTo(0, 8);
  });

  it("admits a textile chapter only when three months of orders, fibre and margin support two workers", () => {
    const burg = worldContext.pack.burgs[1]!;
    expect(getTextileGuildWorkPlan(burg)).toMatchObject({ viable: true });

    getMarkets()[0].goods[0].stock = 1;
    expect(getTextileGuildWorkPlan(burg)).toMatchObject({ viable: false });
  });

  it("does not force a textile chapter into a market without viable work", () => {
    const market = getMarkets()[0];
    market.goods[0].stock = 1;
    GuildChapters.seedAfterGenerate();
    expect(getGuildChapters().some(chapter => chapter.domain === "textiles")).toBe(false);

    market.goods[0].stock = 60;
    GuildChapters.seedAfterGenerate();
    expect(getGuildChapters()).toContainEqual(expect.objectContaining({ burgId: 1, domain: "textiles" }));
  });

  describe("applyCalibration burg-size floor (docs/plan/craft-demand-calibration.md §2.0, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    it("is numerically identical to the legacy points check at the default population rate", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      const burg = worldContext.pack.burgs[1]!;
      expect(getTextileGuildWorkPlan(burg)).toMatchObject({ viable: true });
    });

    it("compares real labor people, not raw population points, once populationRate differs from 1000", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      // 2 population points × 500 = 1000 real people — below MIN_TEXTILE_BURG_PEOPLE (2000), so
      // this burg is no longer viable even though its raw population-point count is unchanged.
      worldContext.populationRate = 500;
      const burg = worldContext.pack.burgs[1]!;
      expect(getTextileGuildWorkPlan(burg)).toMatchObject({ viable: false });
    });
  });
});
