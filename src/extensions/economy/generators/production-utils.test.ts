import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorldContext } from "../../hostCore";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoodCellColumn, setGoods } from "../economyContext";
import { clearForestDepletion, registerLogHarvest } from "./forestDepletion";
import { Goods } from "./goods-generator";
import { getCellProduction } from "./production-utils";

describe("getCellProduction depletion integration", () => {
  afterEach(() => {
    clearEconomyContext();
    clearForestDepletion();
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
        c: [[]]
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

    registerLogHarvest(0, 20); // amount=20 -> depletion delta 20*0.05=1.0, capped at MAX_DEPLETION=0.9
    const after = getCellProduction(0, biomeProduction);

    expect(after[0]).toBeCloseTo(before[0] * 0.1, 5);
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
        name: "Iron",
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
          demandCoverage: {}
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
    Goods.sync();
  };

  it("produces far more grain in autumn (harvest) than in summer at high latitude", () => {
    const biomeProduction = { 6: [{ goodId: 0, production: 1 }] };
    const y = 5.56; // latitude ~80N -> near-full seasonality strength

    setUpWithMonth(7, y); // July -> summer at this latitude
    const summerOutput = getCellProduction(0, biomeProduction)[0];

    setUpWithMonth(10, y); // October -> autumn at this latitude
    const autumnOutput = getCellProduction(0, biomeProduction)[0];

    expect(autumnOutput).toBeGreaterThan(summerOutput * 5);
  });

  it("produces nearly flat grain output year-round near the equator", () => {
    const biomeProduction = { 6: [{ goodId: 0, production: 1 }] };
    const y = 48.89; // latitude ~2N -> seasonality strength near 0

    setUpWithMonth(7, y); // July -> summer at this latitude
    const summerOutput = getCellProduction(0, biomeProduction)[0];

    setUpWithMonth(10, y); // October -> autumn at this latitude
    const autumnOutput = getCellProduction(0, biomeProduction)[0];

    expect(autumnOutput).toBeLessThan(summerOutput * 1.5);
  });
});
