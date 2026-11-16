import { describe, expect, it } from "vitest";
import type { Point } from "../types/document";
import { onReachableLand, pointOnReachableLand, reachableLand } from "./townReachability";

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][][] => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0]
  ]
];

describe("land reached from the town centre (pre-acceptance U5)", () => {
  // A river 10 m wide right across the frame, north of the town centre.
  const river = rect(-500, 90, 500, 100),
    farBank: Point = [0, 300],
    mill: Point[] = [
      [200, 200],
      [210, 200],
      [210, 210],
      [200, 210]
    ];

  it("leaves out the far bank of a river no road crosses", () => {
    const reach = reachableLand(500, [river], [], [0, 0]);
    expect(pointOnReachableLand(reach, farBank)).toBe(false);
    expect(onReachableLand(reach, mill)).toBe(false);
    expect(pointOnReachableLand(reach, [0, -300])).toBe(true);
  });

  it("joins the far bank over a bridge", () => {
    const reach = reachableLand(500, [river], [rect(-3, 80, 3, 110)], [0, 0]);
    expect(pointOnReachableLand(reach, farBank)).toBe(true);
    expect(onReachableLand(reach, mill)).toBe(true);
  });
});
