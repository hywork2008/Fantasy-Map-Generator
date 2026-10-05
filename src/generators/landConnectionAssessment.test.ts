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
import { assessLandConnection } from "./landConnectionAssessment";
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
  const environment = {
    water: PhysicalWaterIndex.build([source.geometry.water], new PhysicalWaterValidationCache())!,
    supportsDryFootprint: () => true,
    crossingInputAt: (id: number) => ({ ...source, id, arcLengthMeters: id === 6 ? 140 : 100 })
  };
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
    const crossingInput = { ...source, id, arcLengthMeters: 100 + y };
    const r = createProvisionalRiverCrossing({ ...crossingInput, waterIndex: environment.water });
    if (!("candidate" in r)) throw new Error(r.reason);
    return {
      kind: "bridge",
      id: edgeId,
      from,
      to,
      bidirectional: true,
      crossing: r.candidate,
      crossingInput,
      approachA: corridor([[30, y], r.candidate.approachA], [-1, 0]),
      approachB: corridor([[-30, y], r.candidate.approachB], [1, 0]),
      constructionCostMeters: 20,
      useCostMeters: 3
    };
  }
  const nodes: NetworkNode[] = [
    { id: 1, point: [30, 0] },
    { id: 2, point: [-30, 0] }
  ];
  const detour: NetworkConnection = {
    id: 2,
    from: 1,
    to: 2,
    bidirectional: true,
    kind: "land",
    land: corridor(
      [
        [30, 0],
        [50, 0],
        [50, 120],
        [-50, 120],
        [-50, 0],
        [-30, 0]
      ],
      [1, 0]
    )
  };
  const connections = [bridge(), detour];
  function build(es = connections, ns = nodes) {
    const r = buildConstrainedLandNetwork({
      nodes: ns,
      connections: es,
      roadWidthMeters: 2,
      maxNodes: 100,
      maxEdges: 100,
      maxCorridorPieces: 1000,
      maxGuideNodes: 1000,
      maxGuideEdges: 5000,
      environment
    });
    if (!("network" in r)) throw new Error(r.reason);
    return r.network;
  }
  const searchSettings = { maxLabels: 2000, maxExpansions: 2000, historyCountCap: 2, repeatCrossingCostMeters: 10 };
  const input = {
    startNodeId: 1,
    goalNodeId: 2,
    baselineConnectionIds: [2],
    candidateConnectionIds: [1, 2],
    searchSettings,
    settings: {
      minimumImprovementMeters: 1,
      nearEqualCostMeters: 1,
      maxConstructionCostMeters: 100,
      maxRouteCostMeters: 1000,
      maxSearches: 3
    },
    environment
  };
  function repeats() {
    const b1 = bridge(),
      b2 = bridge(6, 40, 3, 4, 3);
    const land: NetworkConnection = {
      id: 2,
      from: 2,
      to: 3,
      bidirectional: false,
      kind: "land",
      land: corridor(
        [
          [-30, 0],
          [-50, 0],
          [-50, 40],
          [-30, 40]
        ],
        [1, 0]
      )
    };
    return {
      edges: [b1, land, b2],
      nodes: [...nodes, { id: 3, point: [-30, 40] as RiverPoint }, { id: 4, point: [30, 40] as RiverPoint }]
    };
  }
  return { source, environment, corridor, bridge, build, input, detour, repeats, nodes };
}
describe("bounded whole-route land connection proposal assessment", () => {
  it("charges new approach works even when the shared bridge itself is already paid", () => {
    const f = fixture(),
      b = f.bridge();
    if (b.kind !== "bridge") throw new Error("fixture");
    const n = f.build([b, { ...b, id: 3, approachConstructionCostMeters: 5 }]);
    const r = findConstrainedLandRoute(n, {
      startNodeId: 1,
      goalNodeId: 2,
      settings: f.input.searchSettings,
      environment: f.environment,
      allowedConnectionIds: [3],
      alreadyPaidFacilityIds: [5]
    });
    expect(r).toHaveProperty("route.costs", { travelMeters: 63, constructionMeters: 5, repeatCrossingMeters: 0 });
    expect(
      findConstrainedLandRoute(n, {
        startNodeId: 1,
        goalNodeId: 2,
        settings: f.input.searchSettings,
        environment: f.environment,
        allowedConnectionIds: [3],
        alreadyPaidFacilityIds: [5],
        alreadyPaidConnectionIds: [3]
      })
    ).toHaveProperty("route.costMeters", 63);
  });
  it("accepts a beneficial bridge package and separates travel score from construction", () => {
    const f = fixture(),
      r = assessLandConnection(f.build(), f.input);
    expect(r.status).toBe("proposed");
    if (r.status === "proposed") {
      expect(r.newFacilityIds).toEqual([5]);
      expect(r.newConnectionIds).toEqual([1]);
      expect(r.route.costs).toEqual({ travelMeters: 63, constructionMeters: 20, repeatCrossingMeters: 0 });
      expect(r.route.costMeters).toBe(83);
      expect(r.travelSavingMeters! - r.netImprovementMeters!).toBeCloseTo(20, 8);
    }
  });
  it("requires improvement strictly beyond the configured margin", () => {
    const f = fixture(),
      n = f.build();
    const initial = assessLandConnection(n, f.input);
    if (initial.status !== "proposed") throw new Error("fixture");
    expect(
      assessLandConnection(n, {
        ...f.input,
        settings: { ...f.input.settings, minimumImprovementMeters: initial.netImprovementMeters! }
      })
    ).toMatchObject({ status: "keep-baseline", reason: "insufficient-improvement" });
  });
  it("does not interpret an absent baseline as infinite benefit", () => {
    const f = fixture(),
      n = f.build([f.bridge()]);
    const i = { ...f.input, baselineConnectionIds: [], candidateConnectionIds: [1] };
    expect(assessLandConnection(n, { ...i, settings: { ...i.settings, maxRouteCostMeters: 80 } })).toMatchObject({
      status: "rejected",
      reason: "no-feasible-proposal"
    });
    const r = assessLandConnection(n, i);
    expect(r).toMatchObject({ status: "proposed", travelSavingMeters: null, netImprovementMeters: null });
  });
  it("finds a costlier low-investment road instead of a cheaper bridge outside the investment cap", () => {
    const f = fixture();
    const road = { ...f.detour, constructionCostMeters: 5 };
    const r = assessLandConnection(f.build([f.bridge(), road]), {
      ...f.input,
      baselineConnectionIds: [],
      settings: { ...f.input.settings, maxConstructionCostMeters: 10 }
    });
    expect(r).toMatchObject({
      status: "proposed",
      newFacilityIds: [],
      newConnectionIds: [2],
      route: { costs: { constructionMeters: 5 } }
    });
  });
  it("keeps existing bridges available without charging their construction again", () => {
    const f = fixture();
    const r = assessLandConnection(f.build([f.bridge()]), {
      ...f.input,
      baselineConnectionIds: [1],
      candidateConnectionIds: [1]
    });
    expect(r.status).toBe("keep-baseline");
    if (r.status === "keep-baseline")
      expect(r.route.costs).toEqual({ travelMeters: 63, constructionMeters: 0, repeatCrossingMeters: 0 });
  });
  it("prefers a nearly equal complete bridge-free route for a same-bank pair", () => {
    const f = fixture(),
      p = f.repeats();
    const n = f.build(p.edges, p.nodes);
    const route = findConstrainedLandRoute(n, {
      startNodeId: 1,
      goalNodeId: 4,
      settings: f.input.searchSettings,
      environment: f.environment
    });
    if (!("route" in route)) throw new Error("fixture");
    const direct: NetworkConnection = {
      kind: "land",
      id: 4,
      from: 1,
      to: 4,
      bidirectional: false,
      land: f.corridor(
        [
          [30, 0],
          [30, 40]
        ],
        [0, 1]
      ),
      constructionCostMeters: route.route.costMeters - 40 + 0.5
    };
    const r = assessLandConnection(f.build([...p.edges, direct], p.nodes), {
      ...f.input,
      goalNodeId: 4,
      baselineConnectionIds: [],
      candidateConnectionIds: [1, 2, 3, 4],
      settings: { ...f.input.settings, maxConstructionCostMeters: 1000 }
    });
    expect(r).toMatchObject({ status: "proposed", newFacilityIds: [], newConnectionIds: [4] });
    if (r.status === "proposed") expect(r.route.edges.every(e => !e.crossing)).toBe(true);
  });
  it("retains necessary multiple crossings and evaluates their construction as one package", () => {
    const f = fixture(),
      p = f.repeats(),
      n = f.build(p.edges, p.nodes);
    const i = { ...f.input, goalNodeId: 4, baselineConnectionIds: [], candidateConnectionIds: [1, 2, 3] };
    expect(assessLandConnection(n, i)).toMatchObject({
      status: "proposed",
      newFacilityIds: [5, 6],
      route: { costs: { constructionMeters: 40, repeatCrossingMeters: 10 } }
    });
    expect(assessLandConnection(n, { ...i, settings: { ...i.settings, maxConstructionCostMeters: 30 } })).toMatchObject(
      { status: "rejected", reason: "no-feasible-proposal" }
    );
  });
  it("does not certify a comparison stopped by search or comparison budgets", () => {
    const f = fixture(),
      n = f.build();
    expect(assessLandConnection(n, { ...f.input, settings: { ...f.input.settings, maxSearches: 2 } })).toMatchObject({
      status: "unresolved",
      reason: "comparison-budget"
    });
    expect(
      assessLandConnection(n, { ...f.input, searchSettings: { ...f.input.searchSettings, maxLabels: 1 } })
    ).toMatchObject({ status: "unresolved", reason: "search-budget" });
  });
  it("rejects missing availability IDs, candidate sets omitting baseline and nonfinite limits", () => {
    const f = fixture(),
      n = f.build();
    for (const i of [
      { ...f.input, baselineConnectionIds: [99] },
      { ...f.input, candidateConnectionIds: [1] },
      { ...f.input, settings: { ...f.input.settings, maxRouteCostMeters: Infinity } }
    ])
      expect(assessLandConnection(n, i)).toMatchObject({ status: "unresolved", reason: "invalid-input" });
  });
  it("blocks stale or unsupported geometry rather than adopting a partial comparison", () => {
    const f = fixture(),
      n = f.build();
    f.environment.supportsDryFootprint = () => false;
    expect(assessLandConnection(n, f.input)).toMatchObject({ status: "unresolved", reason: "invalid-geometry" });
  });
  it("does not mutate the candidate graph, availability or RNG", () => {
    const f = fixture(),
      n = f.build(),
      before = structuredClone(f.input.candidateConnectionIds);
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG");
    });
    try {
      expect(assessLandConnection(n, f.input)).toEqual(assessLandConnection(n, f.input));
      expect(f.input.candidateConnectionIds).toEqual(before);
      expect(Object.isFrozen(n.edges)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
