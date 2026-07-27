import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { findPath } from "../utils/pathUtils";
import { MIN_NAVIGABLE_FLUX, Rivers } from "./river-generator";
import { Routes } from "./routes-generator";

type RoutesGraphInternals = {
  calculateUrquhartEdges(points: [number, number][]): number[][];
  calculateAugmentedEdges(points: [number, number][]): number[][];
  addCoastalBackboneEdges(
    points: [number, number][],
    portEdges: [number, number][],
    coastalPortIndices: number[]
  ): [number, number][];
  getPoints(group: string, cells: number[], points: [number, number][]): [number, number, number][];
  createCostEvaluator(options: {
    isWater: boolean;
    connections: Map<string, boolean>;
    seaRouteGenerationMode?: "legacy" | "augmented";
  }): (current: number, next: number) => number;
  sortBurgsByStateAndFeature(
    burgs: { i?: number; removed?: boolean; state?: number; feature?: number; capital?: number; port?: number }[]
  ): {
    burgsByStateFeature: { feature: number; stateId: number; burgs: { i?: number }[] }[];
    capitalsByStateFeature: { feature: number; stateId: number; burgs: { i?: number }[] }[];
    portsByStateFeature: { feature: number; stateId: number; burgs: { i?: number }[] }[];
  };
  generateSeaRoutes(
    connections: Map<string, boolean>,
    seaRouteGenerationMode: "legacy" | "augmented"
  ): {
    feature: number;
    cells: number[];
  }[];
};

type RouteGenerationInternals = {
  createRoutesData(
    routes: { i: number; group: string; feature: number; points: [number, number, number][] }[],
    connections: Map<string, boolean>,
    seaRouteGenerationMode: "legacy" | "augmented"
  ): { i: number; group: string; feature: number; points: [number, number, number][] }[];
};

function normalizeEdges(edges: number[][]): Set<string> {
  return new Set(edges.map(([from, to]) => `${Math.min(from, to)}-${Math.max(from, to)}`));
}

describe("RoutesModule sea-route graph modes", () => {
  const graphInternals = Routes as unknown as RoutesGraphInternals;

  it("restores the closest Urquhart-removed Delaunay edge for each affected port", () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 0],
      [0, 10],
      [10, 10]
    ];

    const legacyEdges = normalizeEdges(graphInternals.calculateUrquhartEdges(points));
    const augmentedEdges = normalizeEdges(graphInternals.calculateAugmentedEdges(points));

    expect(legacyEdges.has("1-2")).toBe(false);
    expect(augmentedEdges.has("1-2")).toBe(true);
    expect(augmentedEdges.size).toBeGreaterThan(legacyEdges.size);
    for (const edge of legacyEdges) expect(augmentedEdges.has(edge)).toBe(true);
  });

  it("adds a coastal backbone edge without removing river-port connections", () => {
    const points: [number, number][] = [
      [0, 0], // coastal port
      [4, 0], // navigable river port
      [8, 0] // coastal port
    ];
    const combinedEdges = normalizeEdges(graphInternals.addCoastalBackboneEdges(points, [[0, 1]], [0, 2]));

    expect(combinedEdges).toEqual(new Set(["0-1", "0-2"]));
  });
});

describe("RoutesModule domestic network grouping", () => {
  const graphInternals = Routes as unknown as RoutesGraphInternals;

  it("keeps same-feature Burgs and ports in separate State networks", () => {
    const groups = graphInternals.sortBurgsByStateAndFeature([
      { i: 1, state: 1, feature: 7, capital: 1, port: 3 },
      { i: 2, state: 2, feature: 7, capital: 1, port: 3 },
      { i: 3, state: 0, feature: 7, capital: 1, port: 3 }
    ]);

    expect(groups.burgsByStateFeature.map(group => group.stateId)).toEqual([1, 2]);
    expect(groups.capitalsByStateFeature.map(group => group.stateId)).toEqual([1, 2]);
    expect(groups.portsByStateFeature.map(group => group.stateId)).toEqual([1, 2]);
  });
});

