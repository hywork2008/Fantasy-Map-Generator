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
  type NetworkNode,
  selectConstrainedLandNetwork
} from "./constrainedLandNetwork";
import { createLandConnectionRegistry } from "./landConnectionAdoption";
import {
  type LandArchiveBudgets,
  restoreRegisteredLandConnections,
  type SavedLandConnection,
  saveRegisteredLandConnections
} from "./registeredLandConnectionArchive";
import { exportRegisteredLandRouteSections } from "./registeredLandRouteSections";
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

describe("explicit selected connections and atomic session adoption", () => {
  function adoptionFixture(shared = false) {
    const f = fixture();
    if (shared) {
      f.input.nodes.push({ id: 3, point: [35, 0] });
      const c = f.bridge(5, 0, 2, 3, 2);
      if (c.kind !== "bridge") throw Error();
      c.approachA = f.corridor([[35, 0], c.crossing.approachA], [-1, 0]);
      f.input.connections.push(c);
    }
    const network = f.build();
    const baseline = selectConstrainedLandNetwork(network, [], f.environment, f.input);
    if (!("network" in baseline)) throw Error(baseline.reason);
    const created = createLandConnectionRegistry(baseline.network, f.environment, f.input);
    if (!("registry" in created)) throw Error(created.reason);
    const current = {
      candidateNetwork: network,
      environment: f.environment,
      nodePointAt: (id: number) => f.input.nodes.find(n => n.id === id)?.point ?? null
    };
    const request = {
      kind: "individual" as const,
      input: {
        startNodeId: 1,
        goalNodeId: 2,
        searchSettings: f.searchSettings,
        settings: {
          minimumImprovementMeters: 1,
          nearEqualCostMeters: 1,
          maxConstructionCostMeters: 100,
          maxRouteCostMeters: 500,
          maxSearches: 4
        }
      }
    };
    const prepare = () => {
      const r = created.registry.prepare(created.registry.snapshot.revision, request, current);
      if (!("draft" in r)) throw Error(JSON.stringify(r));
      return r.draft;
    };
    return { ...f, network, baseline: baseline.network, registry: created.registry, current, request, prepare };
  }
  it("rebuilds explicit selected IDs from saved contracts and rejects copied/unknown sources", () => {
    const f = adoptionFixture();
    expect(selectConstrainedLandNetwork(f.network, [1], f.environment, f.input)).toHaveProperty("network");
    expect(selectConstrainedLandNetwork(f.network, [1, 1], f.environment, f.input)).toMatchObject({
      reason: "invalid-input"
    });
    expect(selectConstrainedLandNetwork(f.network, [999], f.environment, f.input)).toMatchObject({
      reason: "invalid-input"
    });
    expect(selectConstrainedLandNetwork(structuredClone(f.network), [1], f.environment, f.input)).toMatchObject({
      reason: "unvalidated-network"
    });
    f.input.connections[0].from = 999;
    expect(selectConstrainedLandNetwork(f.network, [1], f.environment, f.input)).toHaveProperty("network");
  });
  it("prepares without publishing, then registers the complete bridge once", () => {
    const f = adoptionFixture(),
      before = f.registry.snapshot,
      draft = f.prepare();
    expect(f.registry.snapshot).toBe(before);
    expect(draft.newFacilityIds).toEqual([5]);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(f.registry.commit(draft, f.current)).toMatchObject({
      status: "committed",
      snapshot: { revision: 1, connectionIds: [1], facilityIds: [5] }
    });
    expect(f.registry.commit(draft, f.current)).toMatchObject({ reason: "unknown-draft" });
    expect(f.registry.prepare(1, f.request, f.current)).toMatchObject({ reason: "not-proposed" });
  });
  it("refuses stale concurrent drafts and foreign/JSON drafts without partial registration", () => {
    const f = adoptionFixture(),
      a = f.prepare(),
      b = f.prepare();
    const g = adoptionFixture();
    expect(g.registry.commit(a, g.current)).toMatchObject({ reason: "unknown-draft" });
    expect(f.registry.commit(structuredClone(a), f.current)).toMatchObject({ reason: "unknown-draft" });
    expect(f.registry.commit(a, f.current).status).toBe("committed");
    const snapshot = f.registry.snapshot;
    expect(f.registry.commit(b, f.current)).toMatchObject({ reason: "stale-revision" });
    expect(f.registry.prepare(0, f.request, f.current)).toMatchObject({ reason: "stale-revision" });
    expect(f.registry.snapshot).toBe(snapshot);
  });
  it("checks the revision again if a current-state callback publishes another draft", () => {
    const f = adoptionFixture(),
      a = f.prepare(),
      b = f.prepare();
    let published = false;
    const current = {
      ...f.current,
      nodePointAt: (id: number) => {
        if (!published) {
          published = true;
          expect(f.registry.commit(b, f.current).status).toBe("committed");
        }
        return f.current.nodePointAt(id);
      }
    };
    expect(f.registry.commit(a, current)).toMatchObject({ reason: "stale-revision" });
    expect(f.registry.snapshot.revision).toBe(1);
  });
  it("rechecks actual endpoint positions and current water before commit", () => {
    const f = adoptionFixture(),
      draft = f.prepare(),
      before = f.registry.snapshot;
    expect(f.registry.commit(draft, { ...f.current, nodePointAt: () => [999, 0] })).toMatchObject({
      reason: "changed-nodes"
    });
    const _lake = {
      id: 99,
      rings: [
        [
          [20, -2],
          [25, -2],
          [25, 2],
          [20, 2]
        ]
      ] as RiverPoint[][]
    };
    const water = PhysicalWaterIndex.build([f.source.geometry.water, _lake], new PhysicalWaterValidationCache())!;
    expect(f.registry.commit(draft, { ...f.current, environment: { ...f.environment, water } })).toMatchObject({
      reason: "not-proposed",
      assessment: { status: "unresolved", reason: "invalid-geometry" }
    });
    expect(f.registry.snapshot).toBe(before);
  });
  it("rejects current passage/capability changes and does not lose the draft", () => {
    const f = adoptionFixture(),
      draft = f.prepare(),
      before = f.registry.snapshot;
    expect(
      f.registry.commit(draft, { ...f.current, environment: { ...f.environment, allowsBridgeFootprint: () => false } })
    ).toMatchObject({ reason: "not-proposed" });
    f.source.capability.depthMeters = Infinity;
    expect(f.registry.commit(draft, f.current)).toMatchObject({ reason: "not-proposed" });
    expect(f.registry.snapshot).toBe(before);
    f.source.capability.depthMeters = 3;
    expect(f.registry.commit(draft, f.current).status).toBe("committed");
  });
  it("detects refreshed engineering costs and preserves valuation settings from preparation", () => {
    const f = adoptionFixture(),
      draft = f.prepare();
    f.request.input.settings.maxConstructionCostMeters = 0;
    if (f.input.connections[0].kind !== "bridge") throw Error();
    f.input.connections[0].constructionCostMeters = 21;
    expect(f.registry.commit(draft, { ...f.current, candidateNetwork: f.build() })).toMatchObject({
      reason: "changed-proposal"
    });
    expect(f.registry.snapshot.revision).toBe(0);
    expect(f.registry.commit(draft, f.current).status).toBe("committed");
  });
  it("registers a shared bridge package atomically with unique facility ownership", () => {
    const f = adoptionFixture(true);
    const request = {
      kind: "shared" as const,
      input: {
        pairs: [
          { id: 1, startNodeId: 1, goalNodeId: 2, weight: 1, unconnectedAllowanceMeters: 200 },
          { id: 2, startNodeId: 3, goalNodeId: 2, weight: 1, unconnectedAllowanceMeters: 200 }
        ],
        sharedFacilityIds: [5],
        searchSettings: f.searchSettings,
        settings: {
          maxPairs: 5,
          maxSearches: 20,
          maxReturnComparisons: 1,
          nearEqualCostMeters: 1,
          maxConstructionCostMeters: 100,
          maxPairCostMeters: 500,
          maxTotalCostMeters: 1000,
          minimumNetBenefitMeters: 1
        }
      }
    };
    const p = f.registry.prepare(0, request, f.current);
    if (!("draft" in p)) throw Error(JSON.stringify(p));
    expect(p.draft.newConnectionIds).toEqual([1, 2]);
    expect(f.registry.commit(p.draft, f.current)).toMatchObject({
      status: "committed",
      snapshot: { connectionIds: [1, 2], facilityIds: [5] }
    });
  });
  it("preserves explicit established connections and refuses their silent replacement", () => {
    const f = adoptionFixture(true);
    const base = selectConstrainedLandNetwork(f.network, [1], f.environment, f.input);
    if (!("network" in base)) throw Error();
    const created = createLandConnectionRegistry(base.network, f.environment, f.input);
    if (!("registry" in created)) throw Error();
    const request = { ...f.request, input: { ...f.request.input, startNodeId: 3 } };
    const p = created.registry.prepare(0, request, f.current);
    if (!("draft" in p)) throw Error(JSON.stringify(p));
    expect(p.draft.newFacilityIds).toEqual([]);
    expect(p.draft.newConnectionIds).toEqual([2]);
    const removed = selectConstrainedLandNetwork(f.network, [2], f.environment, f.input);
    if (!("network" in removed)) throw Error();
    expect(created.registry.commit(p.draft, { ...f.current, candidateNetwork: removed.network })).toMatchObject({
      reason: "changed-baseline"
    });
    expect(created.registry.snapshot.connectionIds).toEqual([1]);
    expect(created.registry.commit(p.draft, f.current)).toMatchObject({
      status: "committed",
      snapshot: { connectionIds: [1, 2], facilityIds: [5] }
    });
  });
  it("keeps source settings and network immutable and does not consume RNG", () => {
    const f = adoptionFixture(),
      before = JSON.stringify([f.network, f.request]);
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("RNG");
    });
    try {
      const draft = f.prepare();
      expect(f.registry.commit(draft, f.current).status).toBe("committed");
      expect(JSON.stringify([f.network, f.request])).toBe(before);
      expect(Object.isFrozen(f.registry.snapshot)).toBe(true);
      expect(Object.isFrozen(f.registry.snapshot.connectionIds)).toBe(true);
    } finally {
      random.mockRestore();
    }
  });
  it("exports only authenticated registered geometry and rechecks current nodes and water", () => {
    const f = adoptionFixture(),
      draft = f.prepare();
    f.registry.commit(draft, f.current);
    expect(exportRegisteredLandRouteSections({ ...f.registry.snapshot }, f.current)).toMatchObject({
      reason: "unregistered-snapshot"
    });
    expect(
      exportRegisteredLandRouteSections(f.registry.snapshot, { ...f.current, nodePointAt: () => null })
    ).toMatchObject({ reason: "changed-nodes" });
    const r = exportRegisteredLandRouteSections(f.registry.snapshot, f.current);
    if (!("sections" in r)) throw Error();
    expect(r.sections.crossings[0].id).toBe(5);
    const crossing = r.sections.crossings[0];
    const deck = r.sections.connections[0].sections.find(s => s.kind === "bridge")!;
    expect(deck.pieces[0]).toMatchObject({ start: crossing.deckA, end: crossing.deckB });
    f.source.capability.depthMeters = Infinity;
    expect(exportRegisteredLandRouteSections(f.registry.snapshot, f.current)).toMatchObject({
      reason: "invalid-geometry"
    });
    expect(r.sections.crossings[0]).toEqual(crossing);
    expect(Object.isFrozen(r.sections.crossings[0])).toBe(true);
  });
  it("preserves exact land arcs and one-way connectivity without making bridges", () => {
    const f = fixture();
    const land = f.corridor(
      [
        [30, 0],
        [40, 0],
        [40, 10],
        [30, 10]
      ],
      [-1, 0]
    );
    const built = buildConstrainedLandNetwork({
      ...f.input,
      nodes: [
        { id: 1, point: [30, 0] },
        { id: 2, point: [30, 10] }
      ],
      connections: [{ id: 8, kind: "land", from: 1, to: 2, bidirectional: false, land }]
    });
    if (!("network" in built)) throw Error(built.reason);
    const registered = createLandConnectionRegistry(built.network, f.environment, f.input);
    if (!("registry" in registered)) throw Error();
    const out = exportRegisteredLandRouteSections(registered.registry.snapshot, {
      environment: f.environment,
      nodePointAt: id => built.network.nodes.find(n => n.id === id)?.point ?? null
    });
    if (!("sections" in out)) throw Error(out.reason);
    expect(out.sections.crossings).toEqual([]);
    expect(out.sections.connections[0].bidirectional).toBe(false);
    expect(out.sections.connections[0].sections).toEqual([{ kind: "land", pieces: land.corridor.pieces }]);
    expect(out.sections.connections[0].sections[0].pieces.some(p => p.kind === "arc")).toBe(true);
  });
  function archiveFixture() {
    const f = adoptionFixture(true);
    const environment = { ...f.environment, allowsBridgeFootprint: () => true };
    const created = createLandConnectionRegistry(f.network, environment, f.input, 7);
    if (!("registry" in created)) throw Error(created.reason);
    const budgets: LandArchiveBudgets = {
      maxJsonCharacters: 100000,
      maxArcSections: 100,
      maxFacilities: 10,
      maxNodes: 100,
      maxEdges: 100,
      maxCorridorPieces: 1000,
      maxGuideNodes: 1000,
      maxGuideEdges: 5000
    };
    const current = {
      ...f.current,
      worldIdentity: "archive-fixture-world",
      environment,
      costsAt: (c: Readonly<SavedLandConnection>) => ({
        constructionCostMeters: c.constructionCostMeters,
        ...(c.kind === "bridge"
          ? { useCostMeters: c.useCostMeters, approachConstructionCostMeters: c.approachConstructionCostMeters }
          : {})
      }),
      edgePenaltyAt: (_id: number, _side: "land" | "A" | "B") => null as ((from: number, to: number) => number) | null
    };
    const saved = saveRegisteredLandConnections(created.registry.snapshot, current, budgets);
    if (!("json" in saved)) throw Error(saved.reason);
    const restore = (json = saved.json) => restoreRegisteredLandConnections(json, current, budgets);
    return { ...f, registry: created.registry, current, budgets, saved, restore };
  }
  it("round-trips shared facilities, source contracts and revision into a freshly authenticated session", () => {
    const f = archiveFixture(),
      r = f.restore();
    if (!("registry" in r)) throw Error(r.reason);
    expect(r.registry.snapshot.revision).toBe(7);
    expect(r.registry.snapshot.facilityIds).toEqual([5]);
    expect(r.registry.snapshot.connectionIds).toEqual([1, 2]);
    expect(r.registry.snapshot.network).toEqual(f.registry.snapshot.network);
    expect(r.registry.snapshot).not.toBe(f.registry.snapshot);
    expect(f.saved.archive.facilities).toHaveLength(1);
    expect(f.saved.json).not.toContain('"water":');
    expect(f.saved.json).not.toContain("supportsDryFootprint");
    expect(Object.isFrozen(f.saved.archive)).toBe(true);
    expect(exportRegisteredLandRouteSections(r.registry.snapshot, f.current)).toHaveProperty("sections");
    expect(
      findConstrainedLandRoute(r.registry.snapshot.network, {
        startNodeId: 3,
        goalNodeId: 2,
        settings: f.searchSettings,
        environment: f.current.environment,
        paidFacilityIds: [5],
        paidConnectionIds: [1, 2]
      })
    ).toHaveProperty("route");
  });
  it("restores exact land arcs and one-way connections", () => {
    const f = archiveFixture(),
      land = f.corridor(
        [
          [30, 0],
          [40, 0],
          [40, 10],
          [30, 10]
        ],
        [-1, 0]
      );
    const built = buildConstrainedLandNetwork({
      ...f.input,
      nodes: [
        { id: 1, point: [30, 0] },
        { id: 2, point: [30, 10] }
      ],
      connections: [{ id: 8, kind: "land", from: 1, to: 2, bidirectional: false, land }]
    });
    if (!("network" in built)) throw Error();
    const created = createLandConnectionRegistry(built.network, f.current.environment, f.input);
    if (!("registry" in created)) throw Error();
    const current = {
      ...f.current,
      nodePointAt: (id: number) => built.network.nodes.find(n => n.id === id)?.point ?? null
    };
    const saved = saveRegisteredLandConnections(created.registry.snapshot, current, f.budgets);
    if (!("json" in saved)) throw Error(saved.reason);
    const restored = restoreRegisteredLandConnections(saved.json, current, f.budgets);
    if (!("registry" in restored)) throw Error(restored.reason);
    expect(restored.registry.snapshot.network.edges).toHaveLength(1);
    expect(restored.registry.snapshot.network.edges[0].pieces).toEqual(land.corridor.pieces);
  });
  it("refuses malformed/versioned/oversized archives before registration", () => {
    const f = archiveFixture();
    expect(f.restore("{")).toMatchObject({ reason: "invalid-json" });
    expect(
      restoreRegisteredLandConnections(f.saved.json, { ...f.current, worldIdentity: "other-world" }, f.budgets)
    ).toMatchObject({ reason: "changed-world" });
    expect(f.restore(JSON.stringify({ ...f.saved.archive, schemaVersion: 2 }))).toMatchObject({
      reason: "unsupported-schema"
    });
    expect(f.restore(JSON.stringify({ ...f.saved.archive, coordinateUnit: "map" }))).toMatchObject({
      reason: "unsupported-schema"
    });
    expect(f.restore(JSON.stringify({ ...f.saved.archive, revision: -1 }))).toMatchObject({
      reason: "invalid-archive"
    });
    f.budgets.maxJsonCharacters = 10;
    expect(f.restore()).toMatchObject({ reason: "json-budget" });
    expect(saveRegisteredLandConnections(f.registry.snapshot, f.current, f.budgets)).toMatchObject({
      reason: "json-budget"
    });
  });
  it("checks all graph and corridor archive budgets without partial restoration", () => {
    const f = archiveFixture();
    for (const key of [
      "maxNodes",
      "maxEdges",
      "maxCorridorPieces",
      "maxGuideNodes",
      "maxGuideEdges",
      "maxArcSections"
    ] as const) {
      expect(restoreRegisteredLandConnections(f.saved.json, f.current, { ...f.budgets, [key]: 1 })).toMatchObject({
        reason: "graph-budget"
      });
    }
    expect(
      restoreRegisteredLandConnections(f.saved.json, f.current, { ...f.budgets, maxFacilities: NaN })
    ).toMatchObject({ reason: "invalid-budget" });
    expect(f.registry.snapshot.revision).toBe(7);
  });
  it("rejects missing/duplicate facilities, IDs and broken contract records", () => {
    const f = archiveFixture();
    expect(f.restore(JSON.stringify({ ...f.saved.archive, facilities: [] }))).toMatchObject({
      reason: "missing-facility"
    });
    expect(
      f.restore(
        JSON.stringify({
          ...f.saved.archive,
          facilities: [...f.saved.archive.facilities, f.saved.archive.facilities[0]]
        })
      )
    ).toMatchObject({ reason: "invalid-facility" });
    expect(
      f.restore(
        JSON.stringify({
          ...f.saved.archive,
          connections: [f.saved.archive.connections[0], f.saved.archive.connections[0]]
        })
      )
    ).toMatchObject({ reason: "invalid-connection" });
    const a = JSON.parse(f.saved.json);
    a.connections[0].approachA.contract.nodes[0].neighbors = [999];
    expect(f.restore(JSON.stringify(a))).toMatchObject({ reason: "invalid-corridor" });
    a.connections[0].approachA.corridor.pieces[0] = {};
    expect(f.restore(JSON.stringify(a))).toMatchObject({ reason: "invalid-corridor" });
  });
  it("refuses changed physical bridge axes, banks, versions, dimensions and plan metadata", () => {
    const f = archiveFixture();
    for (const change of [
      (a: import("./registeredLandConnectionArchive").RegisteredLandConnectionArchive) => {
        a.facilities[0].crossing.deckA[1] += 1;
      },
      (a: import("./registeredLandConnectionArchive").RegisteredLandConnectionArchive) => {
        a.facilities[0].crossing.geometryVersion += 1;
      },
      (a: import("./registeredLandConnectionArchive").RegisteredLandConnectionArchive) => {
        a.facilities[0].dimensions.bankSeatMeters += 1;
      },
      (a: import("./registeredLandConnectionArchive").RegisteredLandConnectionArchive) => {
        a.facilities[0].crossing.banks =
          [] as unknown as import("./registeredLandConnectionArchive").RegisteredLandConnectionArchive["facilities"][number]["crossing"]["banks"];
      },
      (a: import("./registeredLandConnectionArchive").RegisteredLandConnectionArchive) => {
        a.facilities[0].crossing.plan.kind = "ferry";
      }
    ]) {
      const a = JSON.parse(f.saved.json);
      change(a);
      expect(f.restore(JSON.stringify(a))).toMatchObject({ reason: "changed-facility" });
    }
    f.source.capability.depthMeters = Infinity;
    expect(f.restore()).toMatchObject({ reason: "changed-facility" });
  });
  it("rechecks current endpoint positions, dry footprints and whole bridge passage", () => {
    const f = archiveFixture();
    expect(
      restoreRegisteredLandConnections(f.saved.json, { ...f.current, nodePointAt: () => null }, f.budgets)
    ).toMatchObject({ reason: "changed-nodes" });
    f.current.environment.allowsBridgeFootprint = () => false;
    expect(f.restore()).toMatchObject({ reason: "invalid-bridge" });
    f.current.environment.allowsBridgeFootprint = () => true;
    f.current.environment.supportsDryFootprint = () => false;
    expect(f.restore()).not.toHaveProperty("registry");
    f.current.environment.supportsDryFootprint = () => true;
    const lake = {
      id: 99,
      rings: [
        [
          [20, -2],
          [25, -2],
          [25, 2],
          [20, 2]
        ]
      ] as RiverPoint[][]
    };
    f.current.environment.water = PhysicalWaterIndex.build(
      [f.source.geometry.water, lake],
      new PhysicalWaterValidationCache()
    )!;
    expect(f.restore()).toMatchObject({ reason: "invalid-bridge" });
    expect(f.registry.snapshot.revision).toBe(7);
  });
  it("requires fresh monetary and penalty contracts instead of trusting archived fees", () => {
    const f = archiveFixture();
    f.current.costsAt = () => ({ constructionCostMeters: 100, useCostMeters: 9, approachConstructionCostMeters: 4 });
    const restored = f.restore();
    if (!("registry" in restored)) throw Error(restored.reason);
    expect(restored.registry.snapshot.network.edges[0].crossing!.useCostMeters).toBe(9);
    expect(restored.registry.snapshot.network.edges[0].connectionConstructionCostMeters).toBe(4);
    f.current.costsAt = () => ({ constructionCostMeters: Infinity });
    expect(f.restore()).toMatchObject({ reason: "invalid-cost" });
    f.current.costsAt = c => ({
      constructionCostMeters: c.constructionCostMeters,
      useCostMeters: 3,
      approachConstructionCostMeters: 0
    });
    const a = JSON.parse(f.saved.json);
    a.connections[0].approachA.contract.requiresEdgePenalty = true;
    expect(f.restore(JSON.stringify(a))).toMatchObject({ reason: "missing-edge-penalty" });
  });
  it("rejects unknown nested fields and numeric overflow without leaking raw parser errors", () => {
    const f = archiveFixture();
    const a = JSON.parse(f.saved.json);
    a.connections[0].approachA.corridor.extra = { deeply: [1, 2, 3] };
    expect(f.restore(JSON.stringify(a))).toMatchObject({ reason: "invalid-corridor" });
    expect(f.restore(f.saved.json.replace('"roadWidthMeters":2', '"roadWidthMeters":1e9999'))).toMatchObject({
      reason: "invalid-archive"
    });
    const b = JSON.parse(f.saved.json);
    b.nodes[0].point = [null, 0];
    expect(f.restore(JSON.stringify(b))).toMatchObject({ reason: "invalid-node" });
    const c = JSON.parse(f.saved.json);
    c.connections[0].approachA.contract.settings.roadWidthMeters = 3;
    expect(f.restore(JSON.stringify(c))).toMatchObject({ reason: "invalid-bridge" });
    expect(
      restoreRegisteredLandConnections(
        f.saved.json,
        { ...f.current, environment: { ...f.current.environment, allowsBridgeFootprint: undefined } },
        f.budgets
      )
    ).toMatchObject({ reason: "missing-current-contract" });
    expect(f.registry.snapshot.revision).toBe(7);
  });
  it("does not silently drop a real edge penalty or change archived corridor cost", () => {
    const f = archiveFixture(),
      a = JSON.parse(f.saved.json);
    a.connections[0].approachA.contract.requiresEdgePenalty = true;
    a.connections[0].approachA.corridor.costMeters += 2;
    // Only connection 1 had a penalty; connection 2 must keep its own zero contract.
    f.current.edgePenaltyAt = (id, side) => (id === 1 && side === "A" ? () => 2 : null);
    expect(f.restore(JSON.stringify(a))).toHaveProperty("registry");
    f.current.edgePenaltyAt = (id, side) => (id === 1 && side === "A" ? () => 3 : null);
    expect(f.restore(JSON.stringify(a))).toMatchObject({ reason: "invalid-bridge" });
  });
  it("keeps archive and source immutable, accepts property reordering, and consumes no RNG", () => {
    const f = archiveFixture(),
      before = JSON.stringify(f.registry.snapshot),
      json = f.saved.json;
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("RNG");
    });
    try {
      const a = JSON.parse(json);
      a.facilities[0].crossing = Object.fromEntries(Object.entries(a.facilities[0].crossing).reverse());
      expect(f.restore(JSON.stringify(a))).toHaveProperty("registry");
      expect(JSON.stringify(f.registry.snapshot)).toBe(before);
      expect(f.saved.json).toBe(json);
      expect(saveRegisteredLandConnections({ ...f.registry.snapshot }, f.current, f.budgets)).toMatchObject({
        reason: "unregistered-snapshot"
      });
    } finally {
      random.mockRestore();
    }
  });
  it("does not register a partial package when selection or assessment budgets expire", () => {
    const f = adoptionFixture(),
      before = f.registry.snapshot;
    f.request.input.searchSettings = { ...f.searchSettings, maxExpansions: 1 };
    expect(f.registry.prepare(0, f.request, f.current)).toMatchObject({
      reason: "not-proposed",
      assessment: { status: "unresolved" }
    });
    expect(selectConstrainedLandNetwork(f.network, [1], f.environment, { ...f.input, maxEdges: 1 })).toMatchObject({
      reason: "graph-budget"
    });
    expect(f.registry.snapshot).toBe(before);
  });
});
