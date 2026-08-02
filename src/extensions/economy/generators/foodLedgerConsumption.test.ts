import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../economyContext", () => ({
  getWorldContext: vi.fn(),
  getMarkets: vi.fn(),
  getMarketCellColumn: vi.fn(),
  getSimulationMonth: vi.fn(),
  getGoods: vi.fn(() => [])
}));

vi.mock("./innStays", () => ({
  getTemporaryLodgerPopulationPointsByBurg: vi.fn(() => new Map())
}));

import { getGoods, getMarketCellColumn, getMarkets, getSimulationMonth, getWorldContext } from "../economyContext";
import { settleMonthlyFoodConsumption } from "./foodLedgerConsumption";
import { getTemporaryLodgerPopulationPointsByBurg } from "./innStays";
import type { FoodLedger, Market } from "./marketTypes";

function makeLedger(overrides: Partial<FoodLedger> = {}): FoodLedger {
  return {
    foodProduced: 0,
    ruralNeed: 0,
    urbanNeed: 0,
    exportable: 0,
    importNeed: 0,
    targetStock: 0,
    satisfiedImport: 0,
    importCapacityBonus: 0,
    foodStockAge0: 0,
    foodStockAge1: 0,
    foodStockAge2: 0,
    foodStockAge0UnitCost: 0,
    foodStockAge1UnitCost: 0,
    foodStockAge2UnitCost: 0,
    storageOverflow: 0,
    ruralFoodStressQuarters: 0,
    urbanFoodStressQuarters: 0,
    ruralSevereDeficitQuarters: 0,
    urbanSevereDeficitQuarters: 0,
    ...overrides
  };
}

