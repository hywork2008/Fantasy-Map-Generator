import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoodCellColumn, setGoods } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { drawGoods } from "./draw-goods";

describe("drawGoods", () => {
  const fills: Array<{ color: string; opacity: number }> = [];
  let goodsNode: SVGGElement;
  const canvasContext = {
    globalAlpha: 1,
    fillStyle: "",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => fills.push({ color: canvasContext.fillStyle, opacity: canvasContext.globalAlpha }))
  };

  beforeEach(() => {
    fills.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D
    );

    goodsNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const goodsLayer = select(goodsNode);
    initEconomyContext({ worldContext, getSvgLayer: () => goodsLayer } as unknown as ExtensionAPI);

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
    worldContext.graphWidth = 10;
    worldContext.graphHeight = 10;
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
    vi.restoreAllMocks();
  });

  it("overlays a mapped mine-supplied cell and does not zoom-gate its resource icon", () => {
    drawGoods(new Set([2]));

    expect(fills).toContainEqual({ color: "#5D686E", opacity: 0.45 });
    expect(goodsNode.querySelector('#goodsIcons > g[data-i="2"]')?.getAttribute("data-min-scale")).toBe("0");
  });
});
