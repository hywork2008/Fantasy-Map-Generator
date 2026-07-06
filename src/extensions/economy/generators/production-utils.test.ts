import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { clearForestDepletion, registerLogHarvest } from "./forestDepletion";
import { Goods } from "./goods-generator";
import { getCellProduction } from "./production-utils";

describe("getCellProduction depletion integration", () => {
  afterEach(() => {
    clearEconomyContext();
    clearForestDepletion();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      goods: [
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
      ],
      cultures: [],
      burgs: [],
      zones: [],
      cells: {
        biome: new Uint8Array([6]),
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
});