describe("RoutesModule settlement foundation trails", () => {
  const routeGenerationInternals = Routes as unknown as RouteGenerationInternals;

  beforeEach(() => {
    worldContext.pack = {
      cells: {
        c: [[1], [0, 2], [1]],
        h: [25, 25, 25],
        biomeCode: [1, 1, 1],
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ],
        burg: [0, 0, 0],
        f: [1, 1, 1]
      },
      burgs: [],
      settlementFoundation: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2] }],
        nodes: [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 10 },
          { id: 1, regionId: 0, cell: 2, role: "village", score: 5 }
        ],
        links: [{ fromNodeId: 0, toNodeId: 1, kind: "trail" }]
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = { habitability: [0, 100] } as unknown as typeof worldContext.biomesData;
  });

  it("does not materialize planned village links until their sites become Burgs", () => {
    const routes = routeGenerationInternals.createRoutesData([], new Map(), "augmented");

    expect(routes).toEqual([]);
  });
});

describe("RoutesModule settlement connections", () => {
  beforeEach(() => {
    worldContext.pack = {
      cells: {
        c: [[1], [0]],
        h: [25, 25],
        biomeCode: [1, 1],
        p: [
          [0, 0],
          [10, 0]
        ],
        burg: [1, 2],
        f: [1, 1],
        state: [1, 1],
        routes: {}
      },
      burgs: [{ i: 0 }, { i: 1, cell: 0, x: 0, y: 0, state: 1 }, { i: 2, cell: 1, x: 10, y: 0, state: 1 }],
      routes: []
    } as unknown as PackedGraph;
    worldContext.biomesData = { habitability: [0, 100] } as unknown as typeof worldContext.biomesData;
  });

  it("connects a newly created burg to another burg instead of treating itself as the route exit", () => {
    const route = Routes.connectFrontier(1, 1);

    expect(route?.points.map(point => point[2])).toEqual([1, 0]);
    expect(worldContext.pack.cells.routes[1]).toEqual({ 0: route?.i });
  });
});

