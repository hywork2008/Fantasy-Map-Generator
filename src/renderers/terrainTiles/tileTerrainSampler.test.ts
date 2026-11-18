import { describe, expect, it } from "vitest";
import type { LocalTerrainSampler } from "../localTerrainSampler";
import type { TerrainTileLayer } from "./terrainTileLayer";
import { createTileTerrainSampler } from "./tileTerrainSampler";

/** A layer with levels of 1000 m and 250 m; `values[z]` answers rawMetersAt or null (not loaded). */
function fakeLayer(values: (number | null)[]): TerrainTileLayer {
  return {
    levelStepsMeters: [1000, 250],
    rawMetersAt: (_x: number, _y: number, z: number) => values[z] ?? null,
    pendingArea: () => 0,
    ensureArea: async () => false
  } as unknown as TerrainTileLayer;
}

const base = {
  consistency: { sampled: 1, mismatched: 0, ratio: 0, ok: true },
  realRivers: [],
  load: { ms: 0, rasterBytes: 0, rasters: 0 },
  levelSteps: [],
  metersAt: () => 7,
  landAt: () => false,
  pendingLevels: () => 0,
  ensureLevels: async () => false
} as LocalTerrainSampler;

describe("createTileTerrainSampler", () => {
  it("reads the level matching the step, then coarser ones, then the region raster", () => {
    expect(createTileTerrainSampler(fakeLayer([100, 120]), base, 1, 1).metersAt(0, 0, 250)).toBe(120);
    expect(createTileTerrainSampler(fakeLayer([100, null]), base, 1, 1).metersAt(0, 0, 250)).toBe(100);
    expect(createTileTerrainSampler(fakeLayer([null, null]), base, 1, 1).metersAt(0, 0, 250)).toBe(7);
    expect(createTileTerrainSampler(fakeLayer([-30, null]), base, 1, 1).metersAt(0, 0, 250)).toBe(0);
  });

  it("keeps the tri-state coast from the finest loaded level", () => {
    expect(createTileTerrainSampler(fakeLayer([-30, 2]), base, 1, 1).landAt(0, 0)).toBe(true);
    expect(createTileTerrainSampler(fakeLayer([5, -2]), base, 1, 1).landAt(0, 0)).toBeUndefined();
    expect(createTileTerrainSampler(fakeLayer([null, -8]), base, 1, 1).landAt(0, 0)).toBe(false);
    expect(createTileTerrainSampler(fakeLayer([null, null]), base, 1, 1).landAt(0, 0)).toBe(false);
  });
});
