import { describe, expect, it } from "vitest";
import { hybridAppearance, hybridMinMaxMedian, hybridNumericRecord } from "./hybridRaceTraits";

describe("hybridRaceTraits", () => {
  it("takes min as both the floor and the median, max as the ceiling", () => {
    expect(hybridMinMaxMedian(10, 95)).toEqual({ min: 10, max: 95, median: 10 });
    expect(hybridMinMaxMedian(95, 10)).toEqual({ min: 10, max: 95, median: 10 });
    expect(hybridMinMaxMedian(50, 50)).toEqual({ min: 50, max: 50, median: 50 });
  });

  it("hybridizes appearance axes onto the lower parent as baseline", () => {
    const human = { stature: 50, build: 50, symmetry: 50, refinement: 50, vitality: 55, ornament: 45 };
    const elf = { stature: 55, build: 35, symmetry: 65, refinement: 75, vitality: 60, ornament: 40 };
    const { baseline, range } = hybridAppearance(human, elf);
    expect(baseline.build).toBe(35);
    expect(baseline.refinement).toBe(50);
    expect(range.build).toEqual({ min: 35, max: 50 });
    expect(range.refinement).toEqual({ min: 50, max: 75 });
  });

  it("keeps only numerically lower record entries", () => {
    expect(
      hybridNumericRecord({ martial: -8, learning: 10 }, {}, ["martial", "learning", "prowess"] as const, 0)
    ).toEqual({ martial: -8 });
  });
});