describe("RoutesModule settlement water connections", () => {
  beforeEach(() => {
    worldContext.pack = {
      cells: {
        c: [[1], [0, 2], [1]],
        h: [25, 25, 25],
        biomeCode: [1, 1, 1],
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ],
        burg: [1, 0, 2],
        f: [1, 1, 1],
        state: [1, 1, 1],
        r: [1, 1, 1],
        fl: [200, 200, 200],
        haven: [0, 0, 0],
        routes: {}
      },
      burgs: [
        { i: 0 },
        { i: 1, cell: 0, x: 0, y: 0, state: 1, port: 1 },
        { i: 2, cell: 2, x: 20, y: 0, state: 1, port: 1 }
      ],
      rivers: [{ i: 1, cells: [0, 1, 2] }],
      routes: []
    } as unknown as PackedGraph;
    worldContext.options = { seaRouteGenerationMode: "augmented" } as typeof worldContext.options;
    worldContext.biomesData = { habitability: [0, 100] } as unknown as typeof worldContext.biomesData;
  });

  it("prefers a searoute along a shared navigable river between two State ports", () => {
    const route = Routes.connectPort(0, 1);

    expect(route).toMatchObject({ group: "searoutes", feature: 1 });
    expect(route?.points.map(point => point[2])).toEqual([0, 1, 2]);
    expect(route?.cells).toEqual([0, 1, 2]);
  });

  it("permits standard-map searoutes between nearby ports of different States", () => {
    const graphInternals = Routes as unknown as RoutesGraphInternals;
    worldContext.pack.cells.state = [1, 0, 2];
    worldContext.pack.burgs = [
      { i: 0 },
      { i: 1, cell: 0, x: 0, y: 0, state: 1, port: 1 },
      { i: 2, cell: 2, x: 20, y: 0, state: 2, port: 1 }
    ] as typeof worldContext.pack.burgs;
    worldContext.options = {
      initialSettlementPattern: "standard",
      seaRouteGenerationMode: "augmented"
    } as typeof worldContext.options;
    Routes.sync();

    expect(graphInternals.generateSeaRoutes(new Map(), "augmented")).toEqual([
      expect.objectContaining({ feature: 1, cells: [0, 1, 2] })
    ]);

    worldContext.options.initialSettlementPattern = "frontier";
    expect(graphInternals.generateSeaRoutes(new Map(), "augmented")).toEqual([]);

    worldContext.options.initialSettlementPattern = "standard";
    expect(Routes.connectPort(0, 1)?.points.map(point => point[2])).toEqual([0, 1, 2]);
  });

  it("adds only the new spur when a port joins an existing sea lane", () => {
    worldContext.pack.cells.c = [[1], [0, 2, 3], [1], [1]];
    worldContext.pack.cells.h = [25, 25, 25, 25];
    worldContext.pack.cells.biomeCode = [1, 1, 1, 1];
    worldContext.pack.cells.p = [
      [0, 0],
      [10, 0],
      [20, 0],
      [10, 10]
    ];
    worldContext.pack.cells.burg = [1, 0, 2, 3];
    worldContext.pack.cells.f = [1, 1, 1, 1];
    worldContext.pack.cells.state = [1, 1, 1, 1];
    worldContext.pack.cells.r = [1, 1, 1, 1];
    worldContext.pack.cells.fl = [200, 200, 200, 200];
    worldContext.pack.cells.haven = [0, 0, 0, 0];
    worldContext.pack.cells.routes = { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } };
    worldContext.pack.burgs = [
      { i: 0 },
      { i: 1, cell: 0, x: 0, y: 0, state: 1, port: 1 },
      { i: 2, cell: 2, x: 20, y: 0, state: 1, port: 1 },
      { i: 3, cell: 3, x: 10, y: 10, state: 1, port: 1 }
    ] as typeof worldContext.pack.burgs;
    worldContext.pack.rivers = [
      { i: 1, cells: [0, 1, 2] },
      { i: 2, cells: [3, 1] }
    ];
    worldContext.pack.routes = [
      {
        i: 0,
        group: "searoutes",
        feature: 1,
        points: [
          [0, 0, 0],
          [10, 0, 1],
          [20, 0, 2]
        ]
      }
    ];

    const route = Routes.connectPort(3, 1);

    expect(route?.points.map(point => point[2])).toEqual([3, 1]);
    expect(worldContext.pack.routes).toHaveLength(2);
  });
});

