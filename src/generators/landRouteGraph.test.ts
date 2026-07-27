import { describe, expect, it } from "vitest";
import { DEFAULT_INFANTRY_GRADE_SENSITIVITY, landEdgeEffortCost } from "../services/routeGrade";
import type { PackedGraph } from "../types/PackedGraph";
import {
  buildLandRouteGraph,
  findLandRouteDistance,
  findLandRoutePath,
  findReachableLandCells,
  WINTER_ROAD_CLOSURE_ELEVATION
} from "./landRouteGraph";

// Towns A(0) -- B(10) -- C(30) along a road, then a trail continuing to D(40), plus an
// unrelated sea route that must be ignored, and an isolated town E(5) with no route at all.
function makePack(): PackedGraph {
  return {
    routes: [
      {
        i: 0,
        group: "roads",
        feature: 1,
        points: [
          [0, 0, 0], // town A, cell 0
          [10, 0, 1], // waypoint cell 1
          [20, 0, 2] // town B, cell 2
        ]
      },
      {
        i: 1,
        group: "trails",
        feature: 1,
        points: [
          [20, 0, 2], // town B, cell 2
          [50, 0, 3] // town C, cell 3
        ]
      },
      {
        i: 2,
        group: "searoutes",
        feature: 1,
        points: [
          [0, 0, 0],
          [0, 100, 4] // isolated town D, cell 4 — only reachable by a sea route, not a road/trail
        ]
      }
    ]
  } as unknown as PackedGraph;
}

describe("buildLandRouteGraph", () => {
  it("connects consecutive cells of a roads route in both directions with their real distance", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(graph.adjacency.get(0)?.get(1)).toBe(10);
    expect(graph.adjacency.get(1)?.get(0)).toBe(10);
    expect(graph.adjacency.get(1)?.get(2)).toBe(10);
  });

  it("also connects consecutive cells of a trails route", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(graph.adjacency.get(2)?.get(3)).toBe(30);
    expect(graph.adjacency.get(3)?.get(2)).toBe(30);
  });

  it("ignores non-road/trail routes (searoutes)", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(graph.adjacency.has(4)).toBe(false);
    expect(graph.adjacency.get(0)?.has(4)).toBe(false);
  });
});

describe("findLandRouteDistance", () => {
  it("returns 0 for the same cell", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findLandRouteDistance(graph, 0, 0)).toBe(0);
  });

  it("sums edge distances across multiple hops on the same route", () => {
    const graph = buildLandRouteGraph(makePack());
    // A(0) -> waypoint(1) -> B(2): 10 + 10 = 20
    expect(findLandRouteDistance(graph, 0, 2)).toBe(20);
  });

  it("finds a path that spans two merged route segments (B -> C, road then trail)", () => {
    const graph = buildLandRouteGraph(makePack());
    // A(0) -> ... -> B(2) -> C(3): 20 + 30 = 50
    expect(findLandRouteDistance(graph, 0, 3)).toBe(50);
  });

  it("returns null when no charted road/trail connects the two cells", () => {
    const graph = buildLandRouteGraph(makePack());
    // Town D(4) is only linked by a sea route in the fixture, never by a road/trail.
    expect(findLandRouteDistance(graph, 0, 4)).toBeNull();
  });

  it("returns null when either cell has no charted route at all", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findLandRouteDistance(graph, 0, 999)).toBeNull();
  });
});

describe("findReachableLandCells", () => {
  it("returns distances to every cell reachable from the start, and nothing else", () => {
    const graph = buildLandRouteGraph(makePack());
    const reachable = findReachableLandCells(graph, 0);

    expect(reachable.get(0)).toBe(0);
    expect(reachable.get(1)).toBe(10);
    expect(reachable.get(2)).toBe(20);
    expect(reachable.get(3)).toBe(50);
    expect(reachable.has(4)).toBe(false); // only linked by a sea route, not a road/trail
  });

  it("returns an empty map when the start cell has no charted route at all", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findReachableLandCells(graph, 999).size).toBe(0);
  });
});

