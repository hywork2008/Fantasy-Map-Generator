import { describe, expect, it } from "vitest";
import type { Point } from "../types/primitives";
import type { TerrainFeature, TerrainPlatform } from "../types/terrain";
import {
  evaluateTerrainFeatures,
  indexTerrainFeatures,
  onPlatformSummit,
  onTerrainEscarpment,
  resolveTerrainFeatures,
  terrainLevelAt
} from "./terrainModel";

const pad = (id: string, x: number, level: number): TerrainPlatform => ({
  kind: "platform",
  id,
  role: "pad",
  levelMeters: level,
  edge: { kind: "wall" },
  summit: {
    kind: "polygon",
    points: [
      [x, -10],
      [x + 60, -10],
      [x + 60, 10],
      [x, 10]
    ]
  }
});

describe("terrain feature candidates", () => {
  it("preserves layered heights, cliff bands and road levels at bucket and shape boundaries", () => {
    const features: TerrainFeature[] = [
      pad("first", -40, 4),
      {
        kind: "riverCorridor",
        id: "river",
        sourceId: "river",
        centerline: [
          [-100, -32],
          [100, -32]
        ],
        widthsMeters: [8, 8],
        bedMeters: [-2, -4],
        depthMeters: 2,
        bank: { kind: "slope", runMeters: 8 }
      },
      pad("last", -10, 8),
      {
        kind: "platform",
        id: "castle",
        levelMeters: 30,
        edge: { kind: "cliff" },
        summit: { kind: "circle", center: [0, 0], radiusMeters: 3 }
      },
      {
        kind: "platform",
        id: "slope",
        levelMeters: 20,
        edge: { kind: "slope", runMeters: 12 },
        summit: { kind: "circle", center: [64, 32], radiusMeters: 6 }
      },
      {
        kind: "ringCut",
        id: "moat",
        axis: { center: [-64, 64], radiusMeters: 20 },
        widthMeters: 8,
        depthMeters: 4,
        rimElevationMeters: 10,
        bankFraction: 0.5
      },
      ...Array.from({ length: 8 }, (_, i) => pad(`far-${i}`, 500 + i * 100, 5))
    ];
    const resolved = resolveTerrainFeatures(features);
    const nearby = indexTerrainFeatures(resolved);
    const base = (point: Point) => 20 + point[0] / 100;
    const points: Point[] = [];
    for (let y = -100; y <= 100; y += 4) for (let x = -100; x <= 100; x += 4) points.push([x, y]);
    points.push([-40.1, 0], [-40, 0], [-39.875, 0], [0, 0], [10, 0], [82, 32], [2000, 0]);
    for (const point of points) {
      const candidates = nearby(point);
      expect(evaluateTerrainFeatures(candidates, base, point)).toBe(evaluateTerrainFeatures(resolved, base, point));
      expect(onTerrainEscarpment(candidates, "face", point)).toBe(onTerrainEscarpment(resolved, "face", point));
      expect(onPlatformSummit(candidates, point)).toBe(onPlatformSummit(resolved, point));
      expect(terrainLevelAt(candidates, point)).toBe(terrainLevelAt(resolved, point));
    }
    expect(evaluateTerrainFeatures(nearby([10, 0]), base, [10, 0])).toBe(8);
    expect(evaluateTerrainFeatures(nearby([0, 0]), base, [0, 0])).toBe(30);
    // Even outside a polygon, the narrow cliff band remains part of its wall.
    expect(onTerrainEscarpment(nearby([-40.1, 0]), "face", [-40.1, 0])).toBe(true);
    // Ring cuts cap distant natural ground at the rim too; they cannot be culled by radius.
    expect(evaluateTerrainFeatures(nearby([2000, 0]), base, [2000, 0])).toBe(10);
    expect(nearby([0, 0]).length).toBeLessThan(resolved.length);
  });

  it("keeps oversized platforms in their original order without expanding a huge index", () => {
    const features = resolveTerrainFeatures([
      pad("local", 0, 2),
      ...Array.from({ length: 8 }, (_, i) => pad(`far-${i}`, 500 + i * 100, 5)),
      {
        kind: "platform",
        id: "large",
        role: "pad",
        levelMeters: 7,
        edge: { kind: "wall" },
        summit: { kind: "circle", center: [0, 0], radiusMeters: 100000 }
      }
    ]);
    const nearby = indexTerrainFeatures(features);
    expect(evaluateTerrainFeatures(nearby([20, 0]), () => 0, [20, 0])).toBe(7);
    expect(evaluateTerrainFeatures(nearby([-2000, 0]), () => 0, [-2000, 0])).toBe(7);
  });
});
