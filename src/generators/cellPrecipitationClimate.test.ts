import { describe, expect, it, vi } from "vitest";
import { createCellClimateNormalsReader, ensureCellClimateNormals, getCellClimateNormals } from "./cellClimateNormals";
import { ensureCellPrecipitationClimate } from "./cellPrecipitationClimate";
import * as windModule from "./cellWindClimate";
import { ensureCellWindClimate } from "./cellWindClimate";

import { seasonalPrecipitationWorld as continent } from "./fixtures/seasonalPrecipitationWorld";

describe("mapped seasonal precipitation", () => {
  it("varies by upwind coast and terrain, preserves annual fields and isolates returned arrays", () => {
    const world = continent();
    const before = world.grid.cells.prec.slice();
    const read = createCellClimateNormalsReader(world, 2023);
    const west = read(9 * 48 + 12)!,
      east = read(9 * 48 + 35)!;
    expect(west.precipitationSeasonalitySource).toBe("modeledSeasonality");
    expect(east.monthlyMoistureSupply).not.toEqual(west.monthlyMoistureSupply);
    expect(east.monthlyPrecipitationMm).not.toEqual(west.monthlyPrecipitationMm);
    expect(world.grid.cells.prec).toEqual(before);
    expect(east.monthlyPrecipitationMm.reduce((a, b) => a + b, 0)).toBeCloseTo(1500, 10);
    east.monthlyPrecipitationMm.fill(0);
    east.monthlyMoistureSupply.fill(0);
    expect(read(9 * 48 + 35)!.monthlyPrecipitationMm.some(v => v > 0)).toBe(true);
    const initial = ensureCellPrecipitationClimate(world);
    world.grid.cells.h[9 * 48 + 34] = 90;
    const mountain = ensureCellPrecipitationClimate(world);
    expect(mountain).not.toBe(initial);
    expect(mountain.monthlyMoistureSupply).not.toEqual(initial.monthlyMoistureSupply);
  });
  it("reuses paths across years and invalidates in-place geography, scale, wind and precipitation edits", () => {
    const world = continent();
    const first = ensureCellPrecipitationClimate(world);
    getCellClimateNormals(world, 450, 2023);
    getCellClimateNormals(world, 450, 2024);
    expect(ensureCellPrecipitationClimate(world)).toBe(first);
    const climate = ensureCellClimateNormals(world, 2024);
    world.options.winds[1] += 30;
    expect(ensureCellClimateNormals(world, 2024).revision).not.toBe(climate.revision);
    const edits = [
      () => {
        world.grid.cells.f[450] = 2;
      },
      () => {
        world.grid.points[450][0] += 0.1;
      },
      () => {
        world.grid.cells.c[450] = [];
      },
      () => {
        world.distanceScale *= 2;
      }
    ];
    for (const edit of edits) {
      const wind = ensureCellWindClimate(world),
        rain = ensureCellPrecipitationClimate(world);
      edit();
      expect(ensureCellWindClimate(world)).not.toBe(wind);
      expect(ensureCellPrecipitationClimate(world)).not.toBe(rain);
    }
    const previous = ensureCellClimateNormals(world, 2024);
    world.grid.cells.prec[450]++;
    expect(ensureCellClimateNormals(world, 2024).revision).not.toBe(previous.revision);
  });
  it("treats lake-only maps and small regional edges as uncertain, never invented oceans", () => {
    const world = continent();
    world.grid.features[0].type = "lake";
    expect(getCellClimateNormals(world, 450, 2023)!.precipitationSeasonalitySource).toBe("uniformFallback");
    world.grid.features[0].type = "ocean";
    world.mapCoordinates = { latN: 35, latT: 4, lonW: 0, lonT: 4 };
    world.distanceScale = 2;
    const normals = getCellClimateNormals(world, 450, 2023)!;
    expect(normals.precipitationSeasonalityConfidence).toBeLessThan(0.5);
    world.grid.cells.prec[450] = NaN;
    // Typed proxies cannot carry NaN; missing values must still be explicitly diagnosed.
    (world.grid.cells as unknown as { prec: number[] }).prec = [];
    expect(getCellClimateNormals(world, 450, 2023)!.invalidAnnualPrecipitation).toBe(true);
  });
  it("is invariant under longitude translation and connects the global wind seam", () => {
    const world = continent();
    const before = getCellClimateNormals(world, 450, 2023)!;
    world.mapCoordinates.lonW += 90;
    expect(getCellClimateNormals(world, 450, 2023)!.monthlyPrecipitationMm).toEqual(before.monthlyPrecipitationMm);
    const wind = ensureCellWindClimate(world);
    // Identical open ocean at both sides of a wrapped raster has the same seasonal vector.
    expect(wind.u[10 * 48 * 12]).toBeCloseTo(wind.u[(10 * 48 + 47) * 12], 5);
    expect(wind.v[10 * 48 * 12]).toBeCloseTo(wind.v[(10 * 48 + 47) * 12], 5);
  });
});

it("does not change seasons when calm wind receives tiny numerical direction errors", () => {
  const world = continent();
  const base = ensureCellWindClimate(world);
  const zeros = new Float32Array(base.u.length);
  const wind = vi
    .spyOn(windModule, "ensureCellWindClimate")
    .mockReturnValue({ ...base, key: "calm", u: zeros, v: zeros });
  const random = vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Climate must not consume random draws");
  });
  try {
    const calm = ensureCellPrecipitationClimate(world);
    wind.mockReturnValue({ ...base, key: "tiny", u: new Float32Array(base.u.length).fill(1e-5), v: zeros });
    const tiny = ensureCellPrecipitationClimate(world);
    const offset = 450 * 12;
    for (let m = 0; m < 12; m++)
      expect(Math.abs(calm.dailyScores[offset + m] - tiny.dailyScores[offset + m])).toBeLessThan(1e-4);
  } finally {
    wind.mockRestore();
    random.mockRestore();
  }
});
