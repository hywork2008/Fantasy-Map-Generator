import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { createEmptyTechnologySimulationState } from "../../../generators/technologyTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { type Good, Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import {
  isGoodManufacturableInState,
  ProductionModule,
  settlePomaceWineMarketProcessing
} from "./production-generator";
import type { MfgRecord, ProductionRecord } from "./productionRecordTypes";

type ManufactureHarness = {
  executeManufacture(
    state: {
      burg: { i: number; cell: number; treasury: number; state?: number; market?: number };
      market: { i: number; goods: Record<number, { stock: number; price: number }> };
      inventory: number[];
      demandCoverage: number[];
      records: ProductionRecord[];
      ingredientCosts: number;
      smithingProgramByGood: Map<string, never>;
      strategicLaborMarket: undefined;
      strategicDemandByGood: ReadonlyMap<number, { stateFunded?: boolean }>;
    },
    index: { demandCoverageByGood: number[][] },
    decision: {
      action: {
        good: Good;
        ingredients: { goodId: number; amount: number }[];
        byproducts: { goodId: number; amount: number }[];
        maxYield: number;
        ingredientCostPerUnit: number;
        smithingProgram: null;
      };
      candidates: [];
      goalGoodId: number;
      laborProductivity: number;
    },
    workerFraction: number
  ): void;
};

describe("ProductionModule byproducts", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    simulationContext.technology = createEmptyTechnologySimulationState();
    setGoods([
      { i: 1, name: "Clay", tags: [], value: 1, unit: "wain", icon: "", color: "" },
      { i: 2, name: "Wood", tags: [], value: 1, unit: "wain", icon: "", color: "" },
      { i: 3, name: "Brick", tags: [], value: 2, unit: "wain", icon: "", color: "" },
      { i: 4, name: "Ash", tags: [], value: 1.5, unit: "sack", icon: "", color: "" },
      { i: 5, name: "Liquor", tags: [], value: 12, unit: "vessel", icon: "", color: "" }
    ]);
    Goods.sync();
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("credits combustion byproducts beside the primary manufactured output", () => {
    const goods = [
      { i: 1, name: "Clay", tags: [], value: 1, unit: "wain", icon: "", color: "" },
      { i: 2, name: "Wood", tags: [], value: 1, unit: "wain", icon: "", color: "" },
      { i: 3, name: "Brick", tags: [], value: 2, unit: "wain", icon: "", color: "" },
      { i: 4, name: "Ash", tags: [], value: 1.5, unit: "sack", icon: "", color: "" }
    ] as Good[];
    const state = {
      burg: { i: 1, cell: 0, treasury: 0 },
      market: { i: 1, goods: {} },
      inventory: [0, 1, 0.1],
      demandCoverage: [],
      records: [] as ProductionRecord[],
      ingredientCosts: 0,
      smithingProgramByGood: new Map<string, never>(),
      strategicLaborMarket: undefined,
      strategicDemandByGood: new Map<number, never>()
    };
    const production = new ProductionModule() as unknown as ManufactureHarness;

    production.executeManufacture(
      state,
      { demandCoverageByGood: [] },
      {
        action: {
          good: goods[2],
          ingredients: [
            { goodId: 1, amount: 1 },
            { goodId: 2, amount: 0.1 }
          ],
          byproducts: [{ goodId: 4, amount: 0.1 }],
          maxYield: 1,
          ingredientCostPerUnit: 0,
          smithingProgram: null
        },
        candidates: [],
        goalGoodId: 3,
        laborProductivity: 1
      },
      1
    );

    expect(state.inventory[3]).toBe(1);
    expect(state.market.goods[4].stock).toBe(0.1);
    expect(state.records.find((record): record is MfgRecord => "recipe" in record)?.byproducts).toEqual([
      { goodId: 4, units: 0.1 }
    ]);
  });

  it("credits byproducts to getBurgProduction alongside the primary manufactured good", () => {
    // Regression guard: tooltips, the burg economy summary, economyTotals.ts's world/state
    // production totals (Goods editor table, Balance History), and the Goods map layer all read
    // this method as "everything this burg produced" — a byproduct silently missing from it (while
    // still landing in state.inventory) makes a real, market-affecting good invisible to the player.
    const production = new ProductionModule();
    const burg = {
      i: 1,
      production: [
        { goodId: 3, units: 1, recipe: [], byproducts: [{ goodId: 4, units: 0.1 }] } satisfies MfgRecord
      ] as ProductionRecord[]
    } as unknown as Burg;

    expect(production.getBurgProduction(burg)).toEqual({ 3: 1, 4: 0.1 });
  });

  it("uses the State treasury for material purchases of State military work", () => {
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#111",
      goods: { 1: { stock: 2, price: 1 } }
    };
    const stateTreasury = 10;
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, cell: 0, state: 1, market: 1, treasury: 0 } as Burg],
      states: [{ i: 0 } as State, { i: 1, treasury: stateTreasury } as State],
      markets: [market]
    } as unknown as PackedGraph;
    setMarkets([market]);
    Markets.sync();
    const state = {
      burg: worldContext.pack.burgs[1] as { i: number; cell: number; treasury: number; state: number; market: number },
      market,
      inventory: [],
      demandCoverage: [],
      records: [] as ProductionRecord[],
      ingredientCosts: 0,
      smithingProgramByGood: new Map<string, never>(),
      strategicLaborMarket: undefined,
      strategicDemandByGood: new Map([[3, { stateFunded: true }]])
    };
    const production = new ProductionModule() as unknown as ManufactureHarness;

    production.executeManufacture(
      state,
      { demandCoverageByGood: [] },
      {
        action: {
          good: Goods.get(3)!,
          ingredients: [{ goodId: 1, amount: 1 }],
          byproducts: [],
          maxYield: 1,
          ingredientCostPerUnit: 1,
          smithingProgram: null
        },
        candidates: [],
        goalGoodId: 3,
        laborProductivity: 1
      },
      1
    );

    expect(state.inventory[3]).toBe(1);
    expect(worldContext.pack.burgs[1].treasury).toBe(0);
    expect(worldContext.pack.states[1].treasury).toBeLessThan(stateTreasury);
  });

  it("blocks Liquor until the burg's state knows distillation", () => {
    const liquor = { name: "Liquor" };
    expect(isGoodManufacturableInState(liquor, 1)).toBe(false);
    simulationContext.technology.progress = [
      { technologyId: "distillation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ];
    expect(isGoodManufacturableInState(liquor, 1)).toBe(true);
  });

  it("settles accumulated Pomace into Pomace Wine at the market recipe ratio", () => {
    const pomace = { i: 1, name: "Pomace", tags: ["food"], value: 0.5, unit: "lot", icon: "", color: "" };
    const barrels = { i: 2, name: "Barrels", tags: [], value: 2, unit: "barrel", icon: "", color: "" };
    const pomaceWine = {
      i: 3,
      name: "Pomace Wine",
      tags: ["food", "beverage"],
      value: 2,
      unit: "cask",
      icon: "",
      color: "",
      recipes: [{ 1: 1.2, 2: 0.08 }]
    };
    const goods = [pomace, barrels, pomaceWine] as Good[];
    setGoods(goods);
    Goods.sync();

    const market = {
      i: 1,
      goods: {
        1: { stock: 63.6, price: 0.5 },
        2: { stock: 5, price: 2 }
      }
    } as Market;

    expect(settlePomaceWineMarketProcessing(market)).toBe(53);
    expect(market.goods[1].stock).toBe(0);
    expect(market.goods[2].stock).toBeCloseTo(0.76, 8);
    expect(market.goods[3].stock).toBe(53);
  });
});
