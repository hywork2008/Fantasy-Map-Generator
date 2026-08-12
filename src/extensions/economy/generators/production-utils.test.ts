import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STAPLE_CROP_PROFILES } from "../../../data/stapleCrops";
import type { WorldContext } from "../../hostCore";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateFaunaStockTable,
  initEconomyContext,
  setCultivableArea,
  setCultivatedArea,
  setFarmLaborRequired,
  setFoodPotential,
  setGoodCellColumn,
  setGoods,
  setHuntingWorkers
} from "../economyContext";
import { registerLogHarvest } from "./forestStock";
import { Goods } from "./goods-generator";
import { getCellProduction } from "./production-utils";
import { GAME_YIELD_PER_HUNTER_PER_MONTH } from "./ruralOccupationAllocation";

describe("getCellProduction forest-stock integration", () => {
  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    const goods = [
      {
        i: 0,
        name: "Wood",
        value: 1,
        tags: [],
        unit: "pile",
        icon: "icon",
        color: "#fff",
        distribution: "1",
        recipes: [],
        demandCoverage: {}
      },
      {
        i: 1,
        name: "Stone",
        value: 1,
        tags: [],
        unit: "pile",
        icon: "icon",
        color: "#fff",
        distribution: "1",
        recipes: [],
        demandCoverage: {}
      }
    ];
    worldContext.pack = {
      goods,
      cultures: [],
      burgs: [],
      zones: [],
      cells: {
        biomeCode: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        pop: [10],
        h: new Uint8Array([50]),
        c: [[]],
        forestCover: new Float32Array([1]),
        forestStock: new Float32Array([1])
      }
    } as unknown as PackedGraph;
    // Economy-owned fields live on the simulation slice when simulationContext is live.
    setGoods(goods as never);
    setGoodCellColumn(new Uint16Array([0]));
    Goods.sync();
  });

  it("reduces only Wood output for a logged cell, leaving other goods untouched", () => {
    const biomeProduction = {
      6: [
        { goodId: 0, production: 1 },
        { goodId: 1, production: 1 }
      ]
    };

    const before = getCellProduction(0, biomeProduction);
    expect(before[0]).toBeGreaterThan(0);
    expect(before[1]).toBeGreaterThan(0);

    registerLogHarvest(0, 2500); // 2,500 Wood units remove half of standing forest coverage
    const after = getCellProduction(0, biomeProduction);

    expect(after[0]).toBeCloseTo(before[0] * 0.5, 5);
    expect(after[1]).toBe(before[1]);
  });

  it("does nothing when no logging was registered", () => {
    const biomeProduction = { 6: [{ goodId: 0, production: 1 }] };
    const before = getCellProduction(0, biomeProduction);
    const after = getCellProduction(0, biomeProduction);
    expect(after[0]).toBe(before[0]);
  });

  it("does not turn a mapped mineral Good into population-proportional supply", () => {
    setGoods([
      {
        i: 2,
        name: "Iron Ore",
        value: 4,
        tags: ["ore"],
        unit: "wagon",
        icon: "iron",
        color: "#777",
        distribution: "true"
      }
    ]);
    setGoodCellColumn(new Uint16Array([2]));
    Goods.sync();

    expect(getCellProduction(0, {})[2]).toBeUndefined();
  });
});

describe("getCellProduction seasonal food output", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  // y (of graphHeight=100) -> latitude = 90 - (y/100)*180, since mapCoordinates = { latN: 90, latT: 180 }.
  const setUpWithMonth = (month: number, y = 40) => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.mapCoordinates = { latN: 90, latT: 180 };
    worldContext.graphHeight = 100;
    worldContext.options = { month } as unknown as WorldContext["options"];
    worldContext.pack = {
      goods: [
        {
          i: 0,
          name: "Grain",
          value: 1,
          tags: ["food"],
          unit: "bushel",
          icon: "icon",
          color: "#fff",
          distribution: "1",
          recipes: [],
          demandCoverage: {},
          crop: STAPLE_CROP_PROFILES.Wheat
        }
      ],
      cultures: [],
      burgs: [],
      zones: [],
      cells: {
        biomeCode: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        pop: [10],
        h: new Uint8Array([50]),
        c: [[]],
        p: [[0, y]]
      }
    } as unknown as PackedGraph;
    worldContext.grid = { cells: { temp: new Int8Array([12]), prec: new Uint8Array([45]) } } as WorldContext["grid"];
    Goods.sync();
  };

  it("uses the crop calendar's single harvest rather than a generic autumn curve", () => {
    const biomeProduction = { 6: [{ goodId: 0, production: 1 }] };
    const y = 5.56; // latitude ~80N -> near-full seasonality strength

    setUpWithMonth(7, y);
    const preHarvestOutput = getCellProduction(0, biomeProduction)[0];

    setUpWithMonth(8, y);
    const harvestOutput = getCellProduction(0, biomeProduction)[0];

    expect(harvestOutput).toBeGreaterThan(preHarvestOutput * 5);
  });

  it("does not make a seasonal cereal continuous merely because it is near the equator", () => {
    const biomeProduction = { 6: [{ goodId: 0, production: 1 }] };
    const y = 48.89; // latitude ~2N -> seasonality strength near 0

    setUpWithMonth(7, y);
    const preHarvestOutput = getCellProduction(0, biomeProduction)[0];

    setUpWithMonth(8, y);
    const harvestOutput = getCellProduction(0, biomeProduction)[0];

    expect(harvestOutput).toBeGreaterThan(preHarvestOutput * 5);
  });
});

