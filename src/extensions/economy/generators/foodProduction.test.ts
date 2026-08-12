import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAPLE_CROP_PROFILES } from "../../../data/stapleCrops";
import { DEFAULT_QUARTERLY_WEIGHTS, FoodProduction, getGlobalQuarterlyFoodWeights } from "./foodProduction";
import type { Good } from "./goodsGeneratorTypes";

// Mock economy context
vi.mock("../economyContext", () => ({
  getWorldContext: vi.fn(),
  getMarkets: vi.fn(),
  getMarketCellColumn: vi.fn(),
  getGoods: vi.fn(() => []),
  getCultivableArea: vi.fn(() => new Float32Array()),
  getCultivatedArea: vi.fn(() => new Float32Array()),
  getFarmLaborRequired: vi.fn(() => new Float32Array()),
  getFoodPotential: vi.fn(() => new Float32Array()),
  getRuralHouseholdFoodStock: vi.fn(() => new Float32Array()),
  setRuralHouseholdFoodStock: vi.fn()
}));

import {
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFoodPotential,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getRuralHouseholdFoodStock,
  getWorldContext,
  setRuralHouseholdFoodStock
} from "../economyContext";

describe("FoodProduction", () => {
  let mockWorldContext: any;
  let ruralHouseholdFoodStock: Float32Array;

  beforeEach(() => {
    vi.resetAllMocks();
    ruralHouseholdFoodStock = new Float32Array();
    vi.mocked(getRuralHouseholdFoodStock).mockImplementation(() => ruralHouseholdFoodStock);
    vi.mocked(setRuralHouseholdFoodStock).mockImplementation(value => {
      ruralHouseholdFoodStock = value;
    });

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
    // Urban Need = 5,000 * 0.43 = 2150 => Quarter Need = 537.5.
    // Rural households retain their own annual provisions, so Market stock is
    // sized for urban demand only: 9-month cap = 1612.5, 3-month export
    // reserve = 537.5, and 6-month import target = 1075.

    // The ledger starts empty. The 9-month Market-storage cap moves the
    // excess to overflow, leaving 1612.5 stock and 1075 exportable Grain.

    expect(market1.foodLedger.ruralNeed).toBeCloseTo(1612.5, 1);
    expect(market1.foodLedger.urbanNeed).toBeCloseTo(537.5, 1);
    expect(market1.foodLedger.exportable).toBeCloseTo(1075, 0);
    expect(market1.foodLedger.importNeed).toBe(0);

    // The quarter's production lands entirely in the newest bucket; older buckets stay empty.
    expect(market1.foodLedger.foodStockAge0).toBeCloseTo(1612.5, 0);
    expect(market1.foodLedger.foodStockAge1).toBe(0);
    expect(market1.foodLedger.foodStockAge2).toBe(0);
    expect(market1.foodLedger.storageOverflow).toBeCloseTo(403.13, 0);

    // With no starting merchant capital, the farmgate cost accrues entirely as rural debt.
    expect(market1.marketTreasury).toBeDefined();
    expect(market1.marketTreasury.balance).toBe(0);
    expect(market1.marketTreasury.ruralGrainPayable).toBeGreaterThan(0);
  });

  it("adds harvest monthly while retaining the legacy three-month ageing bands", () => {
    FoodProduction.generateMonthlyLedger(1);
    const january = mockWorldContext.pack.markets[0].foodLedger.foodProduced;
    FoodProduction.generateMonthlyLedger(2);
    const february = mockWorldContext.pack.markets[0].foodLedger.foodProduced;

    // This legacy fixture has no crop catalogue, so its compatibility fallback is uniform.
    // The important lifecycle property is that each month enters stock rather than waiting for
    // a shared quarterly harvest.
    expect(january).toBeGreaterThan(0);
    expect(february).toBeCloseTo(january, 5);
    expect(mockWorldContext.pack.markets[0].foodLedger.foodStockAge0).toBeGreaterThan(january);
    expect(mockWorldContext.pack.markets[0].foodLedger.foodStockAge1).toBe(0);
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

  it("retains harvest until rural household provisions are full, then wholesales only the surplus", () => {
    mockWorldContext = {
      populationRate: 1,
      urbanization: 1,
      pack: {
        cells: {
          i: new Uint16Array([0]),
          h: new Uint8Array([25]),
          pop: new Float32Array([10]),
          capacity: new Float32Array([20])
        },
        burgs: []
      },
      markets: [{ i: 1, goods: {} }]
    };
    ruralHouseholdFoodStock = new Float32Array([4]);
    vi.mocked(getWorldContext).mockReturnValue(mockWorldContext);
    vi.mocked(getMarkets).mockReturnValue(mockWorldContext.markets);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([1]));
    vi.mocked(getCultivableArea).mockReturnValue(new Float32Array([10]));
    vi.mocked(getCultivatedArea).mockReturnValue(new Float32Array([10]));
    vi.mocked(getFoodPotential).mockReturnValue(new Float32Array([20]));

    FoodProduction.generateQuarterlyLedger(0);

    // Annual household target is 10 people × 0.43 = 4.3. The first quarter
    // harvest is 5, so 0.3 refills the larder and only 4.7 reaches the Market.
    expect(ruralHouseholdFoodStock[0]).toBeCloseTo(4.3, 4);
    expect(mockWorldContext.markets[0].foodLedger.foodProduced).toBeCloseTo(4.7, 4);
  });

  it("does not create anonymous Grain when no catalogued crop is viable", () => {
    const grain: Good = {
      i: 1,
      name: "Grain",
      tags: ["food", "stapleFood"],
      value: 1,
      unit: "wain",
      icon: "grain",
      color: "#fff"
    };
    const wheat: Good = {
      i: 2,
      name: "Wheat",
      tags: ["food", "crop", "stapleCrop"],
      value: 1,
      unit: "wain",
      icon: "wheat",
      color: "#fff",
      crop: STAPLE_CROP_PROFILES.Wheat
    };
    vi.mocked(getGoods).mockReturnValue([grain, wheat]);
    mockWorldContext.grid = { cells: { temp: new Float32Array([30, 30, 30, 30]), prec: new Float32Array(4) } };
    mockWorldContext.biomesData = { tags: [[]] };
    mockWorldContext.pack.cells.g = new Uint16Array([0, 1, 2, 3]);
    mockWorldContext.pack.cells.biomeCode = new Uint8Array([0, 0, 0, 0]);
    mockWorldContext.pack.cells.r = new Uint16Array(4);

    FoodProduction.generateQuarterlyLedger(0);

    expect(mockWorldContext.pack.markets[0].foodLedger.foodProduced).toBe(0);
    expect(mockWorldContext.pack.markets[0].foodLedger.stapleCropInventories).toBeUndefined();
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
        // Market storage is sized for urban buyers, so add an urban burg
        // large enough that its 9-month cap does not affect this bucket test.
        burgs: [{ i: 1, market: 1, population: 3000, removed: false }]
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
