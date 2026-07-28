import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { buildGoodsCellPolygons, buildMineralDepositSymbols } from "./economyWebglLayers";

describe("buildGoodsCellPolygons", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const iron = {
      i: 2,
      name: "Iron Ore",
      value: 4,
      tags: ["ore"],
      unit: "wagon",
      icon: "good-iron",
      color: "#5D686E",
      distribution: "true"
    };
    worldContext.options = { month: 1 } as typeof worldContext.options;
    worldContext.pack = {
      goods: [iron],
      burgs: [],
      zones: [],
      cells: {
        i: [0],
        biomeCode: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([2]),
        pop: [10],
        h: new Uint8Array([50]),
        c: [[]],
        v: [[0, 1, 2]],
        p: [[5, 5]]
      },
      vertices: {
        p: [
          [0, 0],
          [10, 0],
          [0, 10]
        ]
      }
    } as unknown as PackedGraph;
    setGoods([iron] as never);
    setGoodCellColumn(new Uint16Array([2]));
    Goods.sync();
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("renders a mapped mine-supplied good as a display-only cell polygon", () => {
    const polygons = buildGoodsCellPolygons(new Set([2]));

    expect(polygons).toEqual([
      expect.objectContaining({
        id: "economy-goods-cell-0-2",
        cellId: 0,
        fillColor: [93, 104, 110, 115],
        polygon: [
          [0, 0],
          [10, 0],
          [0, 10]
        ]
      })
    ]);
  });
});

describe("buildMineralDepositSymbols", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      cells: { p: [[5, 5]] }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Lead Ore", tags: ["ore"], value: 3, unit: "wagon", icon: "good-lead", color: "#6f7285" }
    ] as never);
  });

  afterEach(() => clearEconomyContext());

  it("omits undiscovered deposits and fades exhausted ones as WebGL scatter alpha", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "mvt",
        primaryCommodity: "lead",
        commodities: ["lead"],
        yields: [],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: true
      },
      {
        i: 2,
        districtId: 2,
        cell: 0,
        type: "mvt",
        primaryCommodity: "lead",
        commodities: ["lead"],
        yields: [],
        richness: 2,
        depth: "surface",
        accessibility: 0.1,
        discovered: false,
        exhausted: false
      }
    ] as never);
    setMineOperations([]);

    const symbols = buildMineralDepositSymbols();

    expect(symbols).toEqual([
      expect.objectContaining({
        id: "economy-mineral-deposit-1",
        cellId: 0,
        position: [5, 5],
        fillColor: [111, 114, 133, 89]
      })
    ]);
  });
});
