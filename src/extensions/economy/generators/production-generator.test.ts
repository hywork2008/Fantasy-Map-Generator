import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wage fixtures below read wageByOccupation as coins per labor point; pin the subsistence wage it
// scales to 1 so they keep that meaning (docs/plan/craft-wage-subsistence-scale.md).
vi.mock("./subsistenceWage", () => ({ getSubsistenceWage: () => 1, WAGE_SUBSISTENCE_MULTIPLE: 1.5 }));

import { simulationContext } from "../../../context/simulationContext";
import { createEmptyTechnologySimulationState } from "../../../generators/technologyTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, getBurgMarketLedgers, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { getGoodDemandCalibration, laborPointsForLots } from "./craftDemandCalibration";
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
      strategicLaborMarket: { wageByOccupation: Record<string, number> } | undefined;
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
    laborBudget: number
  ): { yieldLots: number; laborUsed: number };
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

  it.each([0.5, 1, 2])("keeps material and co-product ratios fixed at productivity %s", productivity => {
    setEconomyCalibrationState({ applyCalibration: false });
    const state = {
      burg: { i: 1, cell: 0, treasury: 0 },
      market: { i: 1, goods: {} },
      inventory: [0, 2, 0.01],
      demandCoverage: [],
      records: [] as ProductionRecord[],
      ingredientCosts: 0,
      smithingProgramByGood: new Map<string, never>(),
      strategicLaborMarket: undefined,
      strategicDemandByGood: new Map<number, never>()
    };
    const result = (new ProductionModule() as unknown as ManufactureHarness).executeManufacture(
      state,
      { demandCoverageByGood: [] },
      {
        action: {
          good: Goods.get(3)!,
          ingredients: [
            { goodId: 1, amount: 1 },
            { goodId: 2, amount: 0.005 }
          ],
          byproducts: [{ goodId: 4, amount: 0.004 }],
          maxYield: 2,
          ingredientCostPerUnit: 0,
          smithingProgram: null
        },
        candidates: [],
        goalGoodId: 3,
        laborProductivity: productivity
      },
      1
    );
    expect(result.yieldLots).toBeCloseTo(productivity, 8);
    expect(result.laborUsed).toBeCloseTo(1, 8);
    expect(2 - state.inventory[1]).toBeCloseTo(productivity, 8);
    expect(0.01 - state.inventory[2]).toBeCloseTo(productivity * 0.005, 8);
    const record = state.records.find((row): row is MfgRecord => "recipe" in row)!;
    expect(record.recipe[1].units).toBeCloseTo(result.yieldLots * 0.005, 10);
    expect(state.market.goods[4].stock).toBeCloseTo(result.yieldLots * 0.004, 10);
  });

  it.each(["Cloth", "Fine Wool Cloth", "Fine Wool Garments"])(
    "does not multiply %s material when productivity doubles",
    name => {
      setEconomyCalibrationState({ applyCalibration: false });
      const good = { i: 3, name, value: 12, tags: [], unit: "bale", icon: "", color: "" } as Good;
      const state = {
        burg: { i: 1, cell: 0, treasury: 0 },
        market: { i: 1, goods: {} },
        inventory: [0, 1],
        demandCoverage: [],
        records: [] as ProductionRecord[],
        ingredientCosts: 0,
        smithingProgramByGood: new Map<string, never>(),
        strategicLaborMarket: undefined,
        strategicDemandByGood: new Map<number, never>()
      };
      const result = (new ProductionModule() as unknown as ManufactureHarness).executeManufacture(
        state,
        { demandCoverageByGood: [] },
        {
          action: {
            good,
            ingredients: [{ goodId: 1, amount: 1 }],
            byproducts: [],
            maxYield: 1,
            ingredientCostPerUnit: 0,
            smithingProgram: null
          },
          candidates: [],
          goalGoodId: 3,
          laborProductivity: 2
        },
        1
      );
      expect(result.yieldLots).toBe(1);
      expect(result.laborUsed).toBe(0.5);
      expect(state.inventory[1]).toBe(0);
      expect(state.inventory[3]).toBe(1);
    }
  );

  it.each([0, 0.005])("requires and pays for sub-hundredth Wood, available=%s", stock => {
    setEconomyCalibrationState({ applyCalibration: false });
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: { 1: { stock: 1, price: 1 }, 2: { stock, price: 1 } }
    };
    const burg = { i: 1, cell: 0, treasury: 10, market: 1 };
    worldContext.pack = { burgs: [{ i: 0 }, burg], states: [{ i: 0 }] } as unknown as PackedGraph;
    setMarkets([market]);
    Markets.sync();
    const state = {
      burg,
      market,
      inventory: [] as number[],
      demandCoverage: [],
      records: [] as ProductionRecord[],
      ingredientCosts: 0,
      smithingProgramByGood: new Map<string, never>(),
      strategicLaborMarket: undefined,
      strategicDemandByGood: new Map<number, never>()
    };
    const result = (new ProductionModule() as unknown as ManufactureHarness).executeManufacture(
      state,
      { demandCoverageByGood: [] },
      {
        action: {
          good: Goods.get(3)!,
          ingredients: [
            { goodId: 1, amount: 1 },
            { goodId: 2, amount: 0.005 }
          ],
          byproducts: [],
          maxYield: 1,
          ingredientCostPerUnit: 1.005,
          smithingProgram: null
        },
        candidates: [],
        goalGoodId: 3,
        laborProductivity: 1
      },
      1
    );
    if (stock === 0) {
      expect(result.yieldLots).toBe(0);
      expect(market.goods[1].stock).toBe(1);
      expect(burg.treasury).toBe(10);
    } else {
      expect(result.yieldLots).toBe(1);
      expect(market.goods[2].stock).toBe(0);
      expect(state.ingredientCosts).toBeCloseTo(1.005 * 1.1, 10);
      expect(10 - burg.treasury).toBeCloseTo(state.ingredientCosts, 10);
      expect(market.marketTreasury?.balance).toBeCloseTo(state.ingredientCosts, 10);
    }
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

  describe("labor/yield split under applyCalibration (docs/plan/craft-demand-calibration.md §3.5, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    function harnessState() {
      return {
        burg: { i: 1, cell: 0, treasury: 0 },
        market: { i: 1, goods: {} },
        inventory: [] as number[],
        demandCoverage: [] as number[],
        records: [] as ProductionRecord[],
        ingredientCosts: 0,
        smithingProgramByGood: new Map<string, never>(),
        strategicLaborMarket: undefined,
        strategicDemandByGood: new Map<number, never>()
      };
    }

    it("decouples laborUsed from yieldLots for a low-labor-intensity calibrated good (Barrels)", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      const barrels = { i: 10, name: "Barrels", tags: [], value: 2, unit: "barrel", icon: "", color: "" } as Good;
      const laborPerLot = laborPointsForLots("Barrels", 1, 1000);
      expect(getGoodDemandCalibration("Barrels")).toBeDefined();
      const production = new ProductionModule() as unknown as ManufactureHarness;

      // 9.36 lots' worth of labor at the authored rate (docs/plan/craft-demand-calibration.md §3).
      const laborBudget = 9.36 * laborPerLot;
      const { yieldLots, laborUsed } = production.executeManufacture(
        harnessState(),
        { demandCoverageByGood: [] },
        {
          action: {
            good: barrels,
            ingredients: [],
            byproducts: [],
            maxYield: 100,
            ingredientCostPerUnit: 0,
            smithingProgram: null
          },
          candidates: [],
          goalGoodId: 10,
          laborProductivity: 1
        },
        laborBudget
      );

      expect(laborUsed).toBeCloseTo(laborBudget, 6);
      expect(yieldLots).toBeGreaterThan(9);
      // The old bug: labor and yield were the same quantity (yieldLots === laborBudget ≈ 0.0099).
      expect(yieldLots).not.toBeCloseTo(laborBudget, 2);
    });

    it("behaves identically to the legacy 1:1 labor=yield identity when applyCalibration is off", () => {
      const unmapped = {
        i: 11,
        name: "Not Calibrated Good",
        tags: [],
        value: 1,
        unit: "wain",
        icon: "",
        color: ""
      } as Good;
      const production = new ProductionModule() as unknown as ManufactureHarness;

      const { yieldLots, laborUsed } = production.executeManufacture(
        harnessState(),
        { demandCoverageByGood: [] },
        {
          action: {
            good: unmapped,
            ingredients: [],
            byproducts: [],
            maxYield: 100,
            ingredientCostPerUnit: 0,
            smithingProgram: null
          },
          candidates: [],
          goalGoodId: 11,
          laborProductivity: 1
        },
        0.7
      );

      expect(yieldLots).toBeCloseTo(0.7, 6);
      expect(laborUsed).toBeCloseTo(0.7, 6);
    });

    it("returns laborUsed 0 (not the offered budget) when an ingredient purchase fails", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      const wood = { i: 12, name: "Wood", tags: [], value: 1, unit: "wain", icon: "", color: "" } as Good;
      const arrows = { i: 13, name: "Arrows", tags: [], value: 3, unit: "quiver", icon: "", color: "" } as Good;
      setGoods([wood, arrows]);
      Goods.sync();
      const production = new ProductionModule() as unknown as ManufactureHarness;
      const state = harnessState();
      // No Wood in inventory and none on the market — the ingredient buy must fail.
      state.market.goods = {};

      const { yieldLots, laborUsed } = production.executeManufacture(
        state,
        { demandCoverageByGood: [] },
        {
          action: {
            good: arrows,
            ingredients: [{ goodId: 12, amount: 1 }],
            byproducts: [],
            maxYield: 100,
            ingredientCostPerUnit: 0,
            smithingProgram: null
          },
          candidates: [],
          goalGoodId: 13,
          laborProductivity: 1
        },
        0.05
      );

      expect(yieldLots).toBe(0);
      expect(laborUsed).toBe(0);
    });
  });

  it("applies the mechanized-textiles output bonus to the textiles guild domain (docs/plan/technology-development-roadmap.md §8)", () => {
    const cloth = {
      i: 20,
      name: "Cloth",
      tags: ["clothing"],
      value: 15,
      unit: "wardrobe bolt",
      icon: "",
      color: ""
    } as Good;
    const production = new ProductionModule() as unknown as ManufactureHarness;
    const stateFor = (stateId: number) => ({
      burg: { i: 1, cell: 0, treasury: 0, state: stateId },
      market: { i: 1, goods: {} },
      inventory: [] as number[],
      demandCoverage: [] as number[],
      records: [] as ProductionRecord[],
      ingredientCosts: 0,
      smithingProgramByGood: new Map<string, never>(),
      strategicLaborMarket: undefined,
      strategicDemandByGood: new Map<number, never>()
    });
    const decision = {
      action: {
        good: cloth,
        ingredients: [] as { goodId: number; amount: number }[],
        byproducts: [] as { goodId: number; amount: number }[],
        maxYield: 100,
        ingredientCostPerUnit: 0,
        smithingProgram: null
      },
      candidates: [] as never[],
      goalGoodId: 20,
      laborProductivity: 1
    };

    const baseline = production.executeManufacture(stateFor(1), { demandCoverageByGood: [] }, decision, 1);
    expect(baseline.yieldLots).toBeCloseTo(1, 6);

    simulationContext.technology.progress = [
      { technologyId: "mechanizedTextiles", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 }
    ];
    const mechanized = production.executeManufacture(stateFor(1), { demandCoverageByGood: [] }, decision, 1);
    // getMechanizedTextilesOutputMultiplier("adopted") = 1 + 0.35 * 0.75 = 1.2625, rn()'d to 2 places.
    expect(mechanized.yieldLots).toBeCloseTo(1.26, 2);
    expect(mechanized.yieldLots).toBeGreaterThan(baseline.yieldLots);

    // A different state without the technology still gets the plain guild-only bonus (1×).
    const other = production.executeManufacture(stateFor(2), { demandCoverageByGood: [] }, decision, 1);
    expect(other.yieldLots).toBeCloseTo(1, 6);
  });
});

