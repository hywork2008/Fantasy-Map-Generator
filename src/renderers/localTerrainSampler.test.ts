import { describe, expect, it } from "vitest";
import {
  createLocalTerrainField,
  demLevelOrder,
  type LocalTerrainSampler,
  snapRiverToValley
} from "./localTerrainSampler";

describe("demLevelOrder", () => {
  it("tries the coarsest level fine enough, then finer, then coarser", () => {
    // steps are finest first, as the sampler stores them
    expect(demLevelOrder([250, 500, 1000], 600)).toEqual([1, 0, 2]);
    expect(demLevelOrder([250, 500, 1000], 100)).toEqual([0, 1, 2]);
    expect(demLevelOrder([250, 500, 1000], 2000)).toEqual([2, 1, 0]);
  });
});

describe("createLocalTerrainField", () => {
  // 1 px = 1 km. Land is x >= 0, rising 10 m per km eastward, with a 50 m ridge at x = 20.
  const sampler: LocalTerrainSampler = {
    metersAt: x => (x < 0 ? 0 : x * 10 + (Math.abs(x - 20) < 1 ? 50 : 0)),
    landAt: x => x >= 0,
    consistency: { sampled: 1, mismatched: 0, ratio: 0, ok: true },
    levelSteps: [],
    realRivers: [],
    load: { ms: 0, rasterBytes: 0, rasters: 0 },
    pendingLevels: () => 0,
    ensureLevels: async () => false
  };
  const field = createLocalTerrainField(sampler, {
    kmPerPx: 1,
    bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50 },
    burgs: [{ x: 10, y: 10 }],
    // Flows west from x = 40 down to the coast, across the ridge.
    rivers: [
      {
        points: [
          [40, 0],
          [0, 0]
        ]
      }
    ],
    burgPadKm: 2,
    riverCorridorM: 500
  });

  it("holds a burg pad flat and leaves the DEM beyond twice the radius", () => {
    expect(field.metersAt(11.5, 10)).toBeCloseTo(100, 6);
    expect(field.metersAt(15, 10)).toBeCloseTo(150, 6);
  });

  it("carves a river to a never-rising profile and reports the carve", () => {
    // The ridge (250 m) drops to the last height before it, about 210 m at x = 21.
    expect(field.metersAt(20, 0)).toBeLessThanOrEqual(210 + 1e-6);
    expect(field.stats.riverMaxCarveM).toBeGreaterThan(40);
  });

  it("moves land tokens off the sea and fleets off the land", () => {
    expect(field.displayPoint(-3, 30, false)[0]).toBeGreaterThanOrEqual(0);
    expect(field.displayPoint(3, 30, true)[0]).toBeLessThan(0);
    expect(field.displayPoint(5, 30, false)).toEqual([5, 30]);
  });
});

describe("createLocalTerrainField water", () => {
  it("paints a wide FMG river as water and asks the cell where the DEM is near 0 m", () => {
    const sampler: LocalTerrainSampler = {
      metersAt: () => 10,
      // Near 0 m west of x = 0: the DEM cannot tell sea from reclaimed land.
      landAt: x => (x < 0 ? undefined : true),
      consistency: { sampled: 1, mismatched: 0, ratio: 0, ok: true },
      levelSteps: [],
      realRivers: [],
      load: { ms: 0, rasterBytes: 0, rasters: 0 },
      pendingLevels: () => 0,
      ensureLevels: async () => false
    };
    const field = createLocalTerrainField(sampler, {
      kmPerPx: 1,
      bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50 },
      burgs: [],
      rivers: [
        {
          points: [
            [10, -20],
            [10, 20]
          ],
          widths: [4, 4]
        }
      ],
      cellWaterAt: x => x < -5,
      burgPadKm: 0,
      riverCorridorM: 300
    });
    expect(field.waterAt(11.5, 0)).toBe(true);
    expect(field.waterAt(13, 0)).toBe(false);
    expect(field.waterAt(-10, 0)).toBe(true);
    expect(field.waterAt(-2, 0)).toBe(false);
  });
});

describe("snapRiverToValley", () => {
  it("moves a river across its course into the valley floor and keeps both ends", () => {
    // A valley along x = 2: the river runs north along x = 0.
    const points = Array.from({ length: 11 }, (_, i) => [0, i * 2]);
    const { points: snapped, meanShiftPx } = snapRiverToValley(points, x => Math.abs(x - 2) * 100, 3, 0.25);
    expect(snapped[0]).toEqual([0, 0]);
    expect(snapped[10]).toEqual([0, 20]);
    expect(snapped[5][0]).toBeCloseTo(2, 1);
    expect(meanShiftPx).toBeGreaterThan(1);
  });
});

describe("snapRiverToValley descent", () => {
  it("follows the descending valley and does not jump into a lone pit across a ridge", () => {
    const points = Array.from({ length: 11 }, (_, i) => [0, i * 2]);
    // Valley along x = 2, falling 2 m per unit downstream; a deep pit at (-2.5, 10) only.
    const ground = (x: number, y: number) =>
      Math.abs(x + 2.5) < 0.3 && Math.abs(y - 10) < 0.3 ? -500 : 100 - y * 2 + Math.abs(x - 2) * 50;
    const { points: snapped } = snapRiverToValley(points, ground, 3, 0.25, 1);
    for (let i = 2; i <= 8; i++) expect(snapped[i][0]).toBeGreaterThan(1);
  });
});
