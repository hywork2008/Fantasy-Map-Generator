import { describe, expect, it, vi } from "vitest";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import { buildPolylineRiverAxis, type RiverPoint } from "../services/riverGeometry";
import {
  type ApproachCorridorInput,
  type ApproachCorridorSettings,
  findApproachCorridor
} from "./approachCorridorSearch";
import {
  buildConstrainedLandNetwork,
  findConstrainedLandRoute,
  type NetworkConnection,
  type NetworkCorridor,
  type NetworkNode
} from "./constrainedLandNetwork";
import { type CrossingCandidateInput, createProvisionalRiverCrossing } from "./riverCrossingCandidates";

const settings: ApproachCorridorSettings = {
  roadWidthMeters: 2,
  minimumTurnRadiusMeters: 4,
  minimumStraightMeters: 0,
  minimumFinalStraightMeters: 2,
  turnPenaltyMetersPerRadian: 0,
  maxEnvelopeErrorMeters: 0.05,
  maxArcSections: 100,
  maxNodes: 100,
  maxEdges: 500,
  maxLabels: 2000,
  maxExpansions: 2000
};
function fixture() {
  const source: CrossingCandidateInput = {
    id: 5,
    arcLengthMeters: 100,
    geometry: {
      axis: buildPolylineRiverAxis(7, 1, [
        [0, -100],
        [0, 100]
      ])!,
      water: {
        id: 7,
        rings: [
          [
            [-5, -100],
            [5, -100],
            [5, 100],
            [-5, 100]
          ]
        ],
        bankReferences: [
          [null, { side: "right", arcStart: 0, arcEnd: 200 }, null, { side: "left", arcStart: 200, arcEnd: 0 }]
        ]
      }
    },
    dimensions: { bankSeatMeters: 1, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 5 },
    otherWater: [],
    capability: { depthMeters: 3 },
    supportsDryFootprint: () => true
  };
  const water = PhysicalWaterIndex.build([source.geometry.water], new PhysicalWaterValidationCache())!;
  const environment = { water, supportsDryFootprint: () => true, crossingInputAt: (_id: number) => source };
  function corridor(points: RiverPoint[], goalTangent: RiverPoint): NetworkCorridor {
    const input: ApproachCorridorInput = {
      nodes: points.map((point, i) => ({ id: i, point, neighbors: i + 1 < points.length ? [i + 1] : [] })),
      startNodeId: 0,
      goalNodeId: points.length - 1,
      goalTangent,
      settings,
      ...environment
    };
    const r = findApproachCorridor(input);
    if (!("corridor" in r)) throw new Error(r.reason);
    return { corridor: r.corridor, input };
  }
  function bridge(id = 5, y = 0, edgeId = 1, from = 1, to = 2): NetworkConnection {
    const crossingInput = { ...source, id, arcLengthMeters: y + 100 };
    const r = createProvisionalRiverCrossing({ ...crossingInput, waterIndex: water });
    if (!("candidate" in r)) throw new Error(r.reason);
    const c = r.candidate;
    return {
      id: edgeId,
      from,
      to,
      bidirectional: true,
      kind: "bridge",
      crossing: c,
      crossingInput,
      approachA: corridor([[30, y], c.approachA], [-1, 0]),
      approachB: corridor([[-30, y], c.approachB], [1, 0]),
      constructionCostMeters: 20,
      useCostMeters: 3
    };
  }
  const nodes: NetworkNode[] = [
    { id: 1, point: [30, 0] },
    { id: 2, point: [-30, 0] }
  ];
  const input = {
    nodes,
    connections: [bridge()],
    roadWidthMeters: 2,
    maxNodes: 100,
    maxEdges: 100,
    maxCorridorPieces: 1000,
    maxGuideNodes: 1000,
    maxGuideEdges: 5000,
    environment
  };
  const searchSettings = { maxLabels: 1000, maxExpansions: 1000, historyCountCap: 2, repeatCrossingCostMeters: 10 };
  function build(i = input) {
    const r = buildConstrainedLandNetwork(i);
    expect(r).toHaveProperty("network");
    if (!("network" in r)) throw new Error(r.reason);
    return r.network;
  }
  function search(network = build(), extra = {}) {
    return findConstrainedLandRoute(network, {
      startNodeId: 1,
      goalNodeId: 2,
      settings: searchSettings,
      environment,
      ...extra
    });
  }
  return { source, environment, corridor, bridge, input, build, search, searchSettings };
}
describe("atomic bridge network and direction/history search", () => {
  it("rechecks whole-water passage policy and does not silently drop a required callback", () => {
    const f = fixture();
    let allowed = true;
    const environment = { ...f.environment, allowsBridgeFootprint: () => allowed };
    const result = buildConstrainedLandNetwork({ ...f.input, environment });
    if (!("network" in result)) throw new Error(result.reason);
    const query = { startNodeId: 1, goalNodeId: 2, settings: f.searchSettings, environment };
    expect(findConstrainedLandRoute(result.network, query)).toHaveProperty("route");
    allowed = false;
    expect(findConstrainedLandRoute(result.network, query)).toMatchObject({ reason: "invalid-geometry" });
    expect(findConstrainedLandRoute(result.network, { ...query, environment: f.environment })).toMatchObject({
      reason: "invalid-geometry"
    });
  });
  it("checks an isolated public endpoint even for a zero-edge route", () => {
    const f = fixture(),
      n = f.build({ ...f.input, connections: [] });
    expect(f.search(n, { goalNodeId: 1 })).toHaveProperty("route.distanceMeters", 0);
    f.environment.supportsDryFootprint = () => false;
    expect(f.search(n, { goalNodeId: 1 })).toMatchObject({ reason: "invalid-geometry" });
    expect(
      buildConstrainedLandNetwork({ ...f.input, connections: [], nodes: [{ id: 1, point: [0, 0] }] })
    ).toMatchObject({ reason: "invalid-junction" });
  });
  it("rejects public branch nodes on the bridge seats or E, and bounds source geometry", () => {
    const f = fixture();
    expect(
      buildConstrainedLandNetwork({ ...f.input, nodes: [...f.input.nodes, { id: 9, point: [10, 0] }] })
    ).toMatchObject({ reason: "invalid-junction" });
    expect(buildConstrainedLandNetwork({ ...f.input, maxGuideNodes: 1 })).toMatchObject({ reason: "graph-budget" });
    expect(buildConstrainedLandNetwork({ ...f.input, maxCorridorPieces: 1 })).toMatchObject({ reason: "graph-budget" });
  });
  it("charges a shared facility's construction once while charging every crossing", () => {
    const f = fixture();
    const a = f.bridge(),
      b = f.bridge(5, 0, 3, 3, 4);
    const land: NetworkConnection = {
      id: 2,
      from: 2,
      to: 3,
      bidirectional: false,
      kind: "land",
      land: f.corridor(
        [
          [-30, 0],
          [-50, 0],
          [-50, 120],
          [50, 120],
          [50, 0],
          [30, 0]
        ],
        [-1, 0]
      )
    };
    const n = f.build({
      ...f.input,
      nodes: [...f.input.nodes, { id: 3, point: [30, 0] }, { id: 4, point: [-30, 0] }],
      connections: [a, land, b]
    });
    const r = f.search(n, { goalNodeId: 4 });
    expect(r).toHaveProperty("route");
    if ("route" in r) {
      expect(r.route.facilityIds).toEqual([5]);
      expect(r.route.costMeters - r.route.distanceMeters).toBeCloseTo(36, 8);
      expect(r.route.crossingHistory[0].count).toBe(2);
    }
  });
  it("keeps the bridge and both approaches atomic with no internal branch nodes", () => {
    const f = fixture(),
      n = f.build(),
      r = f.search(n);
    expect(n.nodes).toHaveLength(2);
    expect(n.edges).toHaveLength(2);
    expect(r).toHaveProperty("route.distanceMeters", 60);
    expect(r).toHaveProperty("route.costMeters", 83);
    expect(n.edges[0].pieces).toHaveLength(3);
    expect(n.edges[0].pieces[1]).toMatchObject({ start: [10, 0], end: [-10, 0] });
  });
  it("supports reverse traversal with reversed geometry, bank references and tangent", () => {
    const f = fixture(),
      r = f.search(f.build(), { startNodeId: 2, goalNodeId: 1, startTangent: [1, 0], goalTangent: [1, 0] });
    expect(r).toHaveProperty("route.costMeters", 83);
    if ("route" in r) {
      expect(r.route.edges[0].reverse).toBe(true);
      expect(r.route.crossingHistory[0].fromBank).toBe("left");
      expect(r.route.crossingHistory[0].toBank).toBe("right");
    }
  });
  it("rejects mismatching start/goal directions and does not insert a junction kink", () => {
    const f = fixture();
    expect(f.search(f.build(), { startTangent: [0, 1] })).toMatchObject({ reason: "no-route" });
    expect(f.search(f.build(), { goalTangent: [0, 1] })).toMatchObject({ reason: "no-route" });
  });
  it("revalidates current bridge versions, capability and dry approaches before search", () => {
    const f = fixture(),
      n = f.build();
    f.environment.crossingInputAt = () => ({
      ...f.source,
      geometry: { ...f.source.geometry, axis: { ...f.source.geometry.axis, geometryVersion: 2 } }
    });
    expect(f.search(n)).toMatchObject({ reason: "invalid-geometry" });
    f.environment.crossingInputAt = () => f.source;
    f.environment.supportsDryFootprint = () => false;
    expect(f.search(n)).toMatchObject({ reason: "invalid-geometry" });
  });
  it("does not accept a copied/serialized network as a validated session snapshot", () => {
    const f = fixture();
    expect(f.search(structuredClone(f.build()))).toMatchObject({ reason: "unvalidated-network" });
  });
  it("requires positive use costs and valid complete approach geometry", () => {
    const f = fixture(),
      c = f.input.connections[0];
    if (c.kind !== "bridge") throw new Error("fixture");
    expect(buildConstrainedLandNetwork({ ...f.input, connections: [{ ...c, useCostMeters: 0 }] })).toMatchObject({
      reason: "invalid-bridge"
    });
    const bad = structuredClone(c.approachA.corridor);
    bad.pieces[0].end[1] += 1;
    expect(
      buildConstrainedLandNetwork({ ...f.input, connections: [{ ...c, approachA: { ...c.approachA, corridor: bad } }] })
    ).toMatchObject({ reason: "invalid-bridge" });
  });
  it("allows necessary finite-cost repeat crossings with saturated river history", () => {
    const f = fixture();
    const b1 = f.bridge(),
      b2 = f.bridge(6, 40, 3, 4, 3);
    const land: NetworkConnection = {
      id: 2,
      from: 2,
      to: 3,
      bidirectional: false,
      kind: "land",
      land: f.corridor(
        [
          [-30, 0],
          [-50, 0],
          [-50, 40],
          [-30, 40]
        ],
        [1, 0]
      )
    };
    const n = f.build({
      ...f.input,
      nodes: [...f.input.nodes, { id: 3, point: [-30, 40] }, { id: 4, point: [30, 40] }],
      connections: [b1, land, b2]
    });
    f.environment.crossingInputAt = id => ({ ...f.source, id, arcLengthMeters: id === 6 ? 140 : 100 });
    const r = f.search(n, { goalNodeId: 4, settings: { ...f.searchSettings, historyCountCap: 1 } });
    expect(r).toHaveProperty("route");
    if ("route" in r) {
      expect(r.route.facilityIds).toEqual([5, 6]);
      expect(r.route.crossingHistory[0]).toMatchObject({
        riverId: 7,
        count: 1,
        arcLengthMeters: 140,
        fromBank: "left",
        toBank: "right"
      });
      expect(r.route.costMeters - r.route.distanceMeters).toBeCloseTo(56, 8);
    }
  });
  it("keeps a feasible incoming direction when a cheaper arrival cannot take the next edge", () => {
    const f = fixture();
    const p = (id: number, from: number, to: number, points: RiverPoint[], t: RiverPoint): NetworkConnection => ({
      id,
      from,
      to,
      bidirectional: false,
      kind: "land",
      land: f.corridor(points, t)
    });
    const n = f.build({
      ...f.input,
      nodes: [
        { id: 1, point: [30, -20] },
        { id: 2, point: [30, 0] },
        { id: 3, point: [10, 0] }
      ],
      connections: [
        p(
          1,
          1,
          2,
          [
            [30, -20],
            [30, 0]
          ],
          [0, 1]
        ),
        p(
          2,
          1,
          2,
          [
            [30, -20],
            [50, -20],
            [50, 0],
            [30, 0]
          ],
          [-1, 0]
        ),
        p(
          3,
          2,
          3,
          [
            [30, 0],
            [10, 0]
          ],
          [-1, 0]
        )
      ]
    });
    expect(f.search(n, { goalNodeId: 3 })).toHaveProperty("route.edges");
  });
  it("reports graph/search budgets and numeric cost overflow distinctly", () => {
    const f = fixture();
    expect(buildConstrainedLandNetwork({ ...f.input, maxEdges: 1 })).toMatchObject({ reason: "graph-budget" });
    expect(f.search(f.build(), { settings: { ...f.searchSettings, maxLabels: 1 } })).toMatchObject({
      reason: "search-budget"
    });
    const c = f.input.connections[0];
    if (c.kind !== "bridge") throw new Error("fixture");
    const n = f.build({ ...f.input, connections: [{ ...c, useCostMeters: 1e308, constructionCostMeters: 1e308 }] });
    expect(f.search(n)).toMatchObject({ reason: "invalid-cost" });
  });
  it("is deterministic, deep frozen and independent of source mutation and RNG", () => {
    const f = fixture(),
      before = structuredClone(f.input.nodes);
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG");
    });
    try {
      const n = f.build();
      expect(f.search(n)).toEqual(f.search(n));
      f.input.nodes[0].point[0] = 99;
      expect(n.nodes).toEqual(before);
      expect(Object.isFrozen(n.edges[0].pieces[0].start)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
