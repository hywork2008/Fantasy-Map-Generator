import { describe, expect, it } from "vitest";
import {
  activeCargoAssignment,
  type CargoQuay,
  cargoShipGeometry,
  polygonsOverlap,
  solveCargoBerth
} from "./harborCargo";

const quay = (depth = 6): CargoQuay => ({
  id: "q",
  craneId: "c",
  landFaceId: "land",
  waterFaceId: "sea",
  a: [0, -40],
  b: [0, 40],
  outward: [-1, 0],
  axis: [3.6, 0],
  reach: 9,
  pulleyHeight: 8,
  transferHeight: 6.5,
  waterBelowQuay: 1,
  landDrop: [12.6, 0],
  swingDirections: [-1, 1],
  depth,
  water: [
    [-150, -100],
    [0, -100],
    [0, 100],
    [-150, 100]
  ],
  reservedWater: []
});

describe("fixed-jib cargo berths", () => {
  it("aligns the actual scaled barge handover point with the hook, broadside to the quay", () => {
    const q = quay();
    const result = solveCargoBerth(q, "barge", 18, () => true)!;
    expect(result).toBeDefined();
    const g = cargoShipGeometry("barge", 18);
    expect(result.point[0]).toBeCloseTo(-5.4);
    expect(result.point[0] - Math.sin(result.rotation) * g.accessAlong).toBeCloseTo(result.assignment.hook[0]);
    expect(result.point[1] + Math.cos(result.rotation) * g.accessAlong).toBeCloseTo(result.assignment.hook[1]);
    expect(Math.abs(Math.cos(result.rotation))).toBeCloseTo(1);
  });
  it("rejects an interior point of the working circle and insufficient quay length", () => {
    expect(solveCargoBerth({ ...quay(), landDrop: [5, 0] }, "barge", 18, () => true)).toBeUndefined();
    expect(solveCargoBerth({ ...quay(), a: [0, -8], b: [0, 8] }, "barge", 18, () => true)).toBeUndefined();
  });
  it("rejects large ships beyond reach, deep drafts, low lifting height and rigging across the access", () => {
    expect(solveCargoBerth(quay(), "large", 42, () => true)).toBeUndefined();
    expect(solveCargoBerth(quay(1), "small", 16, () => true)).toBeUndefined();
    expect(solveCargoBerth({ ...quay(), transferHeight: 1 }, "small", 16, () => true)).toBeUndefined();
    expect(solveCargoBerth(quay(), "small", 16, () => true)).toBeUndefined();
    expect(solveCargoBerth(quay(), "medium", 25, () => true)).toBeUndefined();
    expect(solveCargoBerth(quay(1.3), "barge", 18, () => true)).toBeDefined();
    expect(
      solveCargoBerth({ ...quay(), transferHeight: 1.6, waterBelowQuay: 3 }, "barge", 18, () => true)
    ).toBeDefined();
    expect(
      solveCargoBerth({ ...quay(), transferHeight: 1.6, waterBelowQuay: 0.3 }, "barge", 18, () => true)
    ).toBeUndefined();
  });
  it("rejects obstacles in the approach or swept load path, even with a clear final berth", () => {
    expect(solveCargoBerth(quay(), "barge", 18, (_polygon, center) => center[0] > -10)).toBeUndefined();
    expect(
      solveCargoBerth(
        quay(),
        "barge",
        18,
        () => true,
        p => Math.abs(p[1]) < 2
      )
    ).toBeUndefined();
    expect(solveCargoBerth({ ...quay(), swingDirections: [] }, "barge", 18, () => true)).toBeUndefined();
  });
  it("detects thin piers crossing the hull and invalidates an edited ship's operation", () => {
    expect(
      polygonsOverlap(
        [
          [-10, -2],
          [10, -2],
          [10, 2],
          [-10, 2]
        ],
        [
          [-1, -8],
          [1, -8],
          [1, 8],
          [-1, 8]
        ]
      )
    ).toBe(true);
    const result = solveCargoBerth(quay(), "barge", 18, () => true)!;
    const ship = {
      id: "s",
      kind: "ship" as const,
      locked: false,
      faceIds: ["sea"],
      shipType: "barge" as const,
      point: result.point,
      rotation: result.rotation,
      sizeMeters: 18,
      harborOperation: result.assignment
    };
    expect(activeCargoAssignment(ship)).toBe(result.assignment);
    expect(activeCargoAssignment({ ...ship, point: [20, 20] })).toBeUndefined();
    expect(activeCargoAssignment({ ...ship, sizeMeters: 20 })).toBeUndefined();
    expect(activeCargoAssignment(ship, [])).toBeUndefined();
    expect(activeCargoAssignment(ship, [quay()])).toBeDefined();
    ship.point[0] += 2;
    expect(activeCargoAssignment(ship)).toBeUndefined();
  });
});
