import { describe, expect, it } from "vitest";
import { scoreCellSite } from "./siteSuitability";

describe("scoreCellSite", () => {
  it("scales a poor biome's river, coast and lowland points by its habitability but keeps penalties", () => {
    // Boreal peatland (3) on a harbour coast at height 25: upstream 3 + 5 + 20 + 5 = 33.
    expect(scoreCellSite(3, [5, 20, 5], 1)).toBe(33);
    expect(scoreCellSite(3, [5, 20, 5], 25)).toBeCloseTo(3 + 30 * (3 / 25));
    // Farmland at or above the setting keeps the full points; a height penalty is never scaled.
    expect(scoreCellSite(100, [5, 20, -6], 25)).toBe(119);
    expect(scoreCellSite(3, [-6], 25)).toBe(-3);
  });
});
