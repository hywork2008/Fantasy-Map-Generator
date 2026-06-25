import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { worldContext } from "../../../context/worldContext";
import type { PackedGraph } from "../../../types/PackedGraph";
import * as drawTrade from "../renderers/draw-trade-animation";
import { TradeAnimationModule } from "./trade-animation";

// ─── helpers ────────────────────────────────────────────────────────────────

function makePack(
  cellRoutes: Record<number, Record<number, number>> = {},
  routeData: Array<{ i: number; group: "roads" | "trails" | "searoutes" }> = []
) {
  return {
    cells: {
      h: [20, 20, 10, 10],
      burg: [0, 0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0]
      ] as [number, number][],
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

// ─── shared setup ───────────────────────────────────────────────────────────

let ta: TradeAnimationModule;
let layerIsOnMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
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

// ─── getPathCost ─────────────────────────────────────────────────────────────

describe("getPathCost", () => {
  it("returns 1 for a sea-route segment", () => {
    worldContext.pack = makePack({ 0: { 1: 7 } }, [{ i: 7, group: "searoutes" }]) as unknown as PackedGraph;
    expect(ta.getPathCost(0, 1)).toBe(1);
  });

  it("returns 5 for a roads segment", () => {
    worldContext.pack = makePack({ 0: { 1: 3 } }, [{ i: 3, group: "roads" }]) as unknown as PackedGraph;
    expect(ta.getPathCost(0, 1)).toBe(5);
  });

  it("returns 5 for a trails segment", () => {
    worldContext.pack = makePack({ 0: { 1: 4 } }, [{ i: 4, group: "trails" }]) as unknown as PackedGraph;
    expect(ta.getPathCost(0, 1)).toBe(5);
  });

  it("defaults to 5 (land) when the route is not found", () => {
    worldContext.pack = makePack({ 0: { 1: 99 } }, []) as unknown as PackedGraph;
    expect(ta.getPathCost(0, 1)).toBe(5);
  });
});

// ─── getDealBatches ───────────────────────────────────────────────────────────

describe("getDealBatches", () => {
  it("returns an empty array for no deals", () => {
    expect(ta.getDealBatches([])).toEqual([]);
  });

  it("groups multiple deals between the same burg pair into one batch", () => {
    const deals: Parameters<typeof ta.getDealBatches>[0] = [
      { i: 0, seller: 2, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 1, price: 1, tax: 0 },
      { i: 1, seller: 2, sellerType: "burg", buyer: 1, buyerType: "market", good: 1, units: 1, price: 1, tax: 0 }
    ];
    worldContext.pack.burgs = [
      null as unknown as PackedGraph["burgs"][0],
      { i: 1, cell: 0, x: 0, y: 0 } as unknown as PackedGraph["burgs"][0],
      { i: 2, cell: 1, x: 10, y: 0 } as unknown as PackedGraph["burgs"][0]
    ];
    const batches = ta.getDealBatches(deals);
    expect(batches).toHaveLength(1);
    expect(batches[0].deals).toHaveLength(2);
    expect(batches[0].startBurgId).toBe(2);
    expect(batches[0].endBurgId).toBe(1);
  });

  it("creates separate batches for swapped seller/buyer on the same pair", () => {
    worldContext.pack.burgs = [
      null as unknown as PackedGraph["burgs"][0],
      { i: 1, cell: 0, x: 0, y: 0 } as unknown as PackedGraph["burgs"][0],
      { i: 2, cell: 1, x: 10, y: 0 } as unknown as PackedGraph["burgs"][0]
    ];
    const deals: Parameters<typeof ta.getDealBatches>[0] = [
      { i: 0, seller: 2, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 1, price: 1, tax: 0 },
      { i: 1, seller: 1, sellerType: "market", buyer: 2, buyerType: "burg", good: 0, units: 1, price: 1, tax: 0 }
    ];
    expect(ta.getDealBatches(deals)).toHaveLength(2);
  });

  it("skips deals whose market cannot be resolved", () => {
    const deals: Parameters<typeof ta.getDealBatches>[0] = [
      { i: 0, seller: 2, sellerType: "burg", buyer: 99, buyerType: "market", good: 0, units: 1, price: 1, tax: 0 }
    ];
    expect(ta.getDealBatches(deals)).toHaveLength(0);
  });
});

// ─── getPath ─────────────────────────────────────────────────────────────────

describe("getPath", () => {
  it("returns null when a burg does not exist", () => {
    expect(ta.getPath({ id: "1-99", deals: [], startBurgId: 1, endBurgId: 99, type: "local" })).toBeNull();
  });

  it("returns null when no route exists between the two burgs", () => {
    expect(ta.getPath({ id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" })).toBeNull();
  });

  it("returns points and a land segment when a roads route connects the burgs", () => {
    worldContext.pack = makePack({ 0: { 1: 0 }, 1: { 0: 0 } }, [{ i: 0, group: "roads" }]) as unknown as PackedGraph;
    const result = ta.getPath({ id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" });
    expect(result).not.toBeNull();
    expect(result!.points).toHaveLength(2);
    expect(result!.segments).toHaveLength(1);
    expect(result!.segments[0].type).toBe("land");
  });

  it("routes through a land↔sea boundary at a non-port cell (sea routes run up navigable rivers)", () => {
    worldContext.pack = {
      cells: {
        h: [20, 20, 20, 20],
        burg: [0, 0, 0, 0],
        p: [
          [0, 0],
          [10, 0],
          [20, 0],
          [30, 0]
        ] as [number, number][],
        routes: { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0, 3: 1 }, 3: { 2: 1 } }
      },
      burgs: [null, { i: 1, cell: 0, x: 0, y: 0, port: 0 }, { i: 2, cell: 3, x: 30, y: 0, port: 0 }],
      routes: [
        { i: 0, group: "searoutes" },
        { i: 1, group: "roads" }
      ],
      deals: []
    } as unknown as PackedGraph;
    const result = ta.getPath({ id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" });
    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[0].type).toBe("water");
    expect(result!.segments[1].type).toBe("land");
  });

  it("routes through a land↔sea boundary when the crossing cell has a port burg", () => {
    worldContext.pack = {
      cells: {
        h: [20, 20, 20, 20],
        burg: [0, 0, 3, 0],
        p: [
          [0, 0],
          [10, 0],
          [20, 0],
          [30, 0]
        ] as [number, number][],
        routes: { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0, 3: 1 }, 3: { 2: 1 } }
      },
      burgs: [
        null,
        { i: 1, cell: 0, x: 0, y: 0, port: 0 },
        { i: 2, cell: 3, x: 30, y: 0, port: 0 },
        { i: 3, cell: 2, x: 20, y: 0, port: 1 }
      ],
      routes: [
        { i: 0, group: "searoutes" },
        { i: 1, group: "roads" }
      ],
      deals: []
    } as unknown as PackedGraph;
    const result = ta.getPath({ id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" });
    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[0].type).toBe("water");
    expect(result!.segments[1].type).toBe("land");
  });
});

// ─── trigger ─────────────────────────────────────────────────────────────────

describe("trigger", () => {
  it("does nothing when given an empty batch list", () => {
    ta.trigger([]);
    expect(drawTrade.draw).not.toHaveBeenCalled();
  });

  it("clears animations and returns when the layer is disabled", () => {
    layerIsOnMock.mockReturnValue(false);
    ta.trigger([{ id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" }]);
    expect(drawTrade.clear).toHaveBeenCalled();
    expect(drawTrade.draw).not.toHaveBeenCalled();
  });

  it("draws animation when the layer is active and a route path exists", () => {
    worldContext.pack = makePack({ 0: { 1: 0 }, 1: { 0: 0 } }, [{ i: 0, group: "roads" }]) as unknown as PackedGraph;
    const batch = { id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" as const };
    ta.trigger([batch]);
    expect(drawTrade.draw).toHaveBeenCalledWith(batch, expect.any(Array));
  });

  it("does not draw when no route path can be found", () => {
    ta.trigger([{ id: "1-2", deals: [], startBurgId: 1, endBurgId: 2, type: "local" }]);
    expect(drawTrade.draw).not.toHaveBeenCalled();
  });
});
