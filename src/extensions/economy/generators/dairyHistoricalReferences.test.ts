import { describe, expect, it } from "vitest";
import { DAIRY_HISTORICAL_REFERENCES, getDairyCalibrationAssessment } from "./dairyHistoricalReferences";

describe("scoped dairy evidence", () => {
  it("compares species ratios without silently assuming a historical gallon volume", () => {
    const assessment = getDairyCalibrationAssessment();
    expect(assessment.relativeYield.Sheep.modelRatio).toBe(0.15);
    expect(assessment.relativeYield.Sheep.sourceRatio).toBe(0.1);
    expect(assessment.relativeYield.Sheep.modelToSourceRatio).toBeCloseTo(1.5);
    expect(assessment.relativeYield.Goats.modelToSourceRatio).toBeCloseTo(5 / 3);
    const scaled = getDairyCalibrationAssessment({ Cattle: 1000, Sheep: 150, Goats: 300 });
    expect(scaled.relativeYield).toEqual(assessment.relativeYield);
    expect(DAIRY_HISTORICAL_REFERENCES.deWitteSlavin.nativeGallonLiters).toBeNull();
  });
  it("keeps expenditure, mixed estate output and unknown populations from becoming a herd target", () => {
    const result = getDairyCalibrationAssessment();
    expect(result.confirmedCheeseKilogramsPerPersonYear).toBeNull();
    expect(result.confirmedFreshMilkLitersPerPersonYear).toBeNull();
    expect(result.calibratedStandingHerdTargetHeads).toBeNull();
    expect(result.references.biddickPeterborough.humanFoodAvailableShare).toBeNull();
    expect(result.references.horrellHouseholds.measure).toContain("not physical quantities");
    const invalid = getDairyCalibrationAssessment({ Cattle: 0, Sheep: 75, Goats: 150 });
    expect(invalid.relativeYield.Sheep.modelRatio).toBeNull();
  });
});
