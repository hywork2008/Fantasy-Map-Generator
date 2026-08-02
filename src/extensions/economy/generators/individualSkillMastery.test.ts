import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getIndividualSkills, initEconomyContext, setIndividualSkills } from "../economyContext";
import {
  ensureBlacksmithingSkill,
  growApprenticeBlacksmithing,
  growMasterBlacksmithing,
  inheritBlacksmithingTechniques,
  settleBlacksmithingTechniques
} from "./individualSkillMastery";
import type { CharacterDomainSkill } from "./individualSkillTypes";

function character(id: number, engineering: number): Character {
  return {
    i: id,
    name: `Character ${id}`,
    age: 30,
    gender: "female",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 1,
      diplomacy: 1,
      engineering,
      geography: 1,
      intrigue: 1,
      learning: 1,
      martial: 1,
      prowess: 1,
      stewardship: 1
    },
    personality: {
      boldness: 1,
      compassion: 1,
      greed: 1,
      honor: 1,
      rationality: 1,
      sociability: 1,
      vengefulness: 1,
      zeal: 1,
      energy: 1,
      piety: 1,
      guile: 1,
      confidence: 1
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: []
  };
}

describe("individual metallurgy mastery", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    setIndividualSkills([]);
  });

  afterEach(() => clearEconomyContext());

  it("creates one blacksmithing record from the legacy engineering value without changing it", () => {
    const master = character(1, 72);

    const first = ensureBlacksmithingSkill(master, "master");
    const second = ensureBlacksmithingSkill(master, "master");

    expect(first.proficiency).toBe(72);
    expect(second).toBe(first);
    expect(getIndividualSkills()).toHaveLength(1);
    expect(master.skills.engineering).toBe(72);
  });

  it("grows practical skill from work and instruction while leaving aptitude out of output state", () => {
    const master: CharacterDomainSkill = {
      characterId: 1,
      domain: "blacksmithing",
      proficiency: 85,
      aptitude: "ordinary",
      techniques: []
    };
    const apprentice: CharacterDomainSkill = {
      characterId: 2,
      domain: "blacksmithing",
      proficiency: 20,
      aptitude: "ordinary",
      techniques: []
    };

    growMasterBlacksmithing(master, 1);
    growApprenticeBlacksmithing(apprentice, master, 1);

    expect(master.proficiency).toBeGreaterThan(85);
    expect(apprentice.proficiency).toBeGreaterThan(20);
    expect(apprentice.lastPracticedYear).toBe(500);
  });

  it("requires mastery, institution access, and a teacher before techniques pass on", () => {
    const master: CharacterDomainSkill = {
      characterId: 1,
      domain: "blacksmithing",
      proficiency: 90,
      aptitude: "gifted",
      techniques: []
    };
    const apprentice: CharacterDomainSkill = {
      characterId: 2,
      domain: "blacksmithing",
      proficiency: 82,
      aptitude: "ordinary",
      techniques: []
    };

    settleBlacksmithingTechniques(master, [apprentice], 1, () => true);

    expect(master.techniques).toEqual(["heatTreatment"]);
    expect(apprentice.techniques).toEqual(["heatTreatment"]);
  });

  it("keeps personal techniques through direct succession", () => {
    const predecessor: CharacterDomainSkill = {
      characterId: 1,
      domain: "blacksmithing",
      proficiency: 96,
      aptitude: "exceptional",
      techniques: ["heatTreatment", "patternWelding"]
    };
    const successor: CharacterDomainSkill = {
      characterId: 2,
      domain: "blacksmithing",
      proficiency: 70,
      aptitude: "ordinary",
      techniques: []
    };

    inheritBlacksmithingTechniques(predecessor, successor);

    expect(successor.techniques).toEqual(["heatTreatment", "patternWelding"]);
  });
});
