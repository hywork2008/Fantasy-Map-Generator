import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ja from "../../i18n/locales/ja.json";
import type { CharacterPersonality } from "./characterTypes";
import { getPersonalityDescriptionKeys } from "./personalityDescription";
import {
  type CompatibilityCharacter,
  getCompatibilityProfile,
  getCompatibilitySolidarityModifier,
  getRelationshipCompatibility
} from "./relationshipCompatibility";
import { getRomanceDescriptionKeys } from "./romanceDescription";

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
const person = (
  i: number,
  p: Partial<CharacterPersonality> = {},
  gender: "male" | "female" = "male"
): CompatibilityCharacter => ({
  i,
  gender,
  personality: { ...neutral, ...p },
  appearance: 50,
  race: 1
});
const passionate = { boldness: 80, energy: 80, zeal: 80 };
const withdrawn = { boldness: 25, energy: 25, zeal: 25 };
const plural = { honor: 25, piety: 25, greed: 80 };
const profiles: Partial<CharacterPersonality>[] = [
  {},
  { compassion: 80 },
  { honor: 80 },
  { rationality: 80 },
  { boldness: 80 },
  { guile: 80 },
  { greed: 80 },
  { energy: 25 },
  passionate,
  withdrawn,
  plural,
  { ...passionate, vengefulness: 90, compassion: 20 },
  { ...passionate, vengefulness: 90, compassion: 80 }
];

