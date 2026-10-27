import { describe, expect, it } from "vitest";
import { concatPositions, meshIsClosed } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { createBastionPolygon } from "../generators/castleLayoutBuilder";
import { pointInPolygon } from "../generators/geom";
import { STAIR_RISER_METERS } from "../generators/roadGrading";
import type { CityTerrain } from "../generators/terrainElevation";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";
import { groundStructures } from "./terrainMassing";
import { connectWallWalks } from "./wallWalkConnections";

function curtain(id: string, centerline: Point[], heightMeters = 8): StructureMassing {
  return {
    id: `wall:${id}:0`,
    kind: "wall",
    material: "stone",
    centerline,
    widthMeters: 4,
    baseElevationMeters: 0,
    heightMeters,
    roof: "none",
    parapet: "outer",
    parapetMeters: 1.1,
    parapetWidthMeters: 0.8,
    anchor: [0, -30],
    spire: false
  };
}
function floor(part: StructureMassing): number {
  return part.topElevationsMeters?.[0] ?? part.baseElevationMeters + part.heightMeters;
}
function assertClosed(parts: StructureMassing[]) {
  for (const part of parts) {
    const surfaces = structureSurfaces(part);
    expect(surfaces, part.id).not.toBeNull();
    expect(meshIsClosed(concatPositions(surfaces!.walls, surfaces!.roofs)), part.id).toBe(true);
  }
}
function lipContains(parts: StructureMassing[], prefix: string, point: Point): boolean {
  return parts.some(
    p => p.id.startsWith(prefix) && p.id.includes(":lip-") && p.footprint && pointInPolygon(point, p.footprint)
  );
}

describe("wall walk connections", () => {
  it.each([false, true])(
    "steps down the high curtain and keeps the far end at its original height (reversed: %s)",
    reverse => {
      const line: Point[] = [
        [-30, 0],
        [0, 0]
      ];
      const high = curtain("old", reverse ? [...line].reverse() : line);
      const low = curtain(
        "castle",
        [
          [0, 0],
          [30, 0]
        ],
        4.9
      );
      const result = connectWallWalks([high, low]);
      const highRuns = result.filter(p => p.id.startsWith(high.id) && !p.id.includes(":lip-"));
      expect(highRuns.length).toBeGreaterThan(10);
      const heights = [...new Set(highRuns.map(floor))].sort((a, b) => a - b);
      expect(heights[0]).toBeCloseTo(4.9);
      expect(heights.at(-1)).toBeCloseTo(8);
      for (let i = 1; i < heights.length; i++)
        expect(heights[i] - heights[i - 1]).toBeLessThanOrEqual(STAIR_RISER_METERS + 1e-5);
      const near = highRuns.find(p => p.centerline!.some(([x]) => Math.abs(x) < 1e-5))!;
      expect(floor(near)).toBeCloseTo(4.9);
      expect(near.parapet).toBe("outer");
      expect(result.some(p => p.id.startsWith("wall-walk-rail:") && p.heightMeters === 0.7)).toBe(true);
      assertClosed(result);
    }
  );

  it("creates a landing at a T junction in the middle of an unsplit high curtain", () => {
    const high = curtain("old", [
      [-30, 0],
      [30, 0]
    ]);
    const low = curtain(
      "castle",
      [
        [0, 0],
        [0, 30]
      ],
      4.9
    );
    const result = connectWallWalks([high, low]);
    const landing = result.find(
      p =>
        p.id.startsWith(high.id) &&
        p.centerline &&
        Math.min(...p.centerline.map(p => p[0])) <= 0 &&
        Math.max(...p.centerline.map(p => p[0])) >= 0
    )!;
    expect(floor(landing)).toBeCloseTo(4.9);
    expect(landing.parapet).toBe("none");
    expect(lipContains(result, high.id, [0, 1.6])).toBe(false);
    expect(lipContains(result, high.id, [2.2, 1.6])).toBe(true);
    assertClosed(result);
  });

  it("opens the curtain parapet over the bastion and the bastion parapet at the wall walk", () => {
    const ring = createBastionPolygon([0, 0], 8.5, Math.PI / 4);
    const wall = curtain(
      "castle",
      [
        [-25, 0],
        [0, 0],
        [0, -25]
      ],
      4.9
    );
    wall.anchor = [-20, -20];
    const tower: StructureMassing = {
      ...wall,
      id: "tower:c:0",
      kind: "tower",
      centerline: undefined,
      footprint: ring,
      roof: "flat",
      parapet: "none"
    };
    const lip: StructureMassing = {
      ...wall,
      id: "bastion-parapet:c:0",
      centerline: [ring[3], ring[4], ring[0], ring[1], ring[2]],
      widthMeters: 1.1,
      baseElevationMeters: 4.9,
      heightMeters: 1.1,
      parapet: "none"
    };
    const result = connectWallWalks([wall, tower, lip]);
    expect(result.some(p => p.id.startsWith(`${wall.id}:body-`))).toBe(true);
    expect(result.some(p => p.id.startsWith(`${lip.id}:lip-`))).toBe(true);
    expect(lipContains(result, wall.id, [-0.5, 1.6])).toBe(false);
    // The tip stays protected while the deck intersections become openings.
    expect(result.filter(p => p.id.startsWith(`${lip.id}:lip-`)).length).toBeGreaterThanOrEqual(4);
    assertClosed(result);
  });

  it("keeps disconnected walls and different-storey parapets unchanged", () => {
    const high = curtain("high", [
      [-30, 0],
      [-5, 0]
    ]);
    const low = curtain(
      "low",
      [
        [0, 0],
        [30, 0]
      ],
      4.9
    );
    expect(connectWallWalks([high, low])).toEqual([high, low]);
  });

  it("grounds the bastion lip on the tower roof and resolves joints after terrain sampling", () => {
    const terrain = { relief: true, heightAt: () => 3, foundationAt: () => 3 } as unknown as CityTerrain;
    const high = curtain("old", [
      [-30, 0],
      [0, 0]
    ]);
    const low = curtain(
      "castle",
      [
        [0, 0],
        [30, 0]
      ],
      4.9
    );
    const grounded = groundStructures([high, low], terrain);
    const result = connectWallWalks(grounded);
    const near = result.find(
      p =>
        p.id.startsWith(high.id) &&
        p.centerline &&
        Math.min(...p.centerline.map(p => p[0])) <= 0 &&
        Math.max(...p.centerline.map(p => p[0])) >= 0
    )!;
    expect(floor(near)).toBeCloseTo(8.1);
    assertClosed(result);
    const tower: StructureMassing = {
      ...low,
      id: "tower:c:0",
      kind: "tower",
      centerline: undefined,
      footprint: [
        [-5, -5],
        [5, -5],
        [5, 5],
        [-5, 5]
      ],
      roof: "flat",
      parapet: "none"
    };
    const lip = {
      ...low,
      id: "bastion-parapet:c:0",
      widthMeters: 1.1,
      baseElevationMeters: 4.9,
      heightMeters: 1.1,
      parapet: "none" as const
    };
    const [roof, rim] = groundStructures([tower, lip], terrain);
    expect(rim.topElevationsMeters).toBeUndefined();
    expect(rim.baseElevationMeters).toBeCloseTo(roof.baseElevationMeters + roof.heightMeters);
  });
});
