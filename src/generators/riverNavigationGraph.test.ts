import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import {
  buildRiverNavigationGraph,
  DEFAULT_SHELTERED_WATER_MINIMUM_ENCLOSURE,
  findDownstreamRiverPath
} from "./riverNavigationGraph";

function makePack(overrides: Partial<PackedGraph> = {}): PackedGraph {
  return {
    cells: {
      h: [25, 25, 25, 10],
      r: [1, 1, 1, 0],
      fl: [100, 100, 100, 0],
      enclosure: [0, 0, 0, DEFAULT_SHELTERED_WATER_MINIMUM_ENCLOSURE],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0]
      ]
    },
    rivers: [{ i: 1, cells: [0, 1, 2, 3] }],
    ...overrides
  } as unknown as PackedGraph;
}

describe("buildRiverNavigationGraph", () => {
  it("creates source-to-mouth edges only", () => {
    const graph = buildRiverNavigationGraph(makePack());

    expect(graph.getOutgoing(0)).toMatchObject([{ toCellId: 1, kind: "downstream", distanceMapUnits: 10 }]);
    expect(graph.getOutgoing(1)).toMatchObject([{ toCellId: 2, kind: "downstream", distanceMapUnits: 10 }]);
    expect(graph.getOutgoing(2)).toMatchObject([{ toCellId: 3, kind: "shelteredWater", distanceMapUnits: 10 }]);
    expect(graph.getOutgoing(3)).toEqual([]);
    expect(graph.isDownstreamEdge(2, 1)).toBe(false);
  });

  it("does not cross a river cell below the navigable flux threshold", () => {
    const pack = makePack();
    pack.cells.fl[1] = 99;

    const graph = buildRiverNavigationGraph(pack);

    expect(graph.getOutgoing(0)).toEqual([]);
    expect(graph.getOutgoing(1)).toEqual([]);
  });

  it("permits a river mouth water hop only inside the protected-water threshold", () => {
    const pack = makePack();
    pack.cells.enclosure[3] = DEFAULT_SHELTERED_WATER_MINIMUM_ENCLOSURE - 1;

    const graph = buildRiverNavigationGraph(pack);

    expect(graph.getOutgoing(2)).toEqual([]);
  });

  it("does not create an off-map mouth edge", () => {
    const pack = makePack({ rivers: [{ i: 1, cells: [0, 1, -1] }] as PackedGraph["rivers"] });

    const graph = buildRiverNavigationGraph(pack);

    expect(graph.getOutgoing(1)).toEqual([]);
  });

  it("finds a downstream path but never reverses it", () => {
    const graph = buildRiverNavigationGraph(makePack());

    expect(findDownstreamRiverPath(graph, 0, 2)).toMatchObject({
      cellIds: [0, 1, 2],
      distanceMapUnits: 20
    });
    expect(findDownstreamRiverPath(graph, 2, 0)).toBeNull();
  });

  it("chooses the shortest directed branch at a confluence", () => {
    const pack = makePack({
      cells: {
        h: [25, 25, 25, 25],
        r: [1, 1, 1, 2],
        fl: [100, 100, 100, 100],
        enclosure: [0, 0, 0, 0],
        p: [
          [0, 0],
          [30, 0],
          [10, 0],
          [20, 0]
        ]
      },
      rivers: [
        { i: 1, cells: [0, 1, 3] },
        { i: 2, cells: [0, 2, 3] }
      ]
    } as unknown as PackedGraph);
    const graph = buildRiverNavigationGraph(pack);

    expect(findDownstreamRiverPath(graph, 0, 3)?.cellIds).toEqual([0, 2, 3]);
  });
});
