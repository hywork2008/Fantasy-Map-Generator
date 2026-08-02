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
import { getHousingRecipe, getMasonMaterialShare } from "./housingRecipes";
import { Markets } from "./markets-generator";

function setUpWorld(
  options: { includeConcrete?: boolean; includeBrick?: boolean; populationRate?: number; cultureType?: string } = {}
): void {
  worldContext.populationRate = options.populationRate ?? 1000;
  worldContext.pack = {
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
        type: options.cultureType ?? "Generic",
        culture: 1,
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
    cultures: [null, { i: 1, name: "Test", type: options.cultureType ?? "Generic" }],
    cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([10]), r: Uint16Array.from([0]), routes: {} }
  } as unknown as PackedGraph;

  const goods: Parameters<typeof setGoods>[0] = [
    { i: 1, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#979EA2" },
    { i: 2, name: "Wood", tags: ["construction", "fuel"], value: 1, unit: "pile", icon: "good-wood", color: "#966F33" }
  ];
  if (options.includeBrick) {
    goods.push({
      i: 4,
      name: "Brick",
      tags: ["construction"],
      value: 2,
      unit: "wain",
      icon: "good-clay",
      color: "#a65d3f",
      recipes: [{ Clay: 1, Wood: 0.1 }]
    });
    goods.push({
      i: 5,
      name: "Clay",
      tags: ["mineral", "construction"],
      value: 1,
      unit: "wain",
      icon: "good-clay",
      color: "#b07c60"
    });
  }
  if (options.includeConcrete) {
    goods.push({
      i: 3,
      name: "Roman Concrete",
      tags: ["construction"],
      value: 6,
      unit: "pallet",
      icon: "good-stone",
      color: "#8c8577"
    });
  }
  setGoods(goods);

  const marketGoods: Record<number, { stock: number; price: number }> = {
    1: { stock: 100000, price: 1 },
    2: { stock: 100000, price: 1 }
  };
  if (options.includeConcrete) marketGoods[3] = { stock: 100000, price: 6 };
  if (options.includeBrick) {
    marketGoods[4] = { stock: 100000, price: 2 };
    marketGoods[5] = { stock: 100000, price: 1 };
  }

  setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: marketGoods }]);
  setGoodCellColumn(new Uint16Array(1));
  setMarketCellColumn(Uint16Array.from([1]));
  setQuarryOperations([]);
  Goods.sync();
  Markets.sync();
}

describe("getTargetBuildingStock / getMasonShare (K17)", () => {
  afterEach(() => useOptionsState.setState({ culturesSet: "world" }));

  it("saturates toward 1 as adults grow, and is 0 with no population", () => {
    expect(getTargetBuildingStock(0)).toBe(0);
    expect(getTargetBuildingStock(400)).toBeCloseTo(1 - Math.exp(-1), 4);
    expect(getTargetBuildingStock(40000)).toBeGreaterThan(0.99);
  });

  it("is 0 without quarry when brick is unavailable", () => {
    expect(getMasonShare(false, { brickAvailable: false })).toBe(0);
    useOptionsState.setState({ culturesSet: "highFantasy" });
    expect(getMasonShare(false, { brickAvailable: false, highFantasy: true })).toBe(0);
  });

  it("allows masons without quarry when brick is available for River", () => {
    const share = getMasonShare(false, {
      cultureType: "River",
      brickAvailable: true,
      highFantasy: false
    });
    expect(share).toBeGreaterThan(0);
    expect(share).toBeCloseTo(
      getMasonMaterialShare(
        getHousingRecipe({
          cultureType: "River",
          hasQuarryAccess: false,
          highFantasy: false,
          brickAvailable: true
        })
      ),
      5
    );
  });

  it("uses Generic culture mason share with quarry (stone+brick)", () => {
    const share = getMasonShare(true, { cultureType: "Generic", brickAvailable: true, highFantasy: false });
    expect(share).toBeCloseTo(0.55, 5);
  });

  it("boosts stone on High Fantasy when quarry exists", () => {
    const base = getMasonShare(true, { cultureType: "Generic", brickAvailable: true, highFantasy: false });
    const hf = getMasonShare(true, { cultureType: "Generic", brickAvailable: true, highFantasy: true });
    expect(hf).toBeGreaterThan(base);
  });
});

