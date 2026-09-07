import { describe, expect, it } from "vitest";
import type { CharacterLanguageSkill, WorldLanguages } from "../../types/worldLanguages";
import { conversationScore, literacyScore, validateWorldLanguages } from "../../utils/worldLanguages";
import type { Character } from "./characterTypes";
import { SPECIALIZATION_DEFINITIONS, SPECIALIZATION_SKILLS } from "./specializationCatalog";
import { advanceSpecializationLearning } from "./specializationLearning";
import {
  decaySpecializations,
  EXPERTISE_TASKS,
  emptySpecializations,
  evaluateExpertise,
  generateSpecializations,
  readSpecializationAxis,
  recordSpecializationExperience,
  resolveCommunication
} from "./specializations";
import { validateSpecializationProfile } from "./specializationValidation";

function expertiseCharacter(i = 1): Character {
  return {
    i,
    name: `Character ${i}`,
    age: 30,
    culture: 1,
    location: 1,
    skills: Object.fromEntries(SPECIALIZATION_SKILLS.map(skill => [skill, 60])),
    specializations: emptySpecializations()
  } as Character;
}
function languageSkill(languageId: string, score = 70): CharacterLanguageSkill {
  return { languageId, speaking: score, listening: score, literacy: [], acquisition: "learned" };
}
function languageWorld(): WorldLanguages {
  return {
    version: 1,
    languages: [
      { id: "a", name: "A", scriptIds: ["shared"] },
      { id: "b", name: "B", scriptIds: ["shared"] },
      { id: "oral", name: "Oral", scriptIds: [] }
    ],
    scripts: [{ id: "shared", name: "Shared" }],
    cultures: [
      {
        cultureId: 1,
        languages: [
          { languageId: "a", share: 0.6 },
          { languageId: "b", share: 0.4 }
        ],
        literaryLanguageIds: ["a"],
        liturgicalLanguageIds: ["oral"]
      }
    ],
    states: [
      {
        stateId: 1,
        administrativeLanguageIds: ["a"],
        diplomaticLanguageIds: ["a", "b"],
        courtLanguageIds: ["b"],
        recognizedLanguageIds: ["a", "b", "oral"]
      }
    ]
  };
}

