import { describe, expect, it } from "vitest";
import {
  type GlacisField,
  type GlacisOutwork,
  gapToLines,
  polygonClearsGlacis,
  polygonClearsOutworks
} from "./defenseClearance";

function square(x: number, y: number, half: number): [number, number][] {
  return [
    [x - half, y - half],
    [x + half, y - half],
    [x + half, y + half],
    [x - half, y + half]
  ];
}

const wall: GlacisField = {
  active: true,
  walls: [
    [
      [0, 0],
      [0, 100]
    ]
  ],
  bands: [
    {
      points: [
        [0, 50],
        [200, 50]
      ],
      clearance: 25,
      gateVertexId: "gate"
    }
  ],
  outworks: []
};

const barbican: GlacisOutwork = {
  gateId: "gate",
  gateVertexId: "gate",
  lines: [
    [
      [0, 40],
      [28, 40],
      [28, 46]
    ],
    [
      [28, 54],
      [28, 60],
      [0, 60]
    ],
    [
      [30, 42],
      [36, 42],
      [36, 48],
      [30, 48],
      [30, 42]
    ],
    [
      [30, 52],
      [36, 52],
      [36, 58],
      [30, 58],
      [30, 52]
    ]
  ],
  reachMeters: 36,
  clearance: 25
};

describe("defense clearance", () => {
  it("measures a plain gate from the curtain", () => {
    expect(polygonClearsGlacis(square(10, 50, 4), wall)).toBe(false);
    expect(polygonClearsGlacis(square(40, 50, 4), wall)).toBe(true);
    expect(gapToLines(square(40, 50, 4), wall.walls)).toBeCloseTo(36);
  });

  it("measures a barbican gate from the outer face", () => {
    const field: GlacisField = { ...wall, outworks: [barbican] };
    // 40 m from the curtain is still inside 25 m of the front towers.
    expect(polygonClearsGlacis(square(40, 50, 3), field)).toBe(false);
    expect(polygonClearsOutworks(square(40, 50, 3), [barbican])).toBe(false);
    // The front towers stand at x = 36. A 4 m square centred at 70 clears them by 30 m.
    expect(polygonClearsGlacis(square(70, 50, 4), field)).toBe(true);
  });

  it("keeps a frontier profile when the outwork faces an enemy", () => {
    const frontier: GlacisOutwork = { ...barbican, clearance: 70 };
    const field: GlacisField = {
      ...wall,
      bands: [
        {
          points: [
            [0, 50],
            [200, 50]
          ],
          clearance: 70,
          gateVertexId: "gate"
        }
      ],
      outworks: [frontier]
    };
    expect(polygonClearsGlacis(square(90, 50, 4), field)).toBe(false);
    expect(polygonClearsGlacis(square(120, 50, 4), field)).toBe(true);
  });

  it("does not pull an open town into a glacis", () => {
    expect(polygonClearsGlacis(square(5, 50, 2), { ...wall, active: false })).toBe(true);
  });
});
