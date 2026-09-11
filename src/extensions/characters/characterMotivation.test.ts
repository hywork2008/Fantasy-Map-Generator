import Alea from "alea";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/locales/en.json";
import ja from "../../i18n/locales/ja.json";
import { applyCharacterBackstory, gamblingPersonalityMult, offerGift } from "./backstoryProfile";
import {
  determineCompassionScope,
  getCompassionFor,
  getPersonalAmbition,
  getWarPreference,
  seedCharacterMotivation
} from "./characterMotivation";
import { getEffectivePatriotism } from "./characterSimulationHooks";
import type { Character } from "./characterTypes";
import { buildDailyTastes, DAILY_TASTE_IDS, retainTastes } from "./dailyTastes";
import { idleHawkLoyalty } from "./idleHawkMischief";
import { personalOfficeExitCause } from "./officeResignation";
import { calculateCharacterTraits } from "./utils/personalityUtils";

function person(): Character {
  return {
    i: 1,
    name: "A",
    age: 40,
    gender: "male",
    culture: 1,
    state: 1,
    titles: [],
    pastTitles: [],
    affinities: {},
    marriages: [],
    appearance: 50,
    prestige: 50,
    wealth: 20,
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    skills: {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    },
    personality: {
      boldness: 50,
      compassion: 85,
      greed: 30,
      honor: 80,
      rationality: 50,
      sociability: 50,
      vengefulness: 30,
      zeal: 85,
      energy: 50,
      piety: 85,
      guile: 80,
      confidence: 50
    },
    backstory: {
      origin: { socialStratum: "commoner", estateStatus: "officer", birthStateId: 1, raisedIn: "military_camp" },
      commitment: { primary: { kind: "state", targetId: 1 }, intensity: 90, conflictPolicy: "negotiate" },
      tastes: []
    }
  };
}

afterEach(() => vi.restoreAllMocks());

