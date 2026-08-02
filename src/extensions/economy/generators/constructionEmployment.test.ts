import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getConstructionOperations,
  getMarkets,
  initEconomyContext,
  setConstructionOperations,
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
  getEffectiveConstructionBacklog,
  getHousingBacklog,
  getMasonShare,
  getRequiredDwellings,
  getTargetBuildingStock,
  normalizeConstructionOperation
} from "./constructionEmployment";
import type { ConstructionOperation, LegacyConstructionOperation } from "./constructionEmploymentTypes";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

function setUpWorld(options: { includeConcrete?: boolean; populationRate?: number } = {}): void {
  worldContext.populationRate = options.populationRate ?? 1000;
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
        group: "town",
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

describe("housing ledger formulas (K14/K16/K18)", () => {
  it("derives required dwellings from population × populationRate / 4.5", () => {
    // 5 points × 1000 people/point / 4.5 ≈ 1111.11 → ceil → 1112
    expect(getRequiredDwellings(5, 1000)).toBe(1112);
    expect(getRequiredDwellings(0, 1000)).toBe(1);
  });

  it("uses full housing backlog for gap and size-aware product for employment", () => {
    expect(getHousingBacklog(0, 100)).toBe(1);
    expect(getHousingBacklog(50, 100)).toBe(0.5);
    expect(getHousingBacklog(100, 100)).toBe(0);

    const sizeTarget = getTargetBuildingStock(400);
    expect(getEffectiveConstructionBacklog(0, 100, 400)).toBeCloseTo(sizeTarget, 5);
    expect(getEffectiveConstructionBacklog(100, 100, 400)).toBe(0);
  });
});

describe("normalizeConstructionOperation (K15)", () => {
  it("seeds dwellingStock from legacy buildingStock and write-through sat", () => {
    const legacy: LegacyConstructionOperation = {
      i: 1,
      burgId: 1,
      marketId: 1,
      masonWorkers: 0,
      carpenterWorkers: 0,
      buildingStock: 0.5,
      hasQuarryAccess: false,
      active: true
    };
    const required = getRequiredDwellings(5, 1000);
    const normalized = normalizeConstructionOperation(legacy, { population: 5 }, 1000);

    expect(normalized.dwellingStock).toBeCloseTo(0.5 * required, 4);
    expect(normalized.buildingStock).toBeCloseTo(0.5, 4);
  });

  it("clamps seed overshoot at 1.2 × required when sat would overshoot", () => {
    const legacy: LegacyConstructionOperation = {
      i: 1,
      burgId: 1,
      marketId: 1,
      masonWorkers: 0,
      carpenterWorkers: 0,
      buildingStock: 2, // invalid sat; clamp01 → 1, then seed may use 1.2 cap only if sat*required
      hasQuarryAccess: false,
      active: true
    };
    const required = getRequiredDwellings(5, 1000);
    const normalized = normalizeConstructionOperation(legacy, { population: 5 }, 1000);
    // buildingStock clamp01 → 1, seed = 1 * required, within 1.2×
    expect(normalized.dwellingStock).toBeLessThanOrEqual(required * 1.2);
    expect(normalized.buildingStock).toBeCloseTo(1, 4);
  });

  it("preserves existing dwellingStock and re-syncs buildingStock", () => {
    const required = getRequiredDwellings(5, 1000);
    const op: ConstructionOperation = {
      i: 1,
      burgId: 1,
      marketId: 1,
      masonWorkers: 0,
      carpenterWorkers: 0,
      buildingStock: 0.1, // stale
      dwellingStock: required * 0.8,
      hasQuarryAccess: false,
      active: true
    };
    const normalized = normalizeConstructionOperation(op, { population: 5 }, 1000);
    expect(normalized.dwellingStock).toBeCloseTo(required * 0.8, 4);
    expect(normalized.buildingStock).toBeCloseTo(0.8, 4);
  });
});

describe("getConstructionRequiredWorkers", () => {
  it("requires more workers the larger the housing backlog", () => {
    const noBacklog = getConstructionRequiredWorkers({ buildingStock: 1, hasQuarryAccess: true }, 400);
    const fullBacklog = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: true }, 400);

    expect(fullBacklog.mason + fullBacklog.carpenter).toBeGreaterThan(noBacklog.mason + noBacklog.carpenter);
  });

  it("matches Phase 2 empty-town worker band within ±20% for mid-size adults", () => {
    // Phase 2 empty: backlog = sizeTarget - 0 = sizeTarget → total = 1 + sizeTarget * adults * 0.05
    const adults = 400;
    const sizeTarget = getTargetBuildingStock(adults);
    const phase2EmptyTotal = 1 + sizeTarget * adults * 0.05;
    const housingEmpty = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: true }, adults);
    const total = housingEmpty.mason + housingEmpty.carpenter;
    // mason/carpenter split uses rn(..., 2) so allow 0.01 absolute drift on the sum.
    expect(total).toBeGreaterThanOrEqual(phase2EmptyTotal * 0.8);
    expect(total).toBeLessThanOrEqual(phase2EmptyTotal * 1.2);
    expect(total).toBeCloseTo(phase2EmptyTotal, 1);
  });

  it("puts all required workers into carpentry when there is no quarry access", () => {
    const required = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 400);
    expect(required.mason).toBe(0);
    expect(required.carpenter).toBeGreaterThan(0);
  });

  it("scales empty small vs mid vs large towns by sizeTarget product", () => {
    const small = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 40);
    const mid = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 400);
    const large = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 4000);
    expect(mid.carpenter).toBeGreaterThan(small.carpenter);
    expect(large.carpenter).toBeGreaterThan(mid.carpenter);
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

  it("creates one operation per market Burg with dwellingStock seeded at 0", () => {
    setUpWorld();

    ConstructionOperations.generate();

    const operations = getConstructionOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      burgId: 1,
      marketId: 1,
      buildingStock: 0,
      dwellingStock: 0,
      hasQuarryAccess: false
    });
  });

  it("skips forts even when they have a market (K8)", () => {
    setUpWorld();
    worldContext.pack.burgs[1].group = "fort";

    ConstructionOperations.generate();

    expect(getConstructionOperations()).toHaveLength(0);
  });

  it("preserves dwellingStock across generate()", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const required = getRequiredDwellings(5, 1000);
    const [op] = getConstructionOperations();
    op.dwellingStock = required * 0.4;
    op.buildingStock = 0.4;

    ConstructionOperations.generate();

    const [next] = getConstructionOperations();
    expect(next.dwellingStock).toBeCloseTo(required * 0.4, 4);
    expect(next.buildingStock).toBeCloseTo(0.4, 4);
  });

  it("seeds archive-shaped ops missing dwellingStock on produceMonth", () => {
    setUpWorld();
    const required = getRequiredDwellings(5, 1000);
    setConstructionOperations([
      {
        i: 1,
        burgId: 1,
        marketId: 1,
        masonWorkers: 0,
        carpenterWorkers: 100,
        buildingStock: 0.25,
        hasQuarryAccess: false,
        active: true
      } as unknown as ConstructionOperation
    ]);

    ConstructionOperations.produceMonth();

    const [op] = getConstructionOperations();
    // Seeded from 0.25 sat then grown; sat write-through holds.
    expect(op.dwellingStock).toBeGreaterThan(0.25 * required * 0.99);
    expect(op.buildingStock).toBeCloseTo(op.dwellingStock / required, 4);
    expect(op.buildingStock).toBeLessThanOrEqual(1);
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

  it("grows dwellingStock and write-through buildingStock when fully staffed with carpenters", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    operation.carpenterWorkers = 100; // far more than required, so the labor factor is 1
    const required = getRequiredDwellings(5, 1000);

    ConstructionOperations.produceMonth();

    const [after] = getConstructionOperations();
    expect(after.dwellingStock).toBeGreaterThan(0);
    // Full housing backlog, full progress → monthly Δsat ≈ 0.25/12
    expect(after.buildingStock).toBeCloseTo(0.25 / 12, 3);
    expect(after.buildingStock).toBeCloseTo(after.dwellingStock / required, 4);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(100000);
  });

  it("does not use sizeTarget in Δdwellings (full housing gap growth, K14)", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    // Force tiny adult sizeTarget path for employment, but full staff so progress=1
    worldContext.pack.burgs[1].demographics = {
      capacity: 1000,
      effectiveCapacity: 1000,
      maleAdults: 20,
      femaleAdults: 20,
      children: 0,
      elders: 0
    };
    operation.carpenterWorkers = 100;
    operation.masonWorkers = 0;

    ConstructionOperations.produceMonth();

    // sizeTarget(40)≈0.095; if growth used size-aware backlog, Δsat ≈ 0.095*0.25/12 ≈ 0.002
    // Full gap: 0.25/12 ≈ 0.0208
    const sat = getConstructionOperations()[0].buildingStock;
    expect(sat).toBeGreaterThan(0.01);
    expect(sat).toBeCloseTo(0.25 / 12, 3);
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
    operation.dwellingStock = 0;

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
