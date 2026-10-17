import { describe, expect, it } from "vitest";
import type { RoadRibbon } from "../../utils/roadSurface";
import { ROAD_THICKNESS_M, ROAD_TOP_Y, type RoadTriangleSoup, roadRibbonGeometry } from "./roadGeometry";
import { WATER_Y } from "./waterGeometry";

const EMPTY = { polygons: [], ribbons: [] };

function ribbon(
  surface: RoadRibbon["surface"],
  points: readonly (readonly [number, number])[],
  widthMeters: number
): RoadRibbon {
  return { centerline: points, widthMeters, surface };
}

function hex(red: number, green: number, blue: number): number {
  return (Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255);
}

function colorsOf(soup: RoadTriangleSoup): Set<number> {
  const found = new Set<number>();
  for (let i = 0; i < soup.colors.length; i += 3)
    found.add(hex(soup.colors[i], soup.colors[i + 1], soup.colors[i + 2]));
  return found;
}

function planTriangles(soup: RoadTriangleSoup): { verts: [number, number][]; centroid: [number, number] }[] {
  const triangles = [];
  for (let i = 0; i < soup.positions.length; i += 9) {
    const verts = [0, 1, 2].map(
      index => [soup.positions[i + index * 3], -soup.positions[i + index * 3 + 2]] as [number, number]
    );
    triangles.push({
      verts,
      centroid: [(verts[0][0] + verts[1][0] + verts[2][0]) / 3, (verts[0][1] + verts[1][1] + verts[2][1]) / 3] as [
        number,
        number
      ]
    });
  }
  return triangles;
}

describe("roadRibbonGeometry", () => {
  it("extrudes a straight road above the water and below a bridge", () => {
    const soup = roadRibbonGeometry(
      [
        ribbon(
          "earth",
          [
            [0, 0],
            [20, 0]
          ],
          4
        )
      ],
      EMPTY
    );
    expect(soup.positions.length).toBeGreaterThan(0);
    let top = false;
    let bottom = false;
    const startZ: number[] = [];
    for (let i = 0; i < soup.positions.length; i += 3) {
      const y = soup.positions[i + 1];
      expect(y).toBeGreaterThan(WATER_Y);
      expect(y).toBeLessThan(0.4);
      if (Math.abs(y - ROAD_TOP_Y) < 1e-4) top = true;
      if (Math.abs(y - (ROAD_TOP_Y - ROAD_THICKNESS_M)) < 1e-4) bottom = true;
      if (Math.abs(soup.positions[i]) < 1e-4 && Math.abs(y - ROAD_TOP_Y) < 1e-4) startZ.push(soup.positions[i + 2]);
    }
    expect(top).toBe(true);
    expect(bottom).toBe(true);
    expect(Math.abs(Math.max(...startZ) - Math.min(...startZ) - 4)).toBeLessThan(1e-4);
    expect(startZ.some(z => Math.abs(z + 2) < 1e-4)).toBe(true);
    const upward = [];
    for (let i = 1; i < soup.normals.length; i += 3) if (soup.normals[i] > 0.9) upward.push(soup.normals[i]);
    expect(upward.length).toBeGreaterThan(0);
  });

  it("paints setts with a different colour from earth", () => {
    const earth = colorsOf(
      roadRibbonGeometry(
        [
          ribbon(
            "earth",
            [
              [0, 0],
              [8, 0]
            ],
            4
          )
        ],
        EMPTY
      )
    );
    const setts = colorsOf(
      roadRibbonGeometry(
        [
          ribbon(
            "setts",
            [
              [0, 0],
              [4, 0]
            ],
            4
          )
        ],
        EMPTY
      )
    );
    expect(earth.has(0x8d6a3d)).toBe(true);
    expect(setts.has(0x8d6a3d)).toBe(false);
    expect([...setts].some(color => color !== 0x8d6a3d)).toBe(true);
  });

  it("returns an empty soup for an empty centre line", () => {
    expect(roadRibbonGeometry([ribbon("earth", [], 4)], EMPTY).positions).toHaveLength(0);
    expect(roadRibbonGeometry([ribbon("earth", [[0, 0]], 4)], EMPTY).positions).toHaveLength(0);
  });

  it("drops triangles that cross a rectangular channel and keeps them when the cut is empty", () => {
    const line = ribbon(
      "earth",
      [
        [-8, -8],
        [18, 18]
      ],
      3
    );
    const rect = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ] as const;
    const cut = roadRibbonGeometry([line], { polygons: [rect], ribbons: [] });
    const open = roadRibbonGeometry([line], EMPTY);
    const inside = (point: [number, number]) => point[0] > 0 && point[0] < 10 && point[1] > 0 && point[1] < 10;
    expect(planTriangles(cut).some(triangle => inside(triangle.centroid))).toBe(false);
    expect(
      planTriangles(cut).some(
        triangle =>
          triangle.verts.some(point => point[0] < 0 && point[1] < 0) &&
          triangle.verts.some(point => point[0] > 10 && point[1] > 10)
      )
    ).toBe(false);
    expect(planTriangles(open).some(triangle => inside(triangle.centroid))).toBe(true);
  });

  it("drops the half of a bank-side road that overlaps the water", () => {
    const line = ribbon(
      "earth",
      [
        [0, 3],
        [20, 3]
      ],
      4
    );
    const water = [
      [-5, -10],
      [25, -10],
      [25, 2],
      [-5, 2]
    ] as const;
    const cut = roadRibbonGeometry([line], { polygons: [water], ribbons: [] });
    const open = roadRibbonGeometry([line], EMPTY);
    expect(cut.positions.length).toBeGreaterThan(0);
    expect(open.positions.length).toBeGreaterThan(cut.positions.length);
    let dryHalf = false;
    for (let i = 0; i < cut.positions.length; i += 3) {
      const planY = -cut.positions[i + 2];
      expect(planY).toBeGreaterThanOrEqual(2 - 1e-4);
      if (planY > 4) dryHalf = true;
    }
    expect(dryHalf).toBe(true);
  });
});
