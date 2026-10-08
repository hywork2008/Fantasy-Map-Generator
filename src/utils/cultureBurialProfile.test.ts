import { describe, expect, it } from "vitest";
import type { Culture } from "../types/models";
import { defaultPresetForRiteAndType, getCultureBurialProfile, rollCultureBurialProfile } from "./cultureBurialProfile";

describe("cultureBurialProfile", () => {
  it("resolves preset for legacy cultures by funeralRite and type", () => {
    expect(defaultPresetForRiteAndType("skyBurial", "Highland")).toBe("tibetan_jhator");
    expect(defaultPresetForRiteAndType("cremation", "River")).toBe("varanasi_ghat");
    expect(defaultPresetForRiteAndType("cremation", "Generic")).toBe("edo_temple_town");
    expect(defaultPresetForRiteAndType("inhumation", "Highland")).toBe("fengshui_mountain");
    expect(defaultPresetForRiteAndType("inhumation", "Nomadic")).toBe("steppe_kurgan");
    expect(defaultPresetForRiteAndType("inhumation", "Desert")).toBe("sunni_wahhabi");
  });

  it("getCultureBurialProfile handles null, wildlands, preset string, and inline profile", () => {
    expect(getCultureBurialProfile(null)).toBeUndefined();

    const wildlands: Culture = {
      i: 0,
      name: "Wildlands",
      base: 0,
      shield: ""
    };
    expect(getCultureBurialProfile(wildlands)).toBeUndefined();

    const legacyCulture: Culture = {
      i: 1,
      name: "Gondor",
      base: 1,
      shield: "",
      type: "Highland",
      funeralRite: "skyBurial"
    };
    const profile = getCultureBurialProfile(legacyCulture);
    expect(profile).toBeDefined();
    expect(profile?.id).toBe("tibetan_jhator");

    const presetCulture: Culture = {
      i: 2,
      name: "Rome",
      base: 2,
      shield: "",
      burialProfile: "roman_via_appia"
    };
    const romanProfile = getCultureBurialProfile(presetCulture);
    expect(romanProfile?.id).toBe("roman_via_appia");
    expect(romanProfile?.zoning).toBe("extramural_highway");
  });

  it("rollCultureBurialProfile generates valid profiles", () => {
    const rolled1 = rollCultureBurialProfile("Highland", () => 0.5);
    expect(rolled1).toBeDefined();
    expect(rolled1.id).toBeTruthy();
    expect(rolled1.zoning).toBeTruthy();

    const synthesized = rollCultureBurialProfile("Desert", () => 0.1); // triggers procedural
    expect(synthesized).toBeDefined();
    expect(synthesized.mechanics).toBeDefined();
  });
});

describe("burial profile compatibility", () => {
  it("preserves every legacy funeral rite, including nomadic sky burial", async () => {
    const { corpseTreatmentToFuneralRite } = await import("../data/burialCultures");
    const { FUNERAL_RITES, FUNERAL_RITE_DEFINITIONS } = await import("../data/funeralRites");
    for (const funeralRite of FUNERAL_RITES) {
      const profile = getCultureBurialProfile({ i: 1, type: "Nomadic", funeralRite })!;
      expect(corpseTreatmentToFuneralRite(profile.bodyFate)).toBe(funeralRite);
      expect(profile.mechanics.remainFraction).toBe(FUNERAL_RITE_DEFINITIONS[funeralRite].remainFraction);
    }
  });

  it("uses preset mechanics and updates the profile when the old rite control changes", async () => {
    const { getCultureFuneralMechanics, setCultureFuneralRite } = await import("./cultureBurialProfile");
    const culture: Culture = { i: 1, name: "Catacombs", base: 1, shield: "", burialProfile: "catacomb_paris" };
    expect(getCultureFuneralMechanics(culture)?.remainFraction).toBe(0.6);
    expect(getCultureFuneralMechanics(culture)?.zombieRatio).toBe(0.1);
    setCultureFuneralRite(culture, "cremation");
    expect(getCultureFuneralMechanics(culture)?.remainFraction).toBe(0);
    expect(getCultureBurialProfile(culture)?.bodyFate).toBe("cremation_ritual");
  });

  it("reconciles contradictory profiles from older saved maps", async () => {
    const { getCultureFuneralMechanics } = await import("./cultureBurialProfile");
    const culture: Culture = {
      i: 1,
      name: "Old save",
      base: 0,
      shield: "",
      burialProfile: "varanasi_ghat",
      funeralRite: "mummification"
    };
    expect(getCultureBurialProfile(culture)?.bodyFate).toBe("mummification_embalmed");
    expect(getCultureFuneralMechanics(culture)?.remainFraction).toBe(0.95);
  });

  it("never generates river ghats or water burial in an inland location", () => {
    let seed = 27;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 400; i++) {
      const profile = rollCultureBurialProfile("River", rng, "human", { hasRiver: false, isCoastal: false });
      expect(profile.zoning).not.toBe("riverfront_ghat");
      expect(profile.bodyFate).not.toBe("submersion_water");
    }
  });
});
