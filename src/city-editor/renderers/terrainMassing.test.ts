import { describe, expect, it } from "vitest";
import type { CityTerrain } from "../generators/terrainElevation";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";
import { groundStructures } from "./terrainMassing";

describe("groundStructures walls", () => {
  it("grounds each stretch of a long wall on its own terrain, not on a distant hill", () => {
    const heightAt = (p: Point) => (p[0] > 900 ? 100 : 0);
    const terrain = {
      relief: true,
      heightAt,
      foundationAt: (ring: Point[]) => Math.max(...ring.map(heightAt))
    } as unknown as CityTerrain;
    const centerline: Point[] = [
      [0, 0],
      [300, 0],
      [600, 0],
      [1000, 0]
    ];
    const wall = {
      id: "wall:w:0",
      kind: "wall",
      material: "stone",
      centerline,
      widthMeters: 4,
      baseElevationMeters: 0,
      heightMeters: 8,
      roof: "none",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    } as StructureMassing;
    const out = groundStructures([wall], terrain);
    const flat = out.filter(part => part.centerline?.[0][0] === 0);
    expect(flat.length).toBeGreaterThan(0);
    for (const part of out.filter(p => p.centerline && p.centerline[p.centerline.length - 1][0] <= 600))
      expect(part.baseElevationMeters + part.heightMeters).toBeLessThan(10);
  });
});
