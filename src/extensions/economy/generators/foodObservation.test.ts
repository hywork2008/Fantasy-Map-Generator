import { describe, expect, it } from "vitest";
import type { WorldContext } from "../../../context/worldContext";
import { observeFoodSystem } from "./foodObservation";
import type { Good } from "./goodsGeneratorTypes";
import type { Market } from "./marketTypes";

describe("food boundary observation", () => {
  function fixture() {
    return {
      world: {
        populationRate: 1000,
        urbanization: 2,
        pack: {
          cells: {
            i: [0, 1, 2, 3, 4],
            h: [30, 30, 30, 30, 0],
            pop: [1, 2, 3, 4, 99],
            state: [0, 1, 1, 2, 0],
            province: [0, 1, 1, 2, 0],
            burg: [0, 1, 0, 2, 0]
          },
          burgs: [
            { i: 0 },
            { i: 1, cell: 1, market: 1, population: 1 },
            { i: 2, cell: 3, market: 2, population: 2 },
            { i: 3, removed: true, population: 99 }
          ]
        }
      } as unknown as WorldContext,
      markets: [
        { i: 1, centerBurgId: 1, foodLedger: {}, foodProcessingLedger: { Milk: { householdConsumption: 5 } } },
        { i: 2, centerBurgId: 2 }
      ] as Market[],
      goods: [{ i: 116, name: "Milk" }] as Good[],
      marketByCell: new Uint16Array([0, 1, 99, 2, 0]),
      ruralFoodStock: new Float32Array([0, 10]),
      cellFoodFlows: { 116: { harvested: 7, processed: 2, privateReserveOutput: 0 } }
    };
  }
  it("separates missing attribution, missing market and missing ledger using real population", () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const result = observeFoodSystem(input);
    expect(result.coverage.rural).toEqual({ total: 10000, covered: 2000, uncovered: 8000 });
    expect(result.coverage.urban).toEqual({ total: 6000, covered: 2000, uncovered: 4000 });
    expect(result.coverage.byReason).toEqual({
      noMarketAssignment: { ruralPeople: 1000, urbanPeople: 0 },
      missingMarket: { ruralPeople: 3000, urbanPeople: 0 },
      missingFoodLedger: { ruralPeople: 4000, urbanPeople: 4000 }
    });
    expect(result.coverage.uncoveredCells.map(row => row.householdStock)).toEqual([0, null, null]);
    expect(result.cellFoodFlows).toEqual([
      { goodId: 116, name: "Milk", harvested: 7, processed: 2, privateReserveOutput: 0 }
    ]);
    expect(result.livestockMeatKilograms).toBeNull();
    result.markets[0].processing!.Milk!.householdConsumption = 100;
    expect(JSON.stringify(input)).toBe(before);
    expect(input.markets[0].foodProcessingLedger!.Milk!.householdConsumption).toBe(5);
  });
  it("retains an unavailable source ledger as unknown and treats an existing empty ledger separately", () => {
    const input = fixture();
    expect(observeFoodSystem({ ...input, cellFoodFlows: null }).cellFoodFlows).toBeNull();
    expect(observeFoodSystem({ ...input, cellFoodFlows: {} }).cellFoodFlows).toEqual([]);
  });
});
