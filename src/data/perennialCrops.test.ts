import { describe, expect, it } from "vitest";
import { getPerennialCropSuitability, PERENNIAL_CROP_PROFILES } from "./perennialCrops";

describe("perennial crop suitability", () => {
  it("keeps olives viable in warm dry land without a biome dependency", () => {
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Olives, 25, 5, "thin")).toBe(1);
  });

  it("rejects cold olive land while retaining a temperate apple niche", () => {
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Olives, 2, 5, "loam")).toBe(0);
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Apples, 18, 8, "loam")).toBe(1);
  });

  it("allows irrigation to make a rainfall-limited orchard viable", () => {
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Figs, 20, 2, "sandy")).toBe(0);
    expect(getPerennialCropSuitability(PERENNIAL_CROP_PROFILES.Figs, 20, 2, "sandy", 2)).toBeGreaterThan(0.1);
  });

  it("maps the documented annual-rainfall bands directly onto the 100 mm proxy scale", () => {
    expect(PERENNIAL_CROP_PROFILES).toMatchObject({
      Grapes: { precipitation: { min: 4, idealMin: 7, idealMax: 8.5, max: 12 } },
      Olives: { precipitation: { min: 2, idealMin: 4, idealMax: 7, max: 12 } },
      Apples: { precipitation: { min: 5, idealMin: 7, idealMax: 25, max: 32 } },
      Pears: { precipitation: { min: 4, idealMin: 6, idealMax: 9, max: 21 } },
      Plums: { precipitation: { min: 6, idealMin: 9, idealMax: 15, max: 18 } },
      Figs: { precipitation: { min: 3, idealMin: 7, idealMax: 15, max: 27 } },
      Lemons: { precipitation: { min: 3, idealMin: 10, idealMax: 23, max: 40 } }
    });
  });
});
