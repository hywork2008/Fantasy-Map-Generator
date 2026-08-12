import { describe, expect, it } from "vitest";
import { getPerennialCropSuitability, PERENNIAL_CROP_PROFILES } from "./perennialCrops";

describe("perennial crop suitability", () => {
  it("keeps olives viable in warm dry land without a biome dependency", () => {
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Olives, 25, 50, "thin")).toBe(1);
  });

  it("rejects cold olive land while retaining a temperate apple niche", () => {
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Olives, 2, 50, "loam")).toBe(0);
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Apples, 18, 80, "loam")).toBe(1);
  });

  it("allows irrigation to make a rainfall-limited orchard viable", () => {
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Figs, 20, 25, "sandy")).toBe(0);
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Figs, 20, 25, "sandy", 20)).toBeGreaterThan(0.1);
  });
});
