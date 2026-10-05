import { describe, expect, it } from "vitest";
import { RIVER_GEOMETRY_TOLERANCE as epsilon } from "./riverGeometry";
import { pointInWater } from "./riverPhysicalGeometry";

describe("physical bank contact", () => {
  const diamond = {
    id: 1,
    rings: [
      [
        [0, 0],
        [10, 10],
        [0, 20],
        [-10, 10]
      ] as const
    ]
  };
  it("retains perpendicular and endpoint tolerances at diagonal bank corners", () => {
    expect(pointInWater([-1.3 * epsilon, -0.01 * epsilon], diamond)).toBe(true);
    expect(pointInWater([10 + epsilon, 10], diamond)).toBe(true);
    expect(pointInWater([10 + 2 * epsilon, 10], diamond)).toBe(false);
    expect(pointInWater([0, 10], diamond)).toBe(true);
    expect(pointInWater([100, 10], diamond)).toBe(false);
  });
  it("retains dry islands and wet island boundaries", () => {
    const water = {
      ...diamond,
      rings: [
        ...diamond.rings,
        [
          [-2, 8],
          [2, 8],
          [2, 12],
          [-2, 12]
        ] as const
      ]
    };
    expect(pointInWater([0, 10], water)).toBe(false);
    expect(pointInWater([2, 10], water)).toBe(true);
  });
});