describe("independent character motivations", () => {
  it("does not penalize a compassionate patriotic schemer for guile, zeal, or solitude", () => {
    const a = person();
    const b = structuredClone(a);
    b.personality.guile = 10;
    b.personality.zeal = 10;
    b.personality.sociability = 10;
    // Intensity is held constant: this comparison concerns global personality, not dedication to a target.
    expect(calculateCharacterTraits(a.personality)).toEqual(calculateCharacterTraits(b.personality));
    expect(getEffectivePatriotism(a)).toBe(getEffectivePatriotism(b));
  });

  it("separates a brave pacifist from a cautious warmonger", () => {
    const a = person();
    a.personality.boldness = 100;
    a.backstory!.principles = ["reject_aggression"];
    const b = person();
    b.personality.boldness = 1;
    b.backstory!.tastes = [{ id: "war", polarity: "like", intensity: 100 }];
    expect(getWarPreference(a)).toBe(0);
    expect(getWarPreference(b)).toBeGreaterThanOrEqual(60);
    b.personality.boldness = 100;
    expect(getWarPreference(b)).toBe(getWarPreference({ ...b, personality: { ...b.personality, boldness: 1 } }));
  });

  it("supports frugal ambition and opposition to a ruler without erasing love of country", () => {
    const a = person();
    a.backstory!.goals = [{ kind: "gain_office", intensity: 95, status: "active" }];
    a.solidarity = { 2: -80 };
    a.affinities = { 1: 100 };
    const ruler = { ...person(), i: 2 };
    expect(getPersonalAmbition(a)).toBe(95);
    expect(getEffectivePatriotism(a)).toBeGreaterThan(60);
    expect(idleHawkLoyalty(a, ruler, 1)).toBeLessThan(40);
    a.backstory!.goals[0].status = "completed";
    expect(getPersonalAmbition(a)).toBeLessThan(55);
  });

  it("applies the scope of compassion without inventing religious hostility", () => {
    const a = person();
    const b = { ...person(), i: 2, state: 2 };
    a.backstory!.compassionScope = "community";
    expect(getCompassionFor(a, b)).toBeLessThan(a.personality.compassion);
    a.backstory!.compassionScope = "everyone";
    expect(getCompassionFor(a, b)).toBe(a.personality.compassion);
    a.backstory!.compassionScope = "faith";
    expect(getCompassionFor(a, b)).toBe(a.personality.compassion);
    a.backstory!.compassionScope = "self";
    expect(getCompassionFor(a, a)).toBe(a.personality.compassion);
    expect(getCompassionFor(a, b)).toBeLessThan(a.personality.compassion);
    a.backstory!.compassionScope = "species";
    a.race = 1;
    b.race = 1;
    expect(getCompassionFor(a, b)).toBe(a.personality.compassion);
    b.race = 2;
    expect(getCompassionFor(a, b)).toBeLessThan(a.personality.compassion);
  });

  it("determines appropriate compassionScope from character traits and commitments", () => {
    // 1. Cold, ruthless egoist -> self
    const selfish = person();
    selfish.personality.compassion = 15;
    selfish.personality.greed = 85;
    selfish.backstory!.commitment.primary = { kind: "self" };
    expect(determineCompassionScope(selfish)).toBe("self");

    // 2. High empathy humanitarian -> everyone
    const saint = person();
    saint.personality.compassion = 90;
    saint.backstory!.commitment.primary = { kind: "people" };
    saint.backstory!.principles = ["protect_civilians"];
    expect(determineCompassionScope(saint)).toBe("everyone");

    // 3. Devout believer -> faith
    const monk = person();
    monk.personality.piety = 90;
    monk.backstory!.commitment.primary = { kind: "faith" };
    monk.backstory!.origin.raisedIn = "monastery";
    expect(determineCompassionScope(monk)).toBe("faith");

    // 4. Family-first ruler / parent -> family
    const familyPerson = person();
    familyPerson.personality.compassion = 50;
    familyPerson.family = { spouses: 1, children: 3, grandchildren: 0, greatGrandchildren: 0 };
    familyPerson.backstory!.commitment.primary = { kind: "family" };
    expect(determineCompassionScope(familyPerson)).toBe("family");

    // 5. Ethnocentric / exile valuing kin and culture -> species
    const exile = person();
    exile.backstory!.origin.migration = "exile";
    exile.backstory!.commitment.primary = { kind: "nation_culture" };
    expect(determineCompassionScope(exile)).toBe("species");

    // 6. Standard civic leader / soldier -> community
    const soldier = person();
    soldier.personality.compassion = 50;
    soldier.backstory!.commitment.primary = { kind: "state", targetId: 1 };
    expect(determineCompassionScope(soldier)).toBe("community");

    // seedCharacterMotivation integrates determineCompassionScope
    const charToSeed = person();
    charToSeed.personality.compassion = 10;
    charToSeed.backstory!.commitment.primary = { kind: "self" };
    seedCharacterMotivation(charToSeed);
    expect(charToSeed.backstory!.compassionScope).toBe("self");
  });

  it("does not infer violence or fictional life events from faith and zeal", () => {
    const a = person();
    a.backstory!.commitment.primary = { kind: "faith" };
    seedCharacterMotivation(a);
    expect(a.backstory!.religiousWar).toBe("unspecified");
    expect(a.backstory!.lifeEvents).toBeUndefined();
    expect(a.backstory!.goals).toContainEqual({ kind: "serve_faith", intensity: 90, status: "active" });
  });

  it("requires evidence for mission, health, family, and policy exits", () => {
    const a = person();
    expect(personalOfficeExitCause(a, { title: "Marshal", stateWarlike: 100, policyWarPreference: 0 })).toBeUndefined();
    a.backstory!.principles = ["reject_aggression"];
    expect(personalOfficeExitCause(a, { title: "Marshal", policyWarPreference: 90 })).toBe("policy_conflict");
    a.health = 20;
    expect(personalOfficeExitCause(a, {})).toBe("health");
    a.health = 100;
    a.backstory!.goals = [
      { kind: "complete_service", intensity: 80, status: "completed", target: { type: "state", id: 2 } }
    ];
    expect(personalOfficeExitCause(a, { stateId: 1 })).toBeUndefined();
    expect(personalOfficeExitCause(a, { stateId: 2 })).toBe("mission_complete");
    a.backstory!.goals = [
      { kind: "reunite_family", intensity: 90, status: "active", target: { type: "character", id: 2 } }
    ];
    expect(personalOfficeExitCause(a, {})).toBeUndefined();
    a.family.childIds = [2];
    a.location = 1;
    expect(personalOfficeExitCause(a, { characters: [{ ...person(), i: 2, location: 3 }] })).toBe("family");
  });

  it("keeps old saves without a backstory usable and existing goals intact", () => {
    const a = person();
    a.backstory = undefined;
    expect(Number.isFinite(getWarPreference(a))).toBe(true);
    expect(personalOfficeExitCause(a, {})).toBeUndefined();
    const b = person();
    b.backstory!.goals = [{ kind: "return_home", intensity: 95, status: "active" }];
    b.backstory!.principles = ["spare_prisoners"];
    b.backstory!.religiousWar = "defensive";
    seedCharacterMotivation(b);
    expect(JSON.parse(JSON.stringify(b)).backstory).toEqual(b.backstory);
    expect(b.backstory!.goals[0].kind).toBe("return_home");
    expect(b.backstory!.principles).toEqual(["spare_prisoners"]);
  });

  it("can represent foreign nobility with a merchant family and monastic upbringing", () => {
    const a = person();
    a.birthStateId = 2;
    applyCharacterBackstory(a, { socialStratum: "high_noble", raisedIn: "monastery", familyOccupation: "trade" });
    expect(a.backstory!.origin).toMatchObject({
      socialStratum: "high_noble",
      raisedIn: "monastery",
      migration: "immigrant",
      familyOccupation: "trade"
    });
  });
});