describe("specializations and language model", () => {
  it("covers all nine skills and generates sparse independent theory/practice without inventing campaigns", () => {
    expect(SPECIALIZATION_SKILLS).toHaveLength(9);
    expect(new Set(SPECIALIZATION_DEFINITIONS.map(entry => entry.id)).size).toBe(SPECIALIZATION_DEFINITIONS.length);
    for (const skill of SPECIALIZATION_SKILLS) {
      const character = expertiseCharacter();
      const result = generateSpecializations(character, skill, languageWorld());
      expect(result.domains).toHaveLength(3);
      expect(result.domains.every(domain => domain.knowledge !== domain.practice)).toBe(true);
      expect(result.experience).toEqual([]);
      expect(result.languages[0].literacy).toEqual([]);
      expect(generateSpecializations(character, skill, languageWorld())).toEqual(result);
      validateSpecializationProfile(result, languageWorld());
    }
  });
  it("keeps old skill values and distinguishes a known zero from missing expertise", () => {
    const character = expertiseCharacter();
    delete character.specializations;
    expect(evaluateExpertise(character, EXPERTISE_TASKS.command)).toMatchObject({ score: 60, approximate: true });
    character.specializations = emptySpecializations();
    character.specializations.domains = [{ domainId: "martial.command", practice: 0 }];
    const result = evaluateExpertise(character, [{ domainId: "martial.command", axis: "practice", weight: 1 }]);
    expect(result).toEqual({ score: 0, approximate: false, missing: [] });
    expect(character.skills.martial).toBe(60);
  });
  it("distinguishes command from naval expertise and applies only relevant terrain", () => {
    const character = expertiseCharacter();
    character.specializations!.domains = [
      { domainId: "martial.command", practice: 80 },
      { domainId: "martial.leadership", practice: 90 },
      { domainId: "martial.tactics", knowledge: 80 },
      { domainId: "martial.naval", practice: 0 }
    ];
    character.specializations!.familiarities = [
      { domainId: "martial.command", kind: "terrain", id: "mountain", practice: 100 }
    ];
    expect(evaluateExpertise(character, EXPERTISE_TASKS.command).score).toBeGreaterThan(
      evaluateExpertise(character, EXPERTISE_TASKS.naval).score
    );
    expect(evaluateExpertise(character, EXPERTISE_TASKS.command, [{ kind: "terrain", id: "mountain" }]).score).toBe(94);
    expect(evaluateExpertise(character, EXPERTISE_TASKS.command, [{ kind: "terrain", id: "plain" }]).score).toBe(84);
  });
  it("reads existing practice as the sole source and never substitutes zero for an unavailable extension", () => {
    const character = expertiseCharacter();
    let skill = 20;
    const read = () => skill;
    expect(readSpecializationAxis(character, "engineering.metallurgy.blacksmithing", "practice", read)).toBe(20);
    skill = 85;
    expect(readSpecializationAxis(character, "engineering.metallurgy.blacksmithing", "practice", read)).toBe(85);
    expect(readSpecializationAxis(character, "engineering.metallurgy.blacksmithing", "practice")).toBeUndefined();
    character.specializations!.domains.push({ domainId: "engineering.metallurgy.blacksmithing", practice: 100 });
    expect(() => validateSpecializationProfile(character.specializations)).toThrow(/Economy/);
  });
  it("can appraise ceramics without making ceramics or understanding music", () => {
    const character = expertiseCharacter();
    character.specializations!.domains = [{ domainId: "artistry.ceramics", knowledge: 80, appraisal: 90, practice: 0 }];
    expect(evaluateExpertise(character, EXPERTISE_TASKS.ceramics).score).toBeCloseTo(86.67);
    expect(readSpecializationAxis(character, "artistry.ceramics", "practice")).toBe(0);
    expect(readSpecializationAxis(character, "artistry.music", "practice")).toBeUndefined();
  });
  it("accepts multilingual cultures, shared scripts, oral languages and separate literacy", () => {
    validateWorldLanguages(languageWorld());
    const character = expertiseCharacter();
    character.specializations!.languages = [languageSkill("a", 90), languageSkill("oral", 60)];
    expect(literacyScore(character.specializations!.languages, "a", "shared", "reading")).toBe(0);
    character.specializations!.languages[0].literacy = [{ scriptId: "shared", reading: 70, writing: 20 }];
    expect(literacyScore(character.specializations!.languages, "b", "shared", "reading")).toBe(0);
    validateSpecializationProfile(character.specializations, languageWorld());
    character.specializations!.languages[1].literacy = [{ scriptId: "shared", reading: 70, writing: 20 }];
    expect(() => validateSpecializationProfile(character.specializations, languageWorld())).toThrow(/script/);
  });
  it("uses both directions of speech and a qualified available interpreter", () => {
    const a = expertiseCharacter(1),
      b = expertiseCharacter(2),
      translator = expertiseCharacter(3);
    a.specializations!.languages = [languageSkill("a", 80)];
    b.specializations!.languages = [languageSkill("b", 70)];
    translator.specializations!.languages = [languageSkill("a", 65), languageSkill("b", 55)];
    expect(resolveCommunication(a, b, languageWorld(), [translator]).score).toBe(0);
    translator.specializations!.domains = [{ domainId: "learning.translation", practice: 60 }];
    expect(resolveCommunication(a, b, languageWorld(), [translator])).toMatchObject({ score: 55, interpreterId: 3 });
    expect(resolveCommunication(a, b).enabled).toBe(false);
    const oneWay = languageSkill("a", 90);
    oneWay.listening = 10;
    expect(conversationScore(a.specializations!.languages, [oneWay], "a")).toBe(10);
  });
  it("records defeat as practice once, protects time budgets and separates study from practice", () => {
    const character = expertiseCharacter();
    const battle = {
      id: "battle1",
      domainId: "martial.siege",
      year: 1000,
      coverage: 0.6,
      mode: "battle" as const,
      role: "commander",
      outcome: "defeat",
      source: "simulation" as const,
      targets: [{ kind: "terrain" as const, id: "urban" }]
    };
    expect(recordSpecializationExperience(character, battle)).toBe(true);
    expect(readSpecializationAxis(character, "martial.siege", "practice")).toBeGreaterThan(0);
    expect(readSpecializationAxis(character, "martial.siege", "knowledge")).toBeUndefined();
    expect(recordSpecializationExperience(character, battle)).toBe(false);
    expect(recordSpecializationExperience(character, { ...battle, id: "battle2" })).toBe(false);
    expect(recordSpecializationExperience(character, { ...battle, id: "study", mode: "study", coverage: 0.4 })).toBe(
      true
    );
    validateSpecializationProfile(character.specializations);
  });
  it("rejects nonfinite scores, duplicate IDs, unknown fields and incompatible learning plans", () => {
    const profile = emptySpecializations();
    profile.domains = [{ domainId: "martial.command", practice: NaN }];
    expect(() => validateSpecializationProfile(profile)).toThrow();
    profile.domains = [{ domainId: "unknown", practice: 10 }];
    expect(() => validateSpecializationProfile(profile)).toThrow();
    const world = languageWorld();
    world.cultures[0].languages[0].share = 0.9;
    expect(() => validateWorldLanguages(world)).toThrow(/sum/);
  });
});

