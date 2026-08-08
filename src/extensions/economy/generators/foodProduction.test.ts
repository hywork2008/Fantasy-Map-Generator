import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import { DEFAULT_QUARTERLY_WEIGHTS, FoodProduction, getGlobalQuarterlyFoodWeights } from "./foodProduction";

// Mock economy context
vi.mock("../economyContext", () => ({
  getWorldContext: vi.fn(),
  getMarkets: vi.fn(),
  getMarketCellColumn: vi.fn(),
  getGoods: vi.fn(() => []),
  getCultivableArea: vi.fn(() => new Float32Array()),
  getCultivatedArea: vi.fn(() => new Float32Array()),
  getFarmLaborRequired: vi.fn(() => new Float32Array()),
  getFoodPotential: vi.fn(() => new Float32Array())
}));

import {
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFoodPotential,
  getMarketCellColumn,
  getMarkets,
  getWorldContext
} from "../economyContext";

describe("FoodProduction", () => {
  let mockWorldContext: any;

  beforeEach(() => {
    vi.resetAllMocks();

    mockWorldContext = {
      populationRate: 1000,
      urbanization: 1,
      pack: {
        options: {
          populationRate: 1000,
          urbanization: 1
        },
        markets: [
          { i: 1, goods: {} },
          { i: 2, goods: {} }
        ],
        cells: {
          i: [1, 2, 3],
          market: [0, 1, 1, 2],
          h: [0, 25, 25, 25],
          pop: [0, 10, 5, 2],
          capacity: [0, 20, 10, 2]
        },
        burgs: [
          { i: 1, market: 1, population: 5, removed: false, treasury: 0 },
          { i: 2, market: 2, population: 15, removed: false, treasury: 0 }
        ]
      }
    };

    (getWorldContext as any).mockReturnValue(mockWorldContext);
    (getMarkets as any).mockReturnValue(mockWorldContext.pack.markets);
    (getMarketCellColumn as any).mockReturnValue(mockWorldContext.pack.cells.market);
  });

  afterEach(() => {
    // foodStressProductionMultiplier() reads the real worldContext singleton (not the mocked
    // economyContext above), so state left here by one test must not leak into the next.
    worldContext.pack = undefined as unknown as typeof worldContext.pack;
  });

  it("should calculate quarterly ledger correctly", () => {
    FoodProduction.generateQuarterlyLedger(0);

    const market1 = mockWorldContext.pack.markets[0];
    const market2 = mockWorldContext.pack.markets[1];

    expect(market1.foodLedger).toBeDefined();
    expect(market2.foodLedger).toBeDefined();

    // Market 1:
    // Cells 1, 2
    // Rural population = (10 + 5) * 1000 = 15,000
    // Capacity = (20 + 10) * 1000 = 30,000
    // Saturation = 15,000 / 30,000 = 0.5
    // Cultivation = 0.25 + 0.75 * 0.5 = 0.625
    // Annual Food Produced = 30,000 * 0.43 * 0.625 = 8062.5
    // Quarter 0 Weight = 0.25 => Food Produced = 8062.5 * 0.25 = 2015.63 (rn to 2 decimal)

    // Rural Need = 15,000 * 0.43 = 6450 => Quarter Need = 1612.5
    // Urban Population = 5 * 1000 = 5,000
    // Urban Need = 5,000 * 0.43 = 2150 => Quarter Need = 537.5
    // Annual demand = 8600 => exportReserve (3mo) = 2150, importTarget (6mo) = 4300

    // The ledger starts empty, so this quarter's production is the only stock: 2015.63.
    // exportable = max(0, 2015.63 - 2150) = 0
    // importNeed = max(0, 4300 - 2015.63) = 2284.37

    expect(market1.foodLedger.ruralNeed).toBeCloseTo(1612.5, 1);
    expect(market1.foodLedger.urbanNeed).toBeCloseTo(537.5, 1);
    expect(market1.foodLedger.exportable).toBe(0);
    expect(market1.foodLedger.importNeed).toBeCloseTo(2284.37, 0);

    // The quarter's production lands entirely in the newest bucket; older buckets stay empty.
    expect(market1.foodLedger.foodStockAge0).toBeCloseTo(2015.63, 0);
    expect(market1.foodLedger.foodStockAge1).toBe(0);
    expect(market1.foodLedger.foodStockAge2).toBe(0);
    expect(market1.foodLedger.storageOverflow).toBe(0);

    // With no starting merchant capital, the farmgate cost accrues entirely as rural debt.
    expect(market1.marketTreasury).toBeDefined();
    expect(market1.marketTreasury.balance).toBe(0);
    expect(market1.marketTreasury.ruralGrainPayable).toBeGreaterThan(0);
  });

  it("uses active cultivated area when agricultural columns are available", () => {
    mockWorldContext = {
      populationRate: 1000,
      urbanization: 1,
      pack: {
        cells: {
          i: new Uint16Array([0, 1]),
          h: new Uint8Array([25, 25]),
          pop: new Float32Array([10, 0]),
          capacity: new Float32Array([20, 0]),
          maleAdults: new Float32Array([1, 0]),
          femaleAdults: new Float32Array([1, 0])
        },
        burgs: []
      },
      markets: [{ i: 1, goods: {} }]
    };
    vi.mocked(getWorldContext).mockReturnValue(mockWorldContext);
    vi.mocked(getMarkets).mockReturnValue(mockWorldContext.markets);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([1, 1]));
    vi.mocked(getCultivableArea).mockReturnValue(new Float32Array([10, 0]));
    vi.mocked(getCultivatedArea).mockReturnValue(new Float32Array([10, 0]));
    vi.mocked(getFarmLaborRequired).mockReturnValue(new Float32Array([4, 0]));
    vi.mocked(getFoodPotential).mockReturnValue(new Float32Array([8600, 0]));

    FoodProduction.generateQuarterlyLedger(0);

    // Cultivated area records maintained fields. The labour requirement feeds
    // employment/migration calculations and does not suppress this local crop.
    expect(mockWorldContext.markets[0].foodLedger.foodProduced).toBeCloseTo(2150, 3);
  });

  it("scales production down by the cell's state food stress instead of a permanent capacity cut", () => {
    mockWorldContext = {
      populationRate: 1000,
      urbanization: 1,
      pack: {
        cells: {
          i: new Uint16Array([0, 1]),
          h: new Uint8Array([25, 25]),
          pop: new Float32Array([10, 0]),
          capacity: new Float32Array([20, 0]),
          state: new Uint16Array([1, 1]),
          maleAdults: new Float32Array([1, 0]),
          femaleAdults: new Float32Array([1, 0])
        },
        burgs: []
      },
      markets: [{ i: 1, goods: {} }]
    };
    vi.mocked(getWorldContext).mockReturnValue(mockWorldContext);
    vi.mocked(getMarkets).mockReturnValue(mockWorldContext.markets);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([1, 1]));
    vi.mocked(getCultivableArea).mockReturnValue(new Float32Array([10, 0]));
    vi.mocked(getCultivatedArea).mockReturnValue(new Float32Array([10, 0]));
    vi.mocked(getFarmLaborRequired).mockReturnValue(new Float32Array([4, 0]));
    vi.mocked(getFoodPotential).mockReturnValue(new Float32Array([8600, 0]));

    // Cell 0/1 belong to state 1, which had a bad planting/harvest year (foodStress = 0.5).
    worldContext.pack = { states: [{ i: 0 }, { i: 1, foodStress: 0.5 }] } as unknown as typeof worldContext.pack;

    FoodProduction.generateQuarterlyLedger(0);

    // Same inputs as the unstressed case above (which yields 2150), reduced by
    // foodStressProductionMultiplier's 1 - 0.65 * 0.5 = 0.675 factor. Unlike the old
    // capacity-scar mechanism, this leaves cells.capacity untouched and recovers as soon
    // as foodStress falls, instead of a permanent cut.
    expect(mockWorldContext.markets[0].foodLedger.foodProduced).toBeCloseTo(2150 * 0.675, 1);
  });

  it("keeps the quarterly food allocation uniform at the equator", () => {
    const weights = getGlobalQuarterlyFoodWeights({
      mapCoordinates: { latN: 5, latS: -5 },
      climate: { temperatureEquator: 30, temperatureNorthPole: -20, temperatureSouthPole: -20 }
    });

    expect(weights).toEqual(DEFAULT_QUARTERLY_WEIGHTS);
  });

  it("applies a small, normalized northern harvest peak in strongly seasonal worlds", () => {
    const weights = getGlobalQuarterlyFoodWeights({
      mapCoordinates: { latN: 90, latS: 70 },
      climate: { temperatureEquator: 30, temperatureNorthPole: -20, temperatureSouthPole: -20 }
    });

    expect(weights[2]).toBeGreaterThan(weights[0]);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });

  it("moves the mild harvest peak by half a year for southern maps", () => {
    const weights = getGlobalQuarterlyFoodWeights({
      mapCoordinates: { latN: -70, latS: -90 },
      climate: { temperatureEquator: 30, temperatureNorthPole: -20, temperatureSouthPole: -20 }
    });

    expect(weights[0]).toBeGreaterThan(weights[2]);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });

  it("shifts buckets oldest-first and overflows what the 9-month cap can't hold", () => {
    const market: any = {
      i: 1,
      goods: {},
      foodLedger: {
        foodProduced: 0,
        ruralNeed: 0,
        urbanNeed: 0,
        exportable: 0,
        importNeed: 0,
        targetStock: 0,
        satisfiedImport: 0,
        importCapacityBonus: 0,
        foodStockAge0: 100,
        foodStockAge1: 200,
        foodStockAge2: 300,
        foodStockAge0UnitCost: 1,
        foodStockAge1UnitCost: 1,
        foodStockAge2UnitCost: 1,
        storageOverflow: 0,
        ruralFoodStressQuarters: 0,
        urbanFoodStressQuarters: 0,
        ruralSevereDeficitQuarters: 0,
        urbanSevereDeficitQuarters: 0
      },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 }
    };
    mockWorldContext = {
      populationRate: 1000,
      urbanization: 1,
      pack: {
        // One rural cell (id 1; index 0 is an unused placeholder, matching the array-by-cellId
        // convention used elsewhere in this file) with no production capacity of its own, but
        // enough population that annualDemand keeps the 9-month cap well above the 300 units
        // already in the buckets — this isolates the bucket-shift behavior from the separate
        // cap-trim behavior.
        cells: { i: [1], h: [0, 25], pop: [0, 10], capacity: [0, 0] },
        burgs: []
      },
      markets: [market]
    };
    vi.mocked(getWorldContext).mockReturnValue(mockWorldContext);
    vi.mocked(getMarkets).mockReturnValue(mockWorldContext.markets);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([0, 1]));

    FoodProduction.generateQuarterlyLedger(0);

    // No production this quarter (zero capacity): old Age2 (300) becomes overflow, Age1 (200)
    // becomes the new Age2, old Age0 (100) becomes the new Age1, and the new Age0 is empty.
    expect(market.foodLedger.storageOverflow).toBe(300);
    expect(market.foodLedger.foodStockAge2).toBe(200);
    expect(market.foodLedger.foodStockAge1).toBe(100);
    expect(market.foodLedger.foodStockAge0).toBe(0);
  });
});
