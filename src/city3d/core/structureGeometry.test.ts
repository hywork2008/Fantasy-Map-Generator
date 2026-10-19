import { describe, expect, it } from "vitest";
import { sealRecord } from "../../buildings/canonicalJson";
import { coarseSolids } from "../../buildings/coarseSolids";
import type { BuildingRecord, Point } from "../../buildings/record";
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
  it("preserves tall landmark and tower roof pitches without the ordinary house limit", () => {
    for (const [roof, pitch] of [
      ["gable", 40],
      ["hip", 35],
      ["pyramid", 50]
    ] as const) {
      const structure: StructureMassing = {
        ...wall,
        id: "large-structure",
        kind: roof === "pyramid" ? "tower" : "landmark",
        centerline: undefined,
        widthMeters: undefined,
        footprint: [
          [0, 0],
          [60, 0],
          [60, 40],
          [0, 40]
        ],
        heightMeters: 16,
        baseElevationMeters: 2,
        ridgeAzimuth: 0,
        roof,
        parapet: "none"
      };
      const surfaces = structureSurfaces(structure)!;
      const positions = concatPositions(surfaces.walls, surfaces.roofs);
      expect(range(positions, 1).max).toBeCloseTo(18 + 20 * Math.tan((pitch * Math.PI) / 180), 4);
      expect(meshIsClosed(positions)).toBe(true);
    }
  });

  it("keeps an existing central spire inside a sufficiently tall temple roof", () => {
    const temple: StructureMassing = {
      ...wall,
      id: "temple",
      kind: "landmark",
      centerline: undefined,
      widthMeters: undefined,
      footprint: [
        [0, 0],
        [60, 0],
        [60, 40],
        [0, 40]
      ],
      heightMeters: 16,
      roof: "gable",
      ridgeAzimuth: 0,
      parapet: "none",
      spire: true
    };
    const roof = structureSurfaces({ ...temple, spire: false })!;
    const withSpire = structureSurfaces(temple)!;
    const expected = 16 + 20 * Math.tan((40 * Math.PI) / 180);
    expect(range(roof.roofs.positions, 1).max).toBeCloseTo(expected, 4);
    expect(range(withSpire.roofs.positions, 1).max).toBeCloseTo(expected, 4);
  });

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

  it("cuts a 4 m courtyard out of a 10 m flat keep", () => {
    const outer: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ];
    const hole: Point[] = [
      [3, 3],
      [3, 7],
      [7, 7],
      [7, 3]
    ];
    const surfaces = structureSurfaces({
      ...wall,
      id: "court",
      kind: "tower",
      centerline: undefined,
      widthMeters: undefined,
      footprint: outer,
      holes: [hole],
      heightMeters: 8,
      roof: "flat",
      parapet: "none"
    });
    expect(surfaces).not.toBeNull();
    const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
    expect(meshIsClosed(positions)).toBe(true);
    expect(positions.length / 9).toBeLessThanOrEqual(4000);
    expect(planArea(positions, 7.9)).toBeCloseTo(84, 0);
    expect(covers(positions, 7.9, 5, -5)).toBe(false);
    const flat = positions.some(
      (_, index) => index % 3 === 0 && Math.hypot(positions[index] - 3, positions[index + 2] - -3) < 0.05
    );
    expect(flat).toBe(true);
  });

  it("extrudes two identical floors as one solid", () => {
    const outer: Point[] = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5]
    ];
    const floor = {
      id: "ground",
      name: "Ground",
      elevationMeters: 0,
      floorToFloorMeters: 6,
      plates: [] as BuildingRecord["levels"][number]["plates"],
      walls: [{ id: "keep", kind: "keep" as const, outer, holes: [] as Point[][], thicknessMeters: 2 }],
      openings: [],
      fixtures: []
    };
    const record = sealRecord({
      format: "fmg-building-record",
      version: 1,
      id: "two-floors",
      revision: 1,
      contentHash: "",
      name: "Two floors",
      kind: "castle",
      period: "highMedieval",
      planFamily: "rectangular-keep",
      region: "fixture",
      occupancyMeters: { width: 10, depth: 10 },
      approachAzimuthRadians: 0,
      placementStyles: ["classic"],
      levels: [floor, { ...floor, id: "upper", name: "Upper", elevationMeters: 6, floorToFloorMeters: 5 }],
      verticalLinks: [
        {
          id: "stair",
          kind: "stair",
          fromLevelId: "ground",
          toLevelId: "upper",
          footprint: [
            [-4, -1],
            [-2, -1],
            [-2, 1],
            [-4, 1]
          ],
          widthMeters: 2
        }
      ],
      roofs: [{ baseId: "keep", form: "flat", pitchDeg: 0 }],
      materials: { wall: "stone", roof: "tile" },
      provenance: {
        constructionPeriod: "fixture",
        depictedPhase: "fixture",
        omitted: ["battlements"],
        dimensionSource: "authored",
        planClass: "published-dimensions",
        confidence: "approximate",
        note: "Schematic."
      }
    } as BuildingRecord);
    const solids = coarseSolids(record);
    expect(solids).toHaveLength(1);
    expect(solids[0].heightMeters).toBeCloseTo(11);
    expect(solids[0].baseElevationMeters).toBeCloseTo(0);
    const merged = structureSurfaces({
      ...wall,
      centerline: undefined,
      footprint: solids[0].outer,
      heightMeters: solids[0].heightMeters,
      baseElevationMeters: solids[0].baseElevationMeters,
      roof: "flat",
      parapet: "none"
    });
    const single = structureSurfaces({
      ...wall,
      centerline: undefined,
      footprint: outer,
      heightMeters: 11,
      roof: "flat",
      parapet: "none"
    });
    expect(concatPositions(merged!.walls, merged!.roofs).length).toBe(
      concatPositions(single!.walls, single!.roofs).length
    );
  });
});

function planArea(positions: Float32Array, yMin: number): number {
  let area = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const y0 = positions[i + 1];
    const y1 = positions[i + 4];
    const y2 = positions[i + 7];
    if (y0 < yMin || y1 < yMin || y2 < yMin) continue;
    const ax = positions[i];
    const ay = -positions[i + 2];
    const bx = positions[i + 3];
    const by = -positions[i + 5];
    const cx = positions[i + 6];
    const cy = -positions[i + 8];
    area += Math.abs((ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
  }
  return area;
}

function covers(positions: Float32Array, yMin: number, x: number, z: number): boolean {
  for (let i = 0; i < positions.length; i += 9) {
    if (positions[i + 1] < yMin || positions[i + 4] < yMin || positions[i + 7] < yMin) continue;
    const ax = positions[i];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cz = positions[i + 8];
    const c1 = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    const c2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx);
    const c3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
    if ((c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6) || (c1 <= 1e-6 && c2 <= 1e-6 && c3 <= 1e-6)) return true;
  }
  return false;
}