describe("RoutesModule river-aware water cost", () => {
  const routeInternals = Routes as unknown as RoutesGraphInternals;

  beforeEach(() => {
    worldContext.pack = {
      cells: {
        h: [] as unknown as PackedGraph["cells"]["h"],
        r: [] as unknown as PackedGraph["cells"]["r"],
        fl: [] as unknown as PackedGraph["cells"]["fl"],
        p: [] as unknown as PackedGraph["cells"]["p"],
        t: [] as unknown as PackedGraph["cells"]["t"],
        g: [] as unknown as PackedGraph["cells"]["g"]
      }
    } as unknown as PackedGraph;
    worldContext.grid = { cells: { temp: [20, 20, 20, 20, 20, 20, 20, 20] } } as unknown as Grid;
  });

  function setupTwoRiverPack() {
    worldContext.pack.cells = {
      h: [20, 25, 25, 25, 25, 5],
      r: [0, 1, 1, 2, 2, 0],
      fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [10, 5],
        [20, 5],
        [30, 0]
      ],
      t: [1, 1, 1, 1, 1, -1],
      g: [0, 0, 0, 0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [
      { i: 1, cells: [1, 2, 5] },
      { i: 2, cells: [3, 4, 5] }
    ] as unknown as PackedGraph["rivers"];
    Routes.sync();
  }

  it("allows a step along the river course above the flux threshold", () => {
    setupTwoRiverPack();
    expect(Routes.getWaterPathCost(1, 2)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(2, 1)).toBeLessThan(Infinity);
  });

  it("uses the river-aware cost evaluator when generating sea routes", () => {
    setupTwoRiverPack();
    const getSeaRouteCost = routeInternals.createCostEvaluator({ isWater: true, connections: new Map() });

    expect(getSeaRouteCost(1, 2)).toBeLessThan(Infinity);
    expect(getSeaRouteCost(2, 3)).toBe(Infinity);
  });

  it("uses the pre-river-fix water evaluator in legacy mode", () => {
    setupTwoRiverPack();
    const getLegacySeaRouteCost = routeInternals.createCostEvaluator({
      isWater: true,
      connections: new Map(),
      seaRouteGenerationMode: "legacy"
    });

    expect(getLegacySeaRouteCost(1, 2)).toBe(Infinity);
  });

  it("rejects a step between voronoi-adjacent cells of different rivers", () => {
    setupTwoRiverPack();
    expect(Routes.getWaterPathCost(2, 3)).toBe(Infinity);
    expect(Routes.getWaterPathCost(3, 2)).toBe(Infinity);
  });

  it("rejects a step onto a river cell with flux below the threshold", () => {
    worldContext.pack.cells = {
      h: [20, 25, 25],
      r: [0, 1, 1],
      fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX - 1],
      p: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      t: [1, 1, 1],
      g: [0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [{ i: 1, cells: [1, 2] }] as unknown as PackedGraph["rivers"];
    Routes.sync();

    expect(Routes.getWaterPathCost(1, 2)).toBe(Infinity);
  });

  it("permits the river mouth ↔ sea transition", () => {
    setupTwoRiverPack();
    expect(Routes.getWaterPathCost(2, 5)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(5, 2)).toBeLessThan(Infinity);
  });

  it("permits a low-flux river port through its official haven only", () => {
    worldContext.pack.cells = {
      h: [25, 5, 5],
      r: [1, 0, 0],
      fl: [MIN_NAVIGABLE_FLUX - 1, 0, 0],
      haven: [1, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [0, 10]
      ],
      t: [1, -1, -1],
      g: [0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [{ i: 1, cells: [0, 1] }] as unknown as PackedGraph["rivers"];
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(1, 0)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(0, 2)).toBe(Infinity);
    expect(Routes.getWaterPathCost(2, 0)).toBe(Infinity);
  });

  it("rejects a coastal non-port cell that has no haven", () => {
    worldContext.pack.cells = {
      h: [25, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [0, 10]
      ],
      t: [1, -1, -1],
      g: [0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [] as unknown as PackedGraph["rivers"];
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBe(Infinity);
    expect(Routes.getWaterPathCost(0, 2)).toBe(Infinity);
  });

  it("forces a coastal port to exit through its haven cell", () => {
    worldContext.pack.cells = {
      h: [25, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      haven: [1, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [0, 10]
      ],
      t: [1, -1, -1],
      g: [0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [] as unknown as PackedGraph["rivers"];
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(0, 2)).toBe(Infinity);
    expect(Routes.getWaterPathCost(1, 0)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(2, 0)).toBe(Infinity);
  });

  it("applies the same haven restriction in legacy sea-route mode", () => {
    worldContext.pack.cells = {
      h: [25, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      haven: [1, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [0, 10]
      ],
      t: [1, -1, -1],
      g: [0, 0, 0]
    } as unknown as PackedGraph["cells"];

    const getLegacySeaRouteCost = routeInternals.createCostEvaluator({
      isWater: true,
      connections: new Map(),
      seaRouteGenerationMode: "legacy"
    });

    expect(getLegacySeaRouteCost(0, 1)).toBeLessThan(Infinity);
    expect(getLegacySeaRouteCost(0, 2)).toBe(Infinity);
    expect(getLegacySeaRouteCost(1, 0)).toBeLessThan(Infinity);
    expect(getLegacySeaRouteCost(2, 0)).toBe(Infinity);

    const portGraph = { cells: { c: [[1, 2], [0], [0]] } };
    expect(findPath(1, cell => cell === 0, getLegacySeaRouteCost, portGraph)).toEqual([1, 0]);
    expect(findPath(2, cell => cell === 0, getLegacySeaRouteCost, portGraph)).toBeNull();
  });

  it("places generated sea-route endpoints at the water-side port anchor", () => {
    worldContext.pack = {
      cells: {
        burg: [1, 0],
        haven: [1, 0],
        v: [
          [0, 1],
          [0, 1]
        ],
        p: [
          [5, 5],
          [8, 5]
        ]
      },
      vertices: {
        c: [
          [0, 1, -1],
          [0, 1, -1]
        ],
        p: [
          [0, 0],
          [10, 0]
        ]
      },
      burgs: [{}, { i: 1, cell: 0, x: 5, y: 5, port: 1 }]
    } as unknown as PackedGraph;

    expect(
      routeInternals.getPoints(
        "searoutes",
        [0, 1],
        [
          [5, 5],
          [8, 5]
        ]
      )
    ).toEqual([
      [5.3, 0.5, 0],
      [8, 5, 1]
    ]);
  });

  it("rejects exit from a river-mouth land cell into a non-mouth water cell", () => {
    worldContext.pack.cells = {
      h: [25, 25, 25, 5, 5, 5, 5],
      r: [0, 1, 1, 0, 0, 0, 0],
      fl: [0, MIN_NAVIGABLE_FLUX, MIN_NAVIGABLE_FLUX + 50, 0, 0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [25, 0],
        [25, 5],
        [25, -5],
        [30, 0]
      ],
      t: [1, 1, 1, -1, -1, -1, -2],
      g: [0, 0, 0, 0, 0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [{ i: 1, cells: [1, 2, 5] }] as unknown as PackedGraph["rivers"];
    Routes.sync();

    expect(Routes.getWaterPathCost(2, 5)).toBeLessThan(Infinity);
    expect(Routes.getWaterPathCost(2, 6)).toBe(Infinity);
  });

  it("rejects land cells that are not on a river at all", () => {
    worldContext.pack.cells = {
      h: [20, 25, 25],
      r: [0, 0, 1],
      fl: [0, 0, MIN_NAVIGABLE_FLUX],
      p: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      t: [1, 1, 1],
      g: [0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [{ i: 1, cells: [2] }] as unknown as PackedGraph["rivers"];
    Routes.sync();

    expect(Routes.getWaterPathCost(0, 1)).toBe(Infinity);
  });
});

describe("RoutesModule.addMeandering", () => {
  beforeEach(() => {
    worldContext.graphWidth = 1000;
    worldContext.graphHeight = 1000;
    worldContext.pack = {
      cells: {
        h: [] as unknown as PackedGraph["cells"]["h"],
        r: [] as unknown as PackedGraph["cells"]["r"],
        fl: [] as unknown as PackedGraph["cells"]["fl"],
        p: [] as unknown as PackedGraph["cells"]["p"],
        t: [] as unknown as PackedGraph["cells"]["t"],
        g: [] as unknown as PackedGraph["cells"]["g"],
        burg: [] as unknown as PackedGraph["cells"]["burg"]
      },
      burgs: [],
      rivers: [],
      routes: []
    } as unknown as PackedGraph;
    worldContext.grid = { cells: { temp: [20, 20, 20, 20, 20, 20, 20, 20] } } as unknown as Grid;
  });

  function setupRiverPack() {
    worldContext.pack.cells = {
      h: [20, 25, 25, 25, 25, 5],
      r: [0, 1, 1, 1, 1, 0],
      fl: [0, 200, 200, 200, 200, 0],
      p: [
        [0, 0],
        [10, 0],
        [25, 0],
        [40, 0],
        [55, 0],
        [70, 0]
      ],
      t: [1, 1, 1, 1, 1, -1],
      g: [0, 0, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [{ i: 1, cells: [1, 2, 3, 4, 5] }] as unknown as PackedGraph["rivers"];
    Routes.sync();
  }

  it("emits an anchor for each input cell and interior meander points between river-edge anchors", () => {
    setupRiverPack();
    const routeCells = [1, 2, 3, 4];
    const anchors = routeCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];
    const result = Routes.addMeandering(routeCells, anchors);

    const emittedCellIds = new Set(result.map((p: number[]) => p[2]));
    for (const c of routeCells) {
      expect(emittedCellIds.has(c)).toBe(true);
    }
    expect(result.length).toBeGreaterThan(routeCells.length);
  });

  it("emits one point per cell when there are no river edges (open sea)", () => {
    worldContext.pack.cells = {
      h: [5, 5, 5],
      r: [0, 0, 0],
      fl: [0, 0, 0],
      p: [
        [0, 0],
        [10, 0],
        [20, 0]
      ],
      t: [-1, -1, -1],
      g: [0, 0, 0],
      burg: [0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [] as unknown as PackedGraph["rivers"];
    Routes.sync();

    const routeCells = [0, 1, 2];
    const anchors = routeCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];
    const result = Routes.addMeandering(routeCells, anchors);

    expect(result.length).toBe(routeCells.length);
    expect(result.map((p: number[]) => p[2])).toEqual(routeCells);
  });

  it("matches anchor positions when route runs upstream (mouth→source)", () => {
    setupRiverPack();
    const downstreamCells = [1, 2, 3, 4];
    const upstreamCells = downstreamCells.slice().reverse();
    const downstreamAnchors = downstreamCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];
    const upstreamAnchors = upstreamCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];

    const down = Routes.addMeandering(downstreamCells, downstreamAnchors);
    const up = Routes.addMeandering(upstreamCells, upstreamAnchors);

    expect(up.length).toBe(down.length);

    const downAnchorXY = down.map((p: number[]) => [p[0], p[1]]);
    const upReversedXY = up
      .slice()
      .reverse()
      .map((p: number[]) => [p[0], p[1]]);
    expect(upReversedXY).toEqual(downAnchorXY);
  });

  it("splits the run at a confluence (each river meandered independently)", () => {
    worldContext.pack.cells = {
      h: [20, 25, 25, 25, 25, 25],
      r: [0, 1, 1, 1, 2, 2],
      fl: [0, 200, 200, 300, 200, 200],
      p: [
        [0, 0],
        [10, 0],
        [25, 0],
        [40, 0],
        [40, 15],
        [40, 30]
      ],
      t: [1, 1, 1, 1, 1, 1],
      g: [0, 0, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [
      { i: 1, cells: [1, 2, 3] },
      { i: 2, cells: [5, 4, 3] }
    ] as unknown as PackedGraph["rivers"];
    Routes.sync();

    const routeCells = [5, 4, 3, 2, 1];
    const anchors = routeCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];
    const result = Routes.addMeandering(routeCells, anchors);

    const cellIds = result.map((p: number[]) => p[2]);
    const transitions: number[] = [];
    for (let i = 0; i < cellIds.length; i++) {
      if (i === 0 || cellIds[i] !== cellIds[i - 1]) transitions.push(cellIds[i]);
    }
    expect(transitions).toEqual(routeCells);
  });

  it("anchors river-following cells at cell centers, ignoring shifted burg coords", () => {
    setupRiverPack();
    const routeCells = [1, 2, 3, 4];
    const anchors: [number, number][] = [
      [10, 0],
      [25, 0],
      [40, 3],
      [55, 0]
    ];
    const result = Routes.addMeandering(routeCells, anchors);

    const cell3Anchors = result.filter(
      (p: number[], idx: number, arr: number[][]) => p[2] === 3 && (idx === 0 || arr[idx - 1][2] !== 3)
    );
    expect(cell3Anchors.length).toBeGreaterThan(0);
    const cell3Anchor = cell3Anchors[0];
    expect(cell3Anchor[0]).toBe(40);
    expect(cell3Anchor[1]).toBe(0);
  });

  it("keeps a port cell on the river course — burg markers never move a river route", () => {
    setupRiverPack();
    worldContext.pack.cells.burg = [0, 0, 0, 7, 9, 0] as unknown as PackedGraph["cells"]["burg"];
    const routeCells = [1, 2, 3, 4];
    const anchors: [number, number][] = [
      [10, 0],
      [25, 0],
      [40, 9],
      [55, 8]
    ];
    const result = Routes.addMeandering(routeCells, anchors);

    const cell3Anchor = result.find(
      (p: number[], idx: number, arr: number[][]) => p[2] === 3 && (idx === 0 || arr[idx - 1][2] !== 3)
    );
    expect(cell3Anchor).toBeDefined();
    expect([cell3Anchor![0], cell3Anchor![1]]).toEqual([40, 0]);

    const last = result[result.length - 1];
    expect(last[2]).toBe(4);
    expect([last[0], last[1]]).toEqual([55, 0]);
  });

  it("buildLinks does not create self-links from interior meander points", () => {
    setupRiverPack();
    const routeCells = [1, 2, 3, 4];
    const anchors = routeCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];
    const result = Routes.addMeandering(routeCells, anchors);

    const route = { i: 0, group: "searoutes", feature: 0, points: result };
    const links = Routes.buildLinks([route]);

    for (const fromStr of Object.keys(links)) {
      const from = Number(fromStr);
      expect(links[from][from]).toBeUndefined();
    }
    expect(links[1][2]).toBe(0);
    expect(links[2][3]).toBe(0);
    expect(links[3][4]).toBe(0);
  });

  it("produces geometry identical to the river polygon along the same cells", () => {
    setupRiverPack();
    const riverCells = [1, 2, 3, 4, 5];

    const polygon = Rivers.addMeandering(riverCells);

    const routeAnchors = riverCells.map(c => worldContext.pack.cells.p[c]) as [number, number][];
    const route = Routes.addMeandering(riverCells, routeAnchors);

    expect(route.length).toBe(polygon.length);
    for (let i = 0; i < polygon.length; i++) {
      expect(route[i][0]).toBeCloseTo(polygon[i][0], 6);
      expect(route[i][1]).toBeCloseTo(polygon[i][1], 6);
    }
  });

  it("a partial route run overlays the river polygon exactly, even where acute angles were relaxed", () => {
    worldContext.pack.cells = {
      h: [20, 25, 25, 25, 25, 25, 5],
      r: [0, 1, 1, 1, 1, 1, 0],
      fl: [0, 200, 200, 200, 200, 200, 0],
      p: [
        [0, 0],
        [0, 0],
        [15, 16],
        [30, 0],
        [45, 16],
        [60, 0],
        [75, 5]
      ],
      t: [1, 1, 1, 1, 1, 1, -1],
      g: [0, 0, 0, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 0, 0, 0]
    } as unknown as PackedGraph["cells"];
    worldContext.pack.rivers = [{ i: 1, cells: [1, 2, 3, 4, 5, 6] }] as unknown as PackedGraph["rivers"];
    Routes.sync();

    const polygon = Rivers.addMeandering([1, 2, 3, 4, 5, 6]);

    const anchorIndexOf = (cell: number) => {
      const [cx, cy] = worldContext.pack.cells.p[cell];
      return polygon.findIndex((point: number[]) => point[0] === cx && point[1] === cy);
    };
    const from = anchorIndexOf(2);
    const to = anchorIndexOf(4);
    const polygonSlice = polygon.slice(from, to + 1);

    const runCells = [2, 3, 4];
    const route = Routes.addMeandering(runCells, runCells.map(c => worldContext.pack.cells.p[c]) as [number, number][]);

    expect(route.length).toBe(polygonSlice.length);
    for (let i = 0; i < polygonSlice.length; i++) {
      expect(route[i][0]).toBeCloseTo(polygonSlice[i][0], 6);
      expect(route[i][1]).toBeCloseTo(polygonSlice[i][1], 6);
    }
  });
});