describe("findLandRoutePath", () => {
  it("returns the ordered cell sequence spanning multiple merged route segments", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findLandRoutePath(graph, 0, 3)).toEqual([0, 1, 2, 3]);
  });

  it("returns a single-element path for the same cell when it's part of the network", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findLandRoutePath(graph, 0, 0)).toEqual([0]);
  });

  it("returns null for the same cell when it isn't part of any charted route", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findLandRoutePath(graph, 999, 999)).toBeNull();
  });

  it("returns null when no charted road/trail connects the two cells", () => {
    const graph = buildLandRouteGraph(makePack());
    expect(findLandRoutePath(graph, 0, 4)).toBeNull();
  });
});

describe("buildLandRouteGraph seasonal winter blocking", () => {
  // A single road segment high in the mountains (h=80) at a temperate latitude, and a second
  // segment at sea level (h=10) but far north (subarctic). Map spans latitude 90 (top, y=0) to
  // 0 (bottom, y=100), so y=40 -> latitude 90-0.4*90=54 (just under the closure threshold) and
  // y=10 -> latitude 81 (well past it).
  function makeSeasonalPack(): PackedGraph {
    return {
      routes: [
        {
          i: 0,
          group: "roads",
          feature: 1,
          points: [
            [0, 40, 0], // mountain-pass endpoint, temperate latitude (~54)
            [10, 40, 1] // mountain-pass endpoint, temperate latitude (~54)
          ]
        },
        {
          i: 1,
          group: "roads",
          feature: 1,
          points: [
            [0, 10, 2], // lowland endpoint, subarctic latitude (~81)
            [10, 10, 3] // lowland endpoint, subarctic latitude (~81)
          ]
        }
      ],
      cells: {
        h: Uint8Array.from({ length: 4 }, (_, i) => (i < 2 ? 80 : 10)) // cells 0,1 = mountain; 2,3 = lowland
      }
    } as unknown as PackedGraph;
  }

  const mapCoordinates = { latN: 90, latT: 90 };
  const graphHeight = 100;

  it("keeps all segments open when no seasonal context is given", () => {
    const graph = buildLandRouteGraph(makeSeasonalPack());
    expect(graph.adjacency.get(0)?.has(1)).toBe(true);
    expect(graph.adjacency.get(2)?.has(3)).toBe(true);
  });

  it("keeps all segments open in summer regardless of latitude/elevation", () => {
    const graph = buildLandRouteGraph(makeSeasonalPack(), { month: 7, mapCoordinates, graphHeight });
    expect(graph.adjacency.get(0)?.has(1)).toBe(true);
    expect(graph.adjacency.get(2)?.has(3)).toBe(true);
  });

  it("closes a high-elevation mountain-pass segment in winter even at temperate latitude", () => {
    const graph = buildLandRouteGraph(makeSeasonalPack(), { month: 1, mapCoordinates, graphHeight });
    expect(graph.adjacency.get(0)?.has(1)).toBeFalsy();
  });

  it("closes a high-latitude lowland segment in winter even without mountain elevation", () => {
    const graph = buildLandRouteGraph(makeSeasonalPack(), { month: 1, mapCoordinates, graphHeight });
    expect(graph.adjacency.get(2)?.has(3)).toBeFalsy();
  });

  it("reopens both segments once winter ends", () => {
    const graph = buildLandRouteGraph(makeSeasonalPack(), { month: 4, mapCoordinates, graphHeight });
    expect(graph.adjacency.get(0)?.has(1)).toBe(true);
    expect(graph.adjacency.get(2)?.has(3)).toBe(true);
  });
});

