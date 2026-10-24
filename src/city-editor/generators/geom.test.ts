import { describe, expect, it } from "vitest";
import type { Point } from "../types/geometry";
import { clipPolygonHalfPlane, inwardNormal, simplifyPolyline, splitPolygonHalfPlane } from "./geom";

describe("splitPolygonHalfPlane", () => {
  it("matches separate clips through corners, tolerance bands and nearly duplicate vertices", () => {
    const rings: Point[][] = [
      [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2]
      ],
      [
        [0, 0],
        [1e-5, 0],
        [2, 0],
        [1, 2]
      ],
      [
        [-2e-9, -1],
        [0.5e-9, 0],
        [2e-9, 1],
        [2, 0]
      ],
      [
        [-2, -2],
        [2, -2],
        [2, -1],
        [-1, -1],
        [-1, 2],
        [-2, 2]
      ],
      [
        [0, 0],
        [0, 0]
      ],
      []
    ];
    for (const ring of rings)
      for (const normal of [
        [1, 0],
        [0, 1],
        [0.6, 0.8],
        [-0.8, 0.6]
      ] as Point[])
        for (const origin of [
          [0, 0],
          [2, 2],
          [-10, -10],
          [1e-9, 0]
        ] as Point[])
          expect(splitPolygonHalfPlane(ring, origin, normal)).toEqual([
            clipPolygonHalfPlane(ring, origin, normal),
            clipPolygonHalfPlane(ring, origin, [-normal[0], -normal[1]])
          ]);
  });
});

describe("inwardNormal", () => {
  // C shape whose centroid lies in the notch, outside the polygon.
  const c: Point[] = [
    [0, 0],
    [10, 0],
    [10, 2],
    [2, 2],
    [2, 8],
    [10, 8],
    [10, 10],
    [0, 10]
  ];

  it.each([
    ["as given", c, [10, 2], [2, 2]],
    ["reversed", [...c].reverse(), [2, 2], [10, 2]]
  ])("points into a concave ring wound %s", (_, poly, a, b) => {
    // Inner edge of the lower arm faces the notch; inward is down (-y).
    const n = inwardNormal(a as Point, b as Point, poly as Point[]);
    expect(n[1]).toBeLessThan(0);
    expect(Math.abs(n[0])).toBeLessThan(1e-9);
  });
});

describe("simplifyPolyline closed", () => {
  it("keeps a significant last vertex of the ring", () => {
    const ring: Point[] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
      [0, 10],
      [-5, 5]
    ];
    const out = simplifyPolyline(ring, 0.25, true);
    expect(out).toContainEqual([-5, 5]);
    expect(out).not.toContainEqual([10, 0]);
    expect(out).toHaveLength(5);
  });
});
