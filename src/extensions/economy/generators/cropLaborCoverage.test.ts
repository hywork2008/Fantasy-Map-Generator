import { describe, expect, it } from "vitest";
import { getCropLaborCoverageByCell } from "./developmentPotential";

describe("crop labour coverage", () => {
  it("leaves the unworked share of crop work-days unharvested, charging shortage to crops first", () => {
    const crop = new Float32Array(24);
    crop[6] = 60;
    crop[7] = 40;
    crop[18] = 50;
    const shortage = new Float32Array(24);
    shortage[6] = 25; // a quarter of the cell's crop work
    shortage[18] = 80; // more than the crop work: other occupations, capped at the crop's own days
    const coverage = getCropLaborCoverageByCell(crop, shortage);
    expect(coverage[0]).toBeCloseTo(0.75, 6);
    expect(coverage[1]).toBe(0);
  });
});
