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
import { selectSharedFacilityGroups } from "./landConnectionSelection";
import { compareLandRouteAlternatives } from "./landRouteAlternatives";
import { type CrossingCandidateInput, createProvisionalRiverCrossing } from "./riverCrossingCandidates";
import { assessSharedLandConnections } from "./sharedLandConnectionAssessment";

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
function fixture(secondRiver = false) {
  const geometry = (id: number, x: number) => ({
    axis: buildPolylineRiverAxis(id, 1, [
      [x, -100],
      [x, 100]
    ])!,
    water: {
      id,
      rings: [
        [
          [x - 5, -100],
          [x + 5, -100],
          [x + 5, 100],
          [x - 5, 100]
        ]
      ] as RiverPoint[][],
      bankReferences: [
        [
          null,
          { side: "right" as const, arcStart: 0, arcEnd: 200 },
          null,
          { side: "left" as const, arcStart: 200, arcEnd: 0 }
        ]
      ]
    }
  });
  const rivers = [geometry(7, 0), ...(secondRiver ? [geometry(8, 100)] : [])],
    sources = new Map<number, CrossingCandidateInput>();
  const environment = {
    water: PhysicalWaterIndex.build(
      rivers.map(g => g.water),
      new PhysicalWaterValidationCache()
    )!,
    supportsDryFootprint: () => true,
    crossingInputAt: (id: number) => sources.get(id) ?? null
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
  function bridge(
    id: number,
    riverId: number,
    x: number,
    y: number,
    edgeId: number,
    from: number,
    to: number,
    constructionCostMeters = 20
  ): NetworkConnection {
    const source: CrossingCandidateInput = {
      id,
      geometry: rivers.find(g => g.axis.riverId === riverId)!,
      arcLengthMeters: 100 + y,
      dimensions: { bankSeatMeters: 1, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 5 },
      otherWater: [],
      capability: { depthMeters: 3 },
      supportsDryFootprint: () => true
    };
    sources.set(id, source);
    const r = createProvisionalRiverCrossing({ ...source, waterIndex: environment.water });
    if (!("candidate" in r)) throw new Error(r.reason);
    return {
      id: edgeId,
      kind: "bridge",
      from,
      to,
      bidirectional: true,
      crossing: r.candidate,
      crossingInput: source,
      approachA: corridor([[x + 30, y], r.candidate.approachA], [-1, 0]),
      approachB: corridor([[x - 30, y], r.candidate.approachB], [1, 0]),
      constructionCostMeters,
      useCostMeters: 3
    };
  }
  function land(
    id: number,
    from: number,
    to: number,
    points: RiverPoint[],
    t: RiverPoint,
    constructionCostMeters = 0
  ): NetworkConnection {
    return { kind: "land", id, from, to, bidirectional: false, land: corridor(points, t), constructionCostMeters };
  }
  function build(nodes: NetworkNode[], connections: NetworkConnection[]) {
    const r = buildConstrainedLandNetwork({
      nodes,
      connections,
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
  const searchSettings = { maxLabels: 5000, maxExpansions: 5000, historyCountCap: 2, repeatCrossingCostMeters: 10 };
  return { environment, sources, corridor, bridge, land, build, searchSettings };
}
function returnFixture(withAlternative = true) {
  const f = fixture(true);
  const nodes: NetworkNode[] = [
    { id: 1, point: [30, 0] },
    { id: 2, point: [-30, 0] },
    { id: 3, point: [-30, 40] },
    { id: 4, point: [30, 40] },
    { id: 5, point: [70, 40] },
    { id: 6, point: [130, 40] }
  ];
  const connections = [
    f.bridge(5, 7, 0, 0, 1, 1, 2),
    f.land(
      2,
      2,
      3,
      [
        [-30, 0],
        [-50, 0],
        [-50, 40],
        [-30, 40]
      ],
      [1, 0]
    ),
    f.bridge(6, 7, 0, 40, 3, 4, 3),
    f.land(
      4,
      4,
      5,
      [
        [30, 40],
        [70, 40]
      ],
      [1, 0]
    ),
    f.bridge(7, 8, 100, 40, 5, 6, 5)
  ];
  const query = {
    startNodeId: 1,
    goalNodeId: 6,
    startTangent: [-1, 0] as RiverPoint,
    goalTangent: [1, 0] as RiverPoint,
    settings: f.searchSettings,
    environment: f.environment,
    maxConstructionCostMeters: 2000,
    maxRouteCostMeters: 5000
  };
  if (withAlternative) {
    const n = f.build(nodes, connections),
      original = findConstrainedLandRoute(n, query);
    if (!("route" in original)) throw new Error(original.reason);
    const alternative = f.land(
      6,
      1,
      4,
      [
        [30, 0],
        [10, 0],
        [10, 40],
        [30, 40]
      ],
      [1, 0]
    );
    if (alternative.kind !== "land") throw new Error("fixture");
    const necessary = original.route.edges
      .filter(e => e.id === 4 || e.id === 5)
      .reduce(
        (sum, e) =>
          sum + e.costMeters + (e.crossing ? e.crossing.constructionCostMeters + e.crossing.useCostMeters : 0),
        0
      );
    alternative.constructionCostMeters =
      original.route.costMeters - necessary - alternative.land.corridor.costMeters + 0.5;
    connections.push(alternative);
  }
  return { ...f, network: f.build(nodes, connections), query };
}
describe("whole-route same-river return counterfactuals", () => {
  it("removes a near-equal return while preserving a required bridge on another river", () => {
    const f = returnFixture();
    const before = compareLandRouteAlternatives(f.network, {
      query: f.query,
      nearEqualCostMeters: 1,
      maxSearches: 2,
      maxReturnComparisons: 0
    });
    expect(before).toHaveProperty("route.facilityIds", [5, 6, 7]);
    const r = compareLandRouteAlternatives(f.network, {
      query: f.query,
      nearEqualCostMeters: 1,
      maxSearches: 3,
      maxReturnComparisons: 1
    });
    expect(r).toHaveProperty("route.facilityIds", [7]);
    if ("route" in r) {
      expect(r.route.edges.map(e => e.id)).toEqual([6, 4, 5]);
      expect(r.route.crossingHistory).toHaveLength(1);
      expect(r.route.crossingHistory[0].riverId).toBe(8);
      expect(r.comparison.bridgeFree).toMatchObject({ reason: "no-route" });
      expect(r.comparison.riverReturns).toHaveLength(1);
    }
  });
  it("keeps necessary returns when the finite graph has no same-bank alternative", () => {
    const f = returnFixture(false);
    expect(
      compareLandRouteAlternatives(f.network, {
        query: f.query,
        nearEqualCostMeters: 1,
        maxSearches: 3,
        maxReturnComparisons: 1
      })
    ).toHaveProperty("route.facilityIds", [5, 6, 7]);
  });
  it("keeps a return when its dry alternative is outside the near-equal tolerance", () => {
    const f = returnFixture();
    expect(
      compareLandRouteAlternatives(f.network, {
        query: f.query,
        nearEqualCostMeters: 0.1,
        maxSearches: 3,
        maxReturnComparisons: 1
      })
    ).toHaveProperty("route.facilityIds", [5, 6, 7]);
  });
  it("reports exhausted comparisons instead of certifying a partial route", () => {
    const f = returnFixture();
    expect(
      compareLandRouteAlternatives(f.network, {
        query: f.query,
        nearEqualCostMeters: 1,
        maxSearches: 2,
        maxReturnComparisons: 1
      })
    ).toMatchObject({ reason: "comparison-budget" });
  });
  it("connects the return pass to the single-pair proposal gate with fresh geometry", () => {
    const f = returnFixture();
    const input = {
      startNodeId: 1,
      goalNodeId: 6,
      startTangent: f.query.startTangent,
      goalTangent: f.query.goalTangent,
      baselineConnectionIds: [],
      candidateConnectionIds: [1, 2, 3, 4, 5, 6],
      searchSettings: f.searchSettings,
      settings: {
        minimumImprovementMeters: 1,
        nearEqualCostMeters: 1,
        maxConstructionCostMeters: 2000,
        maxRouteCostMeters: 5000,
        maxSearches: 4,
        maxReturnComparisons: 1
      },
      environment: f.environment
    };
    expect(assessLandConnection(f.network, input)).toMatchObject({ status: "proposed", newFacilityIds: [7] });
    f.environment.supportsDryFootprint = () => false;
    expect(assessLandConnection(f.network, input)).toMatchObject({ status: "unresolved", reason: "invalid-geometry" });
  });
});
function sharedFixture() {
  const f = fixture();
  const nodes: NetworkNode[] = [
    { id: 1, point: [30, 0] },
    { id: 2, point: [-30, 0] },
    { id: 3, point: [40, 0] },
    { id: 4, point: [50, 0] }
  ];
  const connections = [
    f.bridge(5, 7, 0, 0, 1, 1, 2, 500),
    f.land(
      2,
      3,
      2,
      [
        [40, 0],
        [60, 0],
        [60, 120],
        [-50, 120],
        [-50, 0],
        [-30, 0]
      ],
      [1, 0]
    ),
    f.land(
      3,
      3,
      1,
      [
        [40, 0],
        [30, 0]
      ],
      [-1, 0]
    ),
    f.land(
      4,
      4,
      3,
      [
        [50, 0],
        [40, 0]
      ],
      [-1, 0]
    ),
    f.land(
      5,
      4,
      2,
      [
        [50, 0],
        [70, 0],
        [70, 120],
        [-50, 120],
        [-50, 0],
        [-30, 0]
      ],
      [1, 0]
    )
  ];
  const network = f.build(nodes, connections);
  const input = {
    pairs: [
      { id: 1, startNodeId: 3, goalNodeId: 2, weight: 1, unconnectedAllowanceMeters: 0 },
      { id: 2, startNodeId: 4, goalNodeId: 2, weight: 1, unconnectedAllowanceMeters: 0 }
    ],
    baselineConnectionIds: [2, 3, 4, 5],
    candidateConnectionIds: [1, 2, 3, 4, 5],
    sharedFacilityIds: [5],
    settings: {
      maxPairs: 4,
      maxSearches: 6,
      maxReturnComparisons: 0,
      nearEqualCostMeters: 1,
      maxConstructionCostMeters: 600,
      maxPairCostMeters: 1000,
      maxTotalCostMeters: 2000,
      minimumNetBenefitMeters: 1
    },
    searchSettings: f.searchSettings,
    environment: f.environment
  };
  return { ...f, network, input, nodes, connections };
}
describe("bounded shared-bridge proposal packages", () => {
  it("selects and evaluates a complete two-river bundle when individual construction is unaffordable", () => {
    const f = fixture(true);
    const nodes: NetworkNode[] = [
      { id: 1, point: [30, 0] },
      { id: 2, point: [-30, 0] },
      { id: 3, point: [70, 0] },
      { id: 4, point: [130, 0] },
      { id: 5, point: [140, 0] }
    ];
    const network = f.build(nodes, [
      f.bridge(5, 7, 0, 0, 1, 1, 2, 80),
      f.bridge(6, 8, 100, 0, 2, 4, 3, 80),
      f.land(
        3,
        3,
        1,
        [
          [70, 0],
          [30, 0]
        ],
        [-1, 0]
      ),
      f.land(
        4,
        5,
        4,
        [
          [140, 0],
          [130, 0]
        ],
        [-1, 0]
      )
    ]);
    const pairs = [
      { id: 1, cityAId: 4, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 1000 },
      { id: 2, cityAId: 5, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 1000 }
    ];
    const bundles = pairs.map(pair => {
      const route = findConstrainedLandRoute(network, {
        startNodeId: pair.cityAId,
        goalNodeId: pair.cityBId,
        settings: f.searchSettings,
        environment: f.environment,
        allowedConnectionIds: [1, 2, 3, 4],
        alreadyPaidConnectionIds: [3, 4],
        alreadyPaidFacilityIds: [5, 6],
        maxConstructionCostMeters: 300,
        maxRouteCostMeters: 500
      });
      if (!("route" in route)) throw new Error(route.reason);
      expect(route.route.facilityIds).toEqual([5, 6]);
      return { pairId: pair.id, facilityIds: route.route.facilityIds };
    });
    const selection = selectSharedFacilityGroups(network, pairs, [3, 4], bundles, {
      maxGroups: 3,
      maxPairsPerGroup: 2,
      maxFacilitiesPerGroup: 2,
      maxChecks: 1000
    });
    if (selection.status !== "selected") throw new Error(selection.reason);
    const group = selection.groups.find(group => group.facilityIds.length === 2)!;
    const assessment = assessSharedLandConnections(network, {
      pairs: pairs.map(pair => ({ ...pair, startNodeId: pair.cityAId, goalNodeId: pair.cityBId })),
      baselineConnectionIds: [3, 4],
      candidateConnectionIds: group.connectionIds,
      sharedFacilityIds: group.facilityIds,
      settings: {
        maxPairs: 2,
        maxSearches: 10,
        maxReturnComparisons: 0,
        nearEqualCostMeters: 1,
        maxConstructionCostMeters: 300,
        maxPairCostMeters: 500,
        maxTotalCostMeters: 1000,
        minimumNetBenefitMeters: 1
      },
      searchSettings: f.searchSettings,
      environment: f.environment
    });
    expect(assessment).toMatchObject({ status: "proposed", newFacilityIds: [5, 6], investmentMeters: 160 });
    expect(
      assessLandConnection(network, {
        startNodeId: 4,
        goalNodeId: 2,
        baselineConnectionIds: [3, 4],
        candidateConnectionIds: [1, 2, 3, 4],
        searchSettings: f.searchSettings,
        environment: f.environment,
        settings: {
          minimumImprovementMeters: 1,
          nearEqualCostMeters: 1,
          maxConstructionCostMeters: 50,
          maxRouteCostMeters: 500,
          maxSearches: 4,
          maxReturnComparisons: 0
        }
      })
    ).toMatchObject({ status: "rejected" });
  });

  it("counts shared approach connections once, separately from the bridge body", () => {
    const f = sharedFixture();
    const connections = f.connections.map(e => (e.id === 3 || e.id === 4 ? { ...e, constructionCostMeters: 10 } : e));
    const n = f.build(f.nodes, connections);
    expect(assessSharedLandConnections(n, { ...f.input, baselineConnectionIds: [2, 5] })).toMatchObject({
      status: "proposed",
      investmentMeters: 520,
      newConnectionIds: [1, 3, 4],
      operatingScoreMeters: 156
    });
  });
  it("does not bypass a pair cost cap by falling back to an expensive baseline", () => {
    const f = sharedFixture();
    expect(
      assessSharedLandConnections(f.network, { ...f.input, settings: { ...f.input.settings, maxPairCostMeters: 70 } })
    ).toMatchObject({ status: "rejected", reason: "pair-cost-budget" });
  });
  it("finds a beneficial shared package that individual construction pricing does not propose", () => {
    const f = sharedFixture();
    for (const p of f.input.pairs)
      expect(
        assessLandConnection(f.network, {
          ...p,
          baselineConnectionIds: f.input.baselineConnectionIds,
          candidateConnectionIds: f.input.candidateConnectionIds,
          searchSettings: f.searchSettings,
          environment: f.environment,
          settings: {
            minimumImprovementMeters: 1,
            nearEqualCostMeters: 1,
            maxConstructionCostMeters: 600,
            maxRouteCostMeters: 1000,
            maxSearches: 3
          }
        }).status
      ).toBe("keep-baseline");
    const r = assessSharedLandConnections(f.network, f.input);
    expect(r).toMatchObject({
      status: "proposed",
      newFacilityIds: [5],
      newConnectionIds: [1],
      investmentMeters: 500,
      operatingScoreMeters: 156,
      totalScoreMeters: 656,
      searches: 6
    });
    if (r.status === "proposed") expect(r.netBenefitMeters).toBeGreaterThan(1);
  });
  it("rejects the entire package above its actual investment or total-cost cap", () => {
    const f = sharedFixture();
    expect(
      assessSharedLandConnections(f.network, {
        ...f.input,
        settings: { ...f.input.settings, maxConstructionCostMeters: 499 }
      })
    ).toMatchObject({ status: "rejected", reason: "investment-budget" });
    expect(
      assessSharedLandConnections(f.network, { ...f.input, settings: { ...f.input.settings, maxTotalCostMeters: 655 } })
    ).toMatchObject({ status: "rejected", reason: "total-cost-budget" });
  });
  it("requires net benefit strictly beyond the margin after counting investment once", () => {
    const f = sharedFixture(),
      r = assessSharedLandConnections(f.network, f.input);
    if (r.status !== "proposed") throw new Error("fixture");
    expect(
      assessSharedLandConnections(f.network, {
        ...f.input,
        settings: { ...f.input.settings, minimumNetBenefitMeters: r.netBenefitMeters }
      })
    ).toMatchObject({ status: "rejected", reason: "insufficient-benefit" });
  });
  it("uses finite explicit allowances rather than infinite benefit for unconnected pairs", () => {
    const f = sharedFixture(),
      input = { ...f.input, baselineConnectionIds: [] };
    expect(assessSharedLandConnections(f.network, input)).toMatchObject({
      status: "rejected",
      reason: "insufficient-benefit"
    });
    expect(
      assessSharedLandConnections(f.network, {
        ...input,
        pairs: input.pairs.map(p => ({ ...p, unconnectedAllowanceMeters: 400 }))
      })
    ).toMatchObject({ status: "proposed", investmentMeters: 500 });
  });
  it("rejects duplicate/reversed city pairs and invalid weighting or facility input", () => {
    const f = sharedFixture();
    for (const input of [
      { ...f.input, pairs: [f.input.pairs[0], { ...f.input.pairs[0], id: 9, startNodeId: 2, goalNodeId: 3 }] },
      { ...f.input, pairs: f.input.pairs.map(p => ({ ...p, weight: Infinity })) },
      { ...f.input, sharedFacilityIds: [99] }
    ])
      expect(assessSharedLandConnections(f.network, input)).toMatchObject({
        status: "unresolved",
        reason: "invalid-input"
      });
  });
  it("does not silently truncate pair or comparison budgets", () => {
    const f = sharedFixture();
    expect(
      assessSharedLandConnections(f.network, { ...f.input, settings: { ...f.input.settings, maxPairs: 1 } })
    ).toMatchObject({ status: "unresolved", reason: "pair-budget" });
    expect(
      assessSharedLandConnections(f.network, { ...f.input, settings: { ...f.input.settings, maxSearches: 5 } })
    ).toMatchObject({ status: "unresolved", reason: "comparison-budget" });
  });
  it("reports score overflow and stale geometry without registering facilities", () => {
    const f = sharedFixture();
    expect(
      assessSharedLandConnections(f.network, {
        ...f.input,
        pairs: f.input.pairs.map(p => ({ ...p, weight: Number.MAX_VALUE }))
      })
    ).toMatchObject({ status: "unresolved", reason: "invalid-cost" });
    f.environment.supportsDryFootprint = () => false;
    expect(assessSharedLandConnections(f.network, f.input)).toMatchObject({
      status: "unresolved",
      reason: "invalid-geometry"
    });
  });
  it("is stable under pair input ordering and leaves inputs and RNG untouched", () => {
    const f = sharedFixture(),
      before = structuredClone(f.input.pairs);
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG");
    });
    try {
      expect(assessSharedLandConnections(f.network, f.input)).toEqual(
        assessSharedLandConnections(f.network, { ...f.input, pairs: [...f.input.pairs].reverse() })
      );
      expect(f.input.pairs).toEqual(before);
      expect(Object.isFrozen(f.network.edges)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
