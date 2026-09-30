import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { clipRowsToConvex, coastalBandOverlap, cultivableParts } from "./coastalSuitability";
import { polygonArea } from "./geom";

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1]
];

describe("coastal arable area", () => {
  it("keeps the interior of a coarse shore-facing field", () => {
    const parts = cultivableParts(rectangle(0, 0, 150, 100), [
      [
        [0, 0],
        [0, 100]
      ]
    ]);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.reduce((area, part) => area + Math.abs(polygonArea(part)), 0)).toBeCloseTo(9000);
    expect(parts.every(part => part.every(([x]) => x >= 60 - 1e-6))).toBe(true);
  });

  it("removes a wholly exposed plot but leaves inland plots intact", () => {
    const shore: [Point, Point][] = [
      [
        [0, 0],
        [0, 100]
      ]
    ];
    expect(cultivableParts(rectangle(0, 0, 40, 100), shore)).toEqual([]);
    expect(cultivableParts(rectangle(80, 0, 120, 100), shore)).toEqual([rectangle(80, 0, 120, 100)]);
  });

  it("clips existing rows without changing their direction", () => {
    const rows = clipRowsToConvex(
      [
        [
          [0, 20],
          [150, 20]
        ]
      ],
      rectangle(60, 0, 150, 100)
    );
    expect(rows).toEqual([
      [
        [60, 20],
        [150, 20]
      ]
    ]);
  });

  it("detects buildings crossing the coastal building strip", () => {
    const shore: [Point, Point][] = [
      [
        [0, 0],
        [0, 100]
      ]
    ];
    expect(coastalBandOverlap(rectangle(15, 20, 30, 40), shore, 20)).toBe(true);
    expect(coastalBandOverlap(rectangle(25, 20, 40, 40), shore, 20)).toBe(false);
  });
});
