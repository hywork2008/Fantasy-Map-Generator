import { describe, expect, it, vi } from "vitest";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import type { ApproachCorridorSettings } from "./approachCorridorSearch";
import {
  buildLandRouteGraph,
  findLandRouteCorridor,
  type LandGuidePatch,
  type LandRouteGraph,
  landGuideNodeId
} from "./dryLandRouteGraph";
import { buildLocalApproachGuides } from "./localApproachGuides";

const settings: ApproachCorridorSettings = {
  roadWidthMeters: 2,
  minimumTurnRadiusMeters: 4,
  minimumStraightMeters: 0,
  minimumFinalStraightMeters: 2,
  turnPenaltyMetersPerRadian: 0,
  maxEnvelopeErrorMeters: 0.05,
  maxArcSections: 100,
  maxNodes: 1000,
  maxEdges: 5000,
  maxLabels: 10000,
  maxExpansions: 10000
};
function water(w: PhysicalWaterPolygon[] = []) {
  return PhysicalWaterIndex.build(w, new PhysicalWaterValidationCache())!;
}
function box(x: number, y: number, w: number, h: number): PhysicalWaterPolygon {
  return {
    id: 2,
    rings: [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
      ]
    ]
  };
}
function patch(id: number, points: RiverPoint[], cellId = 3): LandGuidePatch {
  return {
    id,
    cellId,
    nodes: points.map((point, i) => ({ id: i, point, neighbors: i + 1 < points.length ? [i + 1] : [] }))
  };
}
function input() {
  return {
    patches: [
      patch(7, [
        [-20, 0],
        [0, 0]
      ]),
      patch(8, [
        [0, 0],
        [20, 0]
      ])
    ],
    portals: [
      {
        id: 4,
        members: [
          { patchId: 7, nodeId: 1 },
          { patchId: 8, nodeId: 0 }
        ]
      }
    ],
    firstNodeId: 100,
    roadWidthMeters: 2,
    maxSourceNodes: 1000,
    maxSourceEdges: 5000,
    environment: { water: water(), supportsDryFootprint: () => true }
  };
}
function graph(i = input()): LandRouteGraph {
  const result = buildLandRouteGraph(i);
  expect(result).toHaveProperty("graph");
  if (!("graph" in result)) throw new Error(result.reason);
  return result.graph;
}
function query(g: LandRouteGraph, overrides = {}) {
  return findLandRouteCorridor(g, {
    startNodeId: 100,
    goalNodeId: g.nodes.at(-1)!.id,
    goalTangent: [1, 0],
    settings,
    water: water(),
    supportsDryFootprint: () => true,
    ...overrides
  });
}
describe("explicit dry land navigation graph", () => {
  it("joins explicit shared portals, preserving sources and derived cell lookup", () => {
    const g = graph();
    expect(g.nodes).toHaveLength(3);
    expect(g.stats.dryComponents).toBe(1);
    expect(g.nodes[1].sources).toEqual([
      { patchId: 7, nodeId: 1 },
      { patchId: 8, nodeId: 0 }
    ]);
    expect(landGuideNodeId(g, { patchId: 8, nodeId: 0 })).toBe(101);
    expect(g.nextNodeId).toBe(103);
    expect(query(g)).toHaveProperty("corridor.distanceMeters", 40);
  });
  it("does not join equal coordinates or shared cell IDs implicitly", () => {
    const i = input();
    i.portals = [];
    const g = graph(i);
    expect(g.nodes).toHaveLength(4);
    expect(g.stats.dryComponents).toBe(2);
    expect(query(g)).toMatchObject({ reason: "no-corridor" });
  });
  it("splits same-cell bank guides at a width-aware river barrier", () => {
    const i = input();
    i.patches = [
      patch(7, [
        [-10, 0],
        [10, 0]
      ])
    ];
    i.portals = [];
    i.environment.water = water([box(-2, -100, 4, 200)]);
    const g = graph(i);
    expect(g.stats.dryComponents).toBe(2);
    expect(g.rejectedEdges).toEqual([{ from: 100, to: 101, reason: "water-intersection" }]);
    expect(query(g, { water: i.environment.water })).toMatchObject({ reason: "no-corridor" });
  });
  it("allows dry river-bank travel and checks occupied policy regions between ports", () => {
    const i = input();
    i.patches = [
      patch(7, [
        [-10, 10],
        [10, 10]
      ])
    ];
    i.portals = [];
    i.environment.water = water([box(-20, -2, 40, 4)]);
    expect(graph(i).stats.dryComponents).toBe(1);
    i.environment.supportsDryFootprint = p => Math.max(...p.map(q => q[0])) < 0 || Math.min(...p.map(q => q[0])) > 2;
    const g = graph(i);
    expect(g.rejectedEdges[0].reason).toBe("unsupported-terrain");
  });
  it("rejects unknown, displaced, duplicate and multiply assigned portal members", () => {
    for (const portals of [
      [
        {
          id: 4,
          members: [
            { patchId: 7, nodeId: 1 },
            { patchId: 99, nodeId: 0 }
          ]
        }
      ],
      [
        {
          id: 4,
          members: [
            { patchId: 7, nodeId: 0 },
            { patchId: 8, nodeId: 0 }
          ]
        }
      ],
      [
        {
          id: 4,
          members: [
            { patchId: 7, nodeId: 1 },
            { patchId: 7, nodeId: 1 }
          ]
        }
      ],
      [...input().portals, ...input().portals]
    ])
      expect(buildLandRouteGraph({ ...input(), portals })).toMatchObject({ reason: "invalid-portal" });
  });
  it("keeps directed reachability distinct from weak guide components", () => {
    const g = graph();
    expect(g.stats.dryComponents).toBe(1);
    expect(query(g, { startNodeId: 102, goalNodeId: 100, goalTangent: [-1, 0] })).toMatchObject({
      reason: "no-corridor"
    });
  });
  it("checks current obstacles and road width again at query time", () => {
    const g = graph();
    expect(query(g, { water: water([box(5, -10, 2, 20)]) })).toMatchObject({ reason: "no-corridor" });
    expect(query(g, { settings: { ...settings, roadWidthMeters: 4 } })).toMatchObject({ reason: "invalid-input" });
  });
  it("does not equate guide connectivity with feasible terminal direction or curvature", () => {
    const i = input();
    i.patches = [
      patch(7, [
        [-20, 0],
        [0, 0],
        [0, 2]
      ])
    ];
    i.portals = [];
    const g = graph(i);
    expect(g.stats.dryComponents).toBe(1);
    expect(query(g, { goalTangent: [0, 1] })).toMatchObject({ reason: "no-corridor" });
  });
  it("reports budget, malformed source, wet port and degenerate alias edges", () => {
    expect(buildLandRouteGraph({ ...input(), maxSourceNodes: 3 })).toMatchObject({ reason: "graph-budget" });
    expect(buildLandRouteGraph({ ...input(), maxSourceEdges: 1 })).toMatchObject({ reason: "graph-budget" });
    expect(buildLandRouteGraph({ ...input(), firstNodeId: Number.MAX_SAFE_INTEGER })).toMatchObject({
      reason: "invalid-input"
    });
    const i = input();
    i.environment.water = water([box(-1, -1, 2, 2)]);
    expect(buildLandRouteGraph(i)).toMatchObject({ reason: "blocked-node" });
    const malformed = input();
    malformed.patches = [
      patch(7, [
        [0, 0],
        [0, 0]
      ])
    ];
    malformed.portals = [
      {
        id: 4,
        members: [
          { patchId: 7, nodeId: 0 },
          { patchId: 7, nodeId: 1 }
        ]
      }
    ];
    expect(buildLandRouteGraph(malformed)).toMatchObject({ reason: "invalid-edge" });
  });
  it("builds deterministic immutable snapshots without touching input or RNG", () => {
    const i = input(),
      before = structuredClone(i.patches);
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG");
    });
    try {
      const g = graph(i);
      expect(graph({ ...i, patches: [...i.patches].reverse() })).toEqual(g);
      expect(i.patches).toEqual(before);
      i.patches[0].nodes[0].point[0] = 99;
      expect(g.nodes[0].point).toEqual([-20, 0]);
      expect(Object.isFrozen(g.nodes[1].sources[0])).toBe(true);
      expect(Object.isFrozen(g.nodes[0].neighbors)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
  it("accepts local approach guide output without treating its guides as road junctions", () => {
    const environment = { water: water(), supportsDryFootprint: () => true };
    const built = buildLocalApproachGuides({
      start: [-30, 0],
      goal: [0, 0],
      goalTangent: [1, 0],
      roadWidthMeters: 2,
      settings: {
        spacingMeters: 10,
        paddingMeters: 10,
        terminalLeadMeters: 10,
        connectorRadiusMeters: 15,
        maxSamples: 100,
        maxNodes: 100,
        maxEdges: 1000,
        maxEdgeChecks: 1000
      },
      ...environment
    });
    if (!("guides" in built)) throw new Error(built.reason);
    const result = buildLandRouteGraph({
      ...input(),
      patches: [{ id: 7, nodes: built.guides.nodes }],
      portals: [],
      environment
    });
    if (!("graph" in result)) throw new Error(result.reason);
    const g = result.graph;
    const start = landGuideNodeId(g, { patchId: 7, nodeId: built.guides.startNodeId })!,
      goal = landGuideNodeId(g, { patchId: 7, nodeId: built.guides.approachNodeId })!;
    expect(query(g, { startNodeId: start, goalNodeId: goal })).toHaveProperty("corridor.distanceMeters", 30);
  });
});
