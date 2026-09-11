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

  it("excludes self and close family from romantic prospects, but preserves compatibility for deceased partners", () => {
    const a = person(1, passionate);
    const b = person(2, passionate, "female");
    expect(getRelationshipCompatibility(a, a).romance).toBe(0);
    expect(getRelationshipCompatibility(a, a).reasons).toContain("romanceExcluded");

    // Close family is excluded
    const family = { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 };
    expect(getRelationshipCompatibility(a, { ...b, family: { ...family, fatherId: 1 } }).romance).toBe(0);
    expect(
      getRelationshipCompatibility(
        { ...a, family: { ...family, motherId: 9 } },
        { ...b, family: { ...family, motherId: 9 } }
      ).romance
    ).toBe(0);

    // Deceased strangers maintain personality compatibility but get marked as deceased
    const deceasedStranger = getRelationshipCompatibility(a, { ...b, dead: true });
    expect(deceasedStranger.romance).toBeGreaterThan(0);
    expect(deceasedStranger.reasons).toContain("deceased");

    // Deceased partners (married or recorded favor) get marked with bereavedLove
    const marriedA = { ...a, family: { ...family, spouseIds: [2] } };
    const bereavedMatch = getRelationshipCompatibility(marriedA, { ...b, dead: true });
    expect(bereavedMatch.romance).toBeGreaterThan(0);
    expect(bereavedMatch.reasons).toContain("bereavedLove");
  });

  it("protects minors under 15 years old by setting romance to zero", () => {
    const adult = { ...person(1, passionate), age: 30 };
    const child = { ...person(2, passionate, "female"), age: 12 };
    const result = getRelationshipCompatibility(adult, child);
    expect(result.romance).toBe(0);
    expect(result.reasons).toContain("underageProtection");
    expect(result.friendship).toBeGreaterThan(0);
  });

  it("applies orderly generational harmony or gap concerns for norm-abiding characters", () => {
    const knight = { ...person(1, { honor: 80, piety: 80 }), age: 30 };
    const peer = { ...person(2, { honor: 80, piety: 80 }, "female"), age: 28 };
    const elderPeer = { ...person(3, { honor: 80, piety: 80 }, "female"), age: 55 };

    const peerMatch = getRelationshipCompatibility(knight, peer);
    expect(peerMatch.reasons).toContain("orderlyGenerations");

    const elderMatch = getRelationshipCompatibility(knight, elderPeer);
    expect(elderMatch.reasons).toContain("generationGapConcern");
    expect(elderMatch.friction).toBeGreaterThan(peerMatch.friction);
  });

  it("reflects scandalous lecherous pursuits and mature affections across age gaps", () => {
    const lecherousElder = {
      ...person(1, { honor: 20, piety: 20, boldness: 80, greed: 80 }),
      age: 55
    };
    const youngAdult = {
      ...person(2, { honor: 50 }, "female"),
      age: 19
    };
    const lecheryResult = getRelationshipCompatibility(lecherousElder, youngAdult);
    expect(lecheryResult.reasons).toContain("lecherousPursuit");
    expect(lecheryResult.friction).toBeGreaterThanOrEqual(50);

    const matureAdmirer = {
      ...person(3, { honor: 25, zeal: 80 }),
      age: 22
    };
    const calmElder = {
      ...person(4, { compassion: 80, sociability: 20 }, "female"),
      age: 50
    };
    const admirationResult = getRelationshipCompatibility(matureAdmirer, calmElder);
    expect(admirationResult.reasons).toContain("matureAffection");
    expect(admirationResult.romance).toBeGreaterThan(35);
  });

  it("reflects social estate divides across historical periods", () => {
    const royal = {
      ...person(1, passionate),
      origin: {
        socialStratum: "royal",
        estateStatus: "reigning_dynasty",
        birthStateId: 1,
        raisedIn: "capital_court"
      } as const
    };
    const serf = {
      ...person(2, passionate, "female"),
      origin: { socialStratum: "commoner", estateStatus: "serf", birthStateId: 1, raisedIn: "rural_manor" } as const
    };

    // Medieval period: strict class barrier
    const medieval = getRelationshipCompatibility(royal, serf, { historicalPeriod: "highMedieval" });
    expect(medieval.reasons).toContain("classDivideMedieval");
    expect(medieval.romance).toBeLessThanOrEqual(25);
    expect(medieval.friction).toBeGreaterThanOrEqual(50);

    // Modern period: class barriers soften
    const modern = getRelationshipCompatibility(royal, serf, { historicalPeriod: "preIndustrialEra" });
    expect(modern.reasons).toContain("classDivideModern");
    expect(modern.friction).toBeLessThan(medieval.friction);
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

describe("romance diversity factors and options", () => {
  it("allows upbringing (e.g. monastery) to make a character withdrawn in romance while keeping their social type", () => {
    const monk = {
      ...person(1, { rationality: 80 }),
      origin: { raisedIn: "monastery" } as any
    };
    const profileWith = getCompatibilityProfile(monk, { diversityConfig: { upbringing: true } });
    expect(profileWith.social).toBe("analytical");
    expect(profileWith.romantic).toBe("withdrawn");

    const profileWithout = getCompatibilityProfile(monk, { diversityConfig: { upbringing: false } });
    expect(profileWithout.social).toBe("analytical");
    expect(profileWithout.romantic).toBe("independent");
  });

  it("allows life commitment (e.g. pleasure) to skew romance toward plural/passionate", () => {
    const hedonist = {
      ...person(1, { honor: 80, compassion: 80 }),
      backstory: { commitment: { kind: "pleasure" } } as any
    };
    const profileWith = getCompatibilityProfile(hedonist, { diversityConfig: { commitment: true } });
    expect(profileWith.social).toBe("caring");
    expect(profileWith.romantic).toBe("plural");

    const profileWithout = getCompatibilityProfile(hedonist, { diversityConfig: { commitment: false } });
    expect(profileWithout.social).toBe("caring");
    expect(profileWithout.romantic).toBe("devoted");
  });

  it("allows skills (e.g. artistry) to unlock passionate romance in analytical characters", () => {
    const poetScholar = {
      ...person(1, { rationality: 80 }),
      skills: { artistry: 95, intrigue: 20, learning: 80 } as any
    };
    const profileWith = getCompatibilityProfile(poetScholar, { diversityConfig: { skills: true } });
    expect(profileWith.social).toBe("analytical");
    expect(profileWith.romantic).toBe("passionate");

    const profileWithout = getCompatibilityProfile(poetScholar, { diversityConfig: { skills: false } });
    expect(profileWithout.social).toBe("analytical");
    expect(profileWithout.romantic).toBe("independent");
  });

  it("allows unique offset to give distinct romantic profiles to identical characters, and falls back identically when disabled", () => {
    const twin1 = person(101);
    const twin2 = person(102);

    const p1 = getCompatibilityProfile(twin1, { diversityConfig: { uniqueOffset: true } });
    const p2 = getCompatibilityProfile(twin2, { diversityConfig: { uniqueOffset: true } });
    expect(p1.romantic !== p2.romantic || p1.romantic !== "measured").toBe(true);

    const offConfig = { upbringing: false, commitment: false, skills: false, uniqueOffset: false };
    const p1Off = getCompatibilityProfile(twin1, { diversityConfig: offConfig });
    const p2Off = getCompatibilityProfile(twin2, { diversityConfig: offConfig });
    expect(p1Off.romantic).toBe("measured");
    expect(p2Off.romantic).toBe("measured");
    expect(p1Off.social).toBe(p2Off.social);
  });
});
