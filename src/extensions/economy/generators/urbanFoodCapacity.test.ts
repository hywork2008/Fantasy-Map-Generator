import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackedGraph } from "../../hostTypes";

vi.mock("../economyContext", () => ({
  getWorldContext: vi.fn(),
  getMarkets: vi.fn(),
  getMarketCellColumn: vi.fn(),
  getRuralFoodCapacity: vi.fn()
}));

import { getMarketCellColumn, getMarkets, getRuralFoodCapacity, getWorldContext } from "../economyContext";
import type { Market } from "./marketTypes";
import {
  hinterlandSurplusUrbanPoints,
  reconcileUrbanCapacityFromFood,
  URBAN_CAPACITY_MAX_GROWTH_MULTIPLIER,
  URBAN_CAPACITY_MIN_SEED_SHARE
} from "./urbanFoodCapacity";

function makeMarket(id: number, importCapacityBonus = 0): Market {
  return {
    i: id,
    centerBurgId: id,
    goods: {},
    foodLedger: {
      foodProduced: 0,
      ruralNeed: 0,
      urbanNeed: 0,
      exportable: 0,
      importNeed: 0,
      targetStock: 0,
      satisfiedImport: 0,
      importCapacityBonus,
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
  } as Market;
}

describe("hinterlandSurplusUrbanPoints", () => {
  it("converts rural food leftover into urban points, ignoring water cells", () => {
    const cells = {
      i: [0, 1, 2],
      h: [25, 25, 10],
      pop: [10, 5, 100]
    };
    const marketCellColumn = [1, 1, 1];
    const ruralFoodCapacity = [40, 20, 999];

    expect(hinterlandSurplusUrbanPoints(1, cells, marketCellColumn, ruralFoodCapacity, 1)).toBe(45);
    expect(hinterlandSurplusUrbanPoints(1, cells, marketCellColumn, ruralFoodCapacity, 2)).toBe(22.5);
    expect(hinterlandSurplusUrbanPoints(2, cells, marketCellColumn, ruralFoodCapacity, 1)).toBe(0);
  });
});

describe("reconcileUrbanCapacityFromFood", () => {
  let world: {
    urbanization: number;
    pack: PackedGraph;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    world = {
      urbanization: 1,
      pack: {
        cells: {
          i: [0],
          h: [25],
          pop: [10]
        },
        burgs: [
          { i: 0, removed: 1 },
          {
            i: 1,
            cell: 0,
            market: 1,
            removed: 0,
            population: 8,
            demographics: {
              capacity: 10,
              seedCapacity: 10,
              effectiveCapacity: 10,
              children: 0,
              maleAdults: 0,
              femaleAdults: 0,
              elders: 0
            }
          }
        ]
      } as unknown as PackedGraph
    };
    vi.mocked(getWorldContext).mockReturnValue(world as never);
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([1]));
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([10]));
    vi.mocked(getMarkets).mockReturnValue([makeMarket(1)]);
  });

  it("records seedCapacity on old saves and leaves capacity unchanged that year", () => {
    const burg = world.pack.burgs[1]!;
    delete burg.demographics!.seedCapacity;
    burg.demographics!.capacity = 12;
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([100]));

    expect(reconcileUrbanCapacityFromFood()).toBe(false);
    expect(burg.demographics!.seedCapacity).toBe(12);
    expect(burg.demographics!.capacity).toBe(12);
  });

  it("raises capacity when hinterland surplus grows, up to 3× seed", () => {
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([10 + 100]));

    expect(reconcileUrbanCapacityFromFood()).toBe(true);
    expect(world.pack.burgs[1]!.demographics!.capacity).toBe(10 * URBAN_CAPACITY_MAX_GROWTH_MULTIPLIER);
  });

  it("gives an AgTech-rich hinterland a higher urban cap than a poor one", () => {
    world.pack.cells = { i: [0, 1], h: [25, 25], pop: [10, 10] } as never;
    world.pack.burgs = [
      { i: 0, removed: 1 },
      {
        i: 1,
        market: 1,
        removed: 0,
        demographics: {
          capacity: 10,
          seedCapacity: 10,
          children: 0,
          maleAdults: 0,
          femaleAdults: 0,
          elders: 0
        }
      },
      {
        i: 2,
        market: 2,
        removed: 0,
        demographics: {
          capacity: 10,
          seedCapacity: 10,
          children: 0,
          maleAdults: 0,
          femaleAdults: 0,
          elders: 0
        }
      }
    ] as never;
    vi.mocked(getMarketCellColumn).mockReturnValue(new Uint16Array([1, 2]));
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([10 + 20, 10 + 4]));
    vi.mocked(getMarkets).mockReturnValue([makeMarket(1), makeMarket(2)]);

    reconcileUrbanCapacityFromFood();

    const rich = world.pack.burgs[1]!.demographics!.capacity;
    const poor = world.pack.burgs[2]!.demographics!.capacity;
    expect(rich).toBeGreaterThan(poor);
    expect(rich).toBe(20);
    expect(poor).toBe(5);
  });

  it("floors capacity at half of seed when hinterland and imports are empty", () => {
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([0]));
    world.pack.cells.pop = [0] as never;

    reconcileUrbanCapacityFromFood();

    expect(world.pack.burgs[1]!.demographics!.capacity).toBe(10 * URBAN_CAPACITY_MIN_SEED_SHARE);
  });

  it("lets last-quarter imports hold a megacity above the hinterland floor", () => {
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([0]));
    world.pack.cells.pop = [0] as never;
    vi.mocked(getMarkets).mockReturnValue([makeMarket(1, 18)]);

    reconcileUrbanCapacityFromFood();

    expect(world.pack.burgs[1]!.demographics!.capacity).toBe(18);
  });

  it("shares hinterland surplus across market burgs in proportion to seedCapacity", () => {
    world.pack.burgs = [
      { i: 0, removed: 1 },
      {
        i: 1,
        market: 1,
        removed: 0,
        demographics: {
          capacity: 10,
          seedCapacity: 10,
          children: 0,
          maleAdults: 0,
          femaleAdults: 0,
          elders: 0
        }
      },
      {
        i: 2,
        market: 1,
        removed: 0,
        demographics: {
          capacity: 30,
          seedCapacity: 30,
          children: 0,
          maleAdults: 0,
          femaleAdults: 0,
          elders: 0
        }
      }
    ] as never;
    vi.mocked(getRuralFoodCapacity).mockReturnValue(new Float32Array([10 + 40]));

    reconcileUrbanCapacityFromFood();

    expect(world.pack.burgs[1]!.demographics!.capacity).toBe(10);
    expect(world.pack.burgs[2]!.demographics!.capacity).toBe(30);
  });
});
