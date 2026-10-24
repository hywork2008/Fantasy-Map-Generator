import { describe, expect, it } from "vitest";
import type { RoadRibbon } from "../../utils/roadSurface";
import type { Point } from "../types/primitives";
import { gradeRoads, MAX_ROAD_GRADE, SIDE_SLOPE_RATIO } from "./roadGrading";

const ribbon = (centerline: Point[], extra: Partial<RoadRibbon> = {}): RoadRibbon => ({
  centerline,
  widthMeters: 6,
  surface: "earth",
  ...extra
});
/** A 12 m step between x = -5 and x = 5. */
const step = (point: Point) => Math.max(0, Math.min(12, (point[0] + 5) * 1.2));
const flat = () => null;
const profile = (grading: ReturnType<typeof gradeRoads>, from: number, to: number, y = 0) => {
  const out: Array<[number, number]> = [];
  for (let x = from; x <= to; x += 1) out.push([x, grading.apply([x, y], step([x, y]))]);
  return out;
};

describe("road grading", () => {
  it("climbs a step no steeper than the cart limit, level across the road, and flat ends on the terrain", () => {
    const grading = gradeRoads(
      [
        ribbon([
          [-200, 0],
          [200, 0]
        ])
      ],
      step,
      flat
    );
    const heights = profile(grading, -200, 200);
    for (let i = 1; i < heights.length; i++)
      expect(Math.abs(heights[i][1] - heights[i - 1][1])).toBeLessThanOrEqual(MAX_ROAD_GRADE.cart + 1e-3);
    expect(heights[0][1]).toBeCloseTo(0, 1);
    expect(heights.at(-1)![1]).toBeCloseTo(12, 1);
    for (const x of [-30, 0, 30]) expect(grading.apply([x, 2.9], 0)).toBeCloseTo(grading.apply([x, -2.9], 99), 6);
    // Side slopes leave the road at 1:1.5 and meet the terrain.
    const road = grading.apply([-20, 0], 0),
      ground = step([-20, 10]);
    expect(grading.apply([-20, 3 + 1.5], ground)).toBeCloseTo(
      Math.max(road - 1.5 / SIDE_SLOPE_RATIO, Math.min(road + 1.5 / SIDE_SLOPE_RATIO, ground)),
      6
    );
    expect(
      grading.needsRefinement([
        [-20, -10],
        [-10, 10],
        [0, -10]
      ])
    ).toBe(true);
  });
  it("keeps pinned platform summits and builds the ramp as fill below them", () => {
    const grading = gradeRoads(
      [
        ribbon([
          [-200, 0],
          [200, 0]
        ])
      ],
      step,
      flat,
      point => point[0] >= 5
    );
    expect(grading.apply([8, 0], 12)).toBeCloseTo(12, 6);
    expect(grading.apply([40, 0], 12)).toBeCloseTo(12, 6);
    expect(grading.apply([-50, 0], 0)).toBeGreaterThan(6);
  });
  it("stops a road at a cliff between levels instead of grading through it", () => {
    const level = (point: Point) => (Math.abs(point[0]) < 0.25 ? "cliff" : point[0] > 0 ? "top" : null);
    const grading = gradeRoads(
      [
        ribbon([
          [-40, 0],
          [40, 0]
        ])
      ],
      point => (point[0] > 0 ? 12 : 0),
      level
    );
    expect(grading.ribbons).toHaveLength(2);
    expect(grading.cliffBreaks.length).toBeGreaterThan(0);
    expect(grading.apply([-3, 0], 0)).toBeCloseTo(0, 6);
    expect(grading.apply([3, 0], 12)).toBeCloseTo(12, 6);
    // The lower road's corridor does not reach up onto the other level.
    expect(grading.apply([1, 2], 12)).toBe(12);
  });
  it("meets at junctions and joins a lane that ends inside a road", () => {
    const grading = gradeRoads(
      [
        ribbon([
          [-100, 0],
          [0, 0]
        ]),
        ribbon([
          [0, 0],
          [100, 0]
        ]),
        ribbon(
          [
            [0, 60],
            [0, 2.5]
          ],
          { widthMeters: 3, gradeClass: "lane" }
        )
      ],
      point => step([point[0], 0]) + point[1] * 0.3,
      flat
    );
    expect(grading.apply([-0.01, 0], 0)).toBeCloseTo(grading.apply([0.01, 0], 0), 2);
    expect(grading.apply([0, 2.5], 0)).toBeCloseTo(grading.apply([0, 0], 0), 0);
  });
});
