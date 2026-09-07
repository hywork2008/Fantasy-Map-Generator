import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../types/extension-api";
import type { WorldLanguages } from "../../types/worldLanguages";
import { literacyScore } from "../../utils/worldLanguages";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import type { Character, CharacterOrigin, EstateStatus, RaisedIn, SocialStratum } from "./characterTypes";
import {
  applySpecializationEducation,
  computeLiteracyScores,
  gatherLiteracyInfluences,
  localLiteracyEnvironment
} from "./literacyGeneration";
import { emptySpecializations } from "./specializations";

function origin(overrides: Partial<CharacterOrigin> = {}): CharacterOrigin {
  return {
    socialStratum: "commoner",
    estateStatus: "freeman",
    birthStateId: 1,
    raisedIn: "rural_manor",
    ...overrides
  };
}

function character(
  stratum: SocialStratum,
  raisedIn: RaisedIn,
  estateStatus: EstateStatus = "freeman",
  extra: Partial<CharacterOrigin> = {}
): Character {
  return {
    i: 1,
    name: "Test",
    age: 30,
    culture: 1,
    location: 1,
    skills: {
      artistry: 60,
      diplomacy: 60,
      engineering: 60,
      geography: 60,
      intrigue: 60,
      learning: 60,
      martial: 60,
      prowess: 60,
      stewardship: 60
    },
    specializations: emptySpecializations(),
    backstory: {
      origin: origin({ socialStratum: stratum, raisedIn, estateStatus, ...extra }),
      commitment: { primary: { kind: "self" }, intensity: 50, conflictPolicy: "primary_wins" },
      tastes: []
    }
  } as Character;
}

function languageWorld(): WorldLanguages {
  return {
    version: 1,
    languages: [
      { id: "a", name: "A", scriptIds: ["shared"] },
      { id: "oral", name: "Oral", scriptIds: [] }
    ],
    scripts: [{ id: "shared", name: "Shared" }],
    cultures: [
      {
        cultureId: 1,
        languages: [{ languageId: "a", share: 1 }],
        literaryLanguageIds: ["a"],
        liturgicalLanguageIds: []
      }
    ],
    states: [
      {
        stateId: 1,
        administrativeLanguageIds: ["a"],
        courtLanguageIds: ["a"],
        diplomaticLanguageIds: ["a"],
        recognizedLanguageIds: ["a"]
      }
    ]
  };
}

afterEach(clearCharactersContext);

describe("literacy layers", () => {
  it("keeps personal access scores when no world influences are supplied", () => {
    expect(computeLiteracyScores(character("high_noble", "rural_manor", "landed_noble"))).toEqual({
      reading: 59,
      writing: 43
    });
    expect(computeLiteracyScores(character("commoner", "rural_manor"))).toBeUndefined();
    expect(computeLiteracyScores(character("commoner", "monastery"))).toEqual({ reading: 59, writing: 43 });
  });

  it("grants letters to a trade or administrative family without a court upbringing", () => {
    expect(
      computeLiteracyScores(character("commoner", "rural_manor", "freeman", { familyOccupation: "administration" }))
    ).toEqual({ reading: 59, writing: 43 });
    expect(computeLiteracyScores(character("commoner", "street", "freeman", { familyOccupation: "trade" }))).toEqual({
      reading: 59,
      writing: 43
    });
  });

  it("shifts noble floors by culture knowledgeValue and polity form", () => {
    const marshal = character("high_noble", "military_camp", "officer");
    marshal.skills.learning = 20;
    expect(computeLiteracyScores(marshal)).toEqual({ reading: 45, writing: 35 });
    const horde = computeLiteracyScores(marshal, { knowledgeValue: 0.22, formPackId: "horde" });
    expect(horde!.reading).toBeLessThan(30);
    expect(horde!.writing).toBeLessThan(15);
    const theocracy = computeLiteracyScores(marshal, { knowledgeValue: 0.7, formPackId: "theocracy" });
    expect(theocracy!.reading).toBeGreaterThan(45);
    expect(theocracy!.writing).toBeGreaterThan(35);
  });

  it("lets monastery towns and capitals raise unschooled commoner literacy, within the period ceiling", () => {
    const peasant = character("commoner", "rural_manor");
    expect(computeLiteracyScores(peasant, { local: { monastery: true } })).toBeUndefined();
    const monasticTown = computeLiteracyScores(peasant, {
      local: { monastery: true, temple: true },
      historicalPeriod: "earlyMedieval"
    });
    expect(monasticTown).toEqual({ reading: 12, writing: 6 });

    const urban = computeLiteracyScores(peasant, {
      local: { capital: true, printingStock: 1 },
      historicalPeriod: "ageOfExploration"
    });
    expect(urban!.reading).toBe(48);
    expect(urban!.writing).toBe(36);
  });

  it("uses recordReplication to thicken copying and to lower the commoner access threshold", () => {
    const noble = character("high_noble", "rural_manor", "landed_noble");
    expect(computeLiteracyScores(noble, { recordReplicationStage: "diffused" })).toEqual({
      reading: 67,
      writing: 57
    });
    const peasant = character("commoner", "rural_manor");
    expect(
      computeLiteracyScores(peasant, { local: { monastery: true }, historicalPeriod: "earlyMedieval" })
    ).toBeUndefined();
    expect(
      computeLiteracyScores(peasant, {
        local: { monastery: true },
        historicalPeriod: "earlyMedieval",
        recordReplicationStage: "diffused"
      })
    ).toEqual({ reading: 12, writing: 6 });
  });

  it("uses historical period only as the last ceiling, including mass literacy", () => {
    const marshal = character("high_noble", "military_camp", "officer");
    marshal.skills.learning = 20;
    expect(computeLiteracyScores(marshal, { historicalPeriod: "earlyMedieval" })).toEqual({
      reading: 40,
      writing: 22
    });
    const peasant = character("commoner", "rural_manor");
    expect(computeLiteracyScores(peasant, { historicalPeriod: "earlyMedieval" })).toBeUndefined();
    expect(computeLiteracyScores(peasant, { historicalPeriod: "steamEra" })).toEqual({
      reading: 59,
      writing: 43
    });
    const monk = computeLiteracyScores(character("commoner", "monastery"), { historicalPeriod: "earlyMedieval" });
    expect(monk!.reading).toBe(59);
  });

  it("weights local sites without inventing a burg", () => {
    expect(localLiteracyEnvironment({ monastery: true, temple: true, capital: true, printingStock: 1 })).toBe(1);
    expect(localLiteracyEnvironment({ printingStock: 1 })).toBeCloseTo(0.35);
  });
});

