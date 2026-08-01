import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import { buildSeaRouteGraph, findReachableCells, findSeaRouteDistance, findSeaRoutePath } from "./seaRouteGraph";

// Ports A(0) -- B(10) -- C(30) along a single sea route, plus an unrelated land route that
// must be ignored, and an isolated port D(4) with no route at all.
function makePack(): PackedGraph {
  return {
    routes: [
      {
        i: 0,
        group: "searoutes",
        feature: 1,
        points: [
          [0, 0, 0], // port A, cell 0
          [10, 0, 1], // water cell 1
          [20, 0, 2] // port B, cell 2
        ]
      },
      {
        i: 1,
        group: "searoutes",
        feature: 1,
        points: [
          [20, 0, 2], // port B, cell 2
          [50, 0, 3] // port C, cell 3
        ]
      },
      {
        i: 2,
        group: "roads",
        feature: 1,
        points: [
          [0, 0, 0],
          [0, 100, 4] // isolated port D, cell 4 — only reachable by a land road, not a sea route
        ]
      }
    ]
  } as unknown as PackedGraph;
}

describe("buildSeaRouteGraph", () => {
  it("connects consecutive cells of a searoutes route in both directions with their real distance", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(graph.adjacency.get(0)?.get(1)).toBe(10);
    expect(graph.adjacency.get(1)?.get(0)).toBe(10);
    expect(graph.adjacency.get(1)?.get(2)).toBe(10);
  });

  it("ignores non-searoutes routes (roads/trails)", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(graph.adjacency.has(4)).toBe(false);
    expect(graph.adjacency.get(0)?.has(4)).toBe(false);
  });

  it("ignores visual-only downstream river routes", () => {
    const pack = makePack();
    pack.routes.push({
      i: 3,
      group: "searoutes",
      navigation: "river",
      feature: 1,
      points: [
        [0, 0, 8],
        [10, 0, 9]
      ]
    });

    const graph = buildSeaRouteGraph(pack);

    expect(graph.adjacency.has(8)).toBe(false);
    expect(graph.adjacency.has(9)).toBe(false);
  });
});

describe("findSeaRouteDistance", () => {
  it("returns 0 for the same cell", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findSeaRouteDistance(graph, 0, 0)).toBe(0);
  });

  it("sums edge distances across multiple hops on the same route", () => {
    const graph = buildSeaRouteGraph(makePack());
    // A(0) -> water(1) -> B(2): 10 + 10 = 20
    expect(findSeaRouteDistance(graph, 0, 2)).toBe(20);
  });

  it("finds a path that spans two merged route segments (B -> C)", () => {
    const graph = buildSeaRouteGraph(makePack());
    // A(0) -> ... -> B(2) -> C(3): 20 + 30 = 50
    expect(findSeaRouteDistance(graph, 0, 3)).toBe(50);
  });

  it("returns null when no charted sea route connects the two cells", () => {
    const graph = buildSeaRouteGraph(makePack());
    // Port D(4) is only linked by a land road in the fixture, never by a searoute.
    expect(findSeaRouteDistance(graph, 0, 4)).toBeNull();
  });

  it("returns null when either cell has no charted route at all", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findSeaRouteDistance(graph, 0, 999)).toBeNull();
  });
});

describe("findReachableCells", () => {
  it("returns distances to every cell reachable from the start, and nothing else", () => {
    const graph = buildSeaRouteGraph(makePack());
    const reachable = findReachableCells(graph, 0);

    expect(reachable.get(0)).toBe(0);
    expect(reachable.get(1)).toBe(10);
    expect(reachable.get(2)).toBe(20);
    expect(reachable.get(3)).toBe(50);
    expect(reachable.has(4)).toBe(false); // only linked by a land road, not a searoute
  });

  it("returns an empty map when the start cell has no charted route at all", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findReachableCells(graph, 999).size).toBe(0);
  });
});

describe("findSeaRoutePath", () => {
  it("returns the ordered cell sequence spanning multiple merged route segments", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findSeaRoutePath(graph, 0, 3)).toEqual([0, 1, 2, 3]);
  });

  it("returns a single-element path for the same cell when it's part of the network", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findSeaRoutePath(graph, 0, 0)).toEqual([0]);
  });

  it("returns null for the same cell when it isn't part of any charted route", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findSeaRoutePath(graph, 999, 999)).toBeNull();
  });

  it("returns null when no charted sea route connects the two cells", () => {
    const graph = buildSeaRouteGraph(makePack());
    expect(findSeaRoutePath(graph, 0, 4)).toBeNull();
  });
});

describe("buildSeaRouteGraph edge weights", () => {
  it("keeps the shorter distance when two routes both connect the same pair of cells", () => {
    const pack = {
      routes: [
        {
          i: 0,
          group: "searoutes",
          feature: 1,
          points: [
            [0, 0, 10],
            [100, 0, 11]
          ]
        }, // dist 100
        {
          i: 1,
          group: "searoutes",
          feature: 1,
          points: [
            [0, 0, 10],
            [30, 40, 11]
          ]
        } // dist 50, shorter
      ]
    } as unknown as PackedGraph;

    const graph = buildSeaRouteGraph(pack);
    expect(graph.adjacency.get(10)?.get(11)).toBe(50);
    expect(graph.adjacency.get(11)?.get(10)).toBe(50);
  });
});
