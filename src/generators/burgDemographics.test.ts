import { describe, expect, it } from "vitest";
import {
  buildBurgDemographics,
  DEFAULT_DEMOGRAPHIC_SHARES,
  GROUP_DEMOGRAPHIC_SHARES,
  getDemographicShares
} from "./burgDemographics";

describe("burgDemographics", () => {
  it("returns default shares for unknown or missing groups", () => {
    expect(getDemographicShares(undefined)).toEqual(DEFAULT_DEMOGRAPHIC_SHARES);
    expect(getDemographicShares(null)).toEqual(DEFAULT_DEMOGRAPHIC_SHARES);
    expect(getDemographicShares("unknown_group")).toEqual(DEFAULT_DEMOGRAPHIC_SHARES);
  });

  it("uses fort profile with no children and ~8:2 adult sex ratio", () => {
    const shares = getDemographicShares("fort");
    expect(shares.children).toBe(0);
    expect(shares.maleAdults).toBeCloseTo(0.72);
    expect(shares.femaleAdults).toBeCloseTo(0.18);
    const adultTotal = shares.maleAdults + shares.femaleAdults;
    expect(shares.maleAdults / adultTotal).toBeCloseTo(0.8);
    expect(shares.femaleAdults / adultTotal).toBeCloseTo(0.2);
  });

  it("builds absolute fort demographics that sum near total population", () => {
    const pop = 10;
    const demo = buildBurgDemographics(pop, 12, "fort");
    expect(demo.capacity).toBe(12);
    expect(demo.children).toBe(0);
    expect(demo.maleAdults).toBeCloseTo(7.2);
    expect(demo.femaleAdults).toBeCloseTo(1.8);
    expect(demo.elders).toBeCloseTo(1);
    const sum = demo.children + demo.maleAdults + demo.femaleAdults + demo.elders;
    expect(sum).toBeCloseTo(pop, 1);
  });

  it("covers all default burg groups with profiles that sum to ~1", () => {
    const groups = [
      "fort",
      "monastery",
      "caravanserai",
      "trading_post",
      "village",
      "hamlet",
      "capital",
      "city",
      "town"
    ];
    for (const group of groups) {
      const shares = GROUP_DEMOGRAPHIC_SHARES[group];
      expect(shares, `missing profile for ${group}`).toBeDefined();
      const sum = shares.children + shares.maleAdults + shares.femaleAdults + shares.elders;
      expect(sum, `${group} shares should sum to ~1`).toBeCloseTo(1, 2);
    }
  });
});
