import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";

vi.mock("../renderers/draw-trade-animation", () => ({
  draw: vi.fn(),
  clear: vi.fn(),
  highlight: vi.fn(),
  clearHighlight: vi.fn()
}));

vi.mock("./markets-generator", () => ({
  Markets: {
    get: vi.fn((id: number) => {
      if (id === 1) return { centerBurgId: 1 };
      if (id === 2) return { centerBurgId: 2 };
      return undefined;
    })
  }
}));

import { clearEconomyContext, initEconomyContext } from "../economyContext";
import * as drawTrade from "../renderers/draw-trade-animation";
import { TradeAnimationModule } from "./trade-animation";

function makePack(
  cellRoutes: Record<number, Record<number, number>> = {},
  routeData: Array<{ i: number; group: "roads" | "trails" | "searoutes" }> = [],
  points: [number, number][] = [
    [0, 0],
    [10, 0],
    [20, 0],
    [30, 0]
  ]
) {
  return {
    cells: {
      h: [20, 20, 10, 10],
      burg: [0, 0, 0, 0],
      p: points,
      routes: cellRoutes
    },
    burgs: [
      null,
      { i: 1, name: "Alpha", cell: 0, x: 0, y: 0, port: 0 },
      { i: 2, name: "Beta", cell: 1, x: 10, y: 0, port: 0 }
    ],
    routes: routeData,
    deals: []
  };
}

let ta: TradeAnimationModule;
let layerIsOnMock: Mock<() => boolean>;

afterEach(() => {
  clearEconomyContext();
});

beforeEach(() => {
  initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  vi.clearAllMocks();
  ta = new TradeAnimationModule();
  layerIsOnMock = vi.fn(() => true);
  ta.bind({
    draw: drawTrade.draw as Parameters<typeof ta.bind>[0]["draw"],
    clear: drawTrade.clear as Parameters<typeof ta.bind>[0]["clear"],
    isLayerOn: layerIsOnMock
  });
  worldContext.pack = makePack() as unknown as PackedGraph;
});

describe("findRoutePath", () => {
  it("returns null when a burg does not exist", () => {
    expect(ta.findRoutePath(1, 99)).toBeNull();
  });

  it("returns null when no route exists between the two cells", () => {
    expect(ta.findRoutePath(0, 3)).toBeNull();
  });

  it("returns points and a land segment when a roads route connects the burgs", () => {
    worldContext.pack = makePack({ 0: { 1: 0 }, 1: { 0: 0 } }, [{ i: 0, group: "roads" }]) as unknown as PackedGraph;
    const result = ta.findRoutePath(0, 1);
    expect(result).not.toBeNull();
    expect(result!.points).toHaveLength(2);
    expect(result!.segments).toHaveLength(1);
    expect(result!.segments[0].type).toBe("land");
  });

  it("prefers an all-water route before considering a shorter mixed route", () => {
    worldContext.pack = makePack(
      {
        0: { 1: 0, 2: 2 },
        1: { 0: 0, 3: 1 },
        2: { 0: 2, 3: 3 },
        3: { 1: 1, 2: 3 }
      },
      [
        { i: 0, group: "roads" },
        { i: 1, group: "roads" },
        { i: 2, group: "searoutes" },
        { i: 3, group: "searoutes" }
      ],
      [
        [0, 0],
        [15, 0],
        [0, 20],
        [30, 0]
      ]
    ) as unknown as PackedGraph;

    const result = ta.findRoutePath(0, 3);

    expect(result?.segments.map(segment => segment.type)).toEqual(["water"]);
    expect(result?.points).toEqual([
      [0, 0],
      [0, 20],
      [30, 0]
    ]);
  });

  it("falls back to the fastest mixed route using travel days and port transfer time", () => {
    worldContext.pack = makePack(
      {
        0: { 1: 0, 2: 2 },
        1: { 0: 0, 3: 1 },
        2: { 0: 2, 3: 3 },
        3: { 1: 1, 2: 3 }
      },
      [
        { i: 0, group: "roads" },
        { i: 1, group: "roads" },
        { i: 2, group: "roads" },
        { i: 3, group: "searoutes" }
      ],
      [
        [0, 0],
        [100, 0],
        [10, 0],
        [200, 0]
      ]
    ) as unknown as PackedGraph;

    const result = ta.findRoutePath(0, 3);

    // 10km by land + 190km by sea + a two-day port transfer beats 200km by land.
    expect(result?.segments.map(segment => segment.type)).toEqual(["land", "water"]);
    expect(result?.points).toEqual([
      [0, 0],
      [10, 0],
      [200, 0]
    ]);
  });
});