describe("executeManufacture wages (docs/plan/economy-coupling-audit.md L2 Phase 1)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setEconomyCalibrationState({ applyCalibration: false });
    setGoods([{ i: 1, name: "Barrels", tags: [], value: 2, unit: "barrel", icon: "", color: "" }]);
    Goods.sync();
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, cell: 0, market: 1, treasury: 10 }]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    setEconomyCalibrationState({ applyCalibration: false });
    clearEconomyContext();
  });

  function decision() {
    return {
      action: {
        good: Goods.get(1)!,
        ingredients: [] as { goodId: number; amount: number }[],
        byproducts: [] as { goodId: number; amount: number }[],
        maxYield: 100,
        ingredientCostPerUnit: 0,
        smithingProgram: null
      },
      candidates: [] as never[],
      goalGoodId: 1,
      laborProductivity: 1
    };
  }

  function stateWithWage(wage: number, treasury: number) {
    worldContext.pack.burgs[1].treasury = treasury;
    return {
      burg: worldContext.pack.burgs[1] as {
        i: number;
        cell: number;
        treasury: number;
        state?: number;
        market?: number;
      },
      market: { i: 1, goods: {} },
      inventory: [] as number[],
      demandCoverage: [] as number[],
      records: [] as ProductionRecord[],
      ingredientCosts: 0,
      smithingProgramByGood: new Map<string, never>(),
      strategicLaborMarket: {
        marketId: 1,
        workersByOccupation: {},
        wageByOccupation: { forestry: wage },
        skillByOccupation: {},
        capacityByOccupation: {}
      },
      strategicDemandByGood: new Map<number, never>()
    };
  }

  it("does not charge wages when no labor market has been reconciled", () => {
    const production = new ProductionModule() as unknown as ManufactureHarness;
    const state = stateWithWage(4, 10);
    state.strategicLaborMarket = undefined;

    const { yieldLots } = production.executeManufacture(state, { demandCoverageByGood: [] }, decision(), 1);

    expect(yieldLots).toBeCloseTo(1, 6);
    expect(worldContext.pack.burgs[1].treasury).toBe(10);
    expect(getBurgMarketLedger(1)?.householdWealth ?? 0).toBe(0);
  });

  it("deducts laborUsed × wageRate from burg.treasury and credits householdWealth", () => {
    const production = new ProductionModule() as unknown as ManufactureHarness;
    const state = stateWithWage(4, 10);

    const { laborUsed } = production.executeManufacture(state, { demandCoverageByGood: [] }, decision(), 1);

    expect(laborUsed).toBeCloseTo(1, 6);
    expect(worldContext.pack.burgs[1].treasury).toBeCloseTo(6, 6);
    expect(getBurgMarketLedger(1)?.householdWealth).toBeCloseTo(4, 6);
  });

  it("produces more in a cheap-labor market than a tight one on the same purse", () => {
    const production = new ProductionModule() as unknown as ManufactureHarness;

    const cheap = production.executeManufacture(stateWithWage(1, 5), { demandCoverageByGood: [] }, decision(), 10);
    const expensive = production.executeManufacture(stateWithWage(5, 5), { demandCoverageByGood: [] }, decision(), 10);

    expect(cheap.yieldLots).toBeGreaterThan(expensive.yieldLots);
    expect(cheap.yieldLots).toBeCloseTo(5, 6);
    expect(expensive.yieldLots).toBeCloseTo(1, 6);
  });

  it("pays State-funded military manufacture wages from the State treasury", () => {
    const stateTreasury = 20;
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, cell: 0, state: 1, market: 1, treasury: 50 } as Burg],
      states: [{ i: 0 } as State, { i: 1, treasury: stateTreasury } as State]
    } as unknown as PackedGraph;
    const production = new ProductionModule() as unknown as ManufactureHarness;
    const state = stateWithWage(3, 50);
    state.burg = worldContext.pack.burgs[1] as {
      i: number;
      cell: number;
      treasury: number;
      state: number;
      market: number;
    };
    state.strategicDemandByGood = new Map([[1, { stateFunded: true }]]);

    production.executeManufacture(state, { demandCoverageByGood: [] }, decision(), 1);

    expect(worldContext.pack.burgs[1].treasury).toBe(50);
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(stateTreasury - 3, 6);
    expect(getBurgMarketLedgers().find(ledger => ledger.burgId === 1)?.householdWealth).toBeCloseTo(3, 6);
  });

  it("cuts manufacture output when burg.discontent is high (L9-b)", () => {
    const production = new ProductionModule() as unknown as ManufactureHarness;
    const calm = production.executeManufacture(stateWithWage(0, 10), { demandCoverageByGood: [] }, decision(), 1);
    worldContext.pack.burgs[1].discontent = 100;
    const restless = production.executeManufacture(stateWithWage(0, 10), { demandCoverageByGood: [] }, decision(), 1);
    expect(restless.yieldLots).toBeLessThan(calm.yieldLots);
    expect(restless.yieldLots).toBeCloseTo(calm.yieldLots * 0.85, 2);
  });
});

