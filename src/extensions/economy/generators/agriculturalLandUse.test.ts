import { describe, expect, it } from "vitest";
import type { WorldContext } from "../../hostCore";
import {
  AGTECH_NO_DRAFT_EFFECT_SHARE,
  AGTECH_YIELD_BONUS_MAX,
  calculateAgriculturalLandProfile
} from "./agriculturalLandUse";

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

  it("matches the no-argument call when agTechStockByCell is omitted (back-compat)", () => {
    const world = createWorld();
    const withoutArg = calculateAgriculturalLandProfile(world);
    const withZeroStock = calculateAgriculturalLandProfile(world, new Float32Array(2));

    expect(withZeroStock.yieldPerArea).toEqual(withoutArg.yieldPerArea);
    expect(withZeroStock.farmLaborRequired).toEqual(withoutArg.farmLaborRequired);
  });

  it("raises yield and lowers required farm labour with rural technology investment", () => {
    // Both cells share biomeCode 1 ("forest", no draft animal), so full agTechStock on cell 1
    // lands at the no-draft-animal share of the maximum bonus (AGTECH_NO_DRAFT_EFFECT_SHARE).
    const world = createWorld();
    const baseline = calculateAgriculturalLandProfile(world);
    const withAgTech = calculateAgriculturalLandProfile(world, new Float32Array([0, 1]));

    const expectedYieldMultiplier = 1 + AGTECH_YIELD_BONUS_MAX * AGTECH_NO_DRAFT_EFFECT_SHARE;
    expect(withAgTech.yieldPerArea[1]).toBeCloseTo(baseline.yieldPerArea[1] * expectedYieldMultiplier, 4);
    expect(withAgTech.farmLaborRequired[1]).toBeLessThan(baseline.farmLaborRequired[1]);

    // Cell 0's agTechStockByCell entry is 0, so it is untouched by the other cell's investment.
    expect(withAgTech.yieldPerArea[0]).toBe(baseline.yieldPerArea[0]);
  });

  it("reaches the full technology bonus only where a draft animal's biome is present", () => {
    // Cell 0: biomeCode 0 -> "grassland" (Cattle/Horses biomeOutputByTag, draft-capable).
    // Cell 1: biomeCode 1 -> "forest" only (no draft animal).
    const world = createWorld();
    world.biomesData.habitability = [80, 80];
    world.biomesData.tags = [["grassland"], ["forest"]];
    world.pack.cells.biomeCode = new Uint8Array([0, 1]);

    const baseline = calculateAgriculturalLandProfile(world);
    const withAgTech = calculateAgriculturalLandProfile(world, new Float32Array([1, 1]));

    const fullBonusMultiplier = 1 + AGTECH_YIELD_BONUS_MAX;
    const partialBonusMultiplier = 1 + AGTECH_YIELD_BONUS_MAX * AGTECH_NO_DRAFT_EFFECT_SHARE;
    expect(withAgTech.yieldPerArea[0]).toBeCloseTo(baseline.yieldPerArea[0] * fullBonusMultiplier, 4);
    expect(withAgTech.yieldPerArea[1]).toBeCloseTo(baseline.yieldPerArea[1] * partialBonusMultiplier, 4);
  });
});
