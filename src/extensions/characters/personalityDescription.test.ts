import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ja from "../../i18n/locales/ja.json";
import type { CharacterPersonality } from "./characterTypes";
import { getPersonalityBand, getPersonalityDescriptionKeys } from "./personalityDescription";

const neutral: CharacterPersonality = {
  boldness: 50,
  compassion: 50,
  greed: 50,
  honor: 50,
  rationality: 50,
  sociability: 50,
  vengefulness: 50,
  zeal: 50,
  energy: 50,
  piety: 50,
  guile: 50,
  confidence: 50
};
const describePerson = (overrides: Partial<CharacterPersonality>) =>
  getPersonalityDescriptionKeys({ ...neutral, ...overrides }).map(key => key.split(".").at(-1));

describe("personality descriptions", () => {
  it.each([
    [0, "veryLow"],
    [15, "veryLow"],
    [16, "low"],
    [35, "low"],
    [36, "moderate"],
    [64, "moderate"],
    [65, "high"],
    [84, "high"],
    [85, "veryHigh"],
    [100, "veryHigh"],
    [undefined, "moderate"],
    [Number.NaN, "moderate"],
    [Number.POSITIVE_INFINITY, "moderate"]
  ] as const)("classifies %s as %s", (score, expected) => {
    expect(getPersonalityBand(score)).toBe(expected);
  });

  it("intensifies combinations when any defining trait reaches an extreme", () => {
    expect(describePerson({ energy: 25, boldness: 75, rationality: 25 })[0]).toBe("suddenImpulse");
    for (const extreme of [{ energy: 15 }, { boldness: 85 }, { rationality: 15 }]) {
      expect(describePerson({ energy: 25, boldness: 75, rationality: 25, ...extreme })[0]).toBe("explosiveImpulse");
    }
    expect(describePerson({ energy: 15, boldness: 75, rationality: 75 })[0]).toBe("rareDaring");
  });

  it("prioritizes specific combinations over isolated extremes", () => {
    expect(describePerson({ boldness: 90, rationality: 90 })[0]).toBe("audaciousCalculation");
    expect(describePerson({ boldness: 90, energy: 90, rationality: 20 })[0]).toBe("headlongRush");
    expect(describePerson({ compassion: 90, guile: 90 })[1]).toBe("discreetCompassion");
    expect(describePerson({ compassion: 20, boldness: 90 })[1]).toBe("ruthlessDominance");
    expect(describePerson({ greed: 90, honor: 90 })[2]).toBe("unyieldingFairShare");
    expect(describePerson({ greed: 90, honor: 20, compassion: 20 })[2]).toBe("predatoryGreed");
    expect(describePerson({ vengefulness: 90, guile: 90 })[3]).toBe("patientRetribution");
    expect(describePerson({ vengefulness: 90, boldness: 90, compassion: 20 })[3]).toBe("ruthlessVengeance");
    expect(describePerson({ zeal: 90, confidence: 10 })[4]).toBe("doggedDoubt");
    expect(describePerson({ confidence: 90, compassion: 20 })[4]).toBe("tyrannicalWill");
  });

  it("characterizes tyrannical personalities with appropriately ruthless descriptions", () => {
    const tyrant = describePerson({
      compassion: 18,
      vengefulness: 85,
      boldness: 75,
      greed: 75,
      honor: 25,
      confidence: 80
    });
    expect(tyrant[1]).toBe("ruthlessDominance");
    expect(tyrant[2]).toBe("predatoryGreed");
    expect(tyrant[3]).toBe("ruthlessVengeance");

    // Capricious Terror (volatile impulse with cruelty)
    const capricious = describePerson({ boldness: 80, rationality: 25, compassion: 15 });
    expect(capricious[0]).toBe("capriciousTerror");

    // Paranoid Purger (ruthless intrigue and retribution)
    const purger = describePerson({ vengefulness: 85, guile: 80, compassion: 15 });
    expect(purger[3]).toBe("paranoidPurger");

    // Zealous Inquisitor (uncompromising dogma and cruelty)
    const inquisitor = describePerson({ zeal: 85, piety: 80, compassion: 15 });
    expect(inquisitor[4]).toBe("zealousInquisitor");
  });

  it("gives both extremes of every trait a distinct description", () => {
    for (const trait of Object.keys(neutral) as (keyof CharacterPersonality)[]) {
      expect(describePerson({ [trait]: 10 })).not.toEqual(describePerson({ [trait]: 25 }));
      expect(describePerson({ [trait]: 90 })).not.toEqual(describePerson({ [trait]: 75 }));
    }
  });

  it("explains moderate personalities in concrete situational terms", () => {
    expect(describePerson({})).toEqual([
      "measured",
      "socialMeasured",
      "negotiator",
      "defensive",
      "selectiveCommitment"
    ]);
  });

  it("distinguishes sudden impulses from reserved willingness to take risks", () => {
    expect(describePerson({ energy: 35, boldness: 65, rationality: 35 })[0]).toBe("suddenImpulse");
    expect(describePerson({ energy: 35, boldness: 65, rationality: 36 })[0]).toBe("reservedDaring");
    expect(describePerson({ energy: 36, boldness: 65, rationality: 35 })[0]).toBe("impulsive");
  });

  it("preserves tensions between traits instead of equating them", () => {
    expect(describePerson({ sociability: 20, compassion: 80 })[1]).toBe("quietCare");
    expect(describePerson({ greed: 80, honor: 80 })[2]).toBe("principledAmbition");
    expect(describePerson({ zeal: 80, confidence: 20 })[4]).toBe("uncertainCommitment");
    expect(describePerson({ energy: 80, boldness: 20 })[0]).toBe("busyCautious");
  });

  it("treats missing legacy and non-finite scores as neutral", () => {
    expect(describePerson({ confidence: undefined, energy: Number.NaN })).toEqual(describePerson({}));
  });

  it("returns five distinct translated sentences consistently without mutating input", () => {
    // Exhaust all triples across five bands, keeping other traits neutral.
    // Covers ordered combination rules without enumerating 5 ** 12 personalities.
    const fields = Object.keys(neutral) as (keyof CharacterPersonality)[];
    const seen = new Set<string>();
    for (let a = 0; a < fields.length; a++) {
      for (let b = a + 1; b < fields.length; b++) {
        for (let c = b + 1; c < fields.length; c++) {
          for (const first of [10, 25, 50, 75, 90]) {
            for (const second of [10, 25, 50, 75, 90]) {
              for (const third of [10, 25, 50, 75, 90]) {
                const personality = { ...neutral, [fields[a]]: first, [fields[b]]: second, [fields[c]]: third };
                const keys = getPersonalityDescriptionKeys(personality);
                expect(new Set(keys).size).toBe(5);
                for (const key of keys) seen.add(key.split(".").at(-1)!);
              }
            }
          }
        }
      }
    }
    for (const key of seen) {
      expect(ja.characters.personalityDescription).toHaveProperty(key);
      expect(en.characters.personalityDescription).toHaveProperty(key);
    }
    expect([...seen].sort()).toEqual(Object.keys(ja.characters.personalityDescription).sort());
    expect([...seen].sort()).toEqual(Object.keys(en.characters.personalityDescription).sort());
    const frozen = Object.freeze({ ...neutral });
    expect(getPersonalityDescriptionKeys(frozen)).toEqual(getPersonalityDescriptionKeys(frozen));
    expect(new Set(getPersonalityDescriptionKeys(frozen)).size).toBe(5);
  });
});
