import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
import { WorldRiverGeometryRegistry } from "../services/worldRiverGeometry";
import { type ApproachCorridorInput, findApproachCorridor } from "./approachCorridorSearch";
import type { NetworkConnection } from "./constrainedLandNetwork";
import {
  evaluateWorldLandConnectionProposals,
  type WorldConnectionPair,
  type WorldProposalEnvironment,
  type WorldProposalSettings
} from "./worldLandConnectionProposals";

function fixture() {
  const world = {
    distanceScale: 0.001,
    graphWidth: 100,
    graphHeight: 100,
    pack: {
      cells: {
        p: [
          [50, 40],
          [50, 44],
          [50, 48],
          [50, 52],
          [50, 56],
          [50, 60]
        ],
        h: [25, 25, 25, 25, 25, 25],
        fl: [20, 20, 20, 20, 20, 20]
      },
      rivers: [{ i: 7, cells: [0, 1, 2, 3, 4, 5], widthFactor: 0, sourceWidth: 2 }],
      burgs: [{}, { i: 1, x: 85, y: 50, cell: 0 }, { i: 2, x: 15, y: 50, cell: 0 }, { i: 3, x: 80, y: 50, cell: 0 }],
      routes: []
    }
  } as unknown as WorldContext;
  const settings: WorldProposalSettings = {
    crossings: {
      geometry: {
        curveAlpha: 0.1,
        precision: { arcToleranceMeters: 1e-5, maxIntegrationDepth: 24, maxEvaluations: 100000 },
        banks: { maxStepMeters: 5, maxChordErrorMeters: 0.01, maxSamples: 2000 },
        maxSourcePoints: 100
      },
      dimensions: { bankSeatMeters: 2, straightApproachMeters: 5, roadWidthMeters: 2, localWindowMeters: 4 },
      spacingMeters: 12,
      maxRivers: 10,
      maxAttempts: 10,
      firstCandidateId: 100
    },
    approaches: {
      guides: {
        spacingMeters: 5,
        paddingMeters: 5,
        terminalLeadMeters: 5,
        connectorRadiusMeters: 8,
        maxSamples: 1000,
        maxNodes: 1000,
        maxEdges: 10000,
        maxEdgeChecks: 10000
      },
      corridor: {
        roadWidthMeters: 2,
        minimumTurnRadiusMeters: 2,
        minimumStraightMeters: 0,
        minimumFinalStraightMeters: 2,
        turnPenaltyMetersPerRadian: 0,
        maxEnvelopeErrorMeters: 0.05,
        maxArcSections: 100,
        maxNodes: 1000,
        maxEdges: 10000,
        maxLabels: 10000,
        maxExpansions: 10000
      }
    },
    network: { maxNodes: 100, maxEdges: 100, maxCorridorPieces: 1000, maxGuideNodes: 10000, maxGuideEdges: 100000 },
    maxPairs: 5,
    maxApproachAttempts: 20,
    maxAssessmentSearches: 30,
    firstConnectionId: 1000,
    search: { maxLabels: 10000, maxExpansions: 10000, historyCountCap: 2, repeatCrossingCostMeters: 10 },
    individual: {
      minimumImprovementMeters: 1,
      nearEqualCostMeters: 1,
      maxConstructionCostMeters: 100,
      maxRouteCostMeters: 500,
      maxSearches: 4,
      maxReturnComparisons: 1
    },
    shared: {
      maxPairs: 5,
      maxSearches: 20,
      maxReturnComparisons: 1,
      nearEqualCostMeters: 1,
      maxConstructionCostMeters: 100,
      maxPairCostMeters: 500,
      maxTotalCostMeters: 1000,
      minimumNetBenefitMeters: 1
    }
  };
  const environment: WorldProposalEnvironment = {
    nonRiverWater: [],
    supportsDryFootprint: () => true,
    allowsPassageFootprint: () => true,
    capabilityAt: () => ({ depthMeters: 3 }),
    facilityCostsAt: () => ({ constructionCostMeters: 10, useCostMeters: 3 }),
    approachConstructionCostAt: () => 2
  };
  const pairs: WorldConnectionPair[] = [
    { id: 1, cityAId: 1, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 },
    { id: 2, cityAId: 3, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 }
  ];
  const registry = new WorldRiverGeometryRegistry();
  const input = { pairs, baselineConnections: [] as NetworkConnection[], settings, environment, registry };
  const run = () => evaluateWorldLandConnectionProposals(world, "km", input);
  return { world, input, run };
}
describe("world candidates to read-only land connection proposals", () => {
  it("keeps later connection slots stable when an earlier coarse candidate is rejected", () => {
    const f = fixture();
    f.input.settings.crossings.spacingMeters = 4;
    const first = f.run();
    expect(first.status).toBe("evaluated");
    f.input.environment.capabilityAt = (_river, s) => ({ depthMeters: s === 6 ? Infinity : 3 });
    const second = f.run();
    expect(second.status).toBe("evaluated");
    if (first.status === "evaluated" && second.status === "evaluated") {
      expect(first.network.edges.filter(e => e.crossing?.facilityId === 101).map(e => e.id)).toEqual([
        1004, 1004, 1006, 1006
      ]);
      expect(second.network.edges.filter(e => e.crossing?.facilityId === 101).map(e => e.id)).toEqual([
        1004, 1004, 1006, 1006
      ]);
    }
  });
  it("builds both city-pair approaches and evaluates one shared physical bridge", () => {
    const f = fixture(),
      before = structuredClone(f.world);
    const r = f.run();
    expect(r.status).toBe("evaluated");
    if (r.status === "evaluated") {
      expect(r.network.nodes.map(n => n.id)).toEqual([1, 2, 3]);
      expect(r.diagnostics.enumeration?.candidates).toHaveLength(1);
      expect(r.diagnostics.approachAttempts).toBe(4);
      expect(r.network.edges).toHaveLength(4);
      expect(r.diagnostics.individuals.every(p => p.assessment.status === "proposed")).toBe(true);
      expect(r.diagnostics.shared).toMatchObject({ status: "proposed", newFacilityIds: [100], investmentMeters: 14 });
    }
    expect(f.world).toEqual(before);
  });
  it("checks passage over the water between otherwise dry seats, not only polygon vertices", () => {
    const f = fixture();
    f.input.environment.allowsPassageFootprint = p =>
      !(
        Math.min(...p.map(q => q[0])) <= 50 &&
        Math.max(...p.map(q => q[0])) >= 50 &&
        Math.min(...p.map(q => q[1])) <= 50 &&
        Math.max(...p.map(q => q[1])) >= 50
      );
    const r = f.run();
    expect(r.status).toBe("evaluated");
    if (r.status === "evaluated") {
      expect(r.network.edges).toHaveLength(0);
      expect(r.diagnostics.rejected).toEqual([{ facilityId: 100, reason: "passage-blocked" }]);
      expect(r.diagnostics.approachAttempts).toBe(0);
      expect(r.diagnostics.individuals[0].assessment.status).toBe("rejected");
    }
  });
  it("refuses missing registered water and invalid supplied lake geometry", () => {
    const f = fixture();
    f.world.pack.rivers.push({ ...f.world.pack.rivers[0], i: 8, cells: [99, 100] });
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "candidate-enumeration" });
    f.world.pack.rivers.pop();
    f.input.environment.nonRiverWater = [
      {
        id: 99,
        rings: [
          [
            [0, 0],
            [1, 1],
            [2, 2]
          ]
        ]
      }
    ];
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "candidate-enumeration" });
  });
  it("does not treat shared city cells as bank connectivity", () => {
    const f = fixture();
    f.world.pack.burgs[1].x = 15;
    const r = f.run();
    expect(r.status).toBe("evaluated");
    if (r.status === "evaluated") expect(r.diagnostics.individuals[0].assessment.status).toBe("rejected");
  });
  it("bounds pair, orientation-attempt and global assessment work without partial certification", () => {
    const f = fixture();
    f.input.settings.maxPairs = 1;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "pair-budget" });
    f.input.settings.maxPairs = 5;
    f.input.settings.maxApproachAttempts = 3;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "approach-budget" });
    f.input.settings.maxApproachAttempts = 20;
    f.input.settings.maxAssessmentSearches = 1;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "assessment-budget" });
  });
  it("does not certify missing approaches when local guide or search budgets expire", () => {
    const f = fixture();
    f.input.settings.approaches.guides.maxSamples = 1;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "approach-budget" });
    const g = fixture();
    g.input.settings.approaches.corridor.maxExpansions = 1;
    expect(g.run()).toMatchObject({ status: "unresolved", reason: "approach-budget" });
  });
  it("rejects duplicate/reversed city pairs, removed cities and bad cost callbacks", () => {
    const f = fixture();
    f.input.pairs = [f.input.pairs[0], { ...f.input.pairs[0], id: 9, cityAId: 2, cityBId: 1 }];
    expect(f.run()).toMatchObject({ reason: "invalid-input" });
    f.input.pairs = [{ id: 1, cityAId: 1, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 }];
    f.world.pack.burgs[1].removed = true;
    expect(f.run()).toMatchObject({ reason: "invalid-input" });
    f.world.pack.burgs[1].removed = false;
    f.input.environment.facilityCostsAt = () => ({ constructionCostMeters: Infinity, useCostMeters: 3 });
    expect(f.run()).toMatchObject({ reason: "invalid-cost" });
  });
  it("uses explicit baseline corridors and protects reserved connection ID ranges", () => {
    const f = fixture();
    const g = f.input.registry.get(f.world, f.world.pack.rivers[0], "km", f.input.settings.crossings.geometry);
    if (!("geometry" in g)) throw new Error(g.reason);
    const water = f.input.registry.getWaterIndex([g.geometry.water])!;
    const source: ApproachCorridorInput = {
      nodes: [
        { id: 0, point: [85, 50], neighbors: [1] },
        { id: 1, point: [85, 25], neighbors: [2] },
        { id: 2, point: [15, 25], neighbors: [3] },
        { id: 3, point: [15, 50], neighbors: [] }
      ],
      startNodeId: 0,
      goalNodeId: 3,
      goalTangent: [0, 1],
      settings: f.input.settings.approaches.corridor,
      water,
      supportsDryFootprint: () => true
    };
    const route = findApproachCorridor(source);
    if (!("corridor" in route)) throw new Error(route.reason);
    f.input.pairs = [f.input.pairs[0]];
    f.input.baselineConnections = [
      {
        id: 10,
        from: 1,
        to: 2,
        bidirectional: false,
        kind: "land",
        land: { input: source, corridor: route.corridor },
        constructionCostMeters: 1000
      }
    ];
    const r = f.run();
    expect(r).toHaveProperty("diagnostics.individuals.0.assessment.status", "proposed");
    f.input.baselineConnections[0].id = 1000;
    expect(f.run()).toMatchObject({ reason: "invalid-input" });
  });
  it("preserves map-scale equivalence and stable candidate/connection identity", () => {
    const a = fixture(),
      b = fixture();
    b.world.distanceScale = 0.001 / 1.609344;
    const first = a.run(),
      second = evaluateWorldLandConnectionProposals(b.world, "mi", b.input);
    expect(first.status).toBe("evaluated");
    expect(second.status).toBe("evaluated");
    if (first.status === "evaluated" && second.status === "evaluated") {
      expect(second.network.nodes).toEqual(first.network.nodes);
      expect(second.network.edges.map(e => [e.id, e.crossing?.facilityId, e.distanceMeters])).toEqual(
        first.network.edges.map(e => [e.id, e.crossing?.facilityId, e.distanceMeters])
      );
    }
  });
  it("does not mutate world, input ordering or consume RNG", () => {
    const f = fixture(),
      before = structuredClone(f.world);
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG");
    });
    try {
      const first = f.run();
      f.input.pairs.reverse();
      const second = f.run();
      expect(second).toEqual(first);
      expect(f.world).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });
});
describe("complete finite bridge passage footprint", () => {
  it("covers the middle water strip, full width and finite caps, and rejects collapsed shapes", () => {
    expect(bridgePassageFootprint([-10, 0], [10, 0], 2)).toEqual([
      [-11, -1],
      [11, -1],
      [11, 1],
      [-11, 1]
    ]);
    expect(bridgePassageFootprint([0, 0], [0, 0], 2)).toBeNull();
    expect(bridgePassageFootprint([1e20, 1e20], [1e20 + 1e5, 1e20], 2)).toBeNull();
  });
});
