import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildChapters,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { GuildChapters } from "./guildChapters";
import {
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
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
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

    market.goods[5].stock = 0.5;
    settleTextileHouseholdDemand();
    expect(market.textileLedger).toMatchObject({
      householdConsumption: 0.5,
      unmetDemand: 2.42,
      cumulativeUnmetDemand: 2.42
    });
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
});
