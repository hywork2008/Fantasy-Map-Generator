import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodProduction } from "./foodProduction";

// Mock economy context
vi.mock("../economyContext", () => ({
  getWorldContext: vi.fn()
}));

import { getWorldContext } from "../economyContext";

describe("FoodProduction", () => {
  let mockWorldContext: any;

  beforeEach(() => {
    vi.resetAllMocks();

    mockWorldContext = {
      pack: {
        options: {
          populationRate: 1000,
          urbanization: 1
        },
        markets: [{ i: 1 }, { i: 2 }],
        cells: {
          i: [1, 2, 3],
          market: [0, 1, 1, 2],
          h: [0, 25, 25, 25],
          pop: [0, 10, 5, 2],
          capacity: [0, 20, 10, 2]
        },
        burgs: [
          { i: 1, market: 1, population: 5, removed: false },
          { i: 2, market: 2, population: 15, removed: false }
        ]
      }
    };

    (getWorldContext as any).mockReturnValue(mockWorldContext);
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

    // Rural Surplus = 2015.63 - 1612.5 = 403.13
    // Food Balance = 403.13 - 537.5 = -134.37

    // Exportable = max(0, -134.37) = 0
    // Import Need = 134.37

    expect(market1.foodLedger.ruralNeed).toBeCloseTo(1612.5, 1);
    expect(market1.foodLedger.urbanNeed).toBeCloseTo(537.5, 1);
    expect(market1.foodLedger.exportable).toBe(0);
    expect(market1.foodLedger.importNeed).toBeGreaterThan(0);
  });
});
