import { describe, expect, it } from "vitest";
import type { Point } from "../core/types";
import { chainCoastSegments, smoothCoastlines } from "./coastline";

describe("coastline smoothing", () => {
  it("joins FMG's per-edge fragments into one chain regardless of order and direction", () => {
    const segs: Point[][] = [
      [
        [20, 0],
        [10, 5]
      ],
      [
        [0, 0],
        [10, 5]
      ],
      [
        [20, 0],
        [30, 8]
      ]
    ];
    const chains = chainCoastSegments(segs);
    expect(chains).toHaveLength(1);
    expect(chains[0].closed).toBe(false);
    expect(chains[0].points).toHaveLength(4);
  });

  it("an open chain passes through its endpoints and does not pass through interior vertices", () => {
    const [coast] = smoothCoastlines([
      [
        [0, 0],
        [10, 10],
        [20, 0],
        [30, 10]
      ]
    ]);
    expect(coast.curve[0]).toEqual([0, 0]);
    const end = coast.curve[coast.curve.length - 1];
    expect(end[0]).toBeCloseTo(30);
    expect(end[1]).toBeCloseTo(10);
    // B-spline cuts the corner: at the knot for vertex (10,10) the curve sits at y = (0 + 4*10 + 0) / 6
    expect(coast.curve.some(p => Math.abs(p[0] - 10) < 1e-9 && Math.abs(p[1] - 40 / 6) < 1e-9)).toBe(true);
    expect(coast.patches).toHaveLength(3);
    for (const [i, patch] of coast.patches.entries()) {
      expect(patch[0]).toEqual(coast.vertices[i]);
      expect(patch[patch.length - 1]).toEqual(coast.vertices[i + 1]);
    }
  });

  it("a closed ring stays closed and gets one patch per edge", () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0]
    ];
    const segs = square.slice(0, -1).map((p, i) => [p, square[i + 1]]);
    const [coast] = smoothCoastlines(segs);
    expect(coast.closed).toBe(true);
    expect(coast.curve[0]).toEqual(coast.curve[coast.curve.length - 1]);
    expect(coast.patches).toHaveLength(4);
  });
});
