import { describe, expect, it } from "vitest";
import { concatPositions, meshIsClosed } from "../../city3d/core/massingGeometry";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import { createStructureMassing } from "../../city3d/three/structureMeshes";
import type { CityTerrain } from "../generators/terrainElevation";
import { cityTerrain } from "../generators/terrainElevation";
import { BRIDGE_WATER_CLEARANCE_METERS } from "../generators/terrainField/constants";
import { createTerraceRiverStudy } from "../generators/terrainField/study";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";
import { groundStructures } from "./terrainMassing";

describe("groundStructures walls", () => {
  it("drapes a curtain on the ground so a distant hill does not raise the near wall", () => {
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
    const [sloped] = groundStructures([wall], terrain);
    const line = sloped.centerline!;
    const bases = sloped.baseElevationsMeters!;
    expect(bases).toHaveLength(line.length);
    for (let i = 0; i < line.length; i++) {
      expect(bases[i]).toBeCloseTo(heightAt(line[i]) - 0.3, 5);
      if (line[i][0] <= 600) expect(sloped.topElevationsMeters![i]).toBeLessThan(10);
    }
    expect(line.every((point, i) => !i || point[0] - line[i - 1][0] <= 1 + 1e-6)).toBe(true);
    expect(bases.at(-1)).toBeCloseTo(99.7, 5);
    expect(sloped.heightMeters).toBe(8);
    const meshes = createStructureMassing([sloped]);
    expect(meshes.pickables.length).toBeGreaterThan(0);
    meshes.dispose();
  });

  it("keeps one wall height above a continuous slope", () => {
    const heightAt = (p: Point) => p[0] * 0.1;
    const terrain = {
      relief: true,
      heightAt,
      foundationAt: (ring: Point[]) => Math.max(...ring.map(heightAt))
    } as unknown as CityTerrain;
    const wall = {
      id: "wall:slope",
      kind: "wall",
      material: "stone",
      centerline: [
        [0, 0],
        [30, 0]
      ] as Point[],
      widthMeters: 4,
      baseElevationMeters: 0.4,
      heightMeters: 8,
      roof: "none",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    } as StructureMassing;
    const [sloped] = groundStructures([wall], terrain);
    const line = sloped.centerline!;
    const bases = sloped.baseElevationsMeters!;
    expect(bases[0]).toBeCloseTo(0.1, 5);
    expect(bases.at(-1)).toBeLessThanOrEqual(3.1);
    for (let i = 1; i < line.length; i++) {
      const mid: Point = [(line[i - 1][0] + line[i][0]) / 2, (line[i - 1][1] + line[i][1]) / 2];
      expect(Math.abs(heightAt(mid) + 0.1 - (bases[i - 1] + bases[i]) / 2)).toBeLessThanOrEqual(0.2 + 1e-6);
    }
    expect(sloped.heightMeters).toBe(8);
  });

  it("keeps the walk above the high bank and ramps across terrace joints without floating footings", () => {
    // The centerline sits at the foot of a bank; a narrow crest is invisible at the run's midpoint.
    const heightAt = ([x, y]: Point) => (x >= 11 && x <= 15 ? 12 : x >= 40 ? 6 : 0) + (y > 0.1 ? 4 : 0);
    const terrain = { relief: true, heightAt } as unknown as CityTerrain;
    const wall = {
      id: "wall:terrace",
      kind: "wall",
      material: "stone",
      centerline: [
        [0, 0],
        [30, 0],
        [60, 0]
      ],
      widthMeters: 4,
      baseElevationMeters: 0,
      heightMeters: 8,
      roof: "none",
      parapet: "outer",
      parapetMeters: 1,
      parapetWidthMeters: 0.5,
      anchor: [30, -10],
      spire: false
    } as StructureMassing;
    const [grounded] = groundStructures([wall], terrain);
    const line = grounded.centerline!,
      tops = grounded.topElevationsMeters!,
      bases = grounded.baseElevationsMeters!;
    for (let i = 0; i < line.length; i++) {
      expect(tops[i] - heightAt([line[i][0], 2])).toBeGreaterThanOrEqual(8);
      expect(bases[i]).toBeLessThan(heightAt([line[i][0], -2]));
      if (i) {
        const run = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        expect(Math.abs(tops[i] - tops[i - 1])).toBeLessThanOrEqual(run * 0.5 + 1e-6);
      }
    }
    const surfaces = structureSurfaces(grounded)!;
    // Inspect the actual rendered body and parapet at the high bank, not just the height metadata.
    for (const [soup, extra] of [
      [surfaces.walls, 0],
      [surfaces.roofs, 1]
    ] as const) {
      const positions = soup.positions;
      for (let i = 0; i < line.length; i++) {
        let top = -Infinity;
        for (let j = 0; j < positions.length; j += 3)
          if (Math.abs(positions[j] - line[i][0]) < 1e-4) top = Math.max(top, positions[j + 1]);
        expect(top).toBeCloseTo(tops[i] + extra, 4);
      }
    }

    const [ring] = groundStructures(
      [
        {
          ...wall,
          centerline: [
            [0, 0],
            [60, 0],
            [60, 30],
            [0, 30],
            [0, 0]
          ]
        }
      ],
      terrain
    );
    const ringLine = ring.centerline!,
      ringTops = ring.topElevationsMeters!;
    expect(ringTops[0]).toBe(ringTops.at(-1));
    expect(ring.baseElevationsMeters![0]).toBe(ring.baseElevationsMeters!.at(-1));
    for (let i = 1; i < ringLine.length; i++) {
      const run = Math.hypot(ringLine[i][0] - ringLine[i - 1][0], ringLine[i][1] - ringLine[i - 1][1]);
      expect(Math.abs(ringTops[i] - ringTops[i - 1])).toBeLessThanOrEqual(run * 0.5 + 1e-6);
    }
    const ringSurfaces = structureSurfaces(ring)!;
    expect(meshIsClosed(concatPositions(ringSurfaces.walls, ringSurfaces.roofs))).toBe(true);
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
