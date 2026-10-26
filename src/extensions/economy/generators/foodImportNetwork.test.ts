import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../../hostCore";
import { buildLandRouteGraph, buildSeaRouteGraph, findLandRouteDistance, findSeaRouteDistance } from "../../hostCore";
import { getGoods, getMarkets } from "../economyContext";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { getFoodImportAttempts, resolveFoodImportNetwork } from "./foodImportNetwork";
import { Markets } from "./markets-generator";
import { calculateRouteDurationFromDistances } from "./tradeRouteDuration";
import { TradeSecurity } from "./tradeSecurity";

vi.mock("../../hostCore", () => ({
  buildLandRouteGraph: vi.fn(),
  buildSeaRouteGraph: vi.fn(),
  findLandRouteDistance: vi.fn(),
  findSeaRouteDistance: vi.fn()
}));

vi.mock("../economyContext", () => ({
  getGoods: vi.fn(),
  getMarkets: vi.fn()
}));

vi.mock("./burgMarketLedgers", () => ({ getBurgMarketLedger: vi.fn() }));
vi.mock("./markets-generator", () => ({ Markets: { customerBuyPrice: vi.fn() } }));
vi.mock("./tradeSecurity", () => ({ TradeSecurity: { getBanditRiskPerDay: vi.fn() } }));
vi.mock("./tradeRouteDuration", () => ({ calculateRouteDurationFromDistances: vi.fn() }));

const ledger = (overrides: Record<string, unknown>) => ({
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
});

