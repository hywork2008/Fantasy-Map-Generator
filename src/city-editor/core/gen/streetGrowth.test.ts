import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { makeRng } from "./prng";
import { blockSpan, infillCore, infillOutskirts, outskirtsBlockSpan } from "./streetGrowth";

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
const options = {
  lotArea: 150,
  laneWidth: 3,
  coverage: 0.75,
  occupancy: 0.82,
  build: true
};

describe("outskirts street growth", () => {
  it("cuts collectors and T-junction stubs without filling every house gap", () => {
    const grown = infillOutskirts(block, road, [[7, 90]], options, makeRng("outskirts-growth"));
    expect(grown.lanes.length).toBeGreaterThan(2);
    expect(grown.buildings.length).toBeGreaterThan(grown.lanes.length * 5);
    const across = grown.lanes.filter(
      l => Math.abs(l[0][0] - l[l.length - 1][0]) >= Math.abs(l[0][1] - l[l.length - 1][1])
    );
    const along = grown.lanes.filter(
      l => Math.abs(l[0][1] - l[l.length - 1][1]) > Math.abs(l[0][0] - l[l.length - 1][0])
    );
    expect(across.length).toBeGreaterThan(0);
    expect(along.length).toBeGreaterThan(0);
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
    expect(blockSpan(150, 3, "core")).toBeGreaterThanOrEqual(40);
    expect(blockSpan(150, 3, "core")).toBeLessThanOrEqual(70);
  });
});

describe("core closed-block infill", () => {
  const coreOptions = {
    lotArea: 150,
    laneWidth: 3,
    coverage: 0.75,
    occupancy: 0.965,
    build: true
  };
  it("keeps every stub so strips become closed blocks, without thinning", () => {
    const core = infillCore(block, road, [[7, 90]], coreOptions, makeRng("core-blocks"));
    const outer = infillOutskirts(block, road, [[7, 90]], options, makeRng("core-blocks"));
    expect(core.buildings.length).toBeGreaterThan(outer.buildings.length);
    const closed = core.lanes.filter(lane => {
      const onOther = (p: Point) => core.lanes.some(other => other !== lane && nearestOnPolyline(p, other).dist < 0.5);
      return onOther(lane[0]) && onOther(lane[lane.length - 1]);
    });
    expect(closed.length).toBeGreaterThan(0);
    expect(core.buildings.length).toBeGreaterThan(70);
    expect(core.buildings.every(p => p.every(q => q[0] > 7))).toBe(true);
    expect(core.buildings.every(p => p.length === 4)).toBe(true);
  });

  it("snaps the local grid to an inspector orientation", () => {
    const grown = infillCore(block, road, [[7, 90]], { ...coreOptions, orientation: 0.3 }, makeRng("core-orientation"));
    expect(
      grown.lanes.some(l => {
        const a = l[0],
          b = l[l.length - 1];
        return Math.abs(Math.sin(2 * (Math.atan2(b[1] - a[1], b[0] - a[0]) - 0.3))) < 1e-6;
      })
    ).toBe(true);
  });

  it("does not fill a cell with a regular orthogonal lattice", () => {
    const core = infillCore(block, road, [[7, 90]], coreOptions, makeRng("core-blocks"));
    expect(
      core.lanes.some(l => {
        const dx = Math.abs(l[0][0] - l[l.length - 1][0]),
          dy = Math.abs(l[0][1] - l[l.length - 1][1]);
        return dx > 3 && dy > 3;
      })
    ).toBe(true);
    const horizontals = core.lanes
      .filter(l => Math.abs(l[0][1] - l[l.length - 1][1]) < 8)
      .map(l => (l[0][1] + l[l.length - 1][1]) / 2)
      .sort((a, b) => a - b);
    const gaps = horizontals.slice(1).map((y, i) => y - horizontals[i]);
    if (gaps.length >= 2) expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(6);
  });
});
