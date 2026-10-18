import { describe, expect, it } from "vitest";
import { getRuralGrainDietShare, NON_GRAIN_DIET_SHARE_MAX } from "./ruralDiet";

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
});