describe("housing ledger formulas (K14/K16/K18)", () => {
  it("derives required dwellings from population × populationRate / 4.5", () => {
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
      buildingStock: 2,
      hasQuarryAccess: false,
      active: true
    };
    const required = getRequiredDwellings(5, 1000);
    const normalized = normalizeConstructionOperation(legacy, { population: 5 }, 1000);
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
      buildingStock: 0.1,
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
    const noBacklog = getConstructionRequiredWorkers({ buildingStock: 1, hasQuarryAccess: true }, 400, {
      cultureType: "Generic",
      brickAvailable: true
    });
    const fullBacklog = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: true }, 400, {
      cultureType: "Generic",
      brickAvailable: true
    });

    expect(fullBacklog.mason + fullBacklog.carpenter).toBeGreaterThan(noBacklog.mason + noBacklog.carpenter);
  });

  it("matches Phase 2 empty-town worker band within ±20% for mid-size adults", () => {
    const adults = 400;
    const sizeTarget = getTargetBuildingStock(adults);
    const phase2EmptyTotal = 1 + sizeTarget * adults * 0.05;
    const housingEmpty = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: true }, adults, {
      cultureType: "Generic",
      brickAvailable: true
    });
    const total = housingEmpty.mason + housingEmpty.carpenter;
    expect(total).toBeGreaterThanOrEqual(phase2EmptyTotal * 0.8);
    expect(total).toBeLessThanOrEqual(phase2EmptyTotal * 1.2);
    expect(total).toBeCloseTo(phase2EmptyTotal, 1);
  });

  it("puts all required workers into carpentry without quarry and without brick", () => {
    const required = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 400, {
      brickAvailable: false
    });
    expect(required.mason).toBe(0);
    expect(required.carpenter).toBeGreaterThan(0);
  });

  it("assigns masons without quarry when brick is available for River culture", () => {
    const required = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 400, {
      cultureType: "River",
      brickAvailable: true
    });
    expect(required.mason).toBeGreaterThan(0);
  });

  it("scales empty small vs mid vs large towns by sizeTarget product", () => {
    const ctx = { brickAvailable: false as const };
    const small = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 40, ctx);
    const mid = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 400, ctx);
    const large = getConstructionRequiredWorkers({ buildingStock: 0, hasQuarryAccess: false }, 4000, ctx);
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
    operation.carpenterWorkers = 100;
    const required = getRequiredDwellings(5, 1000);

    ConstructionOperations.produceMonth();

    const [after] = getConstructionOperations();
    expect(after.dwellingStock).toBeGreaterThan(0);
    expect(after.buildingStock).toBeCloseTo(0.25 / 12, 3);
    expect(after.buildingStock).toBeCloseTo(after.dwellingStock / required, 4);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(100000);
  });

  it("does not use sizeTarget in Δdwellings (full housing gap growth, K14)", () => {
    setUpWorld();
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
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

    const sat = getConstructionOperations()[0].buildingStock;
    expect(sat).toBeGreaterThan(0.01);
    expect(sat).toBeCloseTo(0.25 / 12, 3);
  });

  it("prefers Roman Concrete over Stone for the stone portion of mason need", () => {
    setUpWorld({ includeConcrete: true, includeBrick: true, cultureType: "Highland" });
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
    const [operation] = getConstructionOperations();
    operation.masonWorkers = 100;
    operation.carpenterWorkers = 100;
    operation.hasQuarryAccess = true;

    ConstructionOperations.produceMonth();

    // Concrete covers stone portion; brick is a separate channel.
    expect(getMarkets()[0].goods[3].stock).toBeLessThan(100000);
    expect(getMarkets()[0].goods[1].stock).toBe(100000);
  });

  it("consumes Brick (not Stone) for River culture without quarry", () => {
    setUpWorld({ includeBrick: true, cultureType: "River" });
    ConstructionOperations.generate();
    const [operation] = getConstructionOperations();
    operation.masonWorkers = 100;
    operation.carpenterWorkers = 100;
    operation.hasQuarryAccess = false;

    ConstructionOperations.produceMonth();

    expect(getMarkets()[0].goods[1].stock).toBe(100000); // Stone untouched
    expect(getMarkets()[0].goods[4].stock).toBeLessThan(100000); // Brick consumed
    expect(getConstructionOperations()[0].buildingStock).toBeGreaterThan(0);
  });

  it("does not consume Stone for a Generic Burg with no quarry and no brick good", () => {
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
    expect(burg.demographics.effectiveCapacity).toBeCloseTo(500, 5);
  });

  it("produces no operations once cleared", () => {
    setUpWorld();
    ConstructionOperations.generate();

    ConstructionOperations.clear();

    expect(getConstructionOperations()).toHaveLength(0);
  });
});

describe("Brick good catalogue (K6)", () => {
  beforeEach(() => initEconomyContext({ worldContext } as unknown as ExtensionAPI));
  afterEach(() => clearEconomyContext());

  it("is defined in GOODS_DATA with Clay+Wood recipe and construction demand", async () => {
    const { GOODS_DATA } = await import("./goods-generator");
    const brick = GOODS_DATA.find(good => good.name === "Brick");
    expect(brick).toBeDefined();
    expect(brick?.tags).toContain("construction");
    expect(brick?.demandCoverage).toEqual({ construction: 1 });
    expect(brick?.recipes).toEqual([{ Clay: 1, Wood: 0.1 }]);
    expect(brick?.warEconomyType).toBe("strategic");
  });
});
