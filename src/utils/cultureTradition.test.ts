import { describe, expect, it } from "vitest";
import { BURIAL_CULTURE_PRESETS, getBurialCulturePreset } from "../data/burialCultures";
import {
  burialPresetsFor,
  CIVILIZATION_TRADITIONS,
  FAITH_FAMILIES,
  FAITH_FORMS,
  NAME_BASE_TRADITION,
  religiousHousesFor,
  TRADITION_PERIODS,
  traditionEra
} from "../data/civilizationTraditions";
import type { Culture, Religion } from "../types/models";
import { rollCultureBurialProfile } from "./cultureBurialProfile";
import { burgBurialProfile, getCultureFaith, getReligionFaith, worldTraditionPeriod } from "./cultureTradition";

const culture = (i: number, base: number) => ({ i, base, name: `c${i}` }) as Culture;
const religion = (type: Religion["type"], form: string, cultureId: number) =>
  ({ i: 1, type, form, culture: cultureId }) as Religion;

describe("civilization tradition catalog", () => {
  it("maps every FMG name base to a known tradition", () => {
    for (let base = 0; base <= 44; base++) expect(CIVILIZATION_TRADITIONS[NAME_BASE_TRADITION[base]]).toBeDefined();
  });

  it("gives every faith religion forms and existing burial presets in every period", () => {
    for (const faith of FAITH_FAMILIES) {
      expect(FAITH_FORMS[faith].length).toBeGreaterThan(0);
      for (const period of TRADITION_PERIODS)
        for (const id of burialPresetsFor(faith, period)) expect(BURIAL_CULTURE_PRESETS[id], id).toBeDefined();
    }
  });

  it("follows each civilization's own conversion history", () => {
    const nordic = culture(1, 6);
    expect(getCultureFaith(nordic, "earlyMedieval")).toBe("germanicPagan");
    expect(getCultureFaith(nordic, "highMedieval")).toBe("latinCatholic");
    expect(getCultureFaith(nordic, "ageOfExploration")).toBe("protestant");
    expect(getCultureFaith(culture(1, 16), "earlyMedieval")).toBe("tengri");
    expect(getCultureFaith(culture(1, 16), "lateMedieval")).toBe("sunni");
    expect(getCultureFaith(culture(1, 24), "ageOfExploration")).toBe("shia");
    // No outside conquest: Nahuatl stays Mesoamerican.
    expect(getCultureFaith(culture(1, 14), "steamEra")).toBe("mesoamerican");
    expect(traditionEra(CIVILIZATION_TRADITIONS.magyar, "ageOfExploration").fortification).toBe("european");
  });

  it("keeps the Antique culture set classical", () => {
    const period = worldTraditionPeriod({ culturesSet: "antique", historicalPeriod: "lateMedieval" });
    expect(getCultureFaith(culture(1, 8), period)).toBe("classicalPolytheism");
    expect(getCultureFaith(culture(1, 8), "lateMedieval")).toBe("latinCatholic");
  });

  it("founds friaries only in Catholic towns from the high Middle Ages", () => {
    expect(religiousHousesFor("latinCatholic", "earlyMedieval")).toEqual(["abbey"]);
    expect(religiousHousesFor("latinCatholic", "highMedieval")).toContain("friary");
    expect(religiousHousesFor("protestant", "ageOfExploration")).toEqual([]);
    expect(religiousHousesFor("sunni", "highMedieval")).toEqual([]);
    expect(religiousHousesFor("orthodox", "highMedieval")).toEqual(["orthodoxMonastery"]);
  });
});

describe("religion faith", () => {
  const cultures = [undefined, culture(1, 0)] as Culture[];

  it("keeps folk religions on the pre-conversion substrate", () => {
    expect(getReligionFaith(religion("Folk", "Polytheism", 1), cultures, "highMedieval")).toBe("germanicPagan");
  });

  it("puts an organized Monotheism in the culture's church and a revived Polytheism outside it", () => {
    expect(getReligionFaith(religion("Organized", "Monotheism", 1), cultures, "highMedieval")).toBe("latinCatholic");
    expect(getReligionFaith(religion("Organized", "Polytheism", 1), cultures, "highMedieval")).toBe("germanicPagan");
  });
});

describe("burial profiles", () => {
  it("rolls a new culture's burial from its faith instead of its terrain type", () => {
    const english = rollCultureBurialProfile("Desert", () => 0, undefined, {}, { base: 1, period: "ageOfExploration" });
    expect(english.id).toBe("protestant_gottesacker");
    const castilian = rollCultureBurialProfile("Highland", () => 0, undefined, {}, { base: 4, period: "highMedieval" });
    expect(castilian.id).toBe("medieval_parish");
  });

  it("never rolls a river ghat for a culture without a river", () => {
    const hindu = rollCultureBurialProfile("River", () => 0, undefined, { hasRiver: false }, { base: 26 });
    expect(hindu.id).toBe("hindu_shmashana");
  });

  it("replaces a legacy profile that contradicts the burg's faith", () => {
    const tradition = CIVILIZATION_TRADITIONS.anglo;
    const legacy = getBurialCulturePreset("sunni_wahhabi");
    expect(burgBurialProfile(legacy, "protestant", "ageOfExploration", tradition, 3, true).id).toBe(
      "protestant_gottesacker"
    );
    const fitting = getBurialCulturePreset("medieval_parish");
    expect(burgBurialProfile(fitting, "latinCatholic", "highMedieval", tradition, 3, true)).toBe(fitting);
  });

  it("gives a town of another faith that faith's burial ground", () => {
    const parish = getBurialCulturePreset("medieval_parish");
    const id = burgBurialProfile(parish, "sunni", "highMedieval", CIVILIZATION_TRADITIONS.latinWest, 0, true).id;
    expect(["sunni_wahhabi", "ottoman_turbe"]).toContain(id);
  });
});
