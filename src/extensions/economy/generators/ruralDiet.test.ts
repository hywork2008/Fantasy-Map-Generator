import { describe, expect, it } from "vitest";
import {
  GRAIN_DIET_SHARE_FLOOR,
  getRuralGrainDietShare,
  getWetPastoralDietShare,
  getWetPastoralFieldCapacityMultiplier,
  NON_GRAIN_DIET_SHARE_MAX,
  WET_PASTORAL_DIET_SHARE_MAX
} from "./ruralDiet";

describe("rural grain diet", () => {
  const cells = { subsistenceNonAgriculturalCapacity: Float32Array.from([0, 30, 30]) };
  const fields = Float32Array.from([50, 0, 30]);

  it("asks farming cells for a full grain diet and fishing cells for the grain they barter", () => {
    expect(getRuralGrainDietShare(cells, 0, fields)).toBe(1);
    expect(getRuralGrainDietShare(cells, 1, fields)).toBeCloseTo(1 - NON_GRAIN_DIET_SHARE_MAX, 6);
    expect(getRuralGrainDietShare(cells, 2, fields)).toBeCloseTo(1 - NON_GRAIN_DIET_SHARE_MAX / 2, 6);
  });

  it("keeps a full grain diet on maps without the subsistence column", () => {
    expect(getRuralGrainDietShare({}, 1, fields)).toBe(1);
  });

  it("lowers the grain share where rain is too heavy for grain, taking the stronger reason only", () => {
    expect(getWetPastoralDietShare(1)).toBe(0);
    expect(getWetPastoralDietShare(0.6)).toBeCloseTo(WET_PASTORAL_DIET_SHARE_MAX, 6);
    expect(getWetPastoralDietShare(0)).toBeCloseTo(WET_PASTORAL_DIET_SHARE_MAX, 6);
    const wet = { ...cells, wetPastoralDietShare: Float32Array.from([0.5, 0.5, 0.1]) };
    expect(getRuralGrainDietShare(wet, 0, fields)).toBeCloseTo(0.5, 6);
    expect(getRuralGrainDietShare(wet, 1, fields)).toBeCloseTo(GRAIN_DIET_SHARE_FLOOR, 6);
    expect(getRuralGrainDietShare(wet, 2, fields)).toBeCloseTo(1 - NON_GRAIN_DIET_SHARE_MAX / 2, 6);
  });

  it("eats only the milk and meat the herds supply", () => {
    const wet = {
      wetPastoralDietShare: Float32Array.from([0.25, 0.25]),
      herdDietShare: Float32Array.from([0.1, 0.25])
    };
    expect(getRuralGrainDietShare(wet, 0, fields)).toBeCloseTo(0.9, 6);
    expect(getRuralGrainDietShare(wet, 1, fields)).toBeCloseTo(0.75, 6);
  });

  it("counts the people fed by milk and meat on fields sized for the grain part of their diet", () => {
    const wet = { ...cells, wetPastoralDietShare: Float32Array.from([0.5, 0, 0.1]) };
    expect(getWetPastoralFieldCapacityMultiplier(wet, 0, fields)).toBeCloseTo(2, 6);
    expect(getWetPastoralFieldCapacityMultiplier(wet, 1, fields)).toBe(1);
    // The livelihood share is the stronger reason here and already counted elsewhere.
    expect(getWetPastoralFieldCapacityMultiplier(wet, 2, fields)).toBeCloseTo(1, 6);
  });
});
