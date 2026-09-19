import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { makeRng } from "./prng";
import { infillOutskirts, outskirtsBlockSpan } from "./streetGrowth";

const block: Point[] = [
  [7, 3],
  [233, 3],
  [233, 177],
  [7, 177]
];
const road: Point[][] = [
  [
    [7, 3],
    [7, 177]
  ]
];
const options = { lotArea: 150, laneWidth: 3, coverage: 0.75, occupancy: 0.82, build: true };

describe("outskirts street growth", () => {
  it("cuts collectors and T-junction stubs without filling every house gap", () => {
    const grown = infillOutskirts(block, road, [[7, 90]], options, makeRng("outskirts-growth"));
    expect(grown.lanes.length).toBeGreaterThan(2);
    expect(grown.buildings.length).toBeGreaterThan(grown.lanes.length * 5);
    const horizontal = grown.lanes.filter(l => Math.abs(l[0][1] - l[l.length - 1][1]) < 1);
    const vertical = grown.lanes.filter(l => Math.abs(l[0][0] - l[l.length - 1][0]) < 1);
    expect(horizontal.length).toBeGreaterThan(0);
    expect(vertical.length).toBeGreaterThan(0);
    expect(
      grown.lanes.some(lane =>
        grown.lanes.some(other => {
          if (lane === other) return false;
          const a = lane[0],
            b = lane[lane.length - 1];
          return nearestOnPolyline(a, other).dist < 0.5 || nearestOnPolyline(b, other).dist < 0.5;
        })
      )
    ).toBe(true);
    expect(grown.buildings.filter(b => polygonCentroid(b)[0] > 80).length).toBeGreaterThan(10);
    expect(grown.buildings.reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0)).toBeGreaterThan(2000);
  });

  it("is deterministic and leaves trails when nothing is built", () => {
    const a = infillOutskirts(block, road, [[7, 90]], options, makeRng("outskirts-growth"));
    const b = infillOutskirts(block, road, [[7, 90]], options, makeRng("outskirts-growth"));
    expect(a).toEqual(b);
    const empty = infillOutskirts(block, road, [[7, 90]], { ...options, build: false }, makeRng("outskirts-growth"));
    expect(empty.buildings).toEqual([]);
    expect(empty.lanes.length).toBeGreaterThan(0);
  });

  it("keeps block spacing in a house-row range", () => {
    expect(outskirtsBlockSpan(150, 3)).toBeGreaterThan(40);
    expect(outskirtsBlockSpan(150, 3)).toBeLessThan(90);
  });
});