describe("runWorkerLoop steps (port-freight-queue-and-warehouses.md §10.23)", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => {
    setEconomyCalibrationState({ applyCalibration: false });
    clearEconomyContext();
  });

  type LoopHarness = {
    runWorkerLoop(index: unknown, state: unknown): { total: number };
    makeProductionDecision: (...args: unknown[]) => unknown;
    executeManufacture: (...args: unknown[]) => { yieldLots: number; laborUsed: number };
  };
  const good = (i: number, name: string) => ({ i, name, tags: [], value: 1, unit: "lot", icon: "", color: "" }) as Good;

  it("gives a failed attempt's step back and skips its goal, so a small town's steps reach its work", () => {
    setEconomyCalibrationState({ applyCalibration: true });
    const failingGoal = good(1, "Failing Goal");
    const missingInput = good(2, "Missing Input");
    const work = good(3, "Work");
    const production = new ProductionModule() as unknown as LoopHarness;
    const made: string[] = [];
    // The failing goal keeps winning while it is a candidate, as an active goal would.
    production.makeProductionDecision = (...args: unknown[]) => {
      const candidates = args[7] as Good[];
      const goal = candidates.includes(failingGoal) ? failingGoal : candidates.includes(work) ? work : null;
      if (!goal) return null;
      return {
        action: { good: goal === failingGoal ? missingInput : work },
        candidates: [],
        goalGoodId: goal.i,
        laborProductivity: 1
      };
    };
    production.executeManufacture = (...args: unknown[]) => {
      const action = (args[2] as { action: { good: Good } }).action;
      made.push(action.good.name);
      return action.good === work ? { yieldLots: 1, laborUsed: 1 } : { yieldLots: 0, laborUsed: 0 };
    };

    const { total } = production.runWorkerLoop(
      { priorityGoods: [], productiveGoods: [failingGoal, missingInput, work] },
      {
        burg: { i: 0, cell: 0 },
        population: 2,
        workforce: 2,
        activeGoalGoodId: null,
        strategicDemandByGood: new Map(),
        remainingCalibratedLots: new Map(),
        orderedCalibratedLots: new Map(),
        demandTargets: [],
        demandCoverage: []
      }
    );

    expect(made).toEqual(["Missing Input", "Work", "Work"]);
    expect(total).toBe(2);
  });
});