describe("time-based learning", () => {
  it("grows only the chosen axis, consumes time and is invariant between daily and yearly updates", () => {
    const teacher = expertiseCharacter(2);
    teacher.specializations!.domains = [{ domainId: "martial.operations", knowledge: 80 }];
    const student = expertiseCharacter();
    student.specializations!.learningPlan = {
      teacherId: 2,
      kind: "domain",
      domainId: "martial.operations",
      axis: "knowledge"
    };
    const daily = structuredClone(student);
    advanceSpecializationLearning(student, [teacher], 1000, 1);
    for (let i = 0; i < 365; i++) advanceSpecializationLearning(daily, [teacher], 1000, 1 / 365);
    expect(readSpecializationAxis(student, "martial.operations", "knowledge")).toBeGreaterThan(0);
    expect(readSpecializationAxis(student, "martial.operations", "knowledge")).toBeCloseTo(
      readSpecializationAxis(daily, "martial.operations", "knowledge")!,
      6
    );
    expect(readSpecializationAxis(student, "martial.operations", "practice")).toBeUndefined();
    expect(daily.specializations!.experience).toHaveLength(1);
    expect(daily.specializations!.learningCoverage).toBeCloseTo(0.25);
    validateSpecializationProfile(daily.specializations);
    const before = structuredClone(student.specializations);
    teacher.location = 2;
    advanceSpecializationLearning(student, [teacher], 1001, 1);
    expect(student.specializations).toEqual(before);
  });
  it("learns an oral foreign language without granting literacy or understanding other languages", () => {
    const student = expertiseCharacter(),
      teacher = expertiseCharacter(2);
    teacher.specializations!.languages = [languageSkill("oral", 80)];
    student.specializations!.learningPlan = { teacherId: 2, kind: "language", languageId: "oral", axis: "listening" };
    advanceSpecializationLearning(student, [teacher], 1000, 1, languageWorld());
    expect(student.specializations!.languages[0]).toMatchObject({ speaking: 0, literacy: [] });
    expect(student.specializations!.languages[0].listening).toBeGreaterThan(0);
    validateSpecializationProfile(student.specializations, languageWorld());
  });
});

describe("expertise growth limits", () => {
  it("uses aptitude only for growth, never for current task performance", () => {
    const ordinary = expertiseCharacter(1),
      gifted = expertiseCharacter(2);
    ordinary.specializations!.domains = [{ domainId: "martial.command", practice: 50, aptitude: "ordinary" }];
    gifted.specializations!.domains = [{ domainId: "martial.command", practice: 50, aptitude: "gifted" }];
    expect(evaluateExpertise(ordinary, EXPERTISE_TASKS.command).score).toBe(
      evaluateExpertise(gifted, EXPERTISE_TASKS.command).score
    );
    const event = {
      id: "practice",
      year: 1000,
      domainId: "martial.command",
      coverage: 1,
      mode: "training" as const,
      role: "officer",
      outcome: "service",
      source: "simulation" as const,
      targets: []
    };
    recordSpecializationExperience(ordinary, event);
    recordSpecializationExperience(gifted, event);
    expect(gifted.specializations!.domains[0].practice!).toBeGreaterThan(
      ordinary.specializations!.domains[0].practice!
    );
  });
  it("retains theory while unused practice decays only after five years", () => {
    const character = expertiseCharacter();
    character.specializations!.domains = [{ domainId: "martial.command", knowledge: 80, practice: 70 }];
    decaySpecializations(character, 1000);
    decaySpecializations(character, 1005);
    expect(character.specializations!.domains[0].practice).toBe(70);
    decaySpecializations(character, 1010);
    expect(character.specializations!.domains[0].practice).toBe(69.5);
    expect(character.specializations!.domains[0].knowledge).toBe(80);
    validateSpecializationProfile(character.specializations);
  });
});

describe("diplomatic language policies", () => {
  it("uses state-designated languages for diplomacy while keeping private teaching independent", () => {
    const a = expertiseCharacter(1),
      b = expertiseCharacter(2),
      translator = expertiseCharacter(3);
    a.state = 1;
    b.state = 2;
    a.specializations!.languages = [languageSkill("a", 90), languageSkill("b", 90)];
    b.specializations!.languages = [languageSkill("a", 90), languageSkill("b", 90)];
    translator.specializations!.languages = [languageSkill("a", 70), languageSkill("b", 70)];
    translator.specializations!.domains = [{ domainId: "learning.translation", practice: 65 }];
    const world = languageWorld();
    world.states[0].diplomaticLanguageIds = ["a"];
    world.states.push({ ...world.states[0], stateId: 2, diplomaticLanguageIds: ["b"] });
    expect(resolveCommunication(a, b, world, [], { diplomatic: true }).score).toBe(0);
    expect(resolveCommunication(a, b, world, [translator], { diplomatic: true })).toMatchObject({
      score: 65,
      interpreterId: 3
    });
    expect(resolveCommunication(a, b, world).score).toBe(90);
    world.states[1].diplomaticLanguageIds = [];
    expect(resolveCommunication(a, b, world, [], { diplomatic: true }).score).toBe(90);
  });
});
