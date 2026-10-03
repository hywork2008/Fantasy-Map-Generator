import { describe, expect, it } from "vitest";
import { buildPolylineRiverAxis, type RiverPoint } from "../services/riverGeometry";
import type { PhysicalWaterPolygon } from "../services/riverPhysicalGeometry";
import { RIVER_CARGO_VESSEL, SEA_SAILING_VESSEL } from "../utils/riverCrossing";
import {
  type CrossingCandidateInput,
  createProvisionalRiverCrossing,
  type ProvisionalRiverCrossing,
  validateProvisionalRiverCrossing
} from "./riverCrossingCandidates";

function fixture(): CrossingCandidateInput {
  return {
    id: 42,
    arcLengthMeters: 50,
    geometry: {
      axis: buildPolylineRiverAxis(7, 3, [
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
    capability: { period: "ageOfExploration", depthMeters: 3 },
    supportsDryFootprint: () => true
  };
}
function getCandidate(input: CrossingCandidateInput): ProvisionalRiverCrossing {
  const result = createProvisionalRiverCrossing(input);
  expect(result).toHaveProperty("candidate");
  if (!("candidate" in result)) throw new Error(result.reason);
  return result.candidate;
}
function rectangle(id: number, lo: number, hi: number, bottom = -10, top = 10): PhysicalWaterPolygon {
  return {
    id,
    rings: [
      [
        [lo, bottom],
        [hi, bottom],
        [hi, top],
        [lo, top]
      ]
    ]
  };
}

describe("provisional physical perpendicular crossings", () => {
  it("separates water, deck and approach endpoints on q's normal, using actual banks", () => {
    const input = fixture(),
      before = structuredClone(input.geometry);
    const c = getCandidate(input);
    expect(c.q).toEqual([0, 0]);
    expect(c.tRiver).toEqual([0, 1]);
    expect(c.waterA).toEqual([5, 0]);
    expect(c.waterB).toEqual([-5, 0]);
    expect(c.deckA).toEqual([6, 0]);
    expect(c.deckB).toEqual([-6, 0]);
    expect(c.approachA).toEqual([10, 0]);
    expect(c.approachB).toEqual([-10, 0]);
    expect(c.waterDistanceMeters).toBe(10);
    expect(c.deckLengthMeters).toBe(12);
    expect(c.plan.widthMeters).toBe(12);
    expect(c.status).toBe("provisional");
    expect(validateProvisionalRiverCrossing(c, input)).toBe(true);
    expect(input.geometry).toEqual(before);
    expect(getCandidate(input)).toEqual(c);
  });
  it("uses asymmetric boundaries instead of centering a nominal width on q", () => {
    const input = fixture();
    input.geometry.water = {
      ...input.geometry.water,
      rings: [
        [
          [-3, -50],
          [7, -50],
          [7, 50],
          [-3, 50]
        ]
      ]
    };
    const c = getCandidate(input);
    expect(c.waterA).toEqual([7, 0]);
    expect(c.waterB).toEqual([-3, 0]);
  });
  it("detects parallel-shifted endpoints, stale geometry and bank references", () => {
    const input = fixture(),
      c = getCandidate(input);
    const shifted = { ...c, deckA: [6, 1] as RiverPoint, deckB: [-6, 1] as RiverPoint };
    expect(validateProvisionalRiverCrossing(shifted, input)).toBe(false);
    expect(validateProvisionalRiverCrossing({ ...c, geometryVersion: 2 }, input)).toBe(false);
    const stale = structuredClone(c);
    stale.banks[0].bankArcLength = 49;
    expect(validateProvisionalRiverCrossing(stale, input)).toBe(false);
  });
  it("rejects the axis corner and its approach-width window", () => {
    const input = fixture();
    input.geometry.axis = buildPolylineRiverAxis(7, 3, [
      [0, -50],
      [0, 0],
      [50, 0]
    ])!;
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "unstable-axis" });
    input.arcLengthMeters = 48;
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "unstable-axis" });
  });
  it("rejects a far bank from a downstream fold even within a single water interval", () => {
    const input = fixture();
    input.geometry.water.bankReferences = [
      [null, { side: "right", arcStart: 60, arcEnd: 160 }, null, { side: "left", arcStart: 100, arcEnd: 0 }]
    ];
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "nonlocal-banks" });
  });
  it("rejects a dry centerline with water under the road's side", () => {
    const input = fixture();
    input.otherWater = [rectangle(8, 7, 8, 0.5, 3)];
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "wet-approach" });
  });
  it("ignores water beyond the finite approaches, including normal-aligned remote banks", () => {
    const input = fixture();
    input.otherWater = [rectangle(8, 30, 40)];
    expect(getCandidate(input).plan.kind).toBe("fixedBridge");
    // A separate outer ring represents another fold of this river far along the normal.
    input.geometry.water.rings = [...input.geometry.water.rings, rectangle(7, 30, 40, 0, 10).rings[0]];
    input.geometry.water.bankReferences = [...input.geometry.water.bankReferences!, [null, null, null, null]];
    expect(getCandidate(input).deckLengthMeters).toBe(12);
  });
  it("rejects another flow or island inside the occupied deck", () => {
    const input = fixture();
    input.otherWater = [rectangle(8, -1, 1)];
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "compound-crossing" });
    input.otherWater = [];
    input.geometry.water.rings = [...input.geometry.water.rings, rectangle(7, 2, 3, 0.4, 0.8).rings[0]];
    input.geometry.water.bankReferences = [...input.geometry.water.bankReferences!, [null, null, null, null]];
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "compound-crossing" });
  });
  it("requires complete dry support footprints on both sides", () => {
    const input = fixture(),
      received: (readonly RiverPoint[])[] = [];
    input.supportsDryFootprint = p => {
      received.push(p);
      return true;
    };
    getCandidate(input);
    expect(received).toHaveLength(2);
    expect(received[0]).toHaveLength(4);
    input.supportsDryFootprint = () => false;
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "unsupported-bank" });
  });
  it("rejects ferry and none plans without creating a land bridge", () => {
    const input = fixture();
    input.capability.transport = { maxBridgeCrossingMeters: 11 };
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "bridge-unavailable" });
    input.capability.depthMeters = 0.5;
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "bridge-unavailable" });
  });
  it("honors vessel clearance when choosing fixed or movable bridges", () => {
    const input = fixture();
    input.capability.vessel = RIVER_CARGO_VESSEL;
    expect(getCandidate(input).plan.kind).toBe("fixedBridge");
    input.capability.vessel = SEA_SAILING_VESSEL;
    input.capability.depthMeters = 5;
    expect(getCandidate(input).plan.kind).toBe("movableBridge");
    input.capability.period = "earlyMedieval";
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "bridge-unavailable" });
  });
  it("rejects missing provenance, invalid water and uncalibrated dimensions", () => {
    const input = fixture();
    input.geometry.water.bankReferences = undefined;
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "nonlocal-banks" });
    input.geometry.water.rings = [];
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "invalid-input" });
    const second = fixture();
    second.dimensions.roadWidthMeters = NaN;
    expect(createProvisionalRiverCrossing(second)).toEqual({ reason: "invalid-input" });
  });
  it("preserves perpendicularity and physical lengths after rotation and translation", () => {
    const input = fixture();
    const transform = ([x, y]: RiverPoint): RiverPoint => [100 + (x - y) / Math.sqrt(2), 50 + (x + y) / Math.sqrt(2)];
    input.geometry.axis = buildPolylineRiverAxis(
      7,
      3,
      [
        [0, -50],
        [0, 50]
      ].map(p => transform(p as RiverPoint))
    )!;
    input.geometry.water.rings = input.geometry.water.rings.map(r => r.map(transform));
    const c = getCandidate(input);
    const dx = c.deckB[0] - c.deckA[0],
      dy = c.deckB[1] - c.deckA[1];
    expect(dx * c.tRiver[0] + dy * c.tRiver[1]).toBeCloseTo(0, 9);
    expect(c.waterDistanceMeters).toBeCloseTo(10, 9);
    expect(c.deckLengthMeters).toBeCloseTo(12, 9);
  });
  it("rejects water outside the axis, cap contacts and self-intersecting input", () => {
    const input = fixture();
    input.geometry.water = rectangle(7, 20, 30);
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "unresolved-section" });
    input.geometry.water = {
      id: 7,
      rings: [
        [
          [-5, -50],
          [5, 50],
          [5, -50],
          [-5, 50]
        ]
      ]
    };
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "invalid-input" });
    input.geometry.water = rectangle(7, -5, 5, 0, 10);
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "unresolved-section" });
  });
  it("rejects a bridge end seated dry at its center but wet at its corner", () => {
    const input = fixture();
    input.geometry.water.rings = [
      [
        [-5, -50],
        [5, -50],
        [105, 50],
        [-105, 50]
      ]
    ];
    expect(createProvisionalRiverCrossing(input)).toEqual({ reason: "wet-approach" });
  });
  it("validates reordered saved fields without depending on JSON property order", () => {
    const input = fixture(),
      c = getCandidate(input);
    const saved = structuredClone(c);
    saved.plan = Object.fromEntries(Object.entries(saved.plan).reverse()) as typeof saved.plan;
    saved.banks[0].reference = Object.fromEntries(
      Object.entries(saved.banks[0].reference!).reverse()
    ) as (typeof saved.banks)[0]["reference"];
    expect(validateProvisionalRiverCrossing(saved, input)).toBe(true);
  });
  it("keeps candidate bank metadata independent from the source geometry", () => {
    const input = fixture(),
      c = getCandidate(input);
    c.banks[0].reference!.arcStart = 25;
    expect(input.geometry.water.bankReferences![0][1]!.arcStart).toBe(0);
    expect(validateProvisionalRiverCrossing(c, input)).toBe(false);
  });
});
