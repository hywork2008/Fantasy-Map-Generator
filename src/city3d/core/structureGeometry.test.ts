import { describe, expect, it } from "vitest";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import { concatPositions, meshIsClosed } from "./massingGeometry";
import { structureSurfaces } from "./structureGeometry";

function range(positions: Float32Array, axis: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < positions.length; i += 3) {
    min = Math.min(min, positions[i]);
    max = Math.max(max, positions[i]);
  }
  return { min, max };
}

const wall: StructureMassing = {
  id: "w",
  kind: "wall",
  material: "stone",
  centerline: [
    [0, 0],
    [20, 0]
  ],
  widthMeters: 4,
  heightMeters: 8,
  baseElevationMeters: 0,
  roof: "none",
  parapet: "outer",
  parapetMeters: 1.1,
  parapetWidthMeters: 1,
  anchor: [10, -30],
  spire: false
};

describe("structure geometry", () => {
  it("closes a curtain and lifts the parapet above the wall", () => {
    const surfaces = structureSurfaces(wall);
    expect(surfaces).not.toBeNull();
    const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
    expect(meshIsClosed(positions)).toBe(true);
    const height = range(positions, 1);
    expect(height.max).toBeCloseTo(9.1, 1);
    expect(height.min).toBeCloseTo(0, 2);
    const across = range(positions, 2);
    expect(across.max - across.min).toBeGreaterThan(3.5);
    expect(across.max - across.min).toBeLessThan(4.6);
  });

  it("raises a round tower above its eave", () => {
    const ring = Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2;
      return [Math.cos(angle) * 4, Math.sin(angle) * 4] as [number, number];
    });
    const surfaces = structureSurfaces({
      ...wall,
      id: "t",
      kind: "tower",
      centerline: undefined,
      widthMeters: undefined,
      footprint: ring,
      heightMeters: 12,
      roof: "pyramid",
      parapet: "none"
    });
    const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
    expect(meshIsClosed(positions)).toBe(true);
    expect(range(positions, 1).max).toBeGreaterThan(13);
  });
});
