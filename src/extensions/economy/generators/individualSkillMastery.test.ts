import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getIndividualSkills, initEconomyContext, setIndividualSkills } from "../economyContext";
import {
  advanceBlacksmithingTechniqueLeads,
  ensureBlacksmithingSkill,
  growApprenticeBlacksmithing,
  growMasterBlacksmithing,
  inheritBlacksmithingTechniques,
  settleBlacksmithingSuccession,
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

  it("defers a master's technique when the successor cannot yet perform it", () => {
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
      proficiency: 82,
      aptitude: "ordinary",
      techniques: []
    };

    const result = settleBlacksmithingSuccession(predecessor, successor);

    expect(result.inherited).toEqual(["heatTreatment"]);
    expect(result.deferred).toEqual(["patternWelding"]);
    expect(successor.techniques).toEqual(["heatTreatment"]);
    expect(successor.reconstructionLeads).toEqual([
      expect.objectContaining({ technique: "patternWelding", progress: expect.any(Number) })
    ]);
  });

  it("reconstructs incomplete knowledge much faster with a skilled collaborator", () => {
    const owner: CharacterDomainSkill = {
      characterId: 1,
      domain: "blacksmithing",
      proficiency: 85,
      aptitude: "ordinary",
      techniques: [],
      reconstructionLeads: [{ technique: "heatTreatment", progress: 0.5 }]
    };
    const collaborator: CharacterDomainSkill = {
      characterId: 2,
      domain: "blacksmithing",
      proficiency: 85,
      aptitude: "ordinary",
      techniques: []
    };

    advanceBlacksmithingTechniqueLeads(owner, [], 1);
    const soloProgress = owner.reconstructionLeads?.[0]?.progress ?? 0;
    advanceBlacksmithingTechniqueLeads(owner, [collaborator], 1);

    expect(owner.reconstructionLeads?.[0]?.progress).toBeGreaterThan(soloProgress + 0.2 - Number.EPSILON);
  });

  it("does not turn a lead into a usable technique before the required proficiency", () => {
    const owner: CharacterDomainSkill = {
      characterId: 1,
      domain: "blacksmithing",
      proficiency: 79,
      aptitude: "ordinary",
      techniques: [],
      reconstructionLeads: [{ technique: "heatTreatment", progress: 0.99 }]
    };
    const collaborator: CharacterDomainSkill = {
      characterId: 2,
      domain: "blacksmithing",
      proficiency: 85,
      aptitude: "ordinary",
      techniques: []
    };

    advanceBlacksmithingTechniqueLeads(owner, [collaborator], 1);

    expect(owner.techniques).toEqual([]);
    expect(owner.reconstructionLeads?.[0]?.progress).toBe(0.99);

    owner.proficiency = 80;
    advanceBlacksmithingTechniqueLeads(owner, [collaborator], 1);

    expect(owner.techniques).toEqual(["heatTreatment"]);
    expect(owner.reconstructionLeads).toEqual([]);
  });
});
