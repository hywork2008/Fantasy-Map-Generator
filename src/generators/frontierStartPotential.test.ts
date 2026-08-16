import { describe, expect, it } from "vitest";
import {
  allocateFrontierLandmassSlots,
  type LandmassGrowthPotential,
  landHopDistance,
  measureLandmassPotential
} from "./frontierStartPotential";

function landmass(featureId: number, potential: number, area = potential, startSites = 8): LandmassGrowthPotential {
  return {
    featureId,
    area,
    potential,
    futureSubsistenceCapacity: potential,
    riverAccess: 0,
    coastLakeSpringAccess: 0,
    startSites
  };
}

describe("allocateFrontierLandmassSlots", () => {
  it("gives the first slot on each large landmass, then the extra to the richest", () => {
    expect(allocateFrontierLandmassSlots([landmass(6, 868), landmass(18, 788), landmass(3, 774)], 4)).toEqual([
      6, 18, 3, 6
    ]);
  });

  it("prefers 3:1 over 2:2 when that raises the worst-off P_i / n_i", () => {
    expect(allocateFrontierLandmassSlots([landmass(1, 1630), landmass(2, 957)], 4)).toEqual([1, 2, 1, 1]);
  });

  it("can still split two close peers 2:2", () => {
    expect(allocateFrontierLandmassSlots([landmass(1, 500), landmass(2, 400)], 4)).toEqual([1, 2, 1, 2]);
  });

  it("does not open a small island that misses the P_target floor", () => {
    expect(allocateFrontierLandmassSlots([landmass(1, 500), landmass(2, 400), landmass(3, 107)], 4)).toEqual([
      1, 2, 1, 2
    ]);
  });

  it("caps slots by available start sites", () => {
    expect(allocateFrontierLandmassSlots([landmass(1, 900, 900, 1), landmass(2, 400, 400, 4)], 4)).toEqual([
      1, 2, 2, 2
    ]);
  });
});

describe("measureLandmassPotential", () => {
  it("gives a river basin more potential than a rainless isle and treats a sea crossing as infinite", () => {
    const pack = {
      cells: {
        i: [0, 1, 2, 3],
        f: [1, 1, 2, 2],
        h: [25, 25, 25, 25],
        s: [10, 10, 10, 10],
        r: [1, 0, 0, 0],
        c: [[1], [0], [3], [2]],
        g: [0, 1, 2, 3]
      },
      features: [0, { land: true, cells: 80 }, { land: true, cells: 80 }] as Array<{ land: boolean; cells: number } | 0>
    };
    const climate = { temperature: [14, 14, 14, 14], precipitation: [50, 50, 4, 4] };
    const riverBasin = measureLandmassPotential(pack, 1, climate);
    const dryIsle = measureLandmassPotential(pack, 2, climate);
    expect(riverBasin.potential).toBeGreaterThan(dryIsle.potential);
    expect(dryIsle.potential).toBe(0);
    expect(landHopDistance(pack, 0, 1)).toBe(1);
    expect(landHopDistance(pack, 0, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});
