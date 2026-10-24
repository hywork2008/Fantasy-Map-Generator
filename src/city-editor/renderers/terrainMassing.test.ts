import { describe, expect, it } from "vitest";
import type { CityTerrain } from "../generators/terrainElevation";
import { cityTerrain } from "../generators/terrainElevation";
import { BRIDGE_WATER_CLEARANCE_METERS } from "../generators/terrainField/constants";
import { createTerraceRiverStudy } from "../generators/terrainField/study";
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

describe("groundStructures bridges", () => {
  it("samples corridor water between the dry bank endpoints", () => {
    const document = createTerraceRiverStudy();
    const corridor = document.terrain!.features.find(feature => feature.kind === "riverCorridor")!;
    if (corridor.kind !== "riverCorridor") throw new Error("Missing corridor");
    const a = corridor.centerline[0],
      b = corridor.centerline[1];
    const at: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    corridor.depthMeters = 30;
    const terrain = cityTerrain(document, { renderSpacing: 8 });
    const ring: Point[] = [-1, 1].map(sign => [at[0] + sign * normal[0] * 25, at[1] + sign * normal[1] * 25]);
    const bridge = {
      id: "bridge:test",
      kind: "bridge",
      centerline: ring,
      baseElevationMeters: 0.4,
      heightMeters: 0.55
    } as StructureMassing;
    expect(ring.map(point => terrain.waterAt!(point))).toEqual([null, null]);
    const grounded = groundStructures([bridge], terrain)[0];
    expect(grounded.baseElevationMeters).toBeGreaterThanOrEqual(terrain.waterAt!(at)! + BRIDGE_WATER_CLEARANCE_METERS);
    expect(grounded.baseElevationMeters).toBeGreaterThanOrEqual(Math.max(...ring.map(terrain.heightAt)));
    const legacy = { ...terrain, waterAt: undefined };
    expect(groundStructures([bridge], legacy)[0].baseElevationMeters).toBeCloseTo(terrain.foundationAt(ring) + 0.4);
  });
});
