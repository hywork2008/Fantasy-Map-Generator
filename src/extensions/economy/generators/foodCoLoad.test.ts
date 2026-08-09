import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import {
  computeFoodCoLoadUnits,
  drawFoodForExport,
  foodDeliveredShare,
  receiveFoodImport,
  restoreFoodCoLoadToOrigin,
  returnFoodExportToLedger,
  settleFoodCoLoadOnArrival,
  tryCoLoadFoodOntoCaravan
} from "./foodCoLoad";
import type { Caravan, FoodLedger, Market } from "./marketTypes";

function emptyLedger(overrides: Partial<FoodLedger> = {}): FoodLedger {
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

describe("foodCoLoad pure helpers", () => {
  it("caps co-load units by free slots, exportable, and import need", () => {
    expect(
      computeFoodCoLoadUnits({
        freeSlots: 100,
        cargoSlotsPerUnit: 2,
        exportable: 80,
        importNeed: 30
      })
    ).toBeCloseTo(Math.min(50, 80, 30 * 1.15));

    expect(
      computeFoodCoLoadUnits({
        freeSlots: 100,
        cargoSlotsPerUnit: 1,
        exportable: 10,
        importNeed: 0
      })
    ).toBe(10);
  });

  it("applies half-life spoilage", () => {
    expect(foodDeliveredShare(0)).toBe(1);
    expect(foodDeliveredShare(90)).toBeCloseTo(Math.exp(-1));
  });

  it("draws FIFO from oldest buckets and restores export returns", () => {
    const ledger = emptyLedger({
      foodStockAge2: 5,
      foodStockAge2UnitCost: 1,
      foodStockAge1: 5,
      foodStockAge1UnitCost: 2,
      foodStockAge0: 10,
      foodStockAge0UnitCost: 3,
      exportable: 12
    });

    const drawn = drawFoodForExport(ledger, 8);
    expect(drawn.units).toBe(8);
    expect(ledger.foodStockAge2).toBe(0);
    expect(ledger.foodStockAge1).toBe(2);
    expect(ledger.exportable).toBe(4);
    // 5*1 + 3*2 = 11 → unitCost 11/8
    expect(drawn.unitCost).toBeCloseTo(11 / 8);

    returnFoodExportToLedger(ledger, 8, drawn.unitCost);
    expect(ledger.exportable).toBe(12);
    expect(ledger.foodStockAge0).toBeCloseTo(18);
  });

  it("receives import into age0 and reduces import need", () => {
    const ledger = emptyLedger({ foodStockAge0: 2, foodStockAge0UnitCost: 1, importNeed: 10 });
    receiveFoodImport(ledger, 4, 2);
    expect(ledger.foodStockAge0).toBe(6);
    expect(ledger.foodStockAge0UnitCost).toBeCloseTo((2 * 1 + 4 * 2) / 6);
    expect(ledger.importNeed).toBe(6);
    expect(ledger.satisfiedImport).toBe(4);
  });
});

describe("foodCoLoad caravan integration", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setGoods([
      {
        i: 1,
        name: "Wheat",
        tags: ["food", "stapleCrop", "crop", "cereal"],
        value: 2,
        color: "#cc0",
        icon: "grain",
        trade: { bulk: 4, weight: 3, scale: "regional", timeValueTrend: -1 },
        cargo: { cargoSlotsPerUnit: 2, handlingClass: "loose" },
        demandCoverage: { food: 1 }
      } as never
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: { 1: { stock: 50, price: 2 } },
        foodLedger: emptyLedger({
          foodStockAge0: 40,
          foodStockAge0UnitCost: 1.5,
          exportable: 30,
          importNeed: 0
        })
      },
      {
        i: 2,
        centerBurgId: 2,
        color: "#111",
        goods: { 1: { stock: 0, price: 3 } },
        foodLedger: emptyLedger({
          foodStockAge0: 5,
          foodStockAge0UnitCost: 2,
          exportable: 0,
          importNeed: 20
        })
      }
    ] as Market[]);
  });

  afterEach(() => {
    clearEconomyContext();
  });

  function makeLoadingCaravan(partial?: Partial<Caravan>): Caravan {
    return {
      i: 1,
      seller: 1,
      sellerType: "market",
      buyer: 2,
      buyerType: "market",
      payload: [
        {
          goodId: 99,
          dealId: 1,
          units: 5,
          value: 50,
          cargoSlotsPerUnit: 1
        }
      ],
      units: 5,
      value: 50,
      draftAnimalId: "horse",
      routeSegments: [
        {
          type: "land",
          points: [
            { x: 0, y: 0, cell: 0 },
            { x: 10, y: 0, cell: 1 }
          ]
        }
      ],
      totalDistance: 100,
      currentDistance: 0,
      state: "loading",
      loading: {
        waitedDays: 0,
        maxWaitDays: 14,
        targetUtilization: 0.55,
        minSailUtilization: 0.2,
        plannedCapacitySlots: 80
      },
      ...partial
    };
  }

  it("loads food into free hold space from exportable surplus", () => {
    const caravan = makeLoadingCaravan();
    const exportableBefore = getMarkets().find(market => market.i === 1)!.foodLedger!.exportable;

    const loaded = tryCoLoadFoodOntoCaravan(caravan);
    expect(loaded).toBeGreaterThan(0);

    const food = caravan.payload.find(item => item.isFoodCoLoad);
    expect(food).toBeDefined();
    expect(food!.units).toBe(loaded);
    expect(food!.cargoSlotsPerUnit).toBe(2);
    expect(food!.isFoodCoLoad).toBe(true);

    // freeSlots = 80 - 5 = 75 → units = 75/2 = 37.5, capped by exportable 30 and need 20*1.15
    expect(loaded).toBeCloseTo(Math.min(37.5, 30, 20 * 1.15));
    expect(getMarkets().find(market => market.i === 1)!.foodLedger!.exportable).toBeCloseTo(exportableBefore - loaded);
  });

  it("settles arrival with spoilage into importer ledger", () => {
    const caravan = makeLoadingCaravan();
    tryCoLoadFoodOntoCaravan(caravan);
    const loadedUnits = caravan.payload.find(item => item.isFoodCoLoad)!.units;
    caravan.state = "transit";
    caravan.loading = undefined;
    caravan.travelLegs = [{ endKm: 90, speedKmPerDay: 1 }]; // 90 days → half-life

    const stockBefore = getMarkets().find(market => market.i === 2)!.foodLedger!.foodStockAge0;
    const delivered = settleFoodCoLoadOnArrival(caravan, 1);

    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(loadedUnits);
    expect(caravan.payload.some(item => item.isFoodCoLoad)).toBe(false);

    const importer = getMarkets().find(market => market.i === 2)!;
    expect(importer.foodLedger!.foodStockAge0).toBeCloseTo(stockBefore + delivered);
    expect(importer.foodLedger!.satisfiedImport).toBeCloseTo(delivered);
  });

  it("returns food to exporter on cancel restore", () => {
    const caravan = makeLoadingCaravan();
    const exportableBefore = getMarkets().find(market => market.i === 1)!.foodLedger!.exportable;
    tryCoLoadFoodOntoCaravan(caravan);
    expect(getMarkets().find(market => market.i === 1)!.foodLedger!.exportable).toBeLessThan(exportableBefore);

    restoreFoodCoLoadToOrigin(caravan);
    expect(caravan.payload.some(item => item.isFoodCoLoad)).toBe(false);
    expect(getMarkets().find(market => market.i === 1)!.foodLedger!.exportable).toBeCloseTo(exportableBefore);
  });
});
