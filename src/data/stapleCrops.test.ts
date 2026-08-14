import { describe, expect, it } from "vitest";
import { getStapleCropSuitability, STAPLE_CROP_PROFILES, WET_PRECIPITATION_RESIDUAL } from "./stapleCrops";

describe("staple crop precipitation profiles", () => {
  it("maps source annual-rainfall bands directly onto the 100 mm proxy scale", () => {
    expect(STAPLE_CROP_PROFILES).toMatchObject({
      Wheat: { precipitation: { min: 3, idealMin: 7.5, idealMax: 9, max: 16 } },
      Rye: { precipitation: { min: 4, idealMin: 6, idealMax: 10, max: 20 } },
      Barley: { precipitation: { min: 2, idealMin: 5, idealMax: 10, max: 20 } },
      Oats: { precipitation: { min: 2.5, idealMin: 6, idealMax: 10, max: 15 } },
      Millet: { precipitation: { min: 2, idealMin: 5, idealMax: 7.5, max: 10 } },
      Buckwheat: { precipitation: { min: 4, idealMin: 7, idealMax: 10, max: 13 } },
      Peas: { precipitation: { min: 3.5, idealMin: 8, idealMax: 12, max: 25 } },
      "Broad Beans": { precipitation: { min: 2.5, idealMin: 6.5, idealMax: 10, max: 26 } },
      Lentils: { precipitation: { min: 2.5, idealMin: 6, idealMax: 10, max: 25 } },
      Chickpeas: { precipitation: { min: 3, idealMin: 6, idealMax: 10, max: 18 } },
      Turnips: { precipitation: { min: 2.5, idealMin: 5, idealMax: 8, max: 15 } },
      Potatoes: { precipitation: { min: 2.5, idealMin: 5, idealMax: 8, max: 20 } }
    });
  });

  it("treats physically ideal wheat rainfall as fully suitable", () => {
    expect(getStapleCropSuitability(STAPLE_CROP_PROFILES.Wheat, 15, 8, "loam")).toBe(1);
  });

  it("does not treat wet-of-max rainfall as barren, and prefers the more rain-tolerant crop", () => {
    const wheatOnWet = getStapleCropSuitability(STAPLE_CROP_PROFILES.Wheat, 15, 17, "loam");
    const peasOnWet = getStapleCropSuitability(STAPLE_CROP_PROFILES.Peas, 15, 17, "loam");
    expect(wheatOnWet).toBeGreaterThan(0);
    expect(wheatOnWet).toBeLessThan(1);
    expect(peasOnWet).toBeGreaterThan(wheatOnWet);
    expect(getStapleCropSuitability(STAPLE_CROP_PROFILES.Wheat, 15, 45, "loam")).toBeCloseTo(
      WET_PRECIPITATION_RESIDUAL * (16 / 45),
      5
    );
  });

  it("still treats too-dry and too-cold cells as unsuitable", () => {
    expect(getStapleCropSuitability(STAPLE_CROP_PROFILES.Wheat, 15, 2, "loam")).toBe(0);
    expect(getStapleCropSuitability(STAPLE_CROP_PROFILES.Wheat, -5, 8, "loam")).toBe(0);
  });
});
