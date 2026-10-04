import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
import { exportFixedBurgCrossings } from "../services/fixedBurgCrossings";
import { WorldRiverGeometryRegistry } from "../services/worldRiverGeometry";
import { validFixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { type ApproachCorridorInput, findApproachCorridor } from "./approachCorridorSearch";
import type { NetworkConnection } from "./constrainedLandNetwork";
import { evaluateWorldCellLandConnectionProposals } from "./worldCellLandConnectionProposals";
import { createWorldLandConnectionSession } from "./worldLandConnectionAdoption";
import {
  restoreWorldLandConnections,
  saveWorldLandConnections,
  type WorldLandArchiveCurrent
} from "./worldLandConnectionArchive";
import {
  evaluateWorldLandConnectionProposals,
  getWorldLandProposalContext,
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
  it("applies pair construction caps and supplies confirmed outer corridor lengths", () => {
    const f = fixture();
    f.input.pairs.splice(1);
    f.input.pairs[0].assessmentSettings = { maxConstructionCostMeters: 0, maxRouteCostMeters: 500 };
    const costs = vi.fn((_crossing, _a, _b, lengths: readonly [number, number]) => {
      expect(lengths.every(length => Number.isFinite(length) && length > 0)).toBe(true);
      return 2;
    });
    f.input.environment.approachConstructionCostAt = costs;
    const result = f.run();
    expect(result.status).toBe("evaluated");
    expect(costs).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.individuals[0].assessment.status).toBe("rejected");
    f.input.pairs[0].assessmentSettings.maxConstructionCostMeters = 100;
    expect(f.run().diagnostics.individuals[0].assessment.status).toBe("proposed");
    f.input.pairs[0].assessmentSettings.maxRouteCostMeters = NaN;
    expect(f.run()).toMatchObject({ status: "unresolved", reason: "invalid-input" });
  });

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

describe("current world cell policy proposal adapter", () => {
  function cellFixture() {
    const f = fixture();
    f.world.pack.cells.i = new Uint16Array([0, 1, 2]);
    f.world.pack.cells.state = new Uint16Array([0, 1, 0]);
    const strips = [
      [0, 49.8],
      [49.8, 50.2],
      [50.2, 100]
    ];
    f.world.pack.cells.v = strips.map((_, i) => [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3]);
    f.world.pack.vertices = {
      p: strips.flatMap(([a, b]) => [
        [a, 0],
        [b, 0],
        [b, 100],
        [a, 100]
      ])
    } as WorldContext["pack"]["vertices"];
    const input = {
      ...f.input,
      cellPolicySettings: { maxCells: 10, maxVertices: 100, maxClipOperations: 1000, maxRemainingPieces: 100 },
      cellRules: { allowsCell: (c: { stateId: number }) => c.stateId !== 2, supportsCell: () => true }
    };
    return { ...f, input, run: () => evaluateWorldCellLandConnectionProposals(f.world, "km", input) };
  }
  it("evaluates current permissions over bridge water and rebuilds after state changes", () => {
    const f = cellFixture();
    expect(f.run()).toHaveProperty("diagnostics.shared.status", "proposed");
    f.world.pack.cells.state[1] = 2;
    const denied = f.run();
    expect(denied.status).toBe("evaluated");
    expect(denied.diagnostics.rejected).toContainEqual({ facilityId: 100, reason: "passage-blocked" });
    f.world.pack.cells.state[1] = 1;
    expect(f.run()).toHaveProperty("diagnostics.shared.status", "proposed");
  });
  it("uses freshly rebuilt cell policies for adoption over the bridge water", () => {
    const f = cellFixture(),
      created = createWorldLandConnectionSession(f.run);
    if (!("session" in created)) throw Error(JSON.stringify(created));
    const p = created.session.prepare(0, { kind: "shared" });
    if (!("draft" in p)) throw Error(JSON.stringify(p));
    f.world.pack.cells.state[1] = 2;
    expect(created.session.commit(p.draft).status).toBe("unresolved");
    expect(created.session.snapshot.revision).toBe(0);
    f.world.pack.cells.state[1] = 1;
    expect(created.session.commit(p.draft).status).toBe("committed");
  });
  it("preserves unresolved geometry and policy budgets through boolean callbacks", () => {
    const f = cellFixture();
    f.input.cellPolicySettings.maxClipOperations = 1;
    expect(f.run()).toMatchObject({
      status: "unresolved",
      reason: "world-environment",
      environmentReason: "clip-budget"
    });
    f.input.cellPolicySettings.maxClipOperations = 1000;
    f.world.pack.cells.v[0][0] = 999;
    expect(f.run()).toMatchObject({
      status: "unresolved",
      reason: "world-environment",
      environmentReason: "invalid-cell"
    });
  });
});

describe("fresh world adoption and fixed section handoff", () => {
  function sessionFixture() {
    const f = fixture();
    let evaluations = 0;
    const created = createWorldLandConnectionSession(() => {
      evaluations++;
      return f.run();
    });
    if (!("session" in created)) throw Error(JSON.stringify(created));
    const prepare = (selection = { kind: "shared" as const }) => {
      const p = created.session.prepare(created.session.snapshot.revision, selection);
      if (!("draft" in p)) throw Error(JSON.stringify(p));
      return p.draft;
    };
    return { ...f, session: created.session, prepare, evaluations: () => evaluations };
  }
  it("reevaluates world at preparation, commit and handoff, with one fixed shared deck", () => {
    const f = sessionFixture(),
      before = JSON.stringify(f.world),
      draft = f.prepare();
    expect(f.session.snapshot.revision).toBe(0);
    expect(f.session.commit(draft).status).toBe("committed");
    const exported = f.session.exportSections();
    if (!("sections" in exported)) throw Error(JSON.stringify(exported));
    const a = exported.sections;
    expect(f.evaluations()).toBe(4);
    expect(a.coordinateUnit).toBe("metres");
    expect(a.crossings).toHaveLength(1);
    expect(a.connections).toHaveLength(2);
    const crossing = a.crossings[0];
    for (const connection of a.connections) {
      const bridge = connection.sections.find(s => s.kind === "bridge")!;
      expect(bridge.pieces).toHaveLength(1);
      expect(bridge.pieces[0]).toMatchObject({ kind: "line", start: crossing.deckA, end: crossing.deckB });
      const d = [crossing.deckB[0] - crossing.deckA[0], crossing.deckB[1] - crossing.deckA[1]];
      expect(d[0] * crossing.tRiver[0] + d[1] * crossing.tRiver[1]).toBeCloseTo(0, 10);
      expect(connection.sections.flatMap(s => s.pieces).reduce((n, p) => n + p.lengthMeters, 0)).toBeCloseTo(
        connection.distanceMeters,
        10
      );
      expect(connection.bidirectional).toBe(true);
    }
    expect(Object.isFrozen(a)).toBe(true);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("exports the current cubic river derivative and physical banks to a CE-local preview", () => {
    const f = sessionFixture();
    expect(f.session.commit(f.prepare()).status).toBe("committed");
    const evaluated = f.run(),
      context = getWorldLandProposalContext(evaluated)!;
    const budgets = { maxFacilities: 10, maxWaterVertices: 10000 };
    const exported = exportFixedBurgCrossings(f.session.snapshot, context, [85, 50], budgets);
    if (!("crossings" in exported)) throw Error(exported.reason);
    expect(exported.crossings.crossings[0].witness.kind).toBe("cubic");
    expect(validFixedBurgCrossings(JSON.parse(JSON.stringify(exported.crossings)), budgets)).toBe(true);
    expect(exported.crossings.crossings).toHaveLength(1);
    expect(exported.crossings.crossings[0].tangent[1]).toBeLessThan(0);
  });
  it("adds a second city approach to an already adopted bridge without duplicating the facility", () => {
    const f = sessionFixture();
    const a = f.session.prepare(0, { kind: "individual", pairId: 1 });
    if (!("draft" in a)) throw Error(JSON.stringify(a));
    expect(f.session.commit(a.draft).status).toBe("committed");
    const b = f.session.prepare(1, { kind: "individual", pairId: 2 });
    if (!("draft" in b)) throw Error(JSON.stringify(b));
    expect(b.draft.newFacilityIds).toEqual([]);
    expect(b.draft.newConnectionIds).toHaveLength(1);
    expect(f.session.commit(b.draft).status).toBe("committed");
    expect(f.session.snapshot.facilityIds).toEqual([100]);
    expect(f.session.snapshot.connectionIds).toHaveLength(2);
  });
  it("keeps private world provenance independent of editable diagnostics and rejects network replacement", () => {
    const f = fixture(),
      r = f.run();
    if (r.status !== "evaluated") throw Error();
    const context = getWorldLandProposalContext(r)!;
    const searches = context.assessmentSearches;
    r.diagnostics.assessmentSearches = -100;
    context.settings.maxAssessmentSearches = 100000;
    expect(getWorldLandProposalContext(r)!.assessmentSearches).toBe(searches);
    expect(getWorldLandProposalContext(r)!.settings.maxAssessmentSearches).toBe(30);
    r.network = structuredClone(r.network);
    expect(getWorldLandProposalContext(r)).toBeNull();
  });
  it("refuses section handoff after the registered bridge loses current passage permission", () => {
    const f = sessionFixture(),
      draft = f.prepare();
    expect(f.session.commit(draft).status).toBe("committed");
    f.input.environment.allowsPassageFootprint = () => false;
    const out = f.session.exportSections();
    expect(out).not.toHaveProperty("sections");
    expect(f.session.snapshot.revision).toBe(1);
  });
  it("refuses cached results and result copies as current-world authority", () => {
    const f = fixture(),
      result = f.run();
    const created = createWorldLandConnectionSession(() => result);
    if (!("session" in created)) throw Error();
    expect(created.session.prepare(0, { kind: "shared" })).toMatchObject({ reason: "reused-world-evaluation" });
    expect(createWorldLandConnectionSession(() => ({ ...result }))).toMatchObject({
      reason: "unvalidated-world-evaluation"
    });
  });
  it("does not adopt after actual city movement or changing to another world", () => {
    const f = sessionFixture(),
      draft = f.prepare();
    f.world.pack.burgs[1].x = 86;
    expect(f.session.commit(draft)).toMatchObject({ status: "unresolved", reason: "changed-nodes" });
    expect(f.session.snapshot.revision).toBe(0);
    f.world.pack.burgs[1].x = 85;
    f.world.mapId = 999;
    expect(f.session.commit(draft)).toMatchObject({ reason: "changed-world" });
  });
  it("rechecks current passage policy and physical river geometry without partial publication", () => {
    const f = sessionFixture(),
      draft = f.prepare();
    f.input.environment.allowsPassageFootprint = () => false;
    expect(f.session.commit(draft).status).toBe("unresolved");
    expect(f.session.snapshot.connectionIds).toEqual([]);
    f.input.environment.allowsPassageFootprint = () => true;
    f.world.pack.rivers[0].sourceWidth = 3;
    expect(f.session.commit(draft).status).toBe("unresolved");
    expect(f.session.snapshot.revision).toBe(0);
  });
  it("rechecks refreshed engineering costs and valuation settings", () => {
    const f = sessionFixture(),
      draft = f.prepare();
    f.input.environment.facilityCostsAt = () => ({ constructionCostMeters: 11, useCostMeters: 3 });
    expect(f.session.commit(draft)).toMatchObject({ reason: "changed-proposal" });
    f.input.environment.facilityCostsAt = () => ({ constructionCostMeters: 10, useCostMeters: 3 });
    f.input.settings.shared.minimumNetBenefitMeters = 2;
    expect(f.session.commit(draft)).toMatchObject({ reason: "changed-valuation" });
    expect(f.session.snapshot.revision).toBe(0);
  });
  it("uses actual pair IDs, detects old revisions and refuses an exhausted global search budget", () => {
    const f = sessionFixture();
    expect(f.session.prepare(0, { kind: "individual", pairId: 999 })).toMatchObject({ reason: "unknown-pair" });
    const p = f.session.prepare(0, { kind: "individual", pairId: 1 });
    if (!("draft" in p)) throw Error(JSON.stringify(p));
    expect(f.session.commit(p.draft).status).toBe("committed");
    expect(f.session.prepare(0, { kind: "shared" })).toMatchObject({ reason: "stale-revision" });
    const g = fixture();
    g.input.pairs = [g.input.pairs[0]];
    g.input.settings.maxAssessmentSearches = 3;
    const c = createWorldLandConnectionSession(g.run);
    if (!("session" in c)) throw Error(JSON.stringify(c));
    expect(c.session.prepare(0, { kind: "individual", pairId: 1 })).toMatchObject({ reason: "assessment-budget" });
  });
});

describe("combined world river and connection archive", () => {
  const budgets = {
    maxJsonCharacters: 2000000,
    rivers: { maxJsonCharacters: 100000, maxRivers: 10 },
    connections: {
      maxJsonCharacters: 1500000,
      maxFacilities: 10,
      maxNodes: 100,
      maxEdges: 100,
      maxCorridorPieces: 1000,
      maxGuideNodes: 10000,
      maxGuideEdges: 100000,
      maxArcSections: 100
    }
  };
  function archiveFixture() {
    const f = fixture();
    // Allocate a noninitial version before adoption.
    f.input.registry.get(f.world, f.world.pack.rivers[0], "km", f.input.settings.crossings.geometry);
    f.world.pack.rivers[0].sourceWidth = 2.1;
    const created = createWorldLandConnectionSession(f.run);
    if (!("session" in created)) throw Error(JSON.stringify(created));
    const draft = created.session.prepare(0, { kind: "shared" });
    if (!("draft" in draft)) throw Error(JSON.stringify(draft));
    expect(created.session.commit(draft.draft).status).toBe("committed");
    const evaluated = f.run();
    const context = getWorldLandProposalContext(evaluated)!;
    const current: WorldLandArchiveCurrent = {
      world: f.world,
      worldIdentity: context.worldIdentity,
      distanceUnit: "km",
      geometrySettings: f.input.settings.crossings.geometry,
      connectionsAt: registry => {
        const evaluated = evaluateWorldLandConnectionProposals(f.world, "km", { ...f.input, registry });
        const c = getWorldLandProposalContext(evaluated);
        return c
          ? {
              worldIdentity: c.worldIdentity,
              environment: c.environment,
              nodePointAt: c.nodePointAt,
              costsAt: connection => ({
                constructionCostMeters: connection.constructionCostMeters,
                ...(connection.kind === "bridge" ? { useCostMeters: 3, approachConstructionCostMeters: 2 } : {})
              }),
              edgePenaltyAt: () => null
            }
          : null;
      }
    };
    const saved = saveWorldLandConnections(created.session.snapshot, f.input.registry, current, budgets);
    if (!("json" in saved)) throw Error(saved.reason);
    return { ...f, current, saved, snapshot: created.session.snapshot };
  }
  it("restores a shared bridge and its noninitial river version together", () => {
    const f = archiveFixture(),
      before = JSON.stringify(f.world);
    const result = restoreWorldLandConnections(f.saved.json, f.current, budgets);
    if (!("registry" in result)) throw Error(result.reason);
    expect(result.registry.snapshot.revision).toBe(f.snapshot.revision);
    expect(result.registry.snapshot.facilityIds).toEqual(f.snapshot.facilityIds);
    expect(result.registry.snapshot.connectionIds).toEqual(f.snapshot.connectionIds);
    expect(result.rivers.get(f.world, f.world.pack.rivers[0], "km", f.current.geometrySettings).geometryVersion).toBe(
      2
    );
    expect(JSON.stringify(f.world)).toBe(before);
    const second = saveWorldLandConnections(result.registry.snapshot, result.rivers, f.current, budgets);
    expect(second).toEqual(f.saved);
  });
  it("returns no partial result when either archive or current conditions fail", () => {
    const f = archiveFixture();
    const raw = JSON.parse(f.saved.json);
    raw.connections = "null";
    expect(restoreWorldLandConnections(JSON.stringify(raw), f.current, budgets)).toHaveProperty("reason");
    raw.connections = f.saved.json;
    raw.rivers = "null";
    expect(restoreWorldLandConnections(JSON.stringify(raw), f.current, budgets)).toEqual({ reason: "river-archive" });
    expect(restoreWorldLandConnections(f.saved.json, { ...f.current, worldIdentity: "other" }, budgets)).toEqual({
      reason: "changed-world"
    });
    f.input.environment.allowsPassageFootprint = () => false;
    expect(restoreWorldLandConnections(f.saved.json, f.current, budgets)).toHaveProperty("reason");
    expect(f.snapshot.revision).toBe(1);
  });
  it("rejects a provider using an unrelated session registry", () => {
    const f = archiveFixture();
    const unrelated = new WorldRiverGeometryRegistry();
    const provider = f.current.connectionsAt;
    const result = restoreWorldLandConnections(
      f.saved.json,
      { ...f.current, connectionsAt: () => provider(unrelated) },
      budgets
    );
    expect(result).toHaveProperty("reason");
    expect(
      saveWorldLandConnections(
        f.snapshot,
        f.input.registry,
        { ...f.current, connectionsAt: () => provider(unrelated) },
        budgets
      )
    ).toEqual({ reason: "unbound-rivers" });
  });
  it("rejects source changes made while the provider constructs current contracts", () => {
    const f = archiveFixture(),
      provider = f.current.connectionsAt;
    const current = {
      ...f.current,
      connectionsAt: (registry: WorldRiverGeometryRegistry) => {
        const contracts = provider(registry);
        f.world.pack.rivers[0].sourceWidth += 0.1;
        return contracts;
      }
    };
    expect(restoreWorldLandConnections(f.saved.json, current, budgets)).toHaveProperty("reason");
    expect(f.snapshot.revision).toBe(1);
  });
  it("bounds and validates the outer archive before calling the provider", () => {
    const f = archiveFixture(),
      provider = vi.fn(f.current.connectionsAt),
      current = { ...f.current, connectionsAt: provider };
    for (const json of ["null", "[]", "{", JSON.stringify({ ...JSON.parse(f.saved.json), extra: true })])
      expect(restoreWorldLandConnections(json, current, budgets)).toHaveProperty("reason");
    expect(restoreWorldLandConnections(f.saved.json, current, { ...budgets, maxJsonCharacters: 1 })).toEqual({
      reason: "json-budget"
    });
    expect(provider).not.toHaveBeenCalled();
  });
});