describe("settleMonthlyFoodConsumption", () => {
  let mockWorldContext: any;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getGoods).mockReturnValue([]);
    vi.mocked(getTemporaryLodgerPopulationPointsByBurg).mockReturnValue(new Map());
    vi.mocked(getSimulationMonth).mockReturnValue(1);
    mockWorldContext = {
      populationRate: 1,
      urbanization: 1,
      pack: {
        burgs: [],
        cells: { i: [], h: [], pop: [] }
      }
    };
    vi.mocked(getWorldContext).mockReturnValue(mockWorldContext);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array());
  });

  function setMarket(market: Market): void {
    vi.mocked(getMarkets).mockReturnValue([market]);
  }

  it("charges temporary inn lodgers against the market food ledger, not burg population", () => {
    mockWorldContext.populationRate = 10;
    mockWorldContext.pack.burgs = [{ i: 1, market: 1, removed: false, population: 0, foodReserve: 0 }];
    vi.mocked(getTemporaryLodgerPopulationPointsByBurg).mockReturnValue(new Map([[1, 1]]));
    const market = {
      i: 1,
      centerBurgId: 1,
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 100 })
    } as Market;
    setMarket(market);

    settleMonthlyFoodConsumption();

    expect(mockWorldContext.pack.burgs[0].population).toBe(0);
    expect(market.foodLedger?.foodStockAge0).toBeLessThan(100);
  });

  it("draws rural need from the oldest bucket first, rolling over once it is exhausted", () => {
    // Index 0 is an unused placeholder cell id; cell id 1 is the only real one.
    // ruralPopulation = 200 (populationRate 1) => annualRuralNeed = 86, monthly = 7.1667.
    mockWorldContext.pack.cells = { i: [1], h: [0, 25], pop: [0, 200] };
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([0, 1]));

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 5, foodStockAge1: 5, foodStockAge2: 5 })
    } as Market;
    setMarket(market);

    settleMonthlyFoodConsumption();

    const ledger = market.foodLedger!;
    expect(ledger.foodStockAge2).toBe(0);
    expect(ledger.foodStockAge1).toBeCloseTo(2.83, 1);
    expect(ledger.foodStockAge0).toBe(5);
  });

  it("does not top up a burg's reserve that is already at or above its target", () => {
    const burg = { i: 1, market: 1, removed: false, population: 1000, foodReserve: 10_000 } as any;
    mockWorldContext.pack.burgs = [burg];

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 500 })
    } as Market;
    setMarket(market);

    settleMonthlyFoodConsumption();

    // Only this month's urban consumption may draw the reserve down; nothing tops it up further,
    // so it can only shrink from its huge starting value, never exceed it.
    expect(burg.foodReserve).toBeLessThanOrEqual(10_000);
    // The market had no need to spare anything for a top-up, so its stock is untouched except by
    // any shortfall the (already ample) reserve failed to cover — which here is none.
    expect(market.foodLedger!.foodStockAge0).toBe(500);
  });

  it("draws a burg's own reserve before the market pool, and never goes negative", () => {
    const burg = { i: 1, market: 1, removed: false, population: 1000, foodReserve: 3 } as any;
    mockWorldContext.pack.burgs = [burg];

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger() // empty market stock: nothing to top up or fall back on
    } as Market;
    setMarket(market);

    expect(() => settleMonthlyFoodConsumption()).not.toThrow();

    expect(burg.foodReserve).toBe(0);
    expect(market.foodLedger!.foodStockAge0).toBe(0);
  });

  it("routes urban retail revenue to ruralGrainPayable before the market's balance", () => {
    const stapleGood = { i: 1, name: "Grain", tags: ["food", "stapleFood"], value: 1 } as any;
    vi.mocked(getGoods).mockReturnValue([stapleGood]);

    const burg = { i: 1, market: 1, removed: false, population: 1000, foodReserve: 0 } as any;
    mockWorldContext.pack.burgs = [burg];

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 1_000_000 }), // abundant, so revenue is easy to reason about
      marketTreasury: { balance: 0, ruralGrainPayable: 5 }
    } as Market;
    setMarket(market);

    settleMonthlyFoodConsumption();

    // With ample stock, price sits at the floor (0.8 * base value 1); revenue must repay the
    // outstanding debt first before anything reaches the merchant's own balance.
    expect(market.marketTreasury!.ruralGrainPayable).toBe(0);
    expect(market.marketTreasury!.balance).toBeGreaterThan(0);
  });

  it("prices Grain at the floor when stock comfortably covers the rest of the quarter", () => {
    const stapleGood = { i: 1, name: "Grain", tags: ["food", "stapleFood"], value: 1 } as any;
    vi.mocked(getGoods).mockReturnValue([stapleGood]);
    vi.mocked(getSimulationMonth).mockReturnValue(3); // last month of the quarter: least demand left
    mockWorldContext.pack.burgs = [{ i: 1, market: 1, removed: false, population: 100, foodReserve: 0 } as any];

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 1_000_000 })
    } as Market;
    setMarket(market);

    settleMonthlyFoodConsumption();

    expect(market.goods[stapleGood.i].price).toBeCloseTo(0.8, 5);
  });

  it("prices Grain at the ceiling when stock cannot cover the rest of the quarter", () => {
    const stapleGood = { i: 1, name: "Grain", tags: ["food", "stapleFood"], value: 1 } as any;
    vi.mocked(getGoods).mockReturnValue([stapleGood]);
    vi.mocked(getSimulationMonth).mockReturnValue(1); // first month: most demand still ahead

    mockWorldContext.pack.burgs = [{ i: 1, market: 1, removed: false, population: 100_000, foodReserve: 0 } as any];

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 0.001 })
    } as Market;
    setMarket(market);

    settleMonthlyFoodConsumption();

    expect(market.goods[stapleGood.i].price).toBeCloseTo(2.0, 5);
  });

  it("only updates the stress counters at the end of a calendar quarter", () => {
    mockWorldContext.pack.burgs = [{ i: 1, market: 1, removed: false, population: 100_000, foodReserve: 0 } as any];
    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      foodLedger: makeLedger({ foodStockAge0: 0 }) // fully unmet every month
    } as Market;
    setMarket(market);

    vi.mocked(getSimulationMonth).mockReturnValue(1);
    settleMonthlyFoodConsumption();
    expect(market.foodLedger!.urbanSevereDeficitQuarters).toBe(0);

    vi.mocked(getSimulationMonth).mockReturnValue(2);
    settleMonthlyFoodConsumption();
    expect(market.foodLedger!.urbanSevereDeficitQuarters).toBe(0);

    vi.mocked(getSimulationMonth).mockReturnValue(3);
    settleMonthlyFoodConsumption();
    expect(market.foodLedger!.urbanSevereDeficitQuarters).toBe(1);
  });
});
