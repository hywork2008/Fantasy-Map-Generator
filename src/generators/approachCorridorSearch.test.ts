import { describe, expect, it, vi } from "vitest";
import { checkCorridorArc, corridorPieceTangents, makeCorridorTurn } from "../services/approachCorridorGeometry";
import { checkDryLandSegment } from "../services/dryLandCorridor";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../services/physicalWaterIndex";
import { buildPolylineRiverAxis, type RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import {
  type ApproachCorridorInput,
  type ApproachCorridorSettings,
  type CorridorGuideNode,
  findApproachCorridor,
  validateApproachCorridor
} from "./approachCorridorSearch";
import { connectRiverCrossingApproaches } from "./riverCrossingApproaches";
import { type CrossingCandidateInput, createProvisionalRiverCrossing } from "./riverCrossingCandidates";

const settings: ApproachCorridorSettings = {
  roadWidthMeters: 2,
  minimumTurnRadiusMeters: 10,
  minimumStraightMeters: 0,
  minimumFinalStraightMeters: 2,
  turnPenaltyMetersPerRadian: 0,
  maxEnvelopeErrorMeters: 0.05,
  maxArcSections: 100,
  maxNodes: 100,
  maxEdges: 200,
  maxLabels: 1000,
  maxExpansions: 1000
};
function index(waters: readonly PhysicalWaterPolygon[] = []) {
  const result = PhysicalWaterIndex.build(waters, new PhysicalWaterValidationCache());
  if (!result) throw new Error("bad water fixture");
  return result;
}
function node(id: number, point: RiverPoint, ...neighbors: number[]): CorridorGuideNode {
  return { id, point, neighbors };
}
function input(): ApproachCorridorInput {
  return {
    nodes: [node(0, [-20, 0], 1), node(1, [0, 0], 2), node(2, [0, 20])],
    startNodeId: 0,
    goalNodeId: 2,
    startTangent: [1, 0],
    goalTangent: [0, 1],
    settings,
    water: index(),
    supportsDryFootprint: () => true
  };
}
function requireCorridor(i: ApproachCorridorInput) {
  const result = findApproachCorridor(i);
  expect(result).toHaveProperty("corridor");
  if (!("corridor" in result)) throw new Error(result.reason);
  return result.corridor;
}
function box(id: number, x: number, y: number, w: number, h: number): PhysicalWaterPolygon {
  return {
    id,
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

describe("direction-state dry approach search", () => {
  it("replaces a right-angle guide corner with a dry tangent circular fillet", () => {
    const i = input(),
      before = structuredClone(i.nodes),
      c = requireCorridor(i);
    expect(c.pieces.map(p => p.kind)).toEqual(["line", "arc", "line"]);
    expect(c.pieces[0]).toMatchObject({ start: [-20, 0], end: [-10, 0], lengthMeters: 10 });
    expect(c.pieces[1]).toMatchObject({ start: [-10, 0], end: [0, 10], center: [-10, 10], radiusMeters: 10 });
    expect(c.distanceMeters).toBeCloseTo(20 + 5 * Math.PI, 9);
    expect(c.costMeters).toBe(c.distanceMeters);
    expect(validateApproachCorridor(c, i)).toBe(true);
    expect(i.nodes).toEqual(before);
    const a = corridorPieceTangents(c.pieces[1])!;
    expect(a.start[0]).toBeCloseTo(1, 9);
    expect(a.end[1]).toBeCloseTo(1, 9);
  });
  it("does not leave a turn at the goal or reverse the fixed bridge approach direction", () => {
    expect(findApproachCorridor({ ...input(), goalTangent: [1, 0] })).toMatchObject({ reason: "no-corridor" });
    expect(findApproachCorridor({ ...input(), goalTangent: [0, -1] })).toMatchObject({ reason: "no-corridor" });
    expect(findApproachCorridor({ ...input(), startTangent: [0, 1] })).toMatchObject({ reason: "no-corridor" });
  });
  it("keeps a valid expensive incoming state when a cheaper prefix cannot finish its turn", () => {
    const i: ApproachCorridorInput = {
      ...input(),
      startTangent: undefined,
      startNodeId: 0,
      goalNodeId: 5,
      nodes: [
        node(0, [-40, -40], 1, 4),
        node(1, [-40, 0], 2),
        node(2, [-5, 0], 3),
        node(3, [0, 0], 5),
        node(4, [0, -40], 3),
        node(5, [0, 5])
      ],
      edgePenaltyMeters: (a, b) => (a === 0 && b === 4 ? 100 : 0)
    };
    const c = requireCorridor(i);
    expect(c.guideNodeIds).toEqual([0, 4, 3, 5]);
    expect(c.costMeters - c.distanceMeters).toBeCloseTo(100, 9);
  });
  it("does not lose turn space when a straight guide edge is subdivided", () => {
    const base = requireCorridor(input());
    const split = requireCorridor({
      ...input(),
      nodes: [node(0, [-20, 0], 3), node(3, [-5, 0], 1), node(1, [0, 0], 4), node(4, [0, 5], 2), node(2, [0, 20])]
    });
    expect(split.pieces).toEqual(base.pieces);
    expect(split.distanceMeters).toBe(base.distanceMeters);
  });
  it("allows back-to-back tangent turns without imposing an artificial long straight", () => {
    const i = {
      ...input(),
      goalNodeId: 3,
      goalTangent: [1, 0] as RiverPoint,
      settings: { ...settings, minimumFinalStraightMeters: 0 },
      nodes: [node(0, [-20, 0], 1), node(1, [0, 0], 2), node(2, [0, 20], 3), node(3, [10, 20])]
    };
    const c = requireCorridor(i);
    expect(c.pieces.map(p => p.kind)).toEqual(["line", "arc", "arc"]);
    expect(validateApproachCorridor(c, i)).toBe(true);
    expect(findApproachCorridor({ ...i, settings: { ...i.settings, minimumStraightMeters: 1 } })).toMatchObject({
      reason: "no-corridor"
    });
  });
  it("rejects a pond clipped by the fillet even when the raw guide edges are dry", () => {
    const i = { ...input(), water: index([box(1, -4, 2, 2, 2)]) };
    expect(
      checkDryLandSegment({
        start: [-20, 0],
        end: [0, 0],
        widthMeters: 2,
        water: i.water,
        supportsDryFootprint: () => true
      })
    ).toHaveProperty("lengthMeters");
    expect(
      checkDryLandSegment({
        start: [0, 0],
        end: [0, 20],
        widthMeters: 2,
        water: i.water,
        supportsDryFootprint: () => true
      })
    ).toHaveProperty("lengthMeters");
    expect(findApproachCorridor(i)).toMatchObject({ reason: "no-corridor" });
  });
  it("separates graph/search/geometry budgets from no-corridor and invalid cost", () => {
    const i = input();
    expect(findApproachCorridor({ ...i, settings: { ...settings, maxNodes: 2 } })).toMatchObject({
      reason: "graph-budget"
    });
    expect(findApproachCorridor({ ...i, settings: { ...settings, maxLabels: 1 } })).toMatchObject({
      reason: "search-budget"
    });
    expect(findApproachCorridor({ ...i, settings: { ...settings, maxExpansions: 1 } })).toMatchObject({
      reason: "search-budget"
    });
    expect(findApproachCorridor({ ...i, settings: { ...settings, maxArcSections: 1 } })).toMatchObject({
      reason: "geometry-budget"
    });
    expect(findApproachCorridor({ ...i, edgePenaltyMeters: () => -1 })).toMatchObject({ reason: "invalid-cost" });
  });
  it("uses exact finalized tangents and minimum radii during saved-geometry validation", () => {
    const i = input(),
      c = requireCorridor(i),
      saved = JSON.parse(JSON.stringify(c));
    expect(validateApproachCorridor(saved, i)).toBe(true);
    expect(validateApproachCorridor({ ...c, guideNodeIds: [0, 2] }, i)).toBe(false);
    expect(validateApproachCorridor({ ...c, costMeters: c.costMeters + 1 }, i)).toBe(false);
    saved.pieces[1].center[0] += 0.1;
    expect(validateApproachCorridor(saved, i)).toBe(false);
    expect(validateApproachCorridor(c, { ...i, settings: { ...settings, minimumTurnRadiusMeters: 11 } })).toBe(false);
    expect(validateApproachCorridor(c, { ...i, goalTangent: [0, 0] })).toBe(false);
  });
  it("is deterministic under guide ordering changes and consumes no world RNG", () => {
    const i = input(),
      random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("RNG consumed");
      });
    try {
      const a = findApproachCorridor(i),
        b = findApproachCorridor({ ...i, nodes: [...i.nodes].reverse() });
      expect(b).toEqual(a);
    } finally {
      random.mockRestore();
    }
  });
  it("continues after an early goal whose pending last segment makes it more expensive", () => {
    const i: ApproachCorridorInput = {
      ...input(),
      startTangent: undefined,
      startNodeId: 0,
      goalNodeId: 1,
      goalTangent: [1, 0],
      nodes: [node(0, [0, 0], 1, 2), node(1, [100, 0]), node(2, [50, 5], 3), node(3, [90, 0], 1)],
      edgePenaltyMeters: (a, b) => (a === 0 && b === 1 ? 20 : 0)
    };
    const c = requireCorridor(i);
    expect(c.guideNodeIds).toEqual([0, 2, 3, 1]);
    expect(c.costMeters).toBeLessThan(120);
  });
  it("keeps searching for a dry detour after the cheaper fillet intersects water", () => {
    const i: ApproachCorridorInput = {
      ...input(),
      water: index([box(1, -4, 2, 2, 2)]),
      nodes: [
        node(0, [-20, 0], 1, 3),
        node(1, [0, 0], 2),
        node(2, [0, 60]),
        node(3, [20, 0], 4),
        node(4, [20, 40], 5),
        node(5, [0, 40], 2)
      ]
    };
    expect(requireCorridor(i).guideNodeIds).toEqual([0, 3, 4, 5, 2]);
  });
  it("preserves curvature and tangency after rotation, translation and uniform scaling", () => {
    const i = input(),
      original = requireCorridor(i),
      root = Math.sqrt(2);
    const rotate = ([x, y]: RiverPoint): RiverPoint => [(x - y) / root, (x + y) / root];
    const transform = ([x, y]: RiverPoint): RiverPoint => {
      const p = rotate([x, y]);
      return [100 + 2 * p[0], 50 + 2 * p[1]];
    };
    const transformed = requireCorridor({
      ...i,
      nodes: i.nodes.map(n => ({ ...n, point: transform(n.point) })),
      startTangent: rotate(i.startTangent!),
      goalTangent: rotate(i.goalTangent),
      settings: {
        ...settings,
        roadWidthMeters: 4,
        minimumTurnRadiusMeters: 20,
        minimumFinalStraightMeters: 4,
        maxEnvelopeErrorMeters: 0.1
      }
    });
    expect(transformed.distanceMeters).toBeCloseTo(2 * original.distanceMeters, 8);
    expect(transformed.pieces[1]).toMatchObject({ radiusMeters: 20 });
  });
  it("rejects overflowing costs instead of confusing them with no corridor", () => {
    expect(findApproachCorridor({ ...input(), edgePenaltyMeters: () => 1e308 })).toMatchObject({
      reason: "invalid-cost"
    });
  });
});

describe("conservative circular road envelopes", () => {
  it("covers water between coarse chords rather than approving sampled centerline segments", () => {
    const arc = makeCorridorTurn([0, 0], [1, 0], [0, 1], 10)!.arc!;
    const angle = (-3 * Math.PI) / 8,
      x = -10 + 10 * Math.cos(angle),
      y = 10 + 10 * Math.sin(angle);
    const water = index([box(1, x - 0.02, y - 0.02, 0.04, 0.04)]);
    const middle: RiverPoint = [-10 + 10 * Math.cos(-Math.PI / 4), 10 + 10 * Math.sin(-Math.PI / 4)];
    expect(
      checkDryLandSegment({ start: arc.start, end: middle, widthMeters: 0.2, water, supportsDryFootprint: () => true })
    ).toHaveProperty("lengthMeters");
    expect(
      checkCorridorArc(arc, {
        roadWidthMeters: 0.2,
        maxEnvelopeErrorMeters: 10,
        maxArcSections: 10,
        water,
        supportsDryFootprint: () => true
      })
    ).toEqual({ reason: "water-intersection" });
  });
  it("requires terrain support over the entire curved footprint", () => {
    const arc = makeCorridorTurn([0, 0], [1, 0], [0, 1], 10)!.arc!;
    expect(
      checkCorridorArc(arc, {
        roadWidthMeters: 2,
        maxEnvelopeErrorMeters: 0.05,
        maxArcSections: 100,
        water: index(),
        supportsDryFootprint: () => false
      })
    ).toEqual({ reason: "unsupported-terrain" });
    expect(makeCorridorTurn([0, 0], [1, 0], [-1, 0], 10)).toBeNull();
  });
});

function bridgeFixture() {
  const source: CrossingCandidateInput = {
    id: 3,
    arcLengthMeters: 50,
    geometry: {
      axis: buildPolylineRiverAxis(7, 1, [
        [0, -50],
        [0, 50]
      ])!,
      water: {
        id: 7,
        rings: [
          [
            [-5, -50],
            [5, -50],
            [5, 50],
            [-5, 50]
          ]
        ],
        bankReferences: [
          [null, { side: "right", arcStart: 0, arcEnd: 100 }, null, { side: "left", arcStart: 100, arcEnd: 0 }]
        ]
      }
    },
    dimensions: { bankSeatMeters: 1, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 5 },
    otherWater: [],
    capability: { depthMeters: 3 },
    supportsDryFootprint: () => true
  };
  const water = index([source.geometry.water]);
  const result = createProvisionalRiverCrossing({ ...source, waterIndex: water });
  if (!("candidate" in result)) throw new Error(result.reason);
  return {
    crossing: result.candidate,
    crossingInput: source,
    water,
    settings: { ...settings, minimumTurnRadiusMeters: 4 },
    sideA: {
      nodes: [node(0, [40, 20], 1), node(1, [20, 20], 2), node(2, [20, 0], 3), node(3, result.candidate.approachA)],
      startNodeId: 0,
      approachNodeId: 3,
      startTangent: [-1, 0] as RiverPoint
    },
    sideB: {
      nodes: [
        node(0, [-40, -20], 1),
        node(1, [-20, -20], 2),
        node(2, [-20, 0], 3),
        node(3, result.candidate.approachB)
      ],
      startNodeId: 0,
      approachNodeId: 3,
      startTangent: [1, 0] as RiverPoint
    }
  };
}

describe("both outside approaches to a fixed perpendicular bridge", () => {
  it("validates both dry curved corridors without changing W/D/E or registering a route", () => {
    const i = bridgeFixture(),
      before = structuredClone(i.crossing);
    const result = connectRiverCrossingApproaches(i);
    expect(result).toHaveProperty("status", "approaches-validated");
    if (!("status" in result)) return;
    expect(result.crossing).toEqual(before);
    expect(result.crossing.status).toBe("provisional");
    expect(result.approachA.pieces.at(-1)!.end).toEqual(i.crossing.approachA);
    expect(result.approachB.pieces.at(-1)!.end).toEqual(i.crossing.approachB);
  });
  it("rejects width/endpoint/version contract changes", () => {
    const i = bridgeFixture();
    expect(connectRiverCrossingApproaches({ ...i, settings: { ...i.settings, roadWidthMeters: 3 } })).toEqual({
      reason: "invalid-approach-contract"
    });
    expect(connectRiverCrossingApproaches({ ...i, crossing: { ...i.crossing, geometryVersion: 99 } })).toEqual({
      reason: "invalid-crossing"
    });
    const changed = {
      ...i.sideA,
      nodes: i.sideA.nodes.map(n => (n.id === 3 ? { ...n, point: [11, 0] as RiverPoint } : n))
    };
    expect(connectRiverCrossingApproaches({ ...i, sideA: changed })).toEqual({ reason: "invalid-approach-contract" });
  });
  it("rejects a last-hop kink on one side instead of relaxing the bridge axis", () => {
    const i = bridgeFixture();
    const bad = { nodes: [node(0, [10, 20], 3), node(3, i.crossing.approachA)], startNodeId: 0, approachNodeId: 3 };
    expect(connectRiverCrossingApproaches({ ...i, sideA: bad })).toMatchObject({
      reason: "approach-unresolved",
      side: "A",
      search: { reason: "no-corridor" }
    });
  });
});