describe("relationship compatibility", () => {
  it("uses the actual general and romantic flavor evidence", () => {
    const a = person(1, { compassion: 80, honor: 80 });
    const result = getCompatibilityProfile(a.personality);
    expect(result.social).toBe("caring");
    expect(result.romantic).toBe("devoted");
    expect(result.flavorKeys).toEqual([
      ...getPersonalityDescriptionKeys(a.personality),
      ...getRomanceDescriptionKeys(a.personality)
    ]);
  });

  it("lets opposite-gender analytical pairs form friendships without automatic romance", () => {
    const result = getRelationshipCompatibility(
      person(1, { rationality: 80 }),
      person(2, { rationality: 80 }, "female")
    );
    expect(result.tendency).toBe("friendship");
    expect(result.friendship).toBeGreaterThan(result.romance);
    expect(result.reasons).toContain("sharedReasoning");
  });

  it("finds romantic possibilities in mutually passionate pairs", () => {
    const result = getRelationshipCompatibility(person(1, passionate), person(2, passionate, "female"));
    expect(["romance", "both"]).toContain(result.tendency);
    expect(result.romance).toBeGreaterThanOrEqual(60);
    expect(result.reasons).toContain("mutualPassion");
  });

  it("keeps mutually withdrawn pairs in friendship even across genders", () => {
    const result = getRelationshipCompatibility(person(1, withdrawn), person(2, withdrawn, "female"));
    expect(result.tendency).toBe("friendship");
    expect(result.romance).toBeLessThan(35);
  });

  it("flags incompatible commitments as friction", () => {
    const result = getRelationshipCompatibility(person(1, { honor: 80 }), person(2, plural, "female"));
    expect(result.tendency).toBe("friction");
    expect(result.reasons).toContain("conflictingCommitments");
  });

  it("allows attraction and friction to coexist, with compassion moderating jealousy", () => {
    const jealous = { ...passionate, zeal: 90, vengefulness: 90, compassion: 20 };
    const turbulent = getRelationshipCompatibility(person(1, jealous), person(2, jealous, "female"));
    expect(turbulent.tendency).toBe("volatile");
    const gentle = getRelationshipCompatibility(
      person(1, { ...jealous, compassion: 80 }),
      person(2, { ...jealous, compassion: 80 }, "female")
    );
    expect(gentle.friction).toBeLessThan(turbulent.friction);
    expect(gentle.reasons).toContain("restrainedJealousy");
  });

  it("starts same-gender pairs with friendship but uses recorded interest without assuming reciprocity", () => {
    const a = person(1, passionate);
    const b = person(2, passionate);
    expect(getRelationshipCompatibility(a, b).tendency).toBe("friendship");
    expect(getRelationshipCompatibility(a, b).romanceConditional).toBe(true);
    a.favor = { 2: 30 };
    const result = getRelationshipCompatibility(a, b);
    expect(result.romanceConditional).toBe(false);
    expect(result.romance).toBeGreaterThanOrEqual(60);
    expect(result.reasons).toContain("recordedInterest");
    expect(b.favor).toBeUndefined();
  });

  it("does not recommend romantic prospects for self, deceased people or close family", () => {
    const a = person(1, passionate);
    const b = person(2, passionate, "female");
    expect(getRelationshipCompatibility(a, a).romance).toBe(0);
    expect(getRelationshipCompatibility(a, { ...b, dead: true }).romance).toBe(0);
    const family = { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 };
    expect(getRelationshipCompatibility(a, { ...b, family: { ...family, fatherId: 1 } }).romance).toBe(0);
    expect(
      getRelationshipCompatibility(
        { ...a, family: { ...family, motherId: 9 } },
        { ...b, family: { ...family, motherId: 9 } }
      ).romance
    ).toBe(0);
  });

  it("respects the existing world's cross-race barrier without confusing it with poor friendship", () => {
    const a = person(1, passionate);
    const b = { ...person(2, passionate, "female"), race: 2 };
    const result = getRelationshipCompatibility(a, b);
    expect(result.romance).toBeLessThan(35);
    expect(result.friendship).toBeGreaterThanOrEqual(60);
  });

  it("is deterministic and symmetric, keeps scores bounded, and resolves translations for every pairing", () => {
    for (const pa of profiles)
      for (const pb of profiles)
        for (const gender of ["male", "female"] as const) {
          const a = Object.freeze(person(1, pa));
          const b = Object.freeze(person(2, pb, gender));
          const before = JSON.stringify([a, b]);
          const ab = getRelationshipCompatibility(a, b);
          const ba = getRelationshipCompatibility(b, a);
          expect(ab).toEqual(getRelationshipCompatibility(a, b));
          for (const axis of ["friendship", "romance", "friction"] as const) {
            expect(ab[axis]).toBe(ba[axis]);
            expect(ab[axis]).toBeGreaterThanOrEqual(0);
            expect(ab[axis]).toBeLessThanOrEqual(100);
          }
          expect(ab.tendency).toBe(ba.tendency);
          for (const locale of [ja, en]) {
            expect(locale.characters.compatibility.social).toHaveProperty(ab.from.social);
            expect(locale.characters.compatibility.romantic).toHaveProperty(ab.to.romantic);
            expect(locale.characters.compatibility.tendency).toHaveProperty(ab.tendency);
            for (const reason of ab.reasons) expect(locale.characters.compatibility.reasons).toHaveProperty(reason);
          }
          expect(JSON.stringify([a, b])).toBe(before);
        }
  });
});

describe("compatibility contribution to solidarity", () => {
  it("rewards compatible friendship and penalizes conflicting commitments", () => {
    expect(
      getCompatibilitySolidarityModifier(person(1, { rationality: 80 }), person(2, { rationality: 80 }))
    ).toBeGreaterThan(0);
    expect(getCompatibilitySolidarityModifier(person(1, { honor: 80 }), person(2, plural))).toBeLessThan(0);
    expect(getCompatibilitySolidarityModifier(person(1), person(2))).toBe(0);
  });
  it("is bounded and independent of gender and recorded romantic interest", () => {
    for (const pa of profiles)
      for (const pb of profiles) {
        const a = person(1, pa);
        const b = person(2, pb);
        const modifier = getCompatibilitySolidarityModifier(a, b);
        expect(modifier).toBeGreaterThanOrEqual(-20);
        expect(modifier).toBeLessThanOrEqual(20);
        expect(getCompatibilitySolidarityModifier(a, { ...b, gender: "female" })).toBe(modifier);
        expect(getCompatibilitySolidarityModifier({ ...a, favor: { 2: 80 } }, b)).toBe(modifier);
      }
  });
});
