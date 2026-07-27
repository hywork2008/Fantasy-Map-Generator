import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoodCellColumn, setGoods } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { buildGoodsCellPolygons } from "./economyWebglLayers";

describe("buildGoodsCellPolygons", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const iron = {
      i: 2,
      name: "Iron",
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
