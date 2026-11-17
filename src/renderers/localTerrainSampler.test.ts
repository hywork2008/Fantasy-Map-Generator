import { describe, expect, it } from "vitest";
import { createLocalTerrainField, demLevelOrder, type LocalTerrainSampler } from "./localTerrainSampler";

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
    levelSteps: []
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