describe("resolveFoodImportNetwork", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(buildLandRouteGraph).mockReturnValue({ adjacency: new Map() });
    vi.mocked(buildSeaRouteGraph).mockReturnValue({ adjacency: new Map() });
    vi.mocked(findLandRouteDistance).mockImplementation((_graph, start, end) => (start === 1 && end === 2 ? 10 : null));
    vi.mocked(findSeaRouteDistance).mockReturnValue(null);
    vi.mocked(calculateRouteDurationFromDistances).mockImplementation((landDistanceKm, seaDistanceKm) =>
      landDistanceKm > 0 ? 10 : seaDistanceKm > 0 ? 20 : Infinity
    );
    vi.mocked(getBurgMarketLedger).mockReturnValue(undefined);
    vi.mocked(TradeSecurity.getBanditRiskPerDay).mockReturnValue(0);
    vi.mocked(Markets.customerBuyPrice).mockImplementation(price => price);
    vi.mocked(getGoods).mockReturnValue([{ i: 1, name: "Wheat", tags: ["food", "stapleCrop"], value: 1 }]);
  });

  it.each(["open", "closed origin road", "closed destination road", "missing sea lane", "removed port"])(
    "uses local ports for inland hubs only with every leg available: %s",
    condition => {
      const supplier = {
        i: 1,
        centerBurgId: 1,
        color: "",
        goods: { 1: { stock: 100, price: 1 } },
        marketTreasury: { balance: 0, ruralGrainPayable: 0 },
        foodLedger: ledger({ exportable: 100, foodStockAge0: 100, foodStockAge0UnitCost: 1 })
      };
      const importer = {
        i: 2,
        centerBurgId: 2,
        color: "",
        goods: {},
        marketTreasury: { balance: 60, ruralGrainPayable: 0 },
        foodLedger: ledger({ importNeed: 40 })
      };
      vi.mocked(getMarkets).mockReturnValue([supplier, importer] as never);
      vi.mocked(findLandRouteDistance).mockImplementation((_graph, from, to) => {
        if (from === 1 && to === 3 && condition !== "closed origin road") return 20;
        if (from === 2 && to === 4 && condition !== "closed destination road") return 10;
        return null;
      });
      vi.mocked(findSeaRouteDistance).mockImplementation((_graph, from, to) =>
        from === 3 && to === 4 && condition !== "missing sea lane" ? 50 : null
      );
      const world = {
        populationRate: 100,
        urbanization: 1,
        distanceScale: 1,
        options: { month: 7 },
        pack: {
          routes: [{}],
          burgs: [
            { cell: 0 },
            { i: 1, cell: 1, market: 1 },
            { i: 2, cell: 2, market: 2 },
            { i: 3, cell: 3, market: 1, port: 1, removed: condition === "removed port" },
            { i: 4, cell: 4, market: 2, port: 1 }
          ]
        }
      } as unknown as WorldContext;

      const flows = resolveFoodImportNetwork(world);
      if (condition !== "open") {
        expect(flows).toHaveLength(0);
        expect(supplier.foodLedger.foodStockAge0).toBe(100);
        expect(importer.foodLedger.foodStockAge0).toBe(0);
        expect(importer.marketTreasury.balance).toBe(60);
        return;
      }
      expect(calculateRouteDurationFromDistances).toHaveBeenCalledWith(30, 50, 2);
      expect(flows).toHaveLength(1);
      expect(importer.foodLedger.satisfiedImport).toBeCloseTo(40, 1);
      expect(supplier.foodLedger.foodStockAge0 + flows[0].volume).toBeCloseTo(100, 2);
      expect(supplier.marketTreasury.balance + importer.marketTreasury.balance).toBe(60);
    }
  );

  it("uses finite surplus once, applies transit loss, and raises only the importing burg capacity", () => {
    const supplier = {
      i: 1,
      centerBurgId: 1,
      color: "",
      goods: { 1: { stock: 100, price: 1 } },
      foodLedger: {
        foodProduced: 0,
        ruralNeed: 0,
        urbanNeed: 0,
        exportable: 100,
        importNeed: 0,
        targetStock: 0,
        satisfiedImport: 0,
        importCapacityBonus: 0,
        foodStockAge0: 100,
        foodStockAge1: 0,
        foodStockAge2: 0,
        foodStockAge0UnitCost: 0,
        foodStockAge1UnitCost: 0,
        foodStockAge2UnitCost: 0,
        storageOverflow: 0,
        ruralFoodStressQuarters: 0,
        urbanFoodStressQuarters: 0,
        ruralSevereDeficitQuarters: 0,
        urbanSevereDeficitQuarters: 0
      }
    };
    const importer = {
      i: 2,
      centerBurgId: 2,
      color: "",
      goods: { 1: { stock: 0, price: 4 } },
      foodLedger: {
        foodProduced: 0,
        ruralNeed: 0,
        urbanNeed: 0,
        exportable: 0,
        importNeed: 50,
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
        urbanSevereDeficitQuarters: 0
      }
    };
    vi.mocked(getMarkets).mockReturnValue([supplier, importer]);

    const world = {
      populationRate: 100,
      urbanization: 1,
      distanceScale: 1,
      graphHeight: 100,
      mapCoordinates: { latT: 90, latN: 90, lonT: 180, lonW: 180 },
      options: { month: 6 },
      pack: {
        routes: [{ group: "roads", points: [] }],
        burgs: [
          { cell: 0, demographics: { capacity: 0, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 } },
          {
            i: 1,
            cell: 1,
            market: 1,
            population: 5,
            demographics: {
              capacity: 10,
              effectiveCapacity: 25,
              children: 1,
              maleAdults: 2,
              femaleAdults: 1,
              elders: 1
            }
          },
          {
            i: 2,
            cell: 2,
            market: 2,
            population: 20,
            demographics: { capacity: 20, children: 4, maleAdults: 8, femaleAdults: 5, elders: 3 }
          }
        ]
      }
    } as unknown as WorldContext;

    const flows = resolveFoodImportNetwork(world);

    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({ fromMarketId: 1, toMarketId: 2, travelDays: 10 });
    expect(flows[0].volume).toBeGreaterThan(50);
    expect(importer.foodLedger.satisfiedImport).toBeCloseTo(50, 1);
    expect(importer.foodLedger.importCapacityBonus).toBeCloseTo((50 * 4) / 0.43 / 100, 3);
    expect(world.pack.burgs[1].demographics?.effectiveCapacity).toBe(10);
    expect(world.pack.burgs[2].demographics?.effectiveCapacity).toBeCloseTo(20 + (50 * 4) / 0.43 / 100, 3);
  });

  it("never pays more than the importer holds when the crop's own lots cost more than the average", () => {
    // The ledger-wide average is cheap (0.5), but the wheat itself sits in a dear old lot (3).
    const supplier = {
      i: 1,
      centerBurgId: 1,
      color: "",
      goods: { 1: { stock: 100, price: 1 } },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 },
      foodLedger: ledger({
        exportable: 100,
        foodStockAge0: 100,
        foodStockAge0UnitCost: 0.5,
        stapleCropInventories: {
          1: { age0: 0, age1: 0, age2: 100, age0UnitCost: 0.5, age1UnitCost: 0.5, age2UnitCost: 3, overflow: 0 }
        }
      })
    };
    const importer = {
      i: 2,
      centerBurgId: 2,
      color: "",
      goods: { 1: { stock: 0, price: 4 } },
      marketTreasury: { balance: 30, ruralGrainPayable: 0 },
      foodLedger: ledger({ importNeed: 50 })
    };
    vi.mocked(getMarkets).mockReturnValue([supplier, importer] as never);
    const world = {
      populationRate: 100,
      urbanization: 1,
      distanceScale: 1,
      graphHeight: 100,
      mapCoordinates: { latT: 90, latN: 90, lonT: 180, lonW: 180 },
      options: { month: 6 },
      pack: {
        routes: [{ group: "roads", points: [] }],
        burgs: [
          { cell: 0 },
          { i: 1, cell: 1, market: 1, population: 5, demographics: { capacity: 10 } },
          { i: 2, cell: 2, market: 2, population: 20, demographics: { capacity: 20 } }
        ]
      }
    } as unknown as WorldContext;

    resolveFoodImportNetwork(world);

    expect(importer.marketTreasury.balance).toBeGreaterThanOrEqual(0);
    expect(supplier.marketTreasury.balance).toBeCloseTo(30 - importer.marketTreasury.balance, 2);
    expect(supplier.marketTreasury.balance).toBeGreaterThan(0);
  });

  it("ships real stored crops despite stale mirrors and retains a newly imported crop's identity", () => {
    vi.mocked(getGoods).mockReturnValue([
      { i: 1, name: "Wheat", tags: ["stapleCrop"], value: 1 },
      { i: 2, name: "Barley", tags: ["stapleCrop"], value: 1 },
      { i: 3, name: "Oats", tags: ["stapleCrop"], value: 1 }
    ] as never);
    const crop = (age0: number, overflow = 0) => ({
      age0,
      age1: 0,
      age2: 0,
      age0UnitCost: 1,
      age1UnitCost: 0,
      age2UnitCost: 0,
      overflow
    });
    const supplier = {
      i: 1,
      centerBurgId: 1,
      color: "",
      goods: { 1: { stock: 1000, price: 1 }, 2: { stock: 0, price: 1 }, 3: { stock: 5000, price: 1 } },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 },
      foodLedger: {
        ...ledger({ exportable: 100, foodStockAge0: 100, storageOverflow: 500 }),
        stapleCropInventories: { 1: crop(0, 500), 2: crop(100) }
      }
    };
    const importer = {
      i: 2,
      centerBurgId: 2,
      color: "",
      goods: {},
      marketTreasury: { balance: 100, ruralGrainPayable: 0 },
      foodLedger: {
        ...ledger({ importNeed: 40, foodStockAge0: 5 }),
        stapleCropInventories: { 1: crop(5) } as Record<number, ReturnType<typeof crop>>
      }
    };
    vi.mocked(getMarkets).mockReturnValue([supplier, importer] as never);
    const world = {
      populationRate: 100,
      urbanization: 1,
      distanceScale: 1,
      options: { month: 7 },
      pack: { routes: [{}], burgs: [{ cell: 0 }, { i: 1, cell: 1 }, { i: 2, cell: 2 }] }
    } as unknown as WorldContext;

    const flows = resolveFoodImportNetwork(world);
    expect(flows).toHaveLength(1);
    expect(flows[0].goodId).toBe(2);
    expect(supplier.foodLedger.stapleCropInventories[1].overflow).toBe(500);
    expect(supplier.foodLedger.stapleCropInventories[2].age0 + flows[0].volume).toBeCloseTo(100, 2);
    expect(importer.foodLedger.stapleCropInventories[1].age0).toBe(5);
    expect(importer.foodLedger.stapleCropInventories[2].age0).toBeCloseTo(40, 1);
    expect(importer.foodLedger.foodStockAge0).toBeCloseTo(45, 1);
    expect(importer.marketTreasury.balance + supplier.marketTreasury.balance).toBe(100);
  });

  it("distinguishes an unaffordable minimum quantity from an empty crop without moving stock or cash", () => {
    const supplier = {
      i: 1,
      centerBurgId: 1,
      color: "",
      goods: { 1: { stock: 100, price: 10 } },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 },
      foodLedger: ledger({ exportable: 100, foodStockAge0: 100, foodStockAge0UnitCost: 10 })
    };
    const importer = {
      i: 2,
      centerBurgId: 2,
      color: "",
      goods: {},
      marketTreasury: { balance: 0.01, ruralGrainPayable: 0 },
      foodLedger: ledger({ importNeed: 40 })
    };
    vi.mocked(getMarkets).mockReturnValue([supplier, importer] as never);
    const world = {
      populationRate: 100,
      urbanization: 1,
      distanceScale: 1,
      options: { month: 7 },
      pack: { routes: [{}], burgs: [{ cell: 0 }, { i: 1, cell: 1 }, { i: 2, cell: 2 }] }
    } as unknown as WorldContext;
    expect(resolveFoodImportNetwork(world)).toHaveLength(0);
    expect(getFoodImportAttempts()).toMatchObject([{ outcome: "belowQuantityPrecision", affordableUnits: 0.001 }]);
    expect(supplier.foodLedger.foodStockAge0).toBe(100);
    expect(supplier.marketTreasury.balance).toBe(0);
    expect(importer.marketTreasury.balance).toBe(0.01);
  });
});