describe("everyday tastes", () => {
  it("retains late interests, ethical judgements, and mixed enjoyment/value without the old four-item cutoff", () => {
    const tastes = retainTastes([
      ...["company", "gold", "luxury", "wine"].map(id => ({ id, polarity: "like" as const, intensity: 70 })),
      { id: "horses", polarity: "like", intensity: 95 },
      { id: "cruelty", polarity: "dislike", intensity: 90, aspect: "value" },
      { id: "wine", polarity: "dislike", intensity: 80, aspect: "value" }
    ]);
    expect(tastes).toHaveLength(7);
    expect(tastes[0].id).toBe("horses");
    expect(tastes.filter(t => t.id === "wine")).toHaveLength(2);
  });

  it("generates three different everyday interests with both polarities and localized labels", () => {
    vi.spyOn(Math, "random").mockImplementation(Alea("everyday"));
    const tastes = buildDailyTastes();
    expect(tastes).toHaveLength(3);
    expect(new Set(tastes.map(t => t.id)).size).toBe(3);
    expect(tastes.map(t => t.polarity)).toEqual(["like", "like", "dislike"]);
    for (const id of DAILY_TASTE_IDS) {
      expect(en.characters.tasteNames).toHaveProperty(id);
      expect(ja.characters.tasteNames).toHaveProperty(id);
    }
  });

  it("makes honey a suitable gift for a sweet tooth", () => {
    const giver = person();
    const recipient = { ...person(), i: 2 };
    recipient.backstory!.tastes = [{ id: "sweets", polarity: "like", intensity: 90 }];
    expect(
      offerGift(giver, recipient, { intent: "courtesy", goodName: "Honey", valueHint: 20 }).matchScore
    ).toBeGreaterThan(0);
  });

  it("does not make skilled, rational people automatically dislike gambling", () => {
    const a = person();
    const b = structuredClone(a);
    b.personality.rationality = 100;
    b.skills.learning = b.skills.engineering = b.skills.stewardship = 100;
    expect(gamblingPersonalityMult(a.personality, a.skills)).toBe(gamblingPersonalityMult(b.personality, b.skills));
  });
});
