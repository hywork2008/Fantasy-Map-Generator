import { describe, expect, it } from "vitest";
import type { WorldContext } from "../../hostCore";
import { calculateAgriculturalLandProfile } from "./agriculturalLandUse";

function createWorld(): WorldContext {
  return {
    populationRate: 10,
    distanceScale: 1,
    biomesData: {
      habitability: [0, 80],
      tags: [[], ["forest"]]
    },
    grid: {
      cells: {
        temp: new Int8Array([12, 12]),
        prec: new Uint8Array([45, 45])
      }
    },
    pack: {
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([30, 30]),
        g: new Uint16Array([0, 1]),
        biomeCode: new Uint8Array([1, 1]),
        area: new Float32Array([1, 1]),
        forestCover: new Float32Array([0.9, 0]),
        r: new Uint16Array([0, 0]),
        capacity: new Float32Array([5, 5]),
        pop: new Float32Array([1, 1]),
        maleAdults: new Float32Array([0.5, 0.5]),
        femaleAdults: new Float32Array([0.5, 0.5])
      },
      burgs: []
    }
  } as unknown as WorldContext;
}

describe("agricultural land use", () => {
  it("derives less cultivable land from higher forest cover while retaining clearing potential", () => {
    const profile = calculateAgriculturalLandProfile(createWorld());

    expect(profile.cultivableArea[0]).toBeGreaterThan(0);
    expect(profile.cultivableArea[0]).toBeLessThan(profile.cultivableArea[1]);
    expect(profile.foodPotential[0]).toBeLessThan(profile.foodPotential[1]);
  });

  it("keeps environmental potential stable when only current population changes", () => {
    const world = createWorld();
    const before = calculateAgriculturalLandProfile(world);
    world.pack.cells.pop[0] = 4;
    world.pack.cells.maleAdults[0] = 2;
    world.pack.cells.femaleAdults[0] = 2;
    const after = calculateAgriculturalLandProfile(world);

    expect(after.cultivableArea).toEqual(before.cultivableArea);
    expect(after.yieldPerArea).toEqual(before.yieldPerArea);
    expect(after.foodPotential).toEqual(before.foodPotential);
    expect(after.ruralFoodCapacity).toEqual(before.ruralFoodCapacity);
    expect(after.cultivatedArea[0]).toBeGreaterThan(before.cultivatedArea[0]);
    expect(after.farmLaborRequired[0]).toBeGreaterThan(before.farmLaborRequired[0]);
  });
});
