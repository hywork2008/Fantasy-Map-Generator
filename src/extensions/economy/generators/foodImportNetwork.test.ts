import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../../hostCore";
import { buildLandRouteGraph, buildSeaRouteGraph, findLandRouteDistance, findSeaRouteDistance } from "../../hostCore";
import { getGoods, getMarkets } from "../economyContext";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { resolveFoodImportNetwork } from "./foodImportNetwork";
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
});
