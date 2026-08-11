import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { createEmptyTechnologySimulationState } from "../../../generators/technologyTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods } from "../economyContext";
import type { Good } from "./goods-generator";
import { isGoodManufacturableInState, ProductionModule } from "./production-generator";
import type { MfgRecord, ProductionRecord } from "./productionRecordTypes";

type ManufactureHarness = {
  executeManufacture(
    state: {
      burg: { i: number; cell: number; treasury: number };
      market: { goods: unknown[] };
      inventory: number[];
      demandCoverage: number[];
      records: ProductionRecord[];
      ingredientCosts: number;
      smithingProgramByGood: Map<string, never>;
      strategicLaborMarket: undefined;
      strategicDemandByGood: ReadonlyMap<number, never>;
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
      market: { goods: [] },
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
    expect(state.inventory[4]).toBe(0.1);
    expect(state.records.find((record): record is MfgRecord => "recipe" in record)?.byproducts).toEqual([
      { goodId: 4, units: 0.1 }
    ]);
  });

  it("blocks Liquor until the burg's state knows distillation", () => {
    const liquor = { name: "Liquor" };
    expect(isGoodManufacturableInState(liquor, 1)).toBe(false);
    simulationContext.technology.progress = [
      { technologyId: "distillation", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ];
    expect(isGoodManufacturableInState(liquor, 1)).toBe(true);
  });
});
