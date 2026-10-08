import { describe, expect, it } from "vitest";
import {
  BURIAL_CULTURE_PRESETS,
  corpseTreatmentToFuneralRite,
  funeralRiteToDefaultCorpseTreatment,
  getBurialCulturePreset,
  isBurialCulturePresetId
} from "./burialCultures";

describe("burialCultures data & presets", () => {
  it("defines all 30 historic archetype presets with complete orthogonal dimensions", () => {
    const presetIds = Object.keys(BURIAL_CULTURE_PRESETS);
    expect(presetIds.length).toBe(30);

    const requiredKeys = [
      "roman_via_appia",
      "medieval_parish",
      "victorian_garden",
      "prague_ghetto",
      "jewish_orthodox",
      "ottoman_turbe",
      "wadi_us_salaam",
      "sunni_wahhabi",
      "varanasi_ghat",
      "thai_chedi_wat",
      "tibetan_jhator",
      "edo_temple_town",
      "fengshui_mountain",
      "zoroastrian_tower",
      "steppe_kurgan",
      "catacomb_paris"
    ];

    for (const id of requiredKeys) {
      expect(BURIAL_CULTURE_PRESETS[id]).toBeDefined();
      const profile = BURIAL_CULTURE_PRESETS[id];
      expect(profile.id).toBe(id);
      expect(profile.name).toBeTruthy();
      expect(profile.zoning).toBeTruthy();
      expect(profile.boundary).toBeTruthy();
      expect(profile.sanctuary).toBeTruthy();
      expect(profile.bodyFate).toBeTruthy();
      expect(profile.monuments).toBeTruthy();
      expect(profile.vegetation).toBeTruthy();
      expect(profile.ritualFacilities.length).toBeGreaterThan(0);
      expect(profile.mechanics.remainFraction).toBeGreaterThanOrEqual(0);
      expect(profile.mechanics.remainFraction).toBeLessThanOrEqual(1);
    }
  });

  it("handles getBurialCulturePreset and fallback correctly", () => {
    const p1 = getBurialCulturePreset("roman_via_appia");
    expect(p1.id).toBe("roman_via_appia");
    expect(p1.zoning).toBe("extramural_highway");

    const fallback = getBurialCulturePreset("unknown_custom_id");
    expect(fallback.id).toBe("medieval_parish");

    expect(isBurialCulturePresetId("varanasi_ghat")).toBe(true);
    expect(isBurialCulturePresetId("atlantis_bubbles")).toBe(false);
  });

  it("converts between CorpseTreatment and FuneralRite correctly", () => {
    expect(corpseTreatmentToFuneralRite("cremation_ritual")).toBe("cremation");
    expect(corpseTreatmentToFuneralRite("excarnation_sky")).toBe("skyBurial");
    expect(corpseTreatmentToFuneralRite("inhumation_coffined")).toBe("inhumation");
    expect(corpseTreatmentToFuneralRite("inhumation_shrouded")).toBe("inhumation");
    expect(corpseTreatmentToFuneralRite("mummification_embalmed")).toBe("mummification");
    expect(corpseTreatmentToFuneralRite("submersion_water")).toBe("waterBurial");
    expect(corpseTreatmentToFuneralRite("exposure_surface")).toBe("exposure");

    expect(funeralRiteToDefaultCorpseTreatment("cremation")).toBe("cremation_ritual");
    expect(funeralRiteToDefaultCorpseTreatment("skyBurial")).toBe("excarnation_sky");
  });
});