describe("buildLandRouteGraph edge weights", () => {
  it("keeps the shorter distance when two routes both connect the same pair of cells", () => {
    const pack = {
      routes: [
        {
          i: 0,
          group: "roads",
          feature: 1,
          points: [
            [0, 0, 10],
            [100, 0, 11]
          ]
        }, // dist 100
        {
          i: 1,
          group: "trails",
          feature: 1,
          points: [
            [0, 0, 10],
            [30, 40, 11]
          ]
        } // dist 50, shorter
      ]
    } as unknown as PackedGraph;

    const graph = buildLandRouteGraph(pack);
    expect(graph.adjacency.get(10)?.get(11)).toBe(50);
    expect(graph.adjacency.get(11)?.get(10)).toBe(50);
  });
});

describe("findLandRoutePath with grade effort costs", () => {
  /**
   * Two paths from A(0) to C(2):
   * - Direct steep shortcut: 0 → 2 over 10 map units, +2000 m (grade 20%+)
   * - Milder detour: 0 → 1 → 2, ~50 map units, gentler final climb
   * Planar Dijkstra picks the short climb; effort Dijkstra picks the detour.
   */
  function makeSteepVsFlatPack(): PackedGraph {
    // exp=1: heightToMeters(h)=h-18. Rise 2000 m ⇒ Δh=2000.
    return {
      routes: [
        {
          i: 0,
          group: "roads",
          feature: 1,
          points: [
            [0, 0, 0],
            [10, 0, 2] // steep shortcut (planar 10)
          ]
        },
        {
          i: 1,
          group: "roads",
          feature: 1,
          points: [
            [0, 0, 0],
            [30, 0, 1], // long flat leg
            [10, 0, 2] // climb over 20 map units
          ]
        }
      ],
      cells: {
        h: [20, 20, 20 + 2000]
      }
    } as unknown as PackedGraph;
  }

  it("without edgeCost, prefers the shorter planar shortcut even if steep", () => {
    const pack = makeSteepVsFlatPack();
    const graph = buildLandRouteGraph(pack);
    expect(findLandRoutePath(graph, 0, 2)).toEqual([0, 2]);
  });

  it("with infantry grade effort, prefers the longer mild detour over a hard climb", () => {
    const pack = makeSteepVsFlatPack();
    const graph = buildLandRouteGraph(pack);
    const edgeCost = (from: number, to: number, planar: number) =>
      landEdgeEffortCost(from, to, planar, {
        distanceScale: 1,
        heightExponent: 1,
        heights: pack.cells.h,
        gradeEffectStrength: 1,
        sensitivity: DEFAULT_INFANTRY_GRADE_SENSITIVITY
      });

    const path = findLandRoutePath(graph, 0, 2, edgeCost);
    expect(path).toEqual([0, 1, 2]);

    const effortDist = findLandRouteDistance(graph, 0, 2, edgeCost);
    const planarShort = findLandRouteDistance(graph, 0, 2);
    expect(effortDist).not.toBeNull();
    expect(planarShort).toBe(10);
    // Effort of the chosen path exceeds pure planar length of the shortcut.
    expect(effortDist!).toBeGreaterThan(planarShort!);
  });

  it("winter still removes high-elevation edges before grade costs apply", () => {
    const pack = {
      routes: [
        {
          i: 0,
          group: "roads",
          feature: 1,
          points: [
            [0, 40, 0],
            [10, 40, 1]
          ]
        }
      ],
      cells: {
        h: Uint8Array.from({ length: 2 }, () => WINTER_ROAD_CLOSURE_ELEVATION)
      }
    } as unknown as PackedGraph;
    const mapCoordinates = { latN: 90, latT: 90 };
    const graphHeight = 100;
    const winterGraph = buildLandRouteGraph(pack, { month: 1, mapCoordinates, graphHeight });
    expect(winterGraph.adjacency.get(0)?.has(1)).toBeFalsy();
    expect(findLandRoutePath(winterGraph, 0, 1)).toBeNull();
  });
});