describe("applySpecializationEducation with influences", () => {
  it("still refuses oral languages and privately learned tongues", () => {
    const lord = character("high_noble", "rural_manor", "landed_noble");
    lord.specializations!.languages = [
      { languageId: "oral", speaking: 85, listening: 90, acquisition: "native", literacy: [] },
      { languageId: "a", speaking: 40, listening: 40, acquisition: "learned", literacy: [] }
    ];
    applySpecializationEducation(lord, languageWorld(), { historicalPeriod: "steamEra" });
    expect(lord.specializations!.languages[0].literacy).toEqual([]);
    expect(lord.specializations!.languages[1].literacy).toEqual([]);
  });

  it("writes native letters for an industrial rural commoner and a printing-capital commoner", () => {
    const rural = character("commoner", "rural_manor");
    rural.specializations!.languages = [
      { languageId: "a", speaking: 85, listening: 90, acquisition: "native", literacy: [] }
    ];
    applySpecializationEducation(rural, languageWorld(), { historicalPeriod: "industrialChemistryEra" });
    expect(literacyScore(rural.specializations!.languages, "a", "shared", "reading")).toBe(59);

    const urban = character("commoner", "capital_city");
    urban.specializations!.languages = [
      { languageId: "a", speaking: 85, listening: 90, acquisition: "native", literacy: [] }
    ];
    applySpecializationEducation(urban, languageWorld(), {
      historicalPeriod: "ageOfExploration",
      local: { capital: true, printingStock: 0.8, academyAdministrationStock: 0.5 }
    });
    expect(urban.specializations!.languages[0].literacy).toHaveLength(1);
  });
});

describe("gatherLiteracyInfluences", () => {
  it("reads culture, form, burg, guild, academy and recordReplication without importing Economy", () => {
    const person = character("commoner", "rural_manor");
    person.backstory!.origin.birthBurgId = 1;
    person.state = 1;
    const api = {
      worldContext: {
        options: { historicalPeriod: "ageOfExploration" },
        pack: {
          cultures: [undefined, { i: 1, type: "Nomadic", knowledgeValue: 0.22 }],
          states: [undefined, { i: 1, form: "Horde", formName: "Khanate", capital: 1 }],
          burgs: [undefined, { i: 1, capital: 1, temple: 1, group: "city" }]
        }
      },
      simulationContext: {
        extensions: {
          economy: {
            guildKnowledgeStocks: [{ burgId: 1, domain: "printing", stock: 0.8 }],
            academyKnowledgeStocks: [{ burgId: 1, domain: "administration", stock: 0.4 }]
          }
        },
        technology: {
          progress: [{ technologyId: "recordReplication", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 }]
        }
      }
    } as unknown as ExtensionAPI;
    initCharactersContext(api);
    expect(gatherLiteracyInfluences(person)).toEqual({
      knowledgeValue: 0.22,
      formPackId: "horde",
      historicalPeriod: "ageOfExploration",
      local: {
        monastery: false,
        temple: true,
        capital: true,
        printingStock: 0.8,
        academyAdministrationStock: 0.4
      },
      recordReplicationStage: "adopted"
    });
  });
});