describe("getCellProduction staple-food land-use output", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  it("renders Grain only from active cultivated land, not its forest biome rate", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const grain = {
      i: 0,
      name: "Grain",
      value: 1,
      tags: ["food", "stapleFood"],
      unit: "bushel",
      icon: "icon",
      color: "#fff",
      distribution: "1",
      recipes: [],
      demandCoverage: {}
    };
    worldContext.pack = {
      goods: [grain],
      cultures: [],
      burgs: [],
      zones: [],
      cells: {
        i: new Uint16Array([0]),
        biomeCode: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        pop: new Float32Array([10]),
        maleAdults: new Float32Array([1]),
        femaleAdults: new Float32Array([1]),
        h: new Uint8Array([50]),
        c: [[]]
      }
    } as unknown as PackedGraph;
    setGoods([grain] as never);
    Goods.sync();
    setCultivableArea(new Float32Array([20]));
    setCultivatedArea(new Float32Array([10]));
    setFarmLaborRequired(new Float32Array([2]));
    setFoodPotential(new Float32Array([100]));

    const cultivatedOutput = getCellProduction(0, { 6: [{ goodId: grain.i, production: 99 }] })[grain.i];
    expect(cultivatedOutput).toBe(50);

    setCultivatedArea(new Float32Array([0]));
    expect(getCellProduction(0, { 6: [{ goodId: grain.i, production: 99 }] })[grain.i]).toBeUndefined();
  });

  it("keeps Grain visible for a cultivated inhabited cell when adult columns lag behind", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const grain = {
      i: 0,
      name: "Grain",
      value: 1,
      tags: ["food", "stapleFood"],
      unit: "bushel",
      icon: "icon",
      color: "#fff",
      distribution: "1",
      recipes: [],
      demandCoverage: {}
    };
    worldContext.pack = {
      goods: [grain],
      cultures: [],
      burgs: [],
      zones: [],
      cells: {
        i: new Uint16Array([0]),
        biomeCode: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        pop: new Float32Array([10]),
        maleAdults: new Float32Array([0]),
        femaleAdults: new Float32Array([0]),
        h: new Uint8Array([50]),
        c: [[]]
      }
    } as unknown as PackedGraph;
    setGoods([grain] as never);
    Goods.sync();
    setCultivableArea(new Float32Array([20]));
    setCultivatedArea(new Float32Array([10]));
    setFarmLaborRequired(new Float32Array([2]));
    setFoodPotential(new Float32Array([100]));

    expect(getCellProduction(0, {})[grain.i]).toBe(50);
  });
});

describe("getCellProduction preview option", () => {
  // Regression coverage for the 2026-08-07 bug: every non-production caller (map redraw,
  // CellInfo/tooltip hover, the Goods editor's report table) invoked getCellProduction() without
  // realizing it culls Game's wild fauna stock as a side effect on every call — repeated hovering
  // over the same cell silently drained it. Callers must now pass `{ preview: true }`.
  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    const gameGood = {
      i: 0,
      name: "Game",
      value: 1,
      tags: ["food"],
      unit: "carcass",
      icon: "icon",
      color: "#fff",
      distribution: "1",
      recipes: [],
      demandCoverage: {}
    };
    worldContext.options = { ruralEcosystemDetail: "detailed" } as unknown as WorldContext["options"];
    worldContext.distanceScale = 1;
    worldContext.biomesData = { tags: [[], ["forest"]], habitability: [100, 100] } as never;
    worldContext.pack = {
      goods: [gameGood],
      cultures: [],
      burgs: [],
      states: [],
      zones: [],
      cells: {
        i: new Uint16Array([0]),
        biomeCode: new Uint8Array([1]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        pop: [50],
        h: new Uint8Array([30]),
        area: new Float32Array([100]), // physicalHectares = 100 * 1^2 * 100 = 10,000 ha
        c: [[]],
        p: [[0, 50]] // latitude ~0 (equator) -> seasonal multiplier stays near 1, out of this test's way
      }
    } as unknown as PackedGraph;
    worldContext.mapCoordinates = { latN: 90, latT: 180 };
    worldContext.graphHeight = 100;
    setCultivatedArea(new Float32Array([0]));
    setGoods([gameGood] as never);
    setGoodCellColumn(new Uint16Array([0]));
    setHuntingWorkers(new Float32Array([3])); // desired = 3 * GAME_YIELD_PER_HUNTER_PER_MONTH
    Goods.sync();

    // Pin a stock smaller than one call's desired demand, so a real (non-preview) draw visibly
    // exhausts it on the very next call — independent of the wild carrying-capacity formula.
    const desired = 3 * GAME_YIELD_PER_HUNTER_PER_MONTH;
    const half = (desired * 0.5) / 3;
    getOrCreateFaunaStockTable()!["0:Game"] = { young: half, breeding: half, old: half };
  });

  it("preview: true never shrinks the fauna stock across repeat calls", () => {
    const biomeProduction = { 1: [{ goodId: 0, production: 1 }] };
    const stockBefore = { ...getOrCreateFaunaStockTable()!["0:Game"] };

    const first = getCellProduction(0, biomeProduction, { preview: true })[0];
    const second = getCellProduction(0, biomeProduction, { preview: true })[0];
    const third = getCellProduction(0, biomeProduction, { preview: true })[0];

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(getOrCreateFaunaStockTable()!["0:Game"]).toEqual(stockBefore);
  });

  it("omitting preview (the real production path) draws the stock down across repeat calls", () => {
    const biomeProduction = { 1: [{ goodId: 0, production: 1 }] };

    const first = getCellProduction(0, biomeProduction)[0];
    const second = getCellProduction(0, biomeProduction)[0] ?? 0; // stock may be fully exhausted (0 -> omitted key)

    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });
});
