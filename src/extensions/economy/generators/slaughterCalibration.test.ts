import { describe, expect, it } from "vitest";
import {
  assessSlaughterCalibration,
  HISTORICAL_SLAUGHTER_EVIDENCE,
  type SlaughterCalibrationContext,
  type SlaughterCalibrationEvidence
} from "./slaughterCalibration";

const context: SlaughterCalibrationContext = {
  regionId: "test:region",
  year: 1300,
  species: "Cattle",
  cohort: "old",
  husbandryId: "test:husbandry"
};
// Synthetic approval fixture; no historical source is promoted by this test.
const approved = (): SlaughterCalibrationEvidence => ({
  id: "test-only",
  sourceUrl: "https://example.org/test-only",
  locator: "test-only",
  regionId: "test:region",
  years: [1290, 1310],
  species: "Cattle",
  husbandryId: "test:husbandry",
  eligibleCohorts: ["old"],
  unresolved: [],
  profile: {
    id: "test-only",
    version: 1,
    species: "Cattle",
    calibration: "verified",
    carcassKgPerHead: 100,
    leanKgPerHead: 60,
    edibleFatKgPerHead: 10,
    otherCarcassKgPerHead: 30
  }
});

describe("historical slaughter calibration eligibility", () => {
  it("keeps every current reference out of production, even in its own region", () => {
    for (const evidence of HISTORICAL_SLAUGHTER_EVIDENCE) {
      const before = structuredClone(evidence);
      const result = assessSlaughterCalibration(evidence, {
        ...context,
        regionId: evidence.regionId,
        species: evidence.species,
        husbandryId: evidence.husbandryId,
        year: evidence.years?.[0] ?? 1700
      });
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("unverified-cohort");
      expect(result.reasons).toContain("unverified-yield");
      expect(evidence).toEqual(before);
    }
  });

  it("accepts a fully approved exact scope including date endpoints", () => {
    for (const year of [1290, 1300, 1310]) {
      expect(assessSlaughterCalibration(approved(), { ...context, year })).toEqual({ eligible: true, reasons: [] });
    }
  });

  it.each([
    [{ regionId: null }, "region-mismatch"],
    [{ regionId: "other" }, "region-mismatch"],
    [{ year: 1289 }, "date-mismatch"],
    [{ year: 1311 }, "date-mismatch"],
    [{ year: Number.NaN }, "invalid-year"],
    [{ species: "Sheep" }, "species-mismatch"],
    [{ husbandryId: null }, "husbandry-mismatch"],
    [{ cohort: "young" }, "unverified-cohort"],
    [{ cohort: "mixed" }, "unverified-cohort"],
    [{ cohort: "unknown" }, "unverified-cohort"]
  ] as const)("rejects scope mismatch %j", (patch, reason) => {
    expect(assessSlaughterCalibration(approved(), { ...context, ...patch }).reasons).toContain(reason);
  });

  it("does not let a verified flag override absent dates, source, or unresolved evidence", () => {
    const evidence = approved();
    evidence.years = null;
    evidence.sourceUrl = "";
    evidence.unresolved = ["age-weight-unchecked"];
    expect(assessSlaughterCalibration(evidence, context)).toEqual({
      eligible: false,
      reasons: ["unverified-date-bounds", "missing-source", "age-weight-unchecked"]
    });
  });

  it("preserves the disjoint Scottish reference balance without promoting it", () => {
    for (const evidence of HISTORICAL_SLAUGHTER_EVIDENCE.filter(row => row.profile)) {
      const profile = evidence.profile!;
      expect(profile.leanKgPerHead + profile.edibleFatKgPerHead + profile.otherCarcassKgPerHead).toBeCloseTo(
        profile.carcassKgPerHead,
        10
      );
    }
  });
});
