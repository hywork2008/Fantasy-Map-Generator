import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getConstructionOperations,
  getMarkets,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setQuarryOperations
} from "../economyContext";
import {
  ConstructionOperations,
  getConstructionProductivityMultiplier,
  getConstructionRequiredWorkers,
  getMasonShare,
  getTargetBuildingStock
} from "./constructionEmployment";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

function setUpWorld(options: { includeConcrete?: boolean } = {}): void {
  worldContext.pack = {
    // pack.burgs is index-aligned to burg.i (index 0 is an unused filler).
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        market: 1,
        removed: 0,
        population: 5,
        demographics: {
          capacity: 1000,
          effectiveCapacity: 1000,
          maleAdults: 200,
          femaleAdults: 200,
          children: 0,
          elders: 0
        }
      }
    ],
    cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([10]), r: Uint16Array.from([0]), routes: {} }
  } as unknown as PackedGraph;
  setGoods([
    { i: 1, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#979EA2" },
    { i: 2, name: "Wood", tags: ["construction", "fuel"], value: 1, unit: "pile", icon: "good-wood", color: "#966F33" },
    ...(options.includeConcrete
      ? [
          {
            i: 3,
            name: "Roman Concrete",
            tags: ["construction"],
            value: 6,
            unit: "pallet",
            icon: "good-stone",
            color: "#8c8577"
          }
        ]
      : [])
  ]);
  setMarkets([
    {
      i: 1,
      centerBurgId: 1,
      color: "#111",
      goods: {
        1: { stock: 100000, price: 1 },
        2: { stock: 100000, price: 1 },
        ...(options.includeConcrete ? { 3: { stock: 100000, price: 6 } } : {})
      }
    }
  ]);
  setGoodCellColumn(new Uint16Array(1));
  setMarketCellColumn(Uint16Array.from([1]));
  setQuarryOperations([]);
  Goods.sync();
  Markets.sync();
}

describe("getTargetBuildingStock / getMasonShare", () => {
  afterEach(() => useOptionsState.setState({ culturesSet: "world" }));

  it("saturates toward 1 as adults grow, and is 0 with no population", () => {
    expect(getTargetBuildingStock(0)).toBe(0);
    expect(getTargetBuildingStock(400)).toBeCloseTo(1 - Math.exp(-1), 4);
    expect(getTargetBuildingStock(40000)).toBeGreaterThan(0.99);
  });

  it("is 0 without quarry access regardless of culture", () => {
    expect(getMasonShare(false)).toBe(0);
    useOptionsState.setState({ culturesSet: "highFantasy" });
    expect(getMasonShare(false)).toBe(0);
  });

  it("is boosted by a High Fantasy cultures set when quarry access exists", () => {
    expect(getMasonShare(true)).toBeCloseTo(0.4, 5);
    useOptionsState.setState({ culturesSet: "highFantasy" });
    expect(getMasonShare(true)).toBeCloseTo(0.6, 5);
  });
});

describe("getConstructionRequiredWorkers", () => {
  it("requires more workers the larger the backlog", () => {
    const noBacklog = getConstructionRequiredWorkers({ buildingStock: 1, hasQuarryAccess: true }, 400);
    const fullBacklog = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: true }, 400);

    expect(fullBacklog.mason + fullBacklog.carpenter).toBeGreaterThan(noBacklog.mason + noBacklog.carpenter);
  });

  it("puts all required workers into carpentry when there is no quarry access", () => {
    const required = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 400);
    expect(required.mason).toBe(0);
    expect(required.carpenter).toBeGreaterThan(0);
  });
});

describe("getConstructionProductivityMultiplier", () => {
  it("is neutral (1) when there is no operation yet", () => {
    expect(getConstructionProductivityMultiplier(undefined)).toBe(1);
  });

  it("ranges from 0.5 at buildingStock=0 to 1 at buildingStock=1", () => {
    expect(getConstructionProductivityMultiplier({ buildingStock: 0 })).toBeCloseTo(0.5, 5);
    expect(getConstructionProductivityMultiplier({ buildingStock: 1 })).toBeCloseTo(1, 5);
  });
});

describe("ConstructionOperationsModule", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => {
    clearEconomyContext();
    useOptionsState.setState({ culturesSet: "world" });
  });

  it("creates one operation per Burg with a market, starting with no building stock", () => {
    setUpWorld();

    ConstructionOperations.generate();

    const operations = getConstructionOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ burgId: 1, marketId: 1, buildingStock: 0, hasQuarryAccess: false });
  });

  it("reflects quarry access from QuarryOperations at generation time", () => {
    setUpWorld();
    setQuarryOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        quarryWorkers: 5,
        stoneRatio: 0.5,
        marbleRatio: 0,
        annualOutputTons: {},
        active: true
      }
    ]);

    ConstructionOperations.generate();

    expect(getConstructionOperations()[0].hasQuarryAccess).toBe(true);
  });

  it("grows buildingStock and consumes Wood when fully staffed with carpenters", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    operation.carpenterWorkers = 100; // far more than required, so the labor factor is 1

    ConstructionOperations.produceMonth();

    expect(getConstructionOperations()[0].buildingStock).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(100000);
  });

  it("prefers Roman Concrete over Stone for masons when both are available (§7.1 decision 3)", () => {
    setUpWorld({ includeConcrete: true });
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    operation.masonWorkers = 100;
    operation.carpenterWorkers = 100;
    operation.hasQuarryAccess = true;

    ConstructionOperations.produceMonth();

    expect(getMarkets()[0].goods[3].stock).toBeLessThan(100000);
    // Concrete alone should cover the full mason material need this month, leaving Stone untouched.
    expect(getMarkets()[0].goods[1].stock).toBe(100000);
  });

  it("does not consume Stone for a Burg with no quarry access", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    operation.carpenterWorkers = 100;
    operation.masonWorkers = 100;

    ConstructionOperations.produceMonth();

    expect(getMarkets()[0].goods[1].stock).toBe(100000);
  });

  it("caps effectiveCapacity toward base capacity as buildingStock is low", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    operation.buildingStock = 0;

    ConstructionOperations.constrainEffectiveCapacity();

    const burg = worldContext.pack.burgs[1];
    expect(burg.demographics.effectiveCapacity).toBeCloseTo(500, 5); // 1000 * 0.5
  });

  it("produces no operations once cleared", () => {
    setUpWorld();
    ConstructionOperations.generate();

    ConstructionOperations.clear();

    expect(getConstructionOperations()).toHaveLength(0);
  });
});