describe("linen clothing preparation", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.pack = { burgs: [], states: [], cells: {} } as unknown as PackedGraph;
  });
  afterEach(() => {
    setEconomyCalibrationState({ applyCalibration: false });
    clearEconomyContext();
  });

  it("shares the basic clothing production ceiling without touching luxury apparel", () => {
    const good = (i: number, name: string): Good => ({
      i,
      name,
      value: 130,
      tags: [],
      unit: "lot",
      icon: "",
      color: ""
    });
    setGoods([good(1, "Garments"), good(2, "Linen Garments"), good(3, "Fine Wool Garments")]);
    Goods.sync();
    const state = {
      remainingCalibratedLots: new Map([
        [1, 0.2],
        [2, 0.2],
        [3, 0.2]
      ])
    };
    const skipped = new Set<number>();
    const planner = new ProductionModule() as unknown as {
      settleCalibratedProduction(
        state: unknown,
        id: number,
        lots: number,
        labor: number,
        calibrated: boolean,
        skipped: Set<number>
      ): void;
    };
    planner.settleCalibratedProduction(state, 2, 0.15, 0.1, true, skipped);
    expect(state.remainingCalibratedLots.get(1)).toBeCloseTo(0.05, 10);
    expect(state.remainingCalibratedLots.get(2)).toBeCloseTo(0.05, 10);
    expect(state.remainingCalibratedLots.get(3)).toBe(0.2);
    planner.settleCalibratedProduction(state, 1, 0.05, 0.04, true, skipped);
    expect(skipped.has(1)).toBe(true);
    expect(skipped.has(2)).toBe(true);
    expect(skipped.has(3)).toBe(false);
  });

  it.each([true, false])(
    "uses real calibrated weaving labor for a small wardrobe order, calibration=%s",
    calibrated => {
      setEconomyCalibrationState({ applyCalibration: calibrated });
      const good = (i: number, name: string, value: number): Good => ({
        i,
        name,
        value,
        tags: [],
        unit: "lot",
        icon: "",
        color: ""
      });
      const flax = good(1, "Flax", 0.3);
      const linen = good(2, "Linen", 8);
      const garments = good(3, "Linen Garments", 130);
      setGoods([flax, linen, garments]);
      Goods.sync();
      const recipe = (good: Good, goodId: number, amount: number) => ({
        good,
        ingredients: [{ goodId, amount }],
        byproducts: []
      });
      const index = {
        recipesByOutput: [undefined, undefined, [recipe(linen, 1, 10)], [recipe(garments, 2, 12)]],
        minWorkersByGood: [1, 1, 1, 1]
      };
      const state = {
        burg: { i: 1, cell: 0 },
        market: {
          i: 1,
          goods: { 1: { stock: 1000, price: 0.3 }, 2: { stock: 0, price: 8 }, 3: { stock: 0, price: 130 } }
        },
        inventory: [],
        smithingProgramByGood: new Map()
      };
      const planner = new ProductionModule() as unknown as {
        planGoodAction(
          index: unknown,
          state: unknown,
          good: Good,
          target: number,
          step: number,
          workers: number,
          effect: { multiplier: number; category: null }
        ): { action: { good: Good }; workersNeeded: number; normalizedGain: number } | null;
      };
      const plan = planner.planGoodAction(index, state, garments, 0.1, 0.1, 0.2, { multiplier: 1, category: null });
      if (calibrated) {
        expect(plan?.action.good.name).toBe("Linen");
        expect(plan?.workersNeeded).toBeCloseTo(0.1 * 0.972 + 1.2 * 0.01295, 8);
        const weaving = planner.planGoodAction(index, state, linen, 1, 1, 1, { multiplier: 1, category: null });
        // Direct candidates still rank by lot margin, not by the inverse of their tiny labor intensity.
        expect(weaving?.normalizedGain).toBeLessThan(8);
        expect(weaving?.normalizedGain).toBeGreaterThan(0);
      } else expect(plan).toBeNull();
    }
  );
});
