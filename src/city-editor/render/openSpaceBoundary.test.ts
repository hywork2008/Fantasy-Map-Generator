import { describe, expect, it } from "vitest";
import type { Point } from "../core/types";
import { openSpaceBoundary } from "./openSpaceBoundary";

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const perimeter = (edges: [Point, Point][]) =>
  edges.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);

describe("harbor paving outline", () => {
  it("removes a triangulation diagonal regardless of winding", () => {
    const edges = openSpaceBoundary([
      [
        [0, 0],
        [10, 0],
        [10, 10]
      ],
      [
        [0, 0],
        [0, 10],
        [10, 10]
      ]
    ]);
    expect(edges).toHaveLength(4);
    expect(perimeter(edges)).toBe(40);
  });
  it("removes partial shared edges at T junctions", () => {
    const edges = openSpaceBoundary([rect(0, 0, 10, 10), rect(10, 0, 5, 4), rect(10, 4, 5, 6)]);
    expect(perimeter(edges)).toBe(50);
    expect(edges.every(([a, b]) => !(a[0] === 10 && b[0] === 10))).toBe(true);
  });
  it("retains river gaps and inner boundaries around obstacles", () => {
    expect(perimeter(openSpaceBoundary([rect(0, 0, 10, 10), rect(12, 0, 10, 10)]))).toBe(80);
    const ring = [rect(0, 0, 10, 2), rect(0, 8, 10, 2), rect(0, 2, 2, 6), rect(8, 2, 2, 6)];
    expect(perimeter(openSpaceBoundary(ring))).toBe(64);
  });
});
